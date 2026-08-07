import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { allocateTag } from '../tags'
import {
  asBody,
  badRequest,
  date,
  notFound,
  oneOf,
  optionalDate,
  optionalId,
  optionalStr,
  route,
  sent,
  str,
} from '../http'
import {
  CHECKLIST_KINDS,
  DIVISIONS,
  TAG_TYPE,
  isChecklistKind,
  isDivision,
} from '../../src/types'

export const checklistsRouter = Router()

/**
 * Onboarding and offboarding checklists — the last item in the master plan's
 * Phase 6 with no home.
 *
 * Two models, on purpose:
 *
 *   template  a reusable definition, so twelve steps are not retyped per hire
 *   run       one person going through it, and the only thing ever ticked
 *
 * A run **copies** its steps from the template rather than referencing them. A
 * template edited next year must not silently rewrite what someone was asked to
 * do last year — the run is a record of what actually happened, and that is the
 * whole reason to keep one.
 */

const WITH_STEPS = {
  steps: { orderBy: { position: 'asc' } },
  _count: { select: { runs: true } },
} satisfies Prisma.ChecklistTemplateInclude

const WITH_ITEMS = {
  member: { select: { id: true, tag: true, name: true, division: true } },
  items: {
    orderBy: { position: 'asc' },
    include: { owner: { select: { id: true, tag: true, name: true } } },
  },
} satisfies Prisma.ChecklistRunInclude

/* -------------------------------------------------------------------------- */
/* Templates                                                                  */
/* -------------------------------------------------------------------------- */

const shapeTemplate = <T extends { _count: { runs: number } }>(row: T) => {
  const { _count, ...template } = row
  return { ...template, runCount: _count.runs }
}

checklistsRouter.get(
  '/templates',
  route(async (req, res) => {
    const { kind, division } = req.query

    const where: Prisma.ChecklistTemplateWhereInput = {}
    if (isChecklistKind(kind)) where.kind = kind
    if (isDivision(division)) where.division = division

    const templates = await prisma.checklistTemplate.findMany({
      where,
      include: WITH_STEPS,
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    })

    res.json(templates.map(shapeTemplate))
  }),
)

/**
 * Steps arrive as a whole ordered list rather than one at a time.
 *
 * A checklist is edited as a list — reordered, lines added and removed
 * together — so a per-step API would mean the client orchestrating several
 * calls and leaving the template half-saved if one failed.
 */
function readSteps(body: Record<string, unknown>) {
  const raw = body.steps
  if (!Array.isArray(raw)) throw badRequest('`steps` must be a list')
  if (raw.length === 0) throw badRequest('A checklist needs at least one step')
  if (raw.length > 100) throw badRequest('A checklist cannot have more than 100 steps')

  return raw.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) throw badRequest('Each step must be an object')
    const step = entry as Record<string, unknown>
    const title = typeof step.title === 'string' ? step.title.trim() : ''
    if (title === '') throw badRequest(`Step ${index + 1} needs a title`)

    const offset = step.dueOffsetDays
    const parsed = offset === undefined || offset === null || offset === '' ? 0 : Number(offset)
    if (!Number.isFinite(parsed)) throw badRequest(`Step ${index + 1} has a bad day offset`)

    return {
      title: title.slice(0, 200),
      position: index,
      ownerHint:
        typeof step.ownerHint === 'string' && step.ownerHint.trim() !== ''
          ? step.ownerHint.trim().slice(0, 80)
          : null,
      dueOffsetDays: Math.trunc(parsed),
    }
  })
}

checklistsRouter.post(
  '/templates',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)
    const steps = readSteps(body)

    const template = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.checklistTemplate)
      return tx.checklistTemplate.create({
        data: {
          tag,
          name: str(body, 'name', 120),
          kind: oneOf(body, 'kind', isChecklistKind, CHECKLIST_KINDS),
          division,
          notes: optionalStr(body, 'notes', 2000),
          steps: { create: steps },
        },
        include: WITH_STEPS,
      })
    })

    res.status(201).json(shapeTemplate(template))
  }),
)

checklistsRouter.patch(
  '/templates/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.checklistTemplate.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Template not found')

    // Steps are replaced wholesale when sent. Runs already hold their own
    // copies, so this cannot disturb anything in progress.
    const steps = sent(body, 'steps') ? readSteps(body) : null

    const template = await prisma.$transaction(async (tx) => {
      if (steps) {
        await tx.checklistTemplateStep.deleteMany({ where: { templateId: req.params.id } })
      }
      return tx.checklistTemplate.update({
        where: { id: req.params.id },
        data: {
          ...(sent(body, 'name') && { name: str(body, 'name', 120) }),
          ...(sent(body, 'kind') && {
            kind: oneOf(body, 'kind', isChecklistKind, CHECKLIST_KINDS),
          }),
          ...(sent(body, 'division') && {
            division: oneOf(body, 'division', isDivision, DIVISIONS),
          }),
          ...(sent(body, 'notes') && { notes: optionalStr(body, 'notes', 2000) }),
          ...(steps ? { steps: { create: steps } } : {}),
        },
        include: WITH_STEPS,
      })
    })

    res.json(shapeTemplate(template))
  }),
)

/**
 * Runs survive — the relation is `onDelete: SetNull`. Deleting a template is
 * tidying up a definition, not erasing the record of who was onboarded with it.
 */
checklistsRouter.delete(
  '/templates/:id',
  route(async (req, res) => {
    if (!(await prisma.checklistTemplate.findUnique({ where: { id: req.params.id } }))) {
      throw notFound('Template not found')
    }
    await prisma.checklistTemplate.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

/* -------------------------------------------------------------------------- */
/* Runs                                                                       */
/* -------------------------------------------------------------------------- */

const shapeRun = <
  T extends { items: { doneAt: Date | null; dueDate: Date | null }[] },
>(
  run: T,
) => {
  const now = new Date()
  return {
    ...run,
    progress: {
      done: run.items.filter((i) => i.doneAt !== null).length,
      total: run.items.length,
      overdue: run.items.filter((i) => i.doneAt === null && i.dueDate !== null && i.dueDate < now)
        .length,
    },
  }
}

checklistsRouter.get(
  '/runs',
  route(async (req, res) => {
    const { kind, division, status } = req.query

    const where: Prisma.ChecklistRunWhereInput = {}
    if (isChecklistKind(kind)) where.kind = kind
    if (isDivision(division)) where.division = division
    if (status === 'open') where.completedAt = null
    if (status === 'done') where.completedAt = { not: null }

    const runs = await prisma.checklistRun.findMany({
      where,
      include: WITH_ITEMS,
      // In progress first, then most recent — the register is read to find out
      // who still needs something done for them.
      orderBy: [{ completedAt: { sort: 'asc', nulls: 'first' } }, { startDate: 'desc' }],
    })

    res.json(runs.map(shapeRun))
  }),
)

/** Applies a step's day offset to the run's start date. */
function dueFrom(startDate: Date, offsetDays: number) {
  const due = new Date(startDate)
  due.setDate(due.getDate() + offsetDays)
  return due
}

checklistsRouter.post(
  '/runs',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)
    const kind = oneOf(body, 'kind', isChecklistKind, CHECKLIST_KINDS)
    const startDate = date(body, 'startDate')
    const memberId = optionalId(body, 'memberId')
    const templateId = optionalId(body, 'templateId')

    let member: { id: string; name: string } | null = null
    if (memberId) {
      member = await prisma.teamMember.findUnique({
        where: { id: memberId },
        select: { id: true, name: true },
      })
      if (!member) throw badRequest('`memberId` does not match a team member')
    }

    // Either a member or a typed name. An onboarding run usually starts before
    // the person has a record at all, which is the point of allowing both.
    const personName = member?.name ?? str(body, 'personName', 120)

    const template = templateId
      ? await prisma.checklistTemplate.findUnique({
          where: { id: templateId },
          include: { steps: { orderBy: { position: 'asc' } } },
        })
      : null
    if (templateId && !template) throw badRequest('`templateId` does not match a template')

    const items = (template?.steps ?? []).map((step) => ({
      title: step.title,
      position: step.position,
      dueDate: dueFrom(startDate, step.dueOffsetDays),
    }))

    const run = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.checklistRun)
      return tx.checklistRun.create({
        data: {
          tag,
          templateId: template?.id ?? null,
          memberId: member?.id ?? null,
          personName,
          kind,
          division,
          startDate,
          notes: optionalStr(body, 'notes', 2000),
          items: { create: items },
        },
        include: WITH_ITEMS,
      })
    })

    res.status(201).json(shapeRun(run))
  }),
)

checklistsRouter.patch(
  '/runs/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.checklistRun.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Run not found')

    const run = await prisma.checklistRun.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'personName') && { personName: str(body, 'personName', 120) }),
        ...(sent(body, 'division') && {
          division: oneOf(body, 'division', isDivision, DIVISIONS),
        }),
        ...(sent(body, 'startDate') && { startDate: date(body, 'startDate') }),
        ...(sent(body, 'notes') && { notes: optionalStr(body, 'notes', 2000) }),
      },
      include: WITH_ITEMS,
    })

    res.json(shapeRun(run))
  }),
)

checklistsRouter.delete(
  '/runs/:id',
  route(async (req, res) => {
    if (!(await prisma.checklistRun.findUnique({ where: { id: req.params.id } }))) {
      throw notFound('Run not found')
    }
    await prisma.checklistRun.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

/* -------------------------------------------------------------------------- */
/* Items                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Recomputes the run's completion after any item changes.
 *
 * Derived rather than set by the client: `completedAt` is a fact about the
 * items, and letting the two be updated separately is how a run ends up marked
 * complete with three things outstanding.
 */
async function syncCompletion(tx: Prisma.TransactionClient, runId: string) {
  const items = await tx.checklistRunItem.findMany({
    where: { runId },
    select: { doneAt: true },
  })

  const allDone = items.length > 0 && items.every((i) => i.doneAt !== null)
  const run = await tx.checklistRun.findUnique({ where: { id: runId }, select: { completedAt: true } })

  if (allDone && !run?.completedAt) {
    await tx.checklistRun.update({ where: { id: runId }, data: { completedAt: new Date() } })
  } else if (!allDone && run?.completedAt) {
    // Reopening on un-ticking matters: a run that stays "complete" after
    // someone reopens a step is lying about the state of the world.
    await tx.checklistRun.update({ where: { id: runId }, data: { completedAt: null } })
  }
}

/** Adds a line to a run in progress — checklists are never quite complete. */
checklistsRouter.post(
  '/runs/:id/items',
  route(async (req, res) => {
    const body = asBody(req.body)
    const run = await prisma.checklistRun.findUnique({
      where: { id: req.params.id },
      include: { items: { select: { position: true } } },
    })
    if (!run) throw notFound('Run not found')

    const ownerId = optionalId(body, 'ownerId')
    if (ownerId) {
      const owner = await prisma.teamMember.count({ where: { id: ownerId } })
      if (owner === 0) throw badRequest('`ownerId` does not match a team member')
    }

    const nextPosition = run.items.reduce((max, i) => Math.max(max, i.position + 1), 0)

    await prisma.$transaction(async (tx) => {
      await tx.checklistRunItem.create({
        data: {
          runId: run.id,
          title: str(body, 'title', 200),
          position: nextPosition,
          ownerId,
          dueDate: optionalDate(body, 'dueDate'),
        },
      })
      await syncCompletion(tx, run.id)
    })

    const updated = await prisma.checklistRun.findUnique({
      where: { id: run.id },
      include: WITH_ITEMS,
    })
    res.status(201).json(shapeRun(updated!))
  }),
)

checklistsRouter.patch(
  '/items/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.checklistRunItem.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Item not found')

    if (sent(body, 'ownerId')) {
      const ownerId = optionalId(body, 'ownerId')
      if (ownerId) {
        const owner = await prisma.teamMember.count({ where: { id: ownerId } })
        if (owner === 0) throw badRequest('`ownerId` does not match a team member')
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.checklistRunItem.update({
        where: { id: req.params.id },
        data: {
          ...(sent(body, 'title') && { title: str(body, 'title', 200) }),
          ...(sent(body, 'ownerId') && { ownerId: optionalId(body, 'ownerId') }),
          ...(sent(body, 'dueDate') && { dueDate: optionalDate(body, 'dueDate') }),
          // `done: true/false` rather than a timestamp from the client, so the
          // time recorded is the server's.
          ...(sent(body, 'done') && { doneAt: body.done === true ? new Date() : null }),
        },
      })
      await syncCompletion(tx, existing.runId)
    })

    const run = await prisma.checklistRun.findUnique({
      where: { id: existing.runId },
      include: WITH_ITEMS,
    })
    res.json(shapeRun(run!))
  }),
)

checklistsRouter.delete(
  '/items/:id',
  route(async (req, res) => {
    const existing = await prisma.checklistRunItem.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Item not found')

    await prisma.$transaction(async (tx) => {
      await tx.checklistRunItem.delete({ where: { id: req.params.id } })
      await syncCompletion(tx, existing.runId)
    })

    const run = await prisma.checklistRun.findUnique({
      where: { id: existing.runId },
      include: WITH_ITEMS,
    })
    res.json(shapeRun(run!))
  }),
)

