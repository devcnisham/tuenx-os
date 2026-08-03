import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db.ts'
import { allocateTag } from '../tags.ts'
import {
  asBody,
  badRequest,
  num,
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
  epic: { select: { id: true, tag: true, title: true } },
  sprint: { select: { id: true, tag: true, name: true } },
  subtasks: {
    include: { assignee: ASSIGNEE_SELECT },
    orderBy: { createdAt: 'asc' },
  },
  _count: { select: { subtasks: true } },
} satisfies Prisma.TaskInclude

/**
 * Attaches logged hours, which are summed from time entries rather than stored
 * on the task — a stored total can disagree with its own entries, and the
 * entries are what say who spent the time and when.
 */
async function withHours<
  T extends { id: string; subtasks?: { status: string }[]; _count?: { subtasks: number } },
>(tasks: T[]) {
  if (tasks.length === 0) return []
  const logged = await prisma.timeEntry.groupBy({
    by: ['taskId'],
    where: { taskId: { in: tasks.map((t) => t.id) } },
    _sum: { hours: true },
  })
  const byTask = new Map(logged.map((l) => [l.taskId, l._sum.hours ?? 0]))

  return tasks.map(({ _count, ...task }) => ({
    ...task,
    loggedHours: byTask.get(task.id) ?? 0,
    // `counts` rather than Prisma's `_count`: the client's Task type declares
    // this shape, and done-of-total is the number a card actually shows.
    counts: {
      subtasks: _count?.subtasks ?? 0,
      subtasksDone: (task.subtasks ?? []).filter((s) => s.status === 'done').length,
    },
  }))
}

/**
 * Resolves a parent task, and refuses to nest more than one level.
 *
 * A tree nobody can see the bottom of is worse than a flat list — a subtask of
 * a subtask is almost always a sign the parent should have been an epic.
 */
async function assertParentValid(parentId: string | null) {
  if (parentId === null) return
  const parent = await prisma.task.findUnique({
    where: { id: parentId },
    select: { id: true, parentId: true },
  })
  if (!parent) throw badRequest('`parentId` does not match a task')
  if (parent.parentId) throw badRequest('Subtasks cannot be nested more than one level deep')
}

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
    const { division, status, priority, assigneeId, dueBefore, projectId, epicId, sprintId, q } =
      req.query

    const where: Prisma.TaskWhereInput = {}
    if (isDivision(division)) where.division = division
    if (isTaskStatus(status)) where.status = status
    if (isTaskPriority(priority)) where.priority = priority
    if (typeof assigneeId === 'string' && assigneeId !== '') {
      where.assigneeId = assigneeId === 'unassigned' ? null : assigneeId
    }
    if (typeof projectId === 'string' && projectId !== '') where.projectId = projectId
    if (typeof epicId === 'string' && epicId !== '') where.epicId = epicId
    if (typeof sprintId === 'string' && sprintId !== '') where.sprintId = sprintId
    // Subtasks are shown nested under their parent, so the top-level board
    // lists only roots. `?includeSubtasks=true` opts out, and `?parentId=` asks
    // for one task's children directly.
    const { parentId } = req.query
    if (typeof parentId === 'string' && parentId !== '') where.parentId = parentId
    else if (req.query.includeSubtasks !== 'true') where.parentId = null
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

    res.json(await withHours(tasks))
  }),
)

tasksRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)
    const assigneeId = optionalId(body, 'assigneeId')
    const projectId = optionalId(body, 'projectId')
    const parentId = optionalId(body, 'parentId')
    await Promise.all([
      assertAssigneeExists(assigneeId),
      assertProjectExists(projectId),
      assertParentValid(parentId),
    ])

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
          parentId,
          epicId: optionalId(body, 'epicId'),
          sprintId: optionalId(body, 'sprintId'),
          estimateHours:
            body.estimateHours === undefined || body.estimateHours === null || body.estimateHours === ''
              ? null
              : num(body, 'estimateHours'),
          dueDate: optionalDate(body, 'dueDate'),
        },
        include: WITH_RELATIONS,
      })
    })

    const [withLogged] = await withHours([task])
    res.status(201).json(withLogged)
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
    if (sent(body, 'parentId')) {
      await assertParentValid(optionalId(body, 'parentId'))
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
        ...(sent(body, 'parentId') && { parentId: optionalId(body, 'parentId') }),
        ...(sent(body, 'epicId') && { epicId: optionalId(body, 'epicId') }),
        ...(sent(body, 'sprintId') && { sprintId: optionalId(body, 'sprintId') }),
        ...(sent(body, 'estimateHours') && {
          estimateHours:
            body.estimateHours === null || body.estimateHours === ''
              ? null
              : num(body, 'estimateHours'),
        }),
        ...(sent(body, 'dueDate') && { dueDate: optionalDate(body, 'dueDate') }),
      },
      include: WITH_RELATIONS,
    })

    const [withLogged] = await withHours([task])
    res.json(withLogged)
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
