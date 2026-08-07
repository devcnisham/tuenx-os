import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { route } from '../http'

export const auditLogRouter = Router()

/** One page. Deep history is a query, not something to scroll. */
const PAGE = 60

/**
 * Reading the audit trail. Admin-only — mounted with `requireAdmin` in
 * `server/index.ts`.
 *
 * Read-only by construction: there is no write route here and there never
 * should be. An audit log anyone can edit answers a different question from the
 * one it appears to answer.
 */
auditLogRouter.get(
  '/',
  route(async (req, res) => {
    const { resource, action, actorId, before } = req.query

    const where: Prisma.AuditEntryWhereInput = {}
    if (typeof resource === 'string' && resource !== '') where.resource = resource
    if (typeof action === 'string' && action !== '') where.action = action
    if (typeof actorId === 'string' && actorId !== '') where.actorId = actorId
    // Keyset paging on `at` rather than skip/take: an audit table only ever
    // grows at the head, so an offset walks past rows that shifted under it.
    if (typeof before === 'string' && before !== '') {
      const cutoff = new Date(before)
      if (!Number.isNaN(cutoff.getTime())) where.at = { lt: cutoff }
    }

    const entries = await prisma.auditEntry.findMany({
      where,
      orderBy: { at: 'desc' },
      take: PAGE + 1,
    })

    const hasMore = entries.length > PAGE
    res.json({
      entries: entries.slice(0, PAGE),
      hasMore,
      // The cursor to pass back as `before`, so the client never builds one.
      nextCursor: hasMore ? entries[PAGE - 1]!.at.toISOString() : null,
    })
  }),
)

/** Distinct values actually present, so the filters never offer a dead option. */
auditLogRouter.get(
  '/facets',
  route(async (_req, res) => {
    const [resources, actions, actors] = await Promise.all([
      prisma.auditEntry.groupBy({ by: ['resource'], _count: { _all: true } }),
      prisma.auditEntry.groupBy({ by: ['action'], _count: { _all: true } }),
      prisma.auditEntry.groupBy({
        by: ['actorId', 'actorName'],
        _count: { _all: true },
      }),
    ])

    res.json({
      resources: resources.map((r) => ({ value: r.resource, count: r._count._all })),
      actions: actions.map((r) => ({ value: r.action, count: r._count._all })),
      actors: actors
        .filter((r) => r.actorId !== null)
        .map((r) => ({ id: r.actorId!, name: r.actorName, count: r._count._all })),
    })
  }),
)
