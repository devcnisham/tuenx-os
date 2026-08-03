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
  KEY_RESULT_STATUSES,
  OBJECTIVE_SCOPES,
  TAG_TYPE,
  isDivision,
  isKeyResultStatus,
  isObjectiveScope,
  type Division,
} from '../../src/types'

export const okrsRouter = Router()

const WITH_RELATIONS = {
  product: { select: { id: true, tag: true, name: true } },
  keyResults: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ObjectiveInclude

/**
 * Objective progress, averaged across its key results.
 *
 * Each result contributes current/target, clamped to 1 — a key result that
 * overshoots its target shouldn't let one win paper over three misses. An
 * objective with no key results reads 0 rather than 100: nothing measured is
 * not the same as everything achieved.
 */
function progressOf(keyResults: { targetValue: number; currentValue: number }[]) {
  if (keyResults.length === 0) return 0
  const sum = keyResults.reduce((total, kr) => {
    if (kr.targetValue === 0) return total + (kr.currentValue > 0 ? 1 : 0)
    return total + Math.min(kr.currentValue / kr.targetValue, 1)
  }, 0)
  return sum / keyResults.length
}

const decorate = <T extends { keyResults: { targetValue: number; currentValue: number }[] }>(
  objective: T,
) => ({ ...objective, progress: progressOf(objective.keyResults) })

/**
 * Resolves the scope into the columns the model stores.
 *
 * A product-scoped objective still records a division — always Gaphatch, since
 * products are Gaphatch-only — so every rollup can group by division without
 * a special case for product objectives.
 */
async function resolveScope(body: Record<string, unknown>) {
  const scopeKind = oneOf(body, 'scopeKind', isObjectiveScope, OBJECTIVE_SCOPES)

  if (scopeKind === 'product') {
    const productId = optionalId(body, 'productId')
    if (!productId) throw badRequest('`productId` is required for a product-scoped objective')

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    })
    if (!product) throw badRequest('`productId` does not match a product')

    return { scopeKind, productId, division: 'gaphatch' as Division }
  }

  return {
    scopeKind,
    productId: null,
    division: oneOf(body, 'division', isDivision, DIVISIONS),
  }
}

/** PRD §6 Phase 5: objectives with key results, scoped and tracked per quarter. */
okrsRouter.get(
  '/',
  route(async (req, res) => {
    const { division, period, productId } = req.query

    const where: Prisma.ObjectiveWhereInput = {}
    if (isDivision(division)) where.division = division
    if (typeof period === 'string' && period !== '') where.period = period
    if (typeof productId === 'string' && productId !== '') where.productId = productId

    const objectives = await prisma.objective.findMany({
      where,
      include: WITH_RELATIONS,
      orderBy: [{ period: 'desc' }, { createdAt: 'asc' }],
    })

    res.json(objectives.map(decorate))
  }),
)

okrsRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)
    const scope = await resolveScope(body)

    const objective = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, scope.division, TAG_TYPE.objective)
      return tx.objective.create({
        data: {
          tag,
          ...scope,
          title: str(body, 'title', 200),
          // Free text on purpose — a team that runs halves or thirds shouldn't
          // be forced to call them quarters.
          period: str(body, 'period', 20),
          owner: optionalStr(body, 'owner', 120),
        },
        include: WITH_RELATIONS,
      })
    })

    res.status(201).json(decorate(objective))
  }),
)

okrsRouter.patch(
  '/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.objective.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Objective not found')

    const scope = sent(body, 'scopeKind') ? await resolveScope(body) : {}

    const objective = await prisma.objective.update({
      where: { id: req.params.id },
      data: {
        ...scope,
        ...(sent(body, 'title') && { title: str(body, 'title', 200) }),
        ...(sent(body, 'period') && { period: str(body, 'period', 20) }),
        ...(sent(body, 'owner') && { owner: optionalStr(body, 'owner', 120) }),
      },
      include: WITH_RELATIONS,
    })

    res.json(decorate(objective))
  }),
)

/** Key results cascade — they have no meaning without their objective. */
okrsRouter.delete(
  '/:id',
  route(async (req, res) => {
    const existing = await prisma.objective.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Objective not found')

    await prisma.objective.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

// ---------------------------------------------------------------------------
// Key results
// ---------------------------------------------------------------------------

okrsRouter.post(
  '/:id/key-results',
  route(async (req, res) => {
    const body = asBody(req.body)
    const objective = await prisma.objective.findUnique({
      where: { id: req.params.id },
      select: { id: true, division: true },
    })
    if (!objective) throw notFound('Objective not found')

    const keyResult = await prisma.$transaction(async (tx) => {
      // Tagged with the objective's division, so a KR sits beside its parent.
      const tag = await allocateTag(tx, objective.division as Division, TAG_TYPE.keyResult)
      return tx.keyResult.create({
        data: {
          tag,
          objectiveId: objective.id,
          title: str(body, 'title', 200),
          targetValue: num(body, 'targetValue'),
          currentValue: num(body, 'currentValue'),
          unit: optionalStr(body, 'unit', 20),
          status: oneOf(body, 'status', isKeyResultStatus, KEY_RESULT_STATUSES),
        },
      })
    })

    res.status(201).json(keyResult)
  }),
)

okrsRouter.patch(
  '/key-results/:krId',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.keyResult.findUnique({ where: { id: req.params.krId } })
    if (!existing) throw notFound('Key result not found')

    const keyResult = await prisma.keyResult.update({
      where: { id: req.params.krId },
      data: {
        ...(sent(body, 'title') && { title: str(body, 'title', 200) }),
        ...(sent(body, 'targetValue') && { targetValue: num(body, 'targetValue') }),
        ...(sent(body, 'currentValue') && { currentValue: num(body, 'currentValue') }),
        ...(sent(body, 'unit') && { unit: optionalStr(body, 'unit', 20) }),
        ...(sent(body, 'status') && {
          status: oneOf(body, 'status', isKeyResultStatus, KEY_RESULT_STATUSES),
        }),
      },
    })

    res.json(keyResult)
  }),
)

okrsRouter.delete(
  '/key-results/:krId',
  route(async (req, res) => {
    const existing = await prisma.keyResult.findUnique({ where: { id: req.params.krId } })
    if (!existing) throw notFound('Key result not found')

    await prisma.keyResult.delete({ where: { id: req.params.krId } })
    res.status(204).end()
  }),
)
