import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db.ts'
import { allocateTag } from '../tags.ts'
import {
  asBody,
  badRequest,
  date,
  notFound,
  num,
  oneOf,
  optionalId,
  optionalStr,
  route,
  sent,
  str,
} from '../http.ts'
import {
  DIVISIONS,
  EPIC_STATUSES,
  SPRINT_STATUSES,
  TAG_TYPE,
  isDivision,
  isEpicStatus,
  isSprintStatus,
} from '../../src/types.ts'

export const workRouter = Router()

/**
 * Epics, sprints, and logged time — the structure around tasks.
 *
 * All three are optional. A team that doesn't run sprints leaves every task's
 * sprintId null and nothing about the board changes; the same for epics and
 * time. Structure that forces itself on people who don't want it is how a task
 * tool becomes the thing everyone avoids.
 */

/** Rolls task counts and hours into an epic or sprint. */
async function rollup(where: Prisma.TaskWhereInput, ids: string[], key: 'epicId' | 'sprintId') {
  if (ids.length === 0) return new Map<string, { tasks: number; done: number; estimateHours: number; loggedHours: number }>()

  const [tasks, logged] = await Promise.all([
    prisma.task.findMany({
      where: { ...where, [key]: { in: ids } },
      select: { id: true, epicId: true, sprintId: true, status: true, estimateHours: true },
    }),
    prisma.timeEntry.groupBy({
      by: ['taskId'],
      _sum: { hours: true },
    }),
  ])

  const hoursByTask = new Map(logged.map((l) => [l.taskId, l._sum.hours ?? 0]))
  const out = new Map<string, { tasks: number; done: number; estimateHours: number; loggedHours: number }>()

  for (const task of tasks) {
    const owner = key === 'epicId' ? task.epicId : task.sprintId
    if (!owner) continue
    const bucket = out.get(owner) ?? { tasks: 0, done: 0, estimateHours: 0, loggedHours: 0 }
    bucket.tasks += 1
    if (task.status === 'done') bucket.done += 1
    bucket.estimateHours += task.estimateHours ?? 0
    bucket.loggedHours += hoursByTask.get(task.id) ?? 0
    out.set(owner, bucket)
  }

  return out
}

// ---------------------------------------------------------------------------
// Epics
// ---------------------------------------------------------------------------

workRouter.get(
  '/epics',
  route(async (req, res) => {
    const { division, status } = req.query

    const where: Prisma.EpicWhereInput = {}
    if (isDivision(division)) where.division = division
    if (isEpicStatus(status)) where.status = status

    const epics = await prisma.epic.findMany({ where, orderBy: [{ createdAt: 'asc' }] })
    const stats = await rollup({}, epics.map((e) => e.id), 'epicId')

    res.json(
      epics.map((epic) => {
        const s = stats.get(epic.id) ?? { tasks: 0, done: 0, estimateHours: 0, loggedHours: 0 }
        return {
          ...epic,
          counts: { tasks: s.tasks, done: s.done },
          estimateHours: s.estimateHours,
          loggedHours: s.loggedHours,
        }
      }),
    )
  }),
)

workRouter.post(
  '/epics',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)

    const epic = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.epic)
      return tx.epic.create({
        data: {
          tag,
          division,
          title: str(body, 'title', 200),
          status: oneOf(body, 'status', isEpicStatus, EPIC_STATUSES),
          notes: optionalStr(body, 'notes', 2000),
        },
      })
    })

    res.status(201).json({ ...epic, counts: { tasks: 0, done: 0 }, estimateHours: 0, loggedHours: 0 })
  }),
)

workRouter.patch(
  '/epics/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.epic.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Epic not found')

    const epic = await prisma.epic.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'title') && { title: str(body, 'title', 200) }),
        ...(sent(body, 'division') && {
          division: oneOf(body, 'division', isDivision, DIVISIONS),
        }),
        ...(sent(body, 'status') && { status: oneOf(body, 'status', isEpicStatus, EPIC_STATUSES) }),
        ...(sent(body, 'notes') && { notes: optionalStr(body, 'notes', 2000) }),
      },
    })

    const stats = await rollup({}, [epic.id], 'epicId')
    const s = stats.get(epic.id) ?? { tasks: 0, done: 0, estimateHours: 0, loggedHours: 0 }
    res.json({ ...epic, counts: { tasks: s.tasks, done: s.done }, estimateHours: s.estimateHours, loggedHours: s.loggedHours })
  }),
)

/** Tasks survive — the relation is SetNull, so work outlives its epic. */
workRouter.delete(
  '/epics/:id',
  route(async (req, res) => {
    const existing = await prisma.epic.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Epic not found')

    await prisma.epic.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

// ---------------------------------------------------------------------------
// Sprints
// ---------------------------------------------------------------------------

workRouter.get(
  '/sprints',
  route(async (req, res) => {
    const { division, status } = req.query

    const where: Prisma.SprintWhereInput = {}
    if (isDivision(division)) where.division = division
    if (isSprintStatus(status)) where.status = status

    const sprints = await prisma.sprint.findMany({ where, orderBy: [{ startDate: 'desc' }] })
    const stats = await rollup({}, sprints.map((s) => s.id), 'sprintId')

    res.json(
      sprints.map((sprint) => {
        const s = stats.get(sprint.id) ?? { tasks: 0, done: 0, estimateHours: 0, loggedHours: 0 }
        return {
          ...sprint,
          counts: { tasks: s.tasks, done: s.done },
          estimateHours: s.estimateHours,
          loggedHours: s.loggedHours,
        }
      }),
    )
  }),
)

workRouter.post(
  '/sprints',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)

    const startDate = date(body, 'startDate')
    const endDate = date(body, 'endDate')
    if (endDate < startDate) throw badRequest('`endDate` cannot be before `startDate`')

    const sprint = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.sprint)
      return tx.sprint.create({
        data: {
          tag,
          division,
          name: str(body, 'name', 120),
          goal: optionalStr(body, 'goal', 500),
          status: oneOf(body, 'status', isSprintStatus, SPRINT_STATUSES),
          startDate,
          endDate,
        },
      })
    })

    res.status(201).json({ ...sprint, counts: { tasks: 0, done: 0 }, estimateHours: 0, loggedHours: 0 })
  }),
)

workRouter.patch(
  '/sprints/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.sprint.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Sprint not found')

    const startDate = sent(body, 'startDate') ? date(body, 'startDate') : existing.startDate
    const endDate = sent(body, 'endDate') ? date(body, 'endDate') : existing.endDate
    if (endDate < startDate) throw badRequest('`endDate` cannot be before `startDate`')

    const sprint = await prisma.sprint.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'name') && { name: str(body, 'name', 120) }),
        ...(sent(body, 'goal') && { goal: optionalStr(body, 'goal', 500) }),
        ...(sent(body, 'division') && {
          division: oneOf(body, 'division', isDivision, DIVISIONS),
        }),
        ...(sent(body, 'status') && {
          status: oneOf(body, 'status', isSprintStatus, SPRINT_STATUSES),
        }),
        ...(sent(body, 'startDate') && { startDate }),
        ...(sent(body, 'endDate') && { endDate }),
      },
    })

    const stats = await rollup({}, [sprint.id], 'sprintId')
    const s = stats.get(sprint.id) ?? { tasks: 0, done: 0, estimateHours: 0, loggedHours: 0 }
    res.json({ ...sprint, counts: { tasks: s.tasks, done: s.done }, estimateHours: s.estimateHours, loggedHours: s.loggedHours })
  }),
)

workRouter.delete(
  '/sprints/:id',
  route(async (req, res) => {
    const existing = await prisma.sprint.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Sprint not found')

    await prisma.sprint.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

// ---------------------------------------------------------------------------
// Time entries
// ---------------------------------------------------------------------------

workRouter.get(
  '/time',
  route(async (req, res) => {
    const { taskId, memberId } = req.query

    const where: Prisma.TimeEntryWhereInput = {}
    if (typeof taskId === 'string' && taskId !== '') where.taskId = taskId
    if (typeof memberId === 'string' && memberId !== '') where.memberId = memberId

    const entries = await prisma.timeEntry.findMany({
      where,
      include: { member: { select: { id: true, tag: true, name: true } } },
      orderBy: [{ date: 'desc' }],
    })

    res.json(entries)
  }),
)

workRouter.post(
  '/time',
  route(async (req, res) => {
    const body = asBody(req.body)
    const taskId = str(body, 'taskId', 60)

    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } })
    if (!task) throw badRequest('`taskId` does not match a task')

    const memberId = optionalId(body, 'memberId')
    if (memberId) {
      const found = await prisma.teamMember.count({ where: { id: memberId } })
      if (found === 0) throw badRequest('`memberId` does not match a team member')
    }

    const hours = num(body, 'hours')
    if (hours <= 0) throw badRequest('`hours` must be greater than zero')
    if (hours > 24) throw badRequest('`hours` cannot exceed 24 for a single day')

    const entry = await prisma.timeEntry.create({
      data: {
        taskId,
        memberId,
        hours,
        date: date(body, 'date'),
        note: optionalStr(body, 'note', 500),
      },
      include: { member: { select: { id: true, tag: true, name: true } } },
    })

    res.status(201).json(entry)
  }),
)

workRouter.delete(
  '/time/:id',
  route(async (req, res) => {
    const existing = await prisma.timeEntry.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Time entry not found')

    await prisma.timeEntry.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
