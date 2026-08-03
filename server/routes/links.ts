import { Router } from 'express'
import { prisma } from '../db.ts'
import { asBody, badRequest, notFound, optionalStr, route, str } from '../http.ts'

export const linksRouter = Router()

/**
 * Every record type that can be linked, and how to resolve one for display.
 *
 * Keeping this in one table is what makes the polymorphic link workable: adding
 * a new linkable type is one entry here, not a migration and a new column.
 */
const RESOLVERS = {
  task: {
    label: 'Task',
    route: '#/tasks',
    find: (ids: string[]) =>
      prisma.task.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  contact: {
    label: 'Contact',
    route: '#/crm',
    find: (ids: string[]) =>
      prisma.contact.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, name: true } }),
  },
  member: {
    label: 'Team',
    route: '#/team',
    find: (ids: string[]) =>
      prisma.teamMember.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, name: true } }),
  },
  product: {
    label: 'Product',
    route: '#/products',
    find: (ids: string[]) =>
      prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, name: true } }),
  },
  project: {
    label: 'Project',
    route: '#/projects',
    find: (ids: string[]) =>
      prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  invoice: {
    label: 'Invoice',
    route: '#/invoices',
    find: (ids: string[]) =>
      prisma.invoice.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, status: true } }),
  },
  doc: {
    label: 'Doc',
    route: '#/docs',
    find: (ids: string[]) =>
      prisma.doc.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  objective: {
    label: 'Objective',
    route: '#/okrs',
    find: (ids: string[]) =>
      prisma.objective.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  entry: {
    label: 'Calendar',
    route: '#/calendar',
    find: (ids: string[]) =>
      prisma.calendarEntry.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  plan: {
    label: 'Plan item',
    route: '#/planner',
    find: (ids: string[]) =>
      prisma.planItem.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  idea: {
    label: 'Idea',
    route: '#/brainstorms',
    find: (ids: string[]) =>
      prisma.idea.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  candidate: {
    label: 'Candidate',
    route: '#/ops',
    find: (ids: string[]) =>
      prisma.candidate.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, name: true } }),
  },
  vendor: {
    label: 'Vendor',
    route: '#/ops',
    find: (ids: string[]) =>
      prisma.vendor.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, name: true } }),
  },
  campaign: {
    label: 'Campaign',
    route: '#/ops',
    find: (ids: string[]) =>
      prisma.campaign.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  ticket: {
    label: 'Issue',
    route: '#/products',
    find: (ids: string[]) =>
      prisma.ticket.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, subject: true } }),
  },
  epic: {
    label: 'Epic',
    route: '#/work',
    find: (ids: string[]) =>
      prisma.epic.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  sprint: {
    label: 'Sprint',
    route: '#/work',
    find: (ids: string[]) =>
      prisma.sprint.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, name: true } }),
  },
  contract: {
    label: 'Contract',
    route: '#/ops',
    find: (ids: string[]) =>
      prisma.contract.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, party: true } }),
  },
} as const

export type LinkType = keyof typeof RESOLVERS
const LINK_TYPES = Object.keys(RESOLVERS) as LinkType[]

const isLinkType = (v: unknown): v is LinkType =>
  typeof v === 'string' && (LINK_TYPES as string[]).includes(v)

/** Resolves a batch of ids per type into `{ tag, title }` for display. */
async function resolve(refs: { type: LinkType; id: string }[]) {
  const byType = new Map<LinkType, string[]>()
  for (const ref of refs) {
    const list = byType.get(ref.type)
    if (list) list.push(ref.id)
    else byType.set(ref.type, [ref.id])
  }

  const found = new Map<string, { tag: string; title: string }>()
  await Promise.all(
    [...byType].map(async ([type, ids]) => {
      const rows = await RESOLVERS[type].find(ids)
      for (const row of rows as {
        id: string
        tag: string
        title?: string
        name?: string
        subject?: string
        party?: string
        status?: string
      }[]) {
        found.set(`${type}:${row.id}`, {
          tag: row.tag,
          // Whatever that record type calls its own label. An invoice has none,
          // so its status stands in.
          title: row.title ?? row.name ?? row.subject ?? row.party ?? row.status ?? row.tag,
        })
      }
    }),
  )
  return found
}

/** Confirms a record actually exists before a link is written to it. */
async function assertExists(type: LinkType, id: string) {
  const rows = await RESOLVERS[type].find([id])
  if (rows.length === 0) throw badRequest(`No ${RESOLVERS[type].label.toLowerCase()} with that id`)
}

/**
 * Everything linked to one record, from either direction.
 *
 * Links are stored with a direction but read undirected — a link created on the
 * meeting shows up on the doc too, which is the only behaviour that makes sense
 * to someone looking at the doc.
 */
linksRouter.get(
  '/',
  route(async (req, res) => {
    const { type, id } = req.query
    if (!isLinkType(type) || typeof id !== 'string' || id === '') {
      throw badRequest('`type` and `id` are required')
    }

    const rows = await prisma.recordLink.findMany({
      where: {
        OR: [
          { fromType: type, fromId: id },
          { toType: type, toId: id },
        ],
      },
      orderBy: { createdAt: 'asc' },
    })

    // Normalise to "the other end", so the caller never has to work out which
    // side it is on.
    const others = rows.map((row) => {
      const mine = row.fromType === type && row.fromId === id
      return {
        linkId: row.id,
        note: row.note,
        type: (mine ? row.toType : row.fromType) as LinkType,
        id: mine ? row.toId : row.fromId,
      }
    })

    const valid = others.filter((o) => isLinkType(o.type))
    const resolved = await resolve(valid)

    // A record deleted since the link was made simply drops out — the database
    // can't cascade a polymorphic reference, so reads are the safety net.
    const links = valid
      .map((o) => {
        const target = resolved.get(`${o.type}:${o.id}`)
        if (!target) return null
        return {
          linkId: o.linkId,
          note: o.note,
          type: o.type,
          typeLabel: RESOLVERS[o.type].label,
          id: o.id,
          tag: target.tag,
          title: target.title,
          route: RESOLVERS[o.type].route,
        }
      })
      .filter(Boolean)

    res.json({ links })
  }),
)

linksRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)

    const fromType = body.fromType
    const toType = body.toType
    if (!isLinkType(fromType) || !isLinkType(toType)) {
      throw badRequest(`\`fromType\` and \`toType\` must be one of: ${LINK_TYPES.join(', ')}`)
    }

    const fromId = str(body, 'fromId', 60)
    const toId = str(body, 'toId', 60)
    if (fromType === toType && fromId === toId) {
      throw badRequest('A record cannot be linked to itself')
    }

    await Promise.all([assertExists(fromType, fromId), assertExists(toType, toId)])

    // The pair is unordered in meaning, so check the mirror before creating —
    // otherwise the same relationship can be stored twice.
    const existing = await prisma.recordLink.findFirst({
      where: {
        OR: [
          { fromType, fromId, toType, toId },
          { fromType: toType, fromId: toId, toType: fromType, toId: fromId },
        ],
      },
    })
    if (existing) {
      res.status(200).json(existing)
      return
    }

    const link = await prisma.recordLink.create({
      data: { fromType, fromId, toType, toId, note: optionalStr(body, 'note', 120) },
    })

    res.status(201).json(link)
  }),
)

linksRouter.delete(
  '/:id',
  route(async (req, res) => {
    const existing = await prisma.recordLink.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Link not found')

    await prisma.recordLink.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
