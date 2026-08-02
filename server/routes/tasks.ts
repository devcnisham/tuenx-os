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
  optionalId,
  route,
  sent,
  str,
} from '../http.ts'
import {
  DIVISIONS,
  TAG_TYPE,
  TASK_PRIORITIES,
  TASK_STATUSES,
  isDivision,
  isTaskPriority,
  isTaskStatus,
} from '../../src/types.ts'

export const tasksRouter = Router()

/** Relations embedded in every task response. */
const ASSIGNEE_SELECT = {
  select: { id: true, tag: true, name: true, division: true },
} satisfies Prisma.Task$assigneeArgs

const PROJECT_SELECT = {
  select: { id: true, tag: true, title: true },
} satisfies Prisma.Task$projectArgs

const WITH_RELATIONS = {
  assignee: ASSIGNEE_SELECT,
  project: PROJECT_SELECT,
} satisfies Prisma.TaskInclude

/** Rejects a projectId that doesn't resolve, rather than storing a dangling FK. */
async function assertProjectExists(projectId: string | null) {
  if (projectId === null) return
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  })
  if (!project) throw badRequest('`projectId` does not match a project')
}

/** Rejects an assigneeId that doesn't resolve, rather than storing a dangling FK. */
async function assertAssigneeExists(assigneeId: string | null) {
  if (assigneeId === null) return
  const member = await prisma.teamMember.findUnique({
    where: { id: assigneeId },
    select: { id: true },
  })
  if (!member) throw badRequest('`assigneeId` does not match a team member')
}

/**
 * PRD §6 Phase 1: filterable by division, priority, assignee, due date.
 * Filters are query params so a filtered view is a shareable URL.
 */
tasksRouter.get(
  '/',
  route(async (req, res) => {
    const { division, status, priority, assigneeId, dueBefore, projectId, q } = req.query

    const where: Prisma.TaskWhereInput = {}
    if (isDivision(division)) where.division = division
    if (isTaskStatus(status)) where.status = status
    if (isTaskPriority(priority)) where.priority = priority
    if (typeof assigneeId === 'string' && assigneeId !== '') {
      where.assigneeId = assigneeId === 'unassigned' ? null : assigneeId
    }
    if (typeof projectId === 'string' && projectId !== '') where.projectId = projectId
    if (typeof dueBefore === 'string' && dueBefore !== '') {
      const d = new Date(dueBefore)
      if (!Number.isNaN(d.getTime())) where.dueDate = { lte: d }
    }
    // Free-text search over title and tag, so `AGY-T003` finds the record too.
    if (typeof q === 'string' && q.trim() !== '') {
      const term = q.trim()
      where.OR = [{ title: { contains: term } }, { tag: { contains: term.toUpperCase() } }]
    }

    const tasks = await prisma.task.findMany({
      where,
      include: WITH_RELATIONS,
      // Nulls last on dueDate so dated work leads and undated trails.
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    })

    res.json(tasks)
  }),
)

tasksRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)
    const assigneeId = optionalId(body, 'assigneeId')
    const projectId = optionalId(body, 'projectId')
    await Promise.all([assertAssigneeExists(assigneeId), assertProjectExists(projectId)])

    const task = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.task)
      return tx.task.create({
        data: {
          tag,
          title: str(body, 'title', 200),
          division,
          status: oneOf(body, 'status', isTaskStatus, TASK_STATUSES),
          priority: oneOf(body, 'priority', isTaskPriority, TASK_PRIORITIES),
          assigneeId,
          projectId,
          dueDate: optionalDate(body, 'dueDate'),
        },
        include: WITH_RELATIONS,
      })
    })

    res.status(201).json(task)
  }),
)

/** Also the endpoint the kanban board uses to move a card between columns. */
tasksRouter.patch(
  '/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.task.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Task not found')

    if (sent(body, 'assigneeId')) {
      await assertAssigneeExists(optionalId(body, 'assigneeId'))
    }
    if (sent(body, 'projectId')) {
      await assertProjectExists(optionalId(body, 'projectId'))
    }

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'title') && { title: str(body, 'title', 200) }),
        ...(sent(body, 'division') && {
          division: oneOf(body, 'division', isDivision, DIVISIONS),
        }),
        ...(sent(body, 'status') && {
          status: oneOf(body, 'status', isTaskStatus, TASK_STATUSES),
        }),
        ...(sent(body, 'priority') && {
          priority: oneOf(body, 'priority', isTaskPriority, TASK_PRIORITIES),
        }),
        ...(sent(body, 'assigneeId') && { assigneeId: optionalId(body, 'assigneeId') }),
        ...(sent(body, 'projectId') && { projectId: optionalId(body, 'projectId') }),
        ...(sent(body, 'dueDate') && { dueDate: optionalDate(body, 'dueDate') }),
      },
      include: WITH_RELATIONS,
    })

    res.json(task)
  }),
)

tasksRouter.delete(
  '/:id',
  route(async (req, res) => {
    const existing = await prisma.task.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Task not found')

    await prisma.task.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
