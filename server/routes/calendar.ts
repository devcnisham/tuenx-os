import { Router } from 'express'
import { prisma } from '../db.ts'
import { badRequest, route } from '../http.ts'

export const calendarRouter = Router()

/** Every kind of dated thing the calendar can show. */
export const CALENDAR_KINDS = [
  'task',
  'project',
  'invoice',
  'release',
  'contract',
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

    const [tasks, projects, invoices, releases, contracts] = await Promise.all([
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
        open: p.status !== 'delivered',
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
    ]

    events.sort((a, b) => a.date.localeCompare(b.date))
    res.json({ events })
  }),
)
