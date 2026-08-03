import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { allocateTag } from '../tags'
import {
  asBody,
  date,
  notFound,
  num,
  oneOf,
  optionalStr,
  route,
  sent,
  str,
} from '../http'
import {
  DIVISIONS,
  FUND_TYPES,
  TAG_TYPE,
  isDivision,
  isFundType,
  type Division,
} from '../../src/types'

export const treasuryRouter = Router()

/** Trailing window the burn average is taken over. */
const BURN_WINDOW_MONTHS = 6

/**
 * PRD §6 Phase 4: income, expenses, and budget at the Tuenx level, capital
 * allocation visible per division, and runway.
 *
 * `allocation` is capital moved from the Tuenx level into a division. It is
 * deliberately excluded from balance and burn — it is an internal transfer
 * inside one group, so counting it would double-count the same money. It is
 * reported per division so you can see where capital has been committed.
 */
treasuryRouter.get(
  '/',
  route(async (_req, res) => {
    const [byDivisionType, recent, entries] = await Promise.all([
      prisma.fundEntry.groupBy({
        by: ['division', 'type'],
        _sum: { amount: true },
      }),
      // Burn is measured over a trailing window, not all time — a big founding
      // expense two years ago should not still be dragging the average.
      prisma.fundEntry.groupBy({
        by: ['type'],
        where: { date: { gte: monthsAgo(BURN_WINDOW_MONTHS) } },
        _sum: { amount: true },
      }),
      prisma.fundEntry.findMany({ orderBy: [{ date: 'desc' }], take: 100 }),
    ])

    const total = (division: Division, type: string) =>
      byDivisionType.find((r) => r.division === division && r.type === type)?._sum.amount ?? 0

    const byDivision = DIVISIONS.map((division) => {
      const income = total(division, 'income')
      const expenses = total(division, 'expense')
      return {
        division,
        income,
        expenses,
        allocated: total(division, 'allocation'),
        net: income - expenses,
      }
    })

    const income = byDivision.reduce((sum, d) => sum + d.income, 0)
    const expenses = byDivision.reduce((sum, d) => sum + d.expenses, 0)
    const balance = income - expenses

    const windowed = (type: string) =>
      recent.find((r) => r.type === type)?._sum.amount ?? 0

    const netOverWindow = windowed('income') - windowed('expense')

    // Burning only when the trailing window is net negative. Income covering
    // costs means there is no runway question to answer.
    const monthlyBurn = netOverWindow < 0 ? Math.abs(netOverWindow) / BURN_WINDOW_MONTHS : null

    const runwayMonths =
      monthlyBurn && monthlyBurn > 0 && balance > 0 ? balance / monthlyBurn : null

    res.json({ balance, income, expenses, monthlyBurn, runwayMonths, byDivision, entries })
  }),
)

function monthsAgo(months: number) {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d
}

treasuryRouter.get(
  '/entries',
  route(async (req, res) => {
    const { division, type } = req.query

    const where: Prisma.FundEntryWhereInput = {}
    if (isDivision(division)) where.division = division
    if (isFundType(type)) where.type = type

    const entries = await prisma.fundEntry.findMany({ where, orderBy: [{ date: 'desc' }] })
    res.json(entries)
  }),
)

treasuryRouter.post(
  '/entries',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)

    const entry = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.fund)
      return tx.fundEntry.create({
        data: {
          tag,
          division,
          type: oneOf(body, 'type', isFundType, FUND_TYPES),
          amount: num(body, 'amount'),
          category: str(body, 'category', 80),
          date: date(body, 'date'),
          notes: optionalStr(body, 'notes', 2000),
        },
      })
    })

    res.status(201).json(entry)
  }),
)

treasuryRouter.patch(
  '/entries/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.fundEntry.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Entry not found')

    const entry = await prisma.fundEntry.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'division') && {
          division: oneOf(body, 'division', isDivision, DIVISIONS),
        }),
        ...(sent(body, 'type') && { type: oneOf(body, 'type', isFundType, FUND_TYPES) }),
        ...(sent(body, 'amount') && { amount: num(body, 'amount') }),
        ...(sent(body, 'category') && { category: str(body, 'category', 80) }),
        ...(sent(body, 'date') && { date: date(body, 'date') }),
        ...(sent(body, 'notes') && { notes: optionalStr(body, 'notes', 2000) }),
      },
    })

    res.json(entry)
  }),
)

treasuryRouter.delete(
  '/entries/:id',
  route(async (req, res) => {
    const existing = await prisma.fundEntry.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Entry not found')

    await prisma.fundEntry.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
