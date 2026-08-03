import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { allocateTag } from '../tags'
import {
  asBody,
  badRequest,
  notFound,
  num,
  oneOf,
  optionalId,
  optionalStr,
  route,
  sent,
  str,
} from '../http'
import {
  DIVISIONS,
  IDEA_STATUSES,
  PLAN_EFFORTS,
  PLAN_STATUSES,
  TAG_TYPE,
  isDivision,
  isIdeaStatus,
  isPlanEffort,
  isPlanStatus,
  type Division,
} from '../../src/types'

export const plannerRouter = Router()

const PLAN_RELATIONS = {
  objective: { select: { id: true, tag: true, title: true } },
  product: { select: { id: true, tag: true, name: true } },
} satisfies Prisma.PlanItemInclude

// ---------------------------------------------------------------------------
// Plan items
// ---------------------------------------------------------------------------

/**
 * The quarter planner: what the group intends to do, by period.
 *
 * Separate from Tasks on purpose. A task is work someone is doing now; a plan
 * item is an intention for a period that may never become tasks at all. Merging
 * them turns the task board into a wishlist.
 */
plannerRouter.get(
  '/items',
  route(async (req, res) => {
    const { division, period, status } = req.query

    const where: Prisma.PlanItemWhereInput = {}
    if (isDivision(division)) where.division = division
    if (typeof period === 'string' && period !== '') where.period = period
    if (isPlanStatus(status)) where.status = status

    const items = await prisma.planItem.findMany({
      where,
      include: PLAN_RELATIONS,
      orderBy: [{ period: 'asc' }, { createdAt: 'asc' }],
    })

    res.json(items)
  }),
)

/** Validates the optional links, so neither can point at a missing record. */
async function resolveLinks(body: Record<string, unknown>) {
  const objectiveId = optionalId(body, 'objectiveId')
  const productId = optionalId(body, 'productId')

  if (objectiveId) {
    const found = await prisma.objective.findUnique({
      where: { id: objectiveId },
      select: { id: true },
    })
    if (!found) throw badRequest('`objectiveId` does not match an objective')
  }
  if (productId) {
    const found = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    })
    if (!found) throw badRequest('`productId` does not match a product')
  }

  return { objectiveId, productId }
}

plannerRouter.post(
  '/items',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)
    const links = await resolveLinks(body)

    const item = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.planItem)
      return tx.planItem.create({
        data: {
          tag,
          division,
          ...links,
          title: str(body, 'title', 200),
          period: str(body, 'period', 20),
          status: oneOf(body, 'status', isPlanStatus, PLAN_STATUSES),
          effort: oneOf(body, 'effort', isPlanEffort, PLAN_EFFORTS),
          owner: optionalStr(body, 'owner', 120),
          notes: optionalStr(body, 'notes', 2000),
        },
        include: PLAN_RELATIONS,
      })
    })

    res.status(201).json(item)
  }),
)

plannerRouter.patch(
  '/items/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.planItem.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Plan item not found')

    const links =
      sent(body, 'objectiveId') || sent(body, 'productId') ? await resolveLinks(body) : {}

    const item = await prisma.planItem.update({
      where: { id: req.params.id },
      data: {
        ...links,
        ...(sent(body, 'title') && { title: str(body, 'title', 200) }),
        ...(sent(body, 'division') && {
          division: oneOf(body, 'division', isDivision, DIVISIONS),
        }),
        // Moving between periods is the whole point of a planner, so this is
        // the field most likely to be patched on its own.
        ...(sent(body, 'period') && { period: str(body, 'period', 20) }),
        ...(sent(body, 'status') && {
          status: oneOf(body, 'status', isPlanStatus, PLAN_STATUSES),
        }),
        ...(sent(body, 'effort') && {
          effort: oneOf(body, 'effort', isPlanEffort, PLAN_EFFORTS),
        }),
        ...(sent(body, 'owner') && { owner: optionalStr(body, 'owner', 120) }),
        ...(sent(body, 'notes') && { notes: optionalStr(body, 'notes', 2000) }),
      },
      include: PLAN_RELATIONS,
    })

    res.json(item)
  }),
)

plannerRouter.delete(
  '/items/:id',
  route(async (req, res) => {
    const existing = await prisma.planItem.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Plan item not found')

    await prisma.planItem.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

// ---------------------------------------------------------------------------
// Brainstorm ideas
// ---------------------------------------------------------------------------

plannerRouter.get(
  '/ideas',
  route(async (req, res) => {
    const { division, status } = req.query

    const where: Prisma.IdeaWhereInput = {}
    if (isDivision(division)) where.division = division
    if (isIdeaStatus(status)) where.status = status

    const ideas = await prisma.idea.findMany({
      where,
      include: { planItem: { select: { id: true, tag: true, period: true } } },
      // Most-wanted first, then newest — a brainstorm board should surface
      // what people actually rate, not just what was typed last.
      orderBy: [{ votes: 'desc' }, { createdAt: 'desc' }],
    })

    res.json(ideas)
  }),
)

plannerRouter.post(
  '/ideas',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)

    const idea = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.idea)
      return tx.idea.create({
        data: {
          tag,
          division,
          title: str(body, 'title', 200),
          body: optionalStr(body, 'body', 5000),
          status: oneOf(body, 'status', isIdeaStatus, IDEA_STATUSES),
          author: optionalStr(body, 'author', 120),
          votes: num(body, 'votes'),
        },
        include: { planItem: { select: { id: true, tag: true, period: true } } },
      })
    })

    res.status(201).json(idea)
  }),
)

plannerRouter.patch(
  '/ideas/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.idea.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Idea not found')

    const idea = await prisma.idea.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'title') && { title: str(body, 'title', 200) }),
        ...(sent(body, 'body') && { body: optionalStr(body, 'body', 5000) }),
        ...(sent(body, 'division') && {
          division: oneOf(body, 'division', isDivision, DIVISIONS),
        }),
        ...(sent(body, 'status') && {
          status: oneOf(body, 'status', isIdeaStatus, IDEA_STATUSES),
        }),
        ...(sent(body, 'author') && { author: optionalStr(body, 'author', 120) }),
        ...(sent(body, 'votes') && { votes: num(body, 'votes') }),
      },
      include: { planItem: { select: { id: true, tag: true, period: true } } },
    })

    res.json(idea)
  }),
)

plannerRouter.delete(
  '/ideas/:id',
  route(async (req, res) => {
    const existing = await prisma.idea.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Idea not found')

    await prisma.idea.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

/**
 * Promote an idea into the planner.
 *
 * Creates a plan item, links it back to the idea, and marks the idea promoted
 * — all in one transaction, so a half-promoted idea can't exist. The idea is
 * kept rather than consumed: where a plan came from is worth knowing later.
 */
plannerRouter.post(
  '/ideas/:id/promote',
  route(async (req, res) => {
    const body = asBody(req.body)
    const idea = await prisma.idea.findUnique({
      where: { id: req.params.id },
      include: { planItem: { select: { id: true } } },
    })
    if (!idea) throw notFound('Idea not found')
    if (idea.planItem) throw badRequest('That idea has already been promoted')

    const item = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, idea.division as Division, TAG_TYPE.planItem)
      const created = await tx.planItem.create({
        data: {
          tag,
          title: idea.title,
          division: idea.division,
          period: str(body, 'period', 20),
          status: 'planned',
          effort: oneOf(body, 'effort', isPlanEffort, PLAN_EFFORTS),
          owner: optionalStr(body, 'owner', 120) ?? idea.author,
          notes: idea.body,
          ideaId: idea.id,
        },
        include: PLAN_RELATIONS,
      })

      await tx.idea.update({ where: { id: idea.id }, data: { status: 'promoted' } })
      return created
    })

    res.status(201).json(item)
  }),
)
