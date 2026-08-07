import { Router } from 'express'
import { prisma } from '../db'
import { route } from '../http'
import { DIVISIONS, type Division } from '../../src/types'

export const kpiRouter = Router()

/** Trailing window for burn, matching treasury.ts so the two never disagree. */
const BURN_WINDOW_MONTHS = 6

/** How far back the month-by-month trend runs. */
const TREND_MONTHS = 12

/** A contract inside this many days is worth a look before it lapses. */
const CONTRACT_NOTICE_DAYS = 60

/** A doc untouched for this long is probably lying to whoever reads it next. */
const DOC_STALE_MONTHS = 3

function monthsAgo(months: number) {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d
}

function daysAhead(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

/** `2026-08`. Sorts lexically, which is the whole reason for the format. */
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`

/**
 * PRD §6 Phase 8: a company-wide KPI dashboard aggregating every module.
 *
 * Read-only and storage-free, exactly as TRD §3 Phase 8 specifies — every
 * figure here is derived from records another module owns. Nothing writes, and
 * there is no KPI table to drift out of sync with its sources.
 *
 * Deliberately not a second Overview. Overview answers "how do the three
 * divisions compare right now"; this answers "how is the company doing, and
 * what needs attention" — headline figures a founder would actually report, a
 * scorecard, a month-by-month trend, and a health list that names the specific
 * records behind each warning rather than showing a green tick.
 *
 * Aggregated in SQL wherever `groupBy` can express it. The two month-bucketed
 * series are the exception: Prisma cannot group by month without raw SQL, and
 * writing `date_trunc` here would tie this route to Postgres for no gain — the
 * windows are bounded to a year and select three columns, so folding them in
 * JS costs nothing and survives a database swap.
 */
kpiRouter.get(
  '/',
  route(async (_req, res) => {
    const trendStart = monthsAgo(TREND_MONTHS)
    const now = new Date()

    const [
      // Money
      paidInvoices,
      outstandingInvoices,
      overdueInvoices,
      fundAllTime,
      fundWindow,
      fundTrendRows,
      invoiceTrendRows,
      // Product
      products,
      latestMetrics,
      // Per division
      openTasksByDivision,
      overdueTasksByDivision,
      pipelineByDivision,
      headcountByDivision,
      netCashByDivision,
      // Health
      overdueTaskList,
      unassignedOpen,
      heldProjects,
      openBugs,
      expiringContracts,
      staleDocs,
      keyResultCounts,
      openCandidates,
      liveCampaigns,
      overdueObligations,
      unownedObligations,
    ] = await Promise.all([
      prisma.invoice.aggregate({ where: { status: 'paid' }, _sum: { amount: true } }),
      prisma.invoice.aggregate({
        where: { status: { in: ['sent', 'overdue'] } },
        _sum: { amount: true },
      }),
      prisma.invoice.aggregate({
        where: { status: 'overdue' },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      // Allocations excluded: an internal transfer inside one group is neither
      // income nor spend, and counting it double-counts the same money.
      prisma.fundEntry.groupBy({
        by: ['type'],
        where: { type: { in: ['income', 'expense'] } },
        _sum: { amount: true },
      }),
      prisma.fundEntry.groupBy({
        by: ['type'],
        where: { type: { in: ['income', 'expense'] }, date: { gte: monthsAgo(BURN_WINDOW_MONTHS) } },
        _sum: { amount: true },
      }),
      prisma.fundEntry.findMany({
        where: { type: { in: ['income', 'expense'] }, date: { gte: trendStart } },
        select: { date: true, type: true, amount: true },
      }),
      prisma.invoice.findMany({
        where: { issueDate: { gte: trendStart } },
        select: { issueDate: true, status: true, amount: true },
      }),

      prisma.product.findMany({ select: { id: true, tag: true, name: true, status: true } }),
      // One query, then the newest row per product is picked below — cheaper
      // than a findFirst per product once there are more than a couple.
      prisma.metricSnapshot.findMany({
        select: { productId: true, date: true, mrr: true, activeUsers: true, churnRate: true },
        orderBy: { date: 'desc' },
      }),

      prisma.task.groupBy({
        by: ['division'],
        where: { status: { not: 'done' } },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ['division'],
        where: { status: { not: 'done' }, dueDate: { lt: now } },
        _count: { _all: true },
      }),
      prisma.contact.groupBy({
        by: ['division'],
        where: { stage: { notIn: ['closed', 'lost'] } },
        _sum: { value: true },
      }),
      prisma.teamMember.groupBy({ by: ['division'], _count: { _all: true } }),
      prisma.fundEntry.groupBy({
        by: ['division', 'type'],
        where: { type: { in: ['income', 'expense'] } },
        _sum: { amount: true },
      }),

      prisma.task.findMany({
        where: { status: { not: 'done' }, dueDate: { lt: now } },
        select: { id: true, tag: true, title: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      prisma.task.count({ where: { status: { not: 'done' }, assigneeId: null } }),
      prisma.project.findMany({
        where: { onHold: true },
        select: { id: true, tag: true, title: true },
        take: 5,
      }),
      prisma.ticket.findMany({
        where: { kind: 'bug', priority: 'high', status: { not: 'resolved' } },
        select: { id: true, tag: true, subject: true },
        take: 5,
      }),
      prisma.contract.findMany({
        where: { endDate: { gte: now, lte: daysAhead(CONTRACT_NOTICE_DAYS) } },
        select: { id: true, tag: true, party: true, endDate: true },
        orderBy: { endDate: 'asc' },
        take: 5,
      }),
      prisma.doc.count({ where: { updatedAt: { lt: monthsAgo(DOC_STALE_MONTHS) } } }),
      prisma.keyResult.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.candidate.count({ where: { stage: { notIn: ['hired', 'passed'] } } }),
      prisma.campaign.count({ where: { status: 'live' } }),
      // Compliance. A missed filing costs money in a way a missed task does
      // not, so overdue obligations are their own line rather than folded in
      // with everything else that has a date.
      prisma.complianceItem.findMany({
        where: { retired: false, nextDueDate: { lt: now } },
        select: { id: true, tag: true, title: true, authority: true },
        orderBy: { nextDueDate: 'asc' },
        take: 5,
      }),
      prisma.complianceItem.count({ where: { retired: false, ownerId: null } }),
    ])

    /* ---------------------------------------------------------------- money */

    const fundTotal = (rows: { type: string; _sum: { amount: number | null } }[], type: string) =>
      rows.find((r) => r.type === type)?._sum.amount ?? 0

    const income = fundTotal(fundAllTime, 'income')
    const expenses = fundTotal(fundAllTime, 'expense')
    const cashBalance = income - expenses

    const netOverWindow = fundTotal(fundWindow, 'income') - fundTotal(fundWindow, 'expense')
    // Only burning when the trailing window is net negative — income covering
    // costs means there is no runway question to answer.
    const monthlyBurn = netOverWindow < 0 ? Math.abs(netOverWindow) / BURN_WINDOW_MONTHS : null
    const runwayMonths = monthlyBurn && cashBalance > 0 ? cashBalance / monthlyBurn : null

    /* -------------------------------------------------------------- product */

    // findMany came back newest-first, so the first row seen per product is
    // its latest snapshot.
    const latestByProduct = new Map<string, (typeof latestMetrics)[number]>()
    const previousByProduct = new Map<string, (typeof latestMetrics)[number]>()
    for (const row of latestMetrics) {
      if (!latestByProduct.has(row.productId)) latestByProduct.set(row.productId, row)
      else if (!previousByProduct.has(row.productId)) previousByProduct.set(row.productId, row)
    }

    const mrr = [...latestByProduct.values()].reduce((total, r) => total + r.mrr, 0)
    const activeUsers = [...latestByProduct.values()].reduce((total, r) => total + r.activeUsers, 0)
    const previousMrr = [...previousByProduct.values()].reduce((total, r) => total + r.mrr, 0)

    const churnRising = products.filter((p) => {
      const now = latestByProduct.get(p.id)
      const before = previousByProduct.get(p.id)
      return now && before && now.churnRate > before.churnRate
    })

    /* ------------------------------------------------------------- trend */

    const months: string[] = []
    for (let i = TREND_MONTHS - 1; i >= 0; i -= 1) months.push(monthKey(monthsAgo(i)))

    const blank = () => ({ income: 0, expense: 0, invoiced: 0, collected: 0 })
    const buckets = new Map(months.map((m) => [m, blank()]))

    for (const row of fundTrendRows) {
      const bucket = buckets.get(monthKey(row.date))
      if (!bucket) continue
      if (row.type === 'income') bucket.income += row.amount
      else bucket.expense += row.amount
    }
    for (const row of invoiceTrendRows) {
      const bucket = buckets.get(monthKey(row.issueDate))
      if (!bucket) continue
      // Drafts are not yet a claim on anyone, so they are not "invoiced".
      if (row.status !== 'draft') bucket.invoiced += row.amount
      if (row.status === 'paid') bucket.collected += row.amount
    }

    const trend = months.map((month) => ({ month, ...buckets.get(month)! }))

    /* ---------------------------------------------------------- divisions */

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
    const overdueTasks = byDivision(overdueTasksByDivision, (r) => r._count._all)
    const pipeline = byDivision(pipelineByDivision, (r) => r._sum.value)
    const headcount = byDivision(headcountByDivision, (r) => r._count._all)

    const cashFor = (division: Division, type: string) =>
      netCashByDivision.find((r) => r.division === division && r.type === type)?._sum.amount ?? 0

    const divisions = DIVISIONS.map((division) => ({
      division,
      openTasks: openTasks[division],
      overdueTasks: overdueTasks[division],
      pipelineValue: pipeline[division],
      headcount: headcount[division],
      netCash: cashFor(division, 'income') - cashFor(division, 'expense'),
    }))

    /* ------------------------------------------------------------- health */

    const krCount = (status: string) =>
      keyResultCounts.find((r) => r.status === status)?._count._all ?? 0

    const offTrack = krCount('off_track')
    const atRisk = krCount('at_risk')

    /**
     * Every entry names what is wrong and what to open. A dashboard that only
     * shows green ticks trains people to stop reading it, so an item is
     * emitted only when it has something to say.
     */
    const health: {
      key: string
      label: string
      value: string
      detail: string
      tone: 'alert' | 'watch'
      route: string
      records: { tag: string; label: string }[]
      /** Money behind the number, when there is any. Formatted by the client. */
      amount?: number
    }[] = []

    if (overdueInvoices._count._all > 0) {
      health.push({
        key: 'overdue-invoices',
        label: 'Invoices overdue',
        value: String(overdueInvoices._count._all),
        detail: 'Billed, and the due date has gone',
        tone: 'alert',
        route: '#/invoices',
        records: [],
        // Left as a number: currency formatting is the client's job, and the
        // server has no business guessing a locale.
        amount: overdueInvoices._sum.amount ?? 0,
      })
    }

    if (overdueTaskList.length > 0) {
      health.push({
        key: 'overdue-tasks',
        label: 'Tasks past their due date',
        value: String(overdueTasksByDivision.reduce((n, r) => n + r._count._all, 0)),
        detail: 'Still open, and the date has gone',
        tone: 'alert',
        route: '#/tasks',
        records: overdueTaskList.map((t) => ({ tag: t.tag, label: t.title })),
      })
    }

    if (overdueObligations.length > 0) {
      health.push({
        key: 'compliance-overdue',
        label: 'Compliance obligations overdue',
        value: String(overdueObligations.length),
        detail: 'A missed filing costs money a missed task does not',
        tone: 'alert',
        route: '#/compliance',
        records: overdueObligations.map((o) => ({ tag: o.tag, label: o.title })),
      })
    }

    if (unownedObligations > 0) {
      health.push({
        key: 'compliance-unowned',
        label: 'Obligations with nobody responsible',
        value: String(unownedObligations),
        // The most common way a filing is missed is that everyone assumed
        // somebody else had it.
        detail: 'Nobody is named, so nobody is reminded',
        tone: 'watch',
        route: '#/compliance',
        records: [],
      })
    }

    if (openBugs.length > 0) {
      health.push({
        key: 'open-bugs',
        label: 'High-priority bugs open',
        value: String(openBugs.length),
        detail: 'Unresolved, in the shared issue queue',
        tone: 'alert',
        route: '#/products',
        records: openBugs.map((t) => ({ tag: t.tag, label: t.subject })),
      })
    }

    if (offTrack > 0) {
      health.push({
        key: 'okr-off-track',
        label: 'Key results off track',
        value: String(offTrack),
        detail: atRisk > 0 ? `${atRisk} more at risk` : 'Nothing else at risk',
        tone: 'alert',
        route: '#/okrs',
        records: [],
      })
    } else if (atRisk > 0) {
      health.push({
        key: 'okr-at-risk',
        label: 'Key results at risk',
        value: String(atRisk),
        detail: 'None off track yet',
        tone: 'watch',
        route: '#/okrs',
        records: [],
      })
    }

    if (heldProjects.length > 0) {
      health.push({
        key: 'projects-on-hold',
        label: 'Projects on hold',
        value: String(heldProjects.length),
        // on_hold is a flag, not a stage — the project keeps the stage it
        // stalled in, which is the useful part.
        detail: 'Stalled from their current stage, waiting on someone',
        tone: 'watch',
        route: '#/projects',
        records: heldProjects.map((p) => ({ tag: p.tag, label: p.title })),
      })
    }

    if (expiringContracts.length > 0) {
      health.push({
        key: 'contracts-expiring',
        label: `Contracts ending within ${CONTRACT_NOTICE_DAYS} days`,
        value: String(expiringContracts.length),
        detail: 'Renew, renegotiate, or let them lapse deliberately',
        tone: 'watch',
        route: '#/people-ops',
        records: expiringContracts.map((c) => ({ tag: c.tag, label: c.party })),
      })
    }

    if (churnRising.length > 0) {
      health.push({
        key: 'churn-rising',
        label: 'Churn up since the last reading',
        value: String(churnRising.length),
        detail: churnRising.map((p) => p.name).join(', '),
        tone: 'watch',
        route: '#/products',
        records: churnRising.map((p) => ({ tag: p.tag, label: p.name })),
      })
    }

    if (unassignedOpen > 0) {
      health.push({
        key: 'unassigned-tasks',
        label: 'Open tasks with nobody on them',
        value: String(unassignedOpen),
        detail: 'Work that no one has picked up',
        tone: 'watch',
        route: '#/tasks',
        records: [],
      })
    }

    if (staleDocs > 0) {
      health.push({
        key: 'stale-docs',
        label: `Docs untouched for ${DOC_STALE_MONTHS}+ months`,
        value: String(staleDocs),
        detail: 'An out-of-date playbook is worse than a missing one',
        tone: 'watch',
        route: '#/docs',
        records: [],
      })
    }

    res.json({
      generatedAt: now.toISOString(),
      headline: {
        revenueCollected: paidInvoices._sum.amount ?? 0,
        outstandingInvoiced: outstandingInvoices._sum.amount ?? 0,
        mrr,
        mrrChange: previousMrr === 0 ? null : mrr - previousMrr,
        activeUsers,
        cashBalance,
        monthlyBurn,
        runwayMonths,
        openPipeline: DIVISIONS.reduce((total, d) => total + pipeline[d], 0),
        headcount: DIVISIONS.reduce((total, d) => total + headcount[d], 0),
        openCandidates,
        liveCampaigns,
        productsLive: products.filter((p) => p.status === 'live').length,
        productsBuilding: products.filter((p) => p.status === 'building').length,
      },
      divisions,
      trend,
      health,
    })
  }),
)
