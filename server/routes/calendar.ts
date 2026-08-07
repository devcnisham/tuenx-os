import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import {
  asBody,
  badRequest,
  date,
  notFound,
  oneOf,
  optionalDate,
  optionalStr,
  route,
  sent,
  str,
} from '../http'
import {
  DIVISIONS,
  ENTRY_KINDS,
  TAG_TYPE,
  isDivision,
  isEntryKind,
} from '../../src/types'
import { allocateTag } from '../tags'

export const calendarRouter = Router()

/** Every kind of dated thing the calendar can show. */
export const CALENDAR_KINDS = [
  'task',
  'project',
  'invoice',
  'release',
  'contract',
  'compliance',
  'onboarding',
  'entry',
] as const
export type CalendarKind = (typeof CALENDAR_KINDS)[number]

export interface CalendarEvent {
  id: string
  tag: string
  /** ISO day, `yyyy-mm-dd`. Everything here is a deadline, not a timed event. */
  date: string
  title: string
  detail: string | null
  kind: CalendarKind
  division: string
  /** True when the thing is still outstanding — drives the overdue styling. */
  open: boolean
  route: string
  /** `HH:mm`, only on entries someone created with a time. */
  startTime?: string | null
  endTime?: string | null
  /** Present on entries, so the calendar can open one for editing. */
  entryId?: string
}

const day = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Everything with a date, in one place.
 *
 * Deliberately a read-only projection across modules rather than its own
 * table: a due date already lives on the task, and copying it into a calendar
 * record would create two versions of the same fact. The cost is that every
 * source has to be queried; the benefit is that the calendar can never be
 * stale.
 *
 * These are deadlines, not appointments — no times, no durations. Tuenx OS is
 * not trying to be a meeting calendar; Google Calendar covers that.
 */
calendarRouter.get(
  '/',
  route(async (req, res) => {
    const { from, to } = req.query
    if (typeof from !== 'string' || typeof to !== 'string') {
      throw badRequest('`from` and `to` are required (yyyy-mm-dd)')
    }

    const start = new Date(`${from}T00:00:00.000Z`)
    const end = new Date(`${to}T23:59:59.999Z`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw badRequest('`from` and `to` must be dates')
    }
    if (end < start) throw badRequest('`to` cannot be before `from`')

    const range = { gte: start, lte: end }

    const [tasks, projects, invoices, releases, contracts, obligations, checklistItems, entries] =
      await Promise.all([
      prisma.task.findMany({
        where: { dueDate: range },
        include: { assignee: { select: { name: true } } },
      }),
      prisma.project.findMany({
        where: { dueDate: range },
        include: { contact: { select: { name: true, company: true, division: true } } },
      }),
      prisma.invoice.findMany({
        where: { dueDate: range },
        include: { contact: { select: { name: true, company: true, division: true } } },
      }),
      prisma.release.findMany({
        where: { date: range },
        include: { product: { select: { name: true } } },
      }),
      // Contract end dates — a renewal nobody saw coming is the expensive kind.
      prisma.contact.findMany({
        where: { endDate: range, contractType: { not: null } },
      }),
      // Compliance deadlines. Retired obligations are history and would only
      // clutter the grid.
      prisma.complianceItem.findMany({
        where: { nextDueDate: range, retired: false },
        include: { owner: { select: { name: true } } },
      }),
      // Outstanding checklist steps. Done ones are history, and a step with no
      // date was never a deadline.
      prisma.checklistRunItem.findMany({
        where: { dueDate: range, doneAt: null },
        include: { run: { select: { tag: true, personName: true, division: true, kind: true } } },
      }),
      // Entries people created themselves. A multi-day entry counts as
      // overlapping the window if either end falls inside it.
      prisma.calendarEntry.findMany({
        where: {
          OR: [{ date: range }, { endDate: range }],
        },
      }),
    ])

    const events: CalendarEvent[] = [
      ...tasks.map((t) => ({
        id: t.id,
        tag: t.tag,
        date: day(t.dueDate!),
        title: t.title,
        detail: t.assignee?.name ?? 'Unassigned',
        kind: 'task' as const,
        division: t.division,
        open: t.status !== 'done',
        route: '#/tasks',
      })),
      ...projects.map((p) => ({
        id: p.id,
        tag: p.tag,
        date: day(p.dueDate!),
        title: p.title,
        detail: p.contact.company ?? p.contact.name,
        kind: 'project' as const,
        division: p.contact.division,
        open: p.status !== 'closed',
        route: '#/projects',
      })),
      ...invoices.map((i) => ({
        id: i.id,
        tag: i.tag,
        date: day(i.dueDate),
        title: `${i.contact.company ?? i.contact.name} — due`,
        detail: i.amount.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }),
        kind: 'invoice' as const,
        division: i.contact.division,
        open: i.status !== 'paid',
        route: '#/invoices',
      })),
      ...releases.map((r) => ({
        id: r.id,
        tag: r.tag,
        date: day(r.date),
        title: `${r.product.name} ${r.version}`,
        detail: 'Release',
        kind: 'release' as const,
        division: 'gaphatch',
        // A shipped release is a record, not a thing still to do.
        open: false,
        route: '#/products',
      })),
      ...contracts.map((c) => ({
        id: c.id,
        tag: c.tag,
        date: day(c.endDate!),
        title: `${c.company ?? c.name} — contract ends`,
        detail: c.contractType,
        kind: 'contract' as const,
        division: c.division,
        open: true,
        route: '#/crm',
      })),
      ...obligations.map((c) => ({
        id: c.id,
        tag: c.tag,
        date: day(c.nextDueDate),
        title: c.title,
        detail: c.authority ?? c.owner?.name ?? 'Unowned',
        kind: 'compliance' as const,
        division: c.division,
        // Always open: an obligation on the calendar is one still to be met.
        // Meeting it moves the date rather than closing the record.
        open: true,
        route: '#/compliance',
      })),
      ...checklistItems.map((i) => ({
        id: i.id,
        // The run's tag, not the item's — items are untagged by design, and the
        // run is the thing anyone would go and open.
        tag: i.run.tag,
        date: day(i.dueDate!),
        title: i.title,
        detail: i.run.personName,
        kind: 'onboarding' as const,
        division: i.run.division,
        open: true,
        route: '#/ops',
      })),
      ...entries.flatMap((e) => {
        // A multi-day entry occupies every day it spans, so it reads as a band
        // across the grid rather than a single chip on its first day.
        const days: string[] = []
        const last = e.endDate ?? e.date
        for (
          let cursor = new Date(e.date);
          cursor <= last && days.length < 90;
          cursor.setDate(cursor.getDate() + 1)
        ) {
          days.push(day(cursor))
        }

        return days.map((d) => ({
          id: `${e.id}:${d}`,
          entryId: e.id,
          tag: e.tag,
          date: d,
          title: e.title,
          detail: e.attendees,
          kind: 'entry' as const,
          division: e.division,
          // An entry is a fixture, not an outstanding obligation — it should
          // never render as overdue.
          open: false,
          route: '#/calendar',
          startTime: e.allDay ? null : e.startTime,
          endTime: e.allDay ? null : e.endTime,
        }))
      }),
    ]

    // Timed entries first within a day, then everything else — a 9am standup
    // should sit above a due date that has no time at all.
    events.sort((a, b) => {
      const byDate = a.date.localeCompare(b.date)
      if (byDate !== 0) return byDate
      return (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99')
    })

    res.json({ events })
  }),
)

// ---------------------------------------------------------------------------
// Entries — the part of the calendar people write themselves
// ---------------------------------------------------------------------------

/**
 * Times are `HH:mm` wall-clock strings, not instants. The group is in one
 * place, and a 10am standup should read as 10am wherever it is opened.
 */
function timeFields(body: Record<string, unknown>) {
  const allDay = body.allDay !== false && body.allDay !== 'false'
  const startTime = optionalStr(body, 'startTime', 5)
  const endTime = optionalStr(body, 'endTime', 5)

  const valid = (t: string | null) => t === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
  if (!valid(startTime) || !valid(endTime)) throw badRequest('Times must be HH:mm')
  if (!allDay && startTime && endTime && endTime < startTime) {
    throw badRequest('`endTime` cannot be before `startTime`')
  }

  const startDate = date(body, 'date')
  const endDate = optionalDate(body, 'endDate')
  if (endDate && endDate < startDate) throw badRequest('`endDate` cannot be before `date`')

  const remind = body.remindMinutesBefore
  const remindMinutesBefore =
    remind === undefined || remind === null || remind === '' ? null : Number(remind)
  if (remindMinutesBefore !== null && !Number.isFinite(remindMinutesBefore)) {
    throw badRequest('`remindMinutesBefore` must be a number of minutes')
  }

  return {
    allDay,
    startTime: allDay ? null : startTime,
    endTime: allDay ? null : endTime,
    date: startDate,
    endDate,
    remindMinutesBefore,
  }
}

calendarRouter.get(
  '/entries',
  route(async (req, res) => {
    const { division, kind } = req.query

    const where: Prisma.CalendarEntryWhereInput = {}
    if (isDivision(division)) where.division = division
    if (isEntryKind(kind)) where.kind = kind

    const entries = await prisma.calendarEntry.findMany({ where, orderBy: [{ date: 'asc' }] })
    res.json(entries)
  }),
)

calendarRouter.post(
  '/entries',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)

    const entry = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.entry)
      return tx.calendarEntry.create({
        data: {
          tag,
          division,
          title: str(body, 'title', 200),
          notes: optionalStr(body, 'notes', 2000),
          kind: oneOf(body, 'kind', isEntryKind, ENTRY_KINDS),
          attendees: optionalStr(body, 'attendees', 500),
          ...timeFields(body),
        },
      })
    })

    res.status(201).json(entry)
  }),
)

calendarRouter.patch(
  '/entries/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.calendarEntry.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Entry not found')

    const entry = await prisma.calendarEntry.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'title') && { title: str(body, 'title', 200) }),
        ...(sent(body, 'notes') && { notes: optionalStr(body, 'notes', 2000) }),
        ...(sent(body, 'division') && {
          division: oneOf(body, 'division', isDivision, DIVISIONS),
        }),
        ...(sent(body, 'kind') && { kind: oneOf(body, 'kind', isEntryKind, ENTRY_KINDS) }),
        ...(sent(body, 'attendees') && { attendees: optionalStr(body, 'attendees', 500) }),
        // Time fields move as a unit — allDay changes the meaning of the rest.
        ...(sent(body, 'date') && timeFields(body)),
      },
    })

    res.json(entry)
  }),
)

calendarRouter.delete(
  '/entries/:id',
  route(async (req, res) => {
    const existing = await prisma.calendarEntry.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Entry not found')

    await prisma.calendarEntry.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
