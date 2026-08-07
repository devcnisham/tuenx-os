import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { allocateTag } from '../tags'
import {
  asBody,
  badRequest,
  date,
  notFound,
  oneOf,
  optionalDate,
  optionalId,
  optionalStr,
  route,
  sent,
  str,
} from '../http'
import {
  COMPLIANCE_CATEGORIES,
  DIVISIONS,
  RECURRENCES,
  RECURRENCE_MONTHS,
  TAG_TYPE,
  isComplianceCategory,
  isDivision,
  isRecurrence,
  type Recurrence,
} from '../../src/types'

export const complianceRouter = Router()

/** Inside this many days is "due soon" — near enough to act on, not yet late. */
export const DUE_SOON_DAYS = 30

const WITH_OWNER = {
  owner: { select: { id: true, tag: true, name: true, division: true } },
} satisfies Prisma.ComplianceItemInclude

/**
 * The compliance register.
 *
 * Tuenx handles legal, accounts, finance, and compliance for the group. The
 * first three had homes — the contracts repository, Treasury, Invoices. This is
 * the fourth: filings, licences, renewals, and audits, with who owns each one
 * and when it is next due.
 *
 * Deliberately not tasks. A task is done once and closed; a VAT return is due
 * again the moment you file it. Marking an obligation done advances its date
 * rather than closing the record, so the register never empties and never
 * misleads about what is coming.
 */

/** Advances a due date by whole months, per the recurrence. */
function advance(from: Date, recurrence: Recurrence): Date | null {
  const months = RECURRENCE_MONTHS[recurrence]
  if (months === null) return null

  const next = new Date(from)
  next.setMonth(next.getMonth() + months)
  return next
}

complianceRouter.get(
  '/',
  route(async (req, res) => {
    const { division, category, ownerId, includeRetired } = req.query

    const where: Prisma.ComplianceItemWhereInput = {}
    if (isDivision(division)) where.division = division
    if (isComplianceCategory(category)) where.category = category
    if (typeof ownerId === 'string' && ownerId !== '') {
      where.ownerId = ownerId === 'unowned' ? null : ownerId
    }
    // Retired obligations are history. Shown only when asked for, so the
    // register stays a list of things that still need doing.
    if (includeRetired !== 'true') where.retired = false

    res.json(
      await prisma.complianceItem.findMany({
        where,
        include: WITH_OWNER,
        // Soonest first: the register is read to find out what is next.
        orderBy: [{ nextDueDate: 'asc' }],
      }),
    )
  }),
)

/** Counts for the header, computed in SQL rather than over a fetched list. */
complianceRouter.get(
  '/summary',
  route(async (_req, res) => {
    const now = new Date()
    const soon = new Date(now)
    soon.setDate(soon.getDate() + DUE_SOON_DAYS)

    const [overdue, dueSoon, upcoming, retired, unowned] = await Promise.all([
      prisma.complianceItem.count({ where: { retired: false, nextDueDate: { lt: now } } }),
      prisma.complianceItem.count({
        where: { retired: false, nextDueDate: { gte: now, lte: soon } },
      }),
      prisma.complianceItem.count({ where: { retired: false, nextDueDate: { gt: soon } } }),
      prisma.complianceItem.count({ where: { retired: true } }),
      prisma.complianceItem.count({ where: { retired: false, ownerId: null } }),
    ])

    res.json({ overdue, dueSoon, upcoming, retired, unowned })
  }),
)

async function assertOwnerExists(ownerId: string | null) {
  if (ownerId === null) return
  const member = await prisma.teamMember.findUnique({
    where: { id: ownerId },
    select: { id: true },
  })
  if (!member) throw badRequest('`ownerId` does not match a team member')
}

complianceRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)
    const ownerId = optionalId(body, 'ownerId')
    await assertOwnerExists(ownerId)

    const item = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.compliance)
      return tx.complianceItem.create({
        data: {
          tag,
          title: str(body, 'title', 200),
          division,
          category: oneOf(body, 'category', isComplianceCategory, COMPLIANCE_CATEGORIES),
          authority: optionalStr(body, 'authority', 160),
          ownerId,
          recurrence: oneOf(body, 'recurrence', isRecurrence, RECURRENCES),
          nextDueDate: date(body, 'nextDueDate'),
          notes: optionalStr(body, 'notes', 4000),
        },
        include: WITH_OWNER,
      })
    })

    res.status(201).json(item)
  }),
)

complianceRouter.patch(
  '/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.complianceItem.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Obligation not found')

    if (sent(body, 'ownerId')) await assertOwnerExists(optionalId(body, 'ownerId'))

    const nextDue = sent(body, 'nextDueDate') ? optionalDate(body, 'nextDueDate') : undefined
    if (nextDue === null) throw badRequest('`nextDueDate` is required')

    res.json(
      await prisma.complianceItem.update({
        where: { id: req.params.id },
        data: {
          ...(sent(body, 'title') && { title: str(body, 'title', 200) }),
          ...(sent(body, 'division') && {
            division: oneOf(body, 'division', isDivision, DIVISIONS),
          }),
          ...(sent(body, 'category') && {
            category: oneOf(body, 'category', isComplianceCategory, COMPLIANCE_CATEGORIES),
          }),
          ...(sent(body, 'authority') && { authority: optionalStr(body, 'authority', 160) }),
          ...(sent(body, 'ownerId') && { ownerId: optionalId(body, 'ownerId') }),
          ...(sent(body, 'recurrence') && {
            recurrence: oneOf(body, 'recurrence', isRecurrence, RECURRENCES),
          }),
          ...(nextDue !== undefined && { nextDueDate: nextDue }),
          ...(sent(body, 'notes') && { notes: optionalStr(body, 'notes', 4000) }),
          ...(sent(body, 'retired') && { retired: body.retired === true }),
        },
        include: WITH_OWNER,
      }),
    )
  }),
)

/**
 * Marks an obligation satisfied.
 *
 * A recurring one rolls forward from its **due date**, not from today: a VAT
 * return filed three days late is still due on the same day next quarter, and
 * advancing from today would let the deadline drift a little further every
 * cycle until it silently detached from the real one.
 *
 * A one-off retires instead, because there is no next.
 */
complianceRouter.post(
  '/:id/done',
  route(async (req, res) => {
    const existing = await prisma.complianceItem.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Obligation not found')
    if (existing.retired) throw badRequest('That obligation is already retired')

    const next = advance(existing.nextDueDate, existing.recurrence as Recurrence)

    res.json(
      await prisma.complianceItem.update({
        where: { id: req.params.id },
        data: {
          lastDoneAt: new Date(),
          ...(next ? { nextDueDate: next } : { retired: true }),
        },
        include: WITH_OWNER,
      }),
    )
  }),
)

complianceRouter.delete(
  '/:id',
  route(async (req, res) => {
    if (!(await prisma.complianceItem.findUnique({ where: { id: req.params.id } }))) {
      throw notFound('Obligation not found')
    }
    await prisma.complianceItem.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
