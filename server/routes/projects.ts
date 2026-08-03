import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db.ts'
import { allocateTag } from '../tags.ts'
import {
  asBody,
  badRequest,
  notFound,
  oneOf,
  optionalDate,
  route,
  sent,
  str,
} from '../http.ts'
import {
  PROJECT_STATUSES,
  TAG_TYPE,
  isDivision,
  isProjectStatus,
  type Division,
} from '../../src/types.ts'

export const projectsRouter = Router()

const WITH_RELATIONS = {
  contact: { select: { id: true, tag: true, name: true, company: true, division: true } },
  _count: { select: { tasks: true, invoices: true } },
} satisfies Prisma.ProjectInclude

/**
 * Attaches the counts a project card needs: how much work is open, and how
 * much has been invoiced. Both are grouped queries rather than N per-project
 * lookups.
 */
async function decorate<
  T extends {
    id: string
    _count: { tasks: number; invoices: number }
  },
>(projects: T[]) {
  const ids = projects.map((p) => p.id)
  if (ids.length === 0) return []

  const [openTasks, invoiced] = await Promise.all([
    prisma.task.groupBy({
      by: ['projectId'],
      where: { projectId: { in: ids }, status: { not: 'done' } },
      _count: { _all: true },
    }),
    prisma.invoice.groupBy({
      by: ['projectId'],
      where: { projectId: { in: ids } },
      _sum: { amount: true },
    }),
  ])

  const openByProject = new Map(openTasks.map((r) => [r.projectId, r._count._all]))
  const invoicedByProject = new Map(invoiced.map((r) => [r.projectId, r._sum.amount ?? 0]))

  return projects.map(({ _count, ...project }) => ({
    ...project,
    counts: {
      tasks: _count.tasks,
      openTasks: openByProject.get(project.id) ?? 0,
      invoices: _count.invoices,
    },
    invoicedTotal: invoicedByProject.get(project.id) ?? 0,
  }))
}

async function resolveContact(contactId: string) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, division: true },
  })
  if (!contact) throw badRequest('`contactId` does not match a contact')
  return contact
}

/**
 * PRD §6 Phase 3: a project wraps a client, a contract, and tasks into one
 * trackable unit. Division isn't stored on the project — it is inherited from
 * the client, so the two can never disagree.
 */
projectsRouter.get(
  '/',
  route(async (req, res) => {
    const { status, contactId, division } = req.query

    const where: Prisma.ProjectWhereInput = {}
    if (isProjectStatus(status)) where.status = status
    if (typeof contactId === 'string' && contactId !== '') where.contactId = contactId
    if (isDivision(division)) where.contact = { division }

    const projects = await prisma.project.findMany({
      where,
      include: WITH_RELATIONS,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    })

    res.json(await decorate(projects))
  }),
)

projectsRouter.get(
  '/:id',
  route(async (req, res) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: WITH_RELATIONS,
    })
    if (!project) throw notFound('Project not found')

    const [decorated] = await decorate([project])
    res.json(decorated)
  }),
)

projectsRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)
    const contactId = str(body, 'contactId', 60)
    const contact = await resolveContact(contactId)

    const project = await prisma.$transaction(async (tx) => {
      // Tagged with the client's division, so AGY-J001 sits with AGY-C003.
      const tag = await allocateTag(tx, contact.division as Division, TAG_TYPE.project)
      return tx.project.create({
        data: {
          tag,
          contactId,
          title: str(body, 'title', 200),
          status: oneOf(body, 'status', isProjectStatus, PROJECT_STATUSES),
          onHold: body.onHold === true,
          dueDate: optionalDate(body, 'dueDate'),
        },
        include: WITH_RELATIONS,
      })
    })

    const [created] = await decorate([project])
    res.status(201).json(created)
  }),
)

projectsRouter.patch(
  '/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.project.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Project not found')

    if (sent(body, 'contactId')) await resolveContact(str(body, 'contactId', 60))

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'title') && { title: str(body, 'title', 200) }),
        ...(sent(body, 'status') && {
          status: oneOf(body, 'status', isProjectStatus, PROJECT_STATUSES),
        }),
        ...(sent(body, 'contactId') && { contactId: str(body, 'contactId', 60) }),
        // A held project keeps its stage — that is the point of the flag.
        ...(sent(body, 'onHold') && { onHold: body.onHold === true }),
        ...(sent(body, 'dueDate') && { dueDate: optionalDate(body, 'dueDate') }),
      },
      include: WITH_RELATIONS,
    })

    const [updated] = await decorate([project])
    res.json(updated)
  }),
)

/**
 * Tasks survive — the relation is `onDelete: SetNull`, so work doesn't vanish
 * with its container. Invoices keep their contact and lose only the project
 * link.
 */
projectsRouter.delete(
  '/:id',
  route(async (req, res) => {
    const existing = await prisma.project.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Project not found')

    await prisma.project.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
