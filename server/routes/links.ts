import { Router } from 'express'
import { prisma } from '../db'
import { asBody, badRequest, notFound, optionalStr, route, str } from '../http'

export const linksRouter = Router()

/**
 * Every record type that can be linked, and how to resolve one for display.
 *
 * Keeping this in one table is what makes the polymorphic link workable: adding
 * a new linkable type is one entry here, not a migration and a new column.
 *
 * A type is linkable when a person would cross-reference it from somewhere
 * else. Four tagged records are deliberately left out:
 *
 *   MetricSnapshot     a reading, not a record — you cite the product, not
 *                      the Tuesday its MRR was measured
 *   ChecklistTemplate  a definition; the run is the thing that happened
 *   Channel            already binds to a record via recordType/recordId.
 *                      Two mechanisms for one relationship is worse than one
 *   LeaveRequest       referenced by date and person, effectively never
 *                      cross-referenced. Five lines to add if that changes
 *
 * `DeployRun` and `AuditEntry` cannot be linked at all: they carry no tag, and
 * a link with nothing to display is not a link.
 *
 * **Adding a resolver is only half the job.** The picker finds candidates
 * through `/api/search`, so a type with no search kind can be displayed but
 * never created, and a search kind with no `KIND_TO_LINK` entry sends an
 * undefined type and 400s. Change all three together.
 */
const RESOLVERS = {
  task: {
    label: 'Task',
    titleField: 'title',
    route: '#/tasks',
    find: (ids: string[]) =>
      prisma.task.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  contact: {
    label: 'Contact',
    titleField: 'name',
    route: '#/crm',
    find: (ids: string[]) =>
      prisma.contact.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, name: true } }),
  },
  member: {
    label: 'Team',
    titleField: 'name',
    route: '#/team',
    find: (ids: string[]) =>
      prisma.teamMember.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, name: true } }),
  },
  product: {
    label: 'Product',
    titleField: 'name',
    route: '#/products',
    find: (ids: string[]) =>
      prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, name: true } }),
  },
  project: {
    label: 'Project',
    titleField: 'title',
    route: '#/projects',
    find: (ids: string[]) =>
      prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  invoice: {
    label: 'Invoice',
    titleField: 'status',
    route: '#/invoices',
    find: (ids: string[]) =>
      prisma.invoice.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, status: true } }),
  },
  doc: {
    label: 'Doc',
    titleField: 'title',
    route: '#/docs',
    find: (ids: string[]) =>
      prisma.doc.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  objective: {
    label: 'Objective',
    titleField: 'title',
    route: '#/okrs',
    find: (ids: string[]) =>
      prisma.objective.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  entry: {
    label: 'Calendar',
    titleField: 'title',
    route: '#/calendar',
    find: (ids: string[]) =>
      prisma.calendarEntry.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  plan: {
    label: 'Plan item',
    titleField: 'title',
    route: '#/planner',
    find: (ids: string[]) =>
      prisma.planItem.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  idea: {
    label: 'Idea',
    titleField: 'title',
    route: '#/brainstorms',
    find: (ids: string[]) =>
      prisma.idea.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  candidate: {
    label: 'Candidate',
    titleField: 'name',
    route: '#/ops',
    find: (ids: string[]) =>
      prisma.candidate.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, name: true } }),
  },
  vendor: {
    label: 'Vendor',
    titleField: 'name',
    route: '#/ops',
    find: (ids: string[]) =>
      prisma.vendor.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, name: true } }),
  },
  campaign: {
    label: 'Campaign',
    titleField: 'title',
    route: '#/ops',
    find: (ids: string[]) =>
      prisma.campaign.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  compliance: {
    label: 'Obligation',
    titleField: 'title',
    route: '#/compliance',
    find: (ids: string[]) =>
      prisma.complianceItem.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  ticket: {
    label: 'Issue',
    titleField: 'subject',
    route: '#/products',
    find: (ids: string[]) =>
      prisma.ticket.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, subject: true } }),
  },
  epic: {
    label: 'Epic',
    titleField: 'title',
    route: '#/work',
    find: (ids: string[]) =>
      prisma.epic.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  sprint: {
    label: 'Sprint',
    titleField: 'name',
    route: '#/work',
    find: (ids: string[]) =>
      prisma.sprint.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, name: true } }),
  },
  contract: {
    label: 'Contract',
    titleField: 'party',
    route: '#/ops',
    find: (ids: string[]) =>
      prisma.contract.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, party: true } }),
  },
  roadmap: {
    label: 'Roadmap item',
    titleField: 'title',
    route: '#/products',
    find: (ids: string[]) =>
      prisma.roadmapItem.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  release: {
    label: 'Release',
    titleField: 'version',
    route: '#/products',
    find: (ids: string[]) =>
      prisma.release.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, version: true } }),
  },
  customer: {
    label: 'Customer',
    titleField: 'name',
    route: '#/products',
    find: (ids: string[]) =>
      prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, name: true } }),
  },
  keyResult: {
    label: 'Key result',
    titleField: 'title',
    route: '#/okrs',
    find: (ids: string[]) =>
      prisma.keyResult.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, title: true } }),
  },
  fund: {
    label: 'Treasury entry',
    titleField: 'category',
    route: '#/treasury',
    find: (ids: string[]) =>
      prisma.fundEntry.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, category: true } }),
  },
  checklistRun: {
    label: 'Checklist',
    titleField: 'personName',
    route: '#/ops',
    find: (ids: string[]) =>
      prisma.checklistRun.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, personName: true } }),
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
      const field = RESOLVERS[type].titleField
      for (const row of rows as Record<string, unknown>[]) {
        const label = row[field]
        found.set(`${type}:${row.id as string}`, {
          tag: row.tag as string,
          // Each resolver declares which of its columns is the human label.
          // This used to be a `??` chain over every field name in the table,
          // which quietly broke the moment a new type's label field happened to
          // sit behind another one in the order.
          title: typeof label === 'string' && label !== '' ? label : (row.tag as string),
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
