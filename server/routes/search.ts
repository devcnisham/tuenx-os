import { Router } from 'express'
import { prisma } from '../db.ts'
import { route } from '../http.ts'

export const searchRouter = Router()

/** Shape every hit is flattened into, so one list can mix record types. */
export interface SearchHit {
  id: string
  tag: string
  title: string
  /** Secondary line — client name, role, assignee, whatever identifies it. */
  detail: string | null
  kind: 'task' | 'contact' | 'member' | 'product' | 'project' | 'invoice'
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

    const [tasks, contacts, members, products, projects, invoices] = await Promise.all([
      prisma.task.findMany({
        where: byTitleOrTag('title'),
        take: LIMIT_PER_KIND,
        include: { assignee: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.contact.findMany({
        where: byTitleOrTag('name'),
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
        where: byTitleOrTag('title'),
        take: LIMIT_PER_KIND,
        include: { contact: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.findMany({
        where: { tag: { contains: term.toUpperCase() } },
        take: LIMIT_PER_KIND,
        include: { contact: { select: { name: true } } },
        orderBy: { issueDate: 'desc' },
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
        detail: p.contact.name,
        kind: 'project' as const,
        route: '#/projects',
      })),
      ...invoices.map((i) => ({
        id: i.id,
        tag: i.tag,
        title: `${i.contact.name} · ${i.status}`,
        detail: i.tag,
        kind: 'invoice' as const,
        route: '#/invoices',
      })),
    ]

    res.json({ hits })
  }),
)
