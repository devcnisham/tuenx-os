import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { GAPHATCH, allocateTag } from '../tags'
import { asBody, badRequest, notFound, oneOf, route, sent, str } from '../http'
import { ROADMAP_STATUSES, TAG_TYPE, isRoadmapStatus } from '../../src/types'

export const roadmapRouter = Router()

async function assertProductExists(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  })
  if (!product) throw badRequest('`productId` does not match a product')
}

/**
 * PRD §6 Phase 2: per-product roadmap, backlog → building → shipped.
 * Always scoped to one product in practice; the unfiltered list backs the
 * cross-product rollup.
 */
roadmapRouter.get(
  '/',
  route(async (req, res) => {
    const { productId, status } = req.query

    const where: Prisma.RoadmapItemWhereInput = {}
    if (typeof productId === 'string' && productId !== '') where.productId = productId
    if (isRoadmapStatus(status)) where.status = status

    const items = await prisma.roadmapItem.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }],
    })

    res.json(items)
  }),
)

roadmapRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)
    const productId = str(body, 'productId', 60)
    await assertProductExists(productId)

    // Roadmap items belong to Gaphatch products, so they carry GPH-R### tags.
    const item = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, GAPHATCH, TAG_TYPE.roadmap)
      return tx.roadmapItem.create({
        data: {
          tag,
          productId,
          title: str(body, 'title', 200),
          status: oneOf(body, 'status', isRoadmapStatus, ROADMAP_STATUSES),
        },
      })
    })

    res.status(201).json(item)
  }),
)

/** Also the endpoint the roadmap board uses to move an item between columns. */
roadmapRouter.patch(
  '/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.roadmapItem.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Roadmap item not found')

    const item = await prisma.roadmapItem.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'title') && { title: str(body, 'title', 200) }),
        ...(sent(body, 'status') && {
          status: oneOf(body, 'status', isRoadmapStatus, ROADMAP_STATUSES),
        }),
      },
    })

    res.json(item)
  }),
)

roadmapRouter.delete(
  '/:id',
  route(async (req, res) => {
    const existing = await prisma.roadmapItem.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Roadmap item not found')

    await prisma.roadmapItem.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
