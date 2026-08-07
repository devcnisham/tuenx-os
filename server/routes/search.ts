import { Router } from 'express'
import { prisma } from '../db'
import { route } from '../http'
import { SUBSCRIPTION_STATUS_LABEL, type SubscriptionStatus } from '../../src/types'

export const searchRouter = Router()

/** Shape every hit is flattened into, so one list can mix record types. */
export interface SearchHit {
  id: string
  tag: string
  title: string
  /** Secondary line — client name, role, assignee, whatever identifies it. */
  detail: string | null
  kind:
    | 'task'
    | 'contact'
    | 'member'
    | 'product'
    | 'project'
    | 'invoice'
    | 'doc'
    | 'candidate'
    | 'vendor'
    | 'campaign'
    | 'contract'
    | 'epic'
    | 'sprint'
    | 'ticket'
    | 'customer'
    | 'compliance'
    | 'onboarding'
  /** Hash route that opens the record's module. */
  route: string
}

const LIMIT_PER_KIND = 5

/**
 * Cross-module lookup: one box that finds any record by title or by tag.
 *
 * Typing `AGY-` lists everything Agency; typing `T003` finds the task. That
 * only works because every record carries a division-coded tag — this is the
 * payoff for the tag scheme, not a separate feature.
 *
 * SQLite `contains` is case-insensitive for ASCII, so tags and titles both
 * match without a second query.
 */
searchRouter.get(
  '/',
  route(async (req, res) => {
    const raw = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (raw.length < 2) {
      res.json({ hits: [] })
      return
    }

    const term = raw
    const byTitleOrTag = (titleField: 'title' | 'name') => ({
      OR: [{ [titleField]: { contains: term } }, { tag: { contains: term.toUpperCase() } }],
    })

    /**
     * Client-owned records also match on the client. Searching "northwind"
     * should surface their contact, projects, and invoices — not just the one
     * record that happens to carry the word in its own title.
     */
    const viaClient = [
      { contact: { name: { contains: term } } },
      { contact: { company: { contains: term } } },
    ]

    const [
      tasks,
      contacts,
      members,
      products,
      projects,
      invoices,
      docs,
      candidates,
      vendors,
      campaigns,
      contracts,
      epics,
      sprints,
      tickets,
      customers,
      obligations,
      checklistRuns,
    ] = await Promise.all([
      prisma.task.findMany({
        where: byTitleOrTag('title'),
        take: LIMIT_PER_KIND,
        include: { assignee: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // A contact matches on their own name, their company, or their tag.
      prisma.contact.findMany({
        where: {
          OR: [
            { name: { contains: term } },
            { company: { contains: term } },
            { tag: { contains: term.toUpperCase() } },
          ],
        },
        take: LIMIT_PER_KIND,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.teamMember.findMany({
        where: byTitleOrTag('name'),
        take: LIMIT_PER_KIND,
        orderBy: { name: 'asc' },
      }),
      prisma.product.findMany({
        where: byTitleOrTag('name'),
        take: LIMIT_PER_KIND,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.project.findMany({
        where: { OR: [...byTitleOrTag('title').OR, ...viaClient] },
        take: LIMIT_PER_KIND,
        include: { contact: { select: { name: true, company: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Invoices have no title of their own, so they match on tag, or on the
      // client's name — "northwind" should surface their invoices too.
      prisma.invoice.findMany({
        where: { OR: [{ tag: { contains: term.toUpperCase() } }, ...viaClient] },
        take: LIMIT_PER_KIND,
        include: { contact: { select: { name: true, company: true } } },
        orderBy: { issueDate: 'desc' },
      }),
      // Docs match on their body too — a knowledge base you can only search by
      // title is a filing cabinet, not a knowledge base.
      prisma.doc.findMany({
        where: {
          OR: [
            { title: { contains: term } },
            { body: { contains: term } },
            { tag: { contains: term.toUpperCase() } },
          ],
        },
        take: LIMIT_PER_KIND,
        select: { id: true, tag: true, title: true, category: true },
        orderBy: { updatedAt: 'desc' },
      }),
      // Phase 6. Leave is deliberately absent — it is identified by the person,
      // who is already searchable, and a list of holidays in the results would
      // bury the records people are actually looking for.
      prisma.candidate.findMany({
        where: byTitleOrTag('name'),
        take: LIMIT_PER_KIND,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.vendor.findMany({
        where: byTitleOrTag('name'),
        take: LIMIT_PER_KIND,
        include: { owner: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.campaign.findMany({
        where: byTitleOrTag('title'),
        take: LIMIT_PER_KIND,
        orderBy: { date: 'desc' },
      }),
      // A contract's party is its title — searching a vendor's name should find
      // the agreement with them, not just the subscription.
      prisma.contract.findMany({
        where: {
          OR: [{ party: { contains: term } }, { tag: { contains: term.toUpperCase() } }],
        },
        take: LIMIT_PER_KIND,
        orderBy: { createdAt: 'desc' },
      }),
      // Task depth. A sprint tag pasted into the box should open the sprint.
      prisma.epic.findMany({
        where: byTitleOrTag('title'),
        take: LIMIT_PER_KIND,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.sprint.findMany({
        where: byTitleOrTag('name'),
        take: LIMIT_PER_KIND,
        orderBy: { startDate: 'desc' },
      }),
      // Phase 7. Body-searchable like docs — a bug is usually remembered by
      // what it did, not by its subject line.
      prisma.ticket.findMany({
        where: {
          OR: [
            { subject: { contains: term } },
            { body: { contains: term } },
            { tag: { contains: term.toUpperCase() } },
          ],
        },
        take: LIMIT_PER_KIND,
        include: { product: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Phase 7. A subscriber is looked up by name or the email they wrote in.
      prisma.customer.findMany({
        where: {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { tag: { contains: term.toUpperCase() } },
          ],
        },
        take: LIMIT_PER_KIND,
        include: { product: { select: { id: true, name: true } } },
        orderBy: { since: 'desc' },
      }),
      // Compliance obligations, findable by what they are or who demands them.
      prisma.complianceItem.findMany({
        where: {
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { authority: { contains: term, mode: 'insensitive' } },
            { tag: { contains: term.toUpperCase() } },
          ],
        },
        take: LIMIT_PER_KIND,
        orderBy: { nextDueDate: 'asc' },
      }),
      // Onboarding runs, findable by whose they are.
      prisma.checklistRun.findMany({
        where: {
          OR: [
            { personName: { contains: term, mode: 'insensitive' } },
            { tag: { contains: term.toUpperCase() } },
          ],
        },
        take: LIMIT_PER_KIND,
        orderBy: { startDate: 'desc' },
      }),
    ])

    const hits: SearchHit[] = [
      ...tasks.map((t) => ({
        id: t.id,
        tag: t.tag,
        title: t.title,
        detail: t.assignee?.name ?? 'Unassigned',
        kind: 'task' as const,
        route: '#/tasks',
      })),
      ...contacts.map((c) => ({
        id: c.id,
        tag: c.tag,
        title: c.name,
        detail: c.company,
        kind: 'contact' as const,
        route: '#/crm',
      })),
      ...members.map((m) => ({
        id: m.id,
        tag: m.tag,
        title: m.name,
        detail: m.role,
        kind: 'member' as const,
        route: '#/team',
      })),
      ...products.map((p) => ({
        id: p.id,
        tag: p.tag,
        title: p.name,
        detail: p.status,
        kind: 'product' as const,
        route: `#/products/${p.id}`,
      })),
      ...projects.map((p) => ({
        id: p.id,
        tag: p.tag,
        title: p.title,
        detail: p.contact.company ?? p.contact.name,
        kind: 'project' as const,
        route: '#/projects',
      })),
      ...docs.map((d) => ({
        id: d.id,
        tag: d.tag,
        title: d.title,
        detail: d.category,
        kind: 'doc' as const,
        route: '#/docs',
      })),
      ...invoices.map((i) => ({
        id: i.id,
        tag: i.tag,
        // Amount first — it is what identifies an invoice at a glance. The tag
        // is already rendered beside this, so repeating it here wastes the row.
        title: `${i.amount.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        })} · ${i.contact.company ?? i.contact.name}`,
        detail: i.status,
        kind: 'invoice' as const,
        route: '#/invoices',
      })),
      ...candidates.map((c) => ({
        id: c.id,
        tag: c.tag,
        title: c.name,
        detail: c.role,
        kind: 'candidate' as const,
        route: '#/ops',
      })),
      ...vendors.map((v) => ({
        id: v.id,
        tag: v.tag,
        title: v.name,
        detail: v.owner?.name ?? 'No owner',
        kind: 'vendor' as const,
        route: '#/ops',
      })),
      ...campaigns.map((c) => ({
        id: c.id,
        tag: c.tag,
        title: c.title,
        detail: c.channel,
        kind: 'campaign' as const,
        route: '#/ops',
      })),
      ...contracts.map((c) => ({
        id: c.id,
        tag: c.tag,
        title: c.party,
        detail: c.type,
        kind: 'contract' as const,
        route: '#/ops',
      })),
      ...epics.map((e) => ({
        id: e.id,
        tag: e.tag,
        title: e.title,
        detail: e.status,
        kind: 'epic' as const,
        route: `#/tasks?epic=${e.id}`,
      })),
      ...sprints.map((s) => ({
        id: s.id,
        tag: s.tag,
        title: s.name,
        detail: s.goal,
        kind: 'sprint' as const,
        route: `#/tasks?sprint=${s.id}`,
      })),
      ...tickets.map((t) => ({
        id: t.id,
        tag: t.tag,
        title: t.subject,
        detail: `${t.kind} · ${t.product.name}`,
        kind: 'ticket' as const,
        route: `#/products/${t.productId}`,
      })),
      ...customers.map((c) => ({
        id: c.id,
        tag: c.tag,
        title: c.name,
        detail: `${SUBSCRIPTION_STATUS_LABEL[c.subscriptionStatus as SubscriptionStatus]} · ${c.product.name}`,
        kind: 'customer' as const,
        route: `#/products/${c.productId}`,
      })),
      ...obligations.map((o) => ({
        id: o.id,
        tag: o.tag,
        title: o.title,
        detail: o.authority ?? 'Compliance',
        kind: 'compliance' as const,
        route: '#/compliance',
      })),
      ...checklistRuns.map((r) => ({
        id: r.id,
        tag: r.tag,
        title: `${r.personName} — ${r.kind}`,
        detail: r.completedAt ? 'Complete' : 'In progress',
        kind: 'onboarding' as const,
        route: '#/ops',
      })),
    ]

    res.json({ hits })
  }),
)
