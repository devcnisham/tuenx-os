import { Router } from 'express'
import { prisma } from '../db.ts'
import { route } from '../http.ts'
import { DIVISIONS, type Division } from '../../src/types.ts'

export const overviewRouter = Router()

/**
 * PRD §6 Phase 1 Overview: division summary cards, open task counts, active
 * pipeline value, and a needs-attention list of high-priority open tasks.
 *
 * Aggregated in SQL rather than by pulling whole tables and reducing in the
 * client — this endpoint stays cheap as the tables grow, and the same shape
 * survives the Postgres swap.
 */
overviewRouter.get(
  '/',
  route(async (_req, res) => {
    const [
      openTasksByDivision,
      pipelineByDivision,
      activeDealsByDivision,
      headcountByDivision,
      productCounts,
      needsAttention,
      outstandingInvoices,
      overdueInvoices,
      fundTotals,
    ] = await Promise.all([
        // Open = anything not done. Master plan treats "done" as closed work.
        prisma.task.groupBy({
          by: ['division'],
          where: { status: { not: 'done' } },
          _count: { _all: true },
        }),
        // Pipeline value excludes closed deals — money still in play, not booked.
        prisma.contact.groupBy({
          by: ['division'],
          // Open pipeline: neither won-and-finished nor lost.
          where: { stage: { notIn: ['closed', 'lost'] } },
          _sum: { value: true },
        }),
        prisma.contact.groupBy({
          by: ['division'],
          where: { stage: 'active' },
          _count: { _all: true },
        }),
        prisma.teamMember.groupBy({
          by: ['division'],
          _count: { _all: true },
        }),
        // Phase 2 rollup. Products are Gaphatch-only, so this is a company total.
        prisma.product.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        prisma.task.findMany({
          where: { priority: 'high', status: { not: 'done' } },
          include: {
            assignee: { select: { id: true, tag: true, name: true, division: true } },
            project: { select: { id: true, tag: true, title: true } },
          },
          orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
          take: 8,
        }),
        // Phase 3 — money billed but not yet collected.
        prisma.invoice.aggregate({
          where: { status: { in: ['sent', 'overdue'] } },
          _sum: { amount: true },
        }),
        prisma.invoice.count({ where: { status: 'overdue' } }),
        // Phase 4 — allocations excluded: an internal transfer inside one
        // group is not income or spend, and counting it would double-count.
        prisma.fundEntry.groupBy({
          by: ['type'],
          where: { type: { in: ['income', 'expense'] } },
          _sum: { amount: true },
        }),
      ])

    // groupBy only returns rows for divisions that have data, so fold each
    // result into a map and let every division fall back to zero.
    const byDivision = <Row extends { division: string }>(
      rows: Row[],
      pick: (row: Row) => number | null,
    ): Record<Division, number> => {
      const out = { tuenx: 0, agency: 0, gaphatch: 0 } satisfies Record<Division, number>
      for (const row of rows) {
        if (row.division in out) out[row.division as Division] = pick(row) ?? 0
      }
      return out
    }

    const openTasks = byDivision(openTasksByDivision, (r) => r._count._all)
    const pipeline = byDivision(pipelineByDivision, (r) => r._sum.value)
    const activeDeals = byDivision(activeDealsByDivision, (r) => r._count._all)
    const headcount = byDivision(headcountByDivision, (r) => r._count._all)

    const divisions = DIVISIONS.map((division) => ({
      division,
      openTasks: openTasks[division],
      pipelineValue: pipeline[division],
      activeDeals: activeDeals[division],
      headcount: headcount[division],
    }))

    const productsWith = (status: string) =>
      productCounts.find((p) => p.status === status)?._count._all ?? 0

    const sum = (key: 'openTasks' | 'pipelineValue' | 'activeDeals' | 'headcount') =>
      divisions.reduce((total, d) => total + d[key], 0)

    const fundTotal = (type: string) =>
      fundTotals.find((f) => f.type === type)?._sum.amount ?? 0

    res.json({
      divisions,
      totals: {
        openTasks: sum('openTasks'),
        pipelineValue: sum('pipelineValue'),
        activeDeals: sum('activeDeals'),
        headcount: sum('headcount'),
        productsBuilding: productsWith('building'),
        productsLive: productsWith('live'),
        outstandingInvoiced: outstandingInvoices._sum.amount ?? 0,
        overdueInvoices,
        treasuryBalance: fundTotal('income') - fundTotal('expense'),
      },
      needsAttention,
    })
  }),
)
