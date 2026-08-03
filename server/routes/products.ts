import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { GAPHATCH, allocateTag } from '../tags'
import {
  asBody,
  notFound,
  oneOf,
  optionalStr,
  route,
  sent,
  str,
} from '../http'
import { PRODUCT_STATUSES, TAG_TYPE, isProductStatus } from '../../src/types'

export const productsRouter = Router()

const WITH_COUNTS = {
  _count: { select: { roadmapItems: true, releases: true } },
} satisfies Prisma.ProductInclude

/**
 * Attaches per-product roadmap/release counts.
 *
 * The shipped count needs its own groupBy — a filtered relation count isn't
 * available on this Prisma/SQLite combination, and one extra grouped query is
 * cheaper than N per-product counts.
 */
async function withCounts<T extends { id: string; _count: { roadmapItems: number; releases: number } }>(
  products: T[],
) {
  const shipped = await prisma.roadmapItem.groupBy({
    by: ['productId'],
    where: {
      status: 'shipped',
      productId: { in: products.map((p) => p.id) },
    },
    _count: { _all: true },
  })

  const shippedByProduct = new Map(shipped.map((r) => [r.productId, r._count._all]))

  return products.map(({ _count, ...product }) => ({
    ...product,
    counts: {
      roadmapTotal: _count.roadmapItems,
      roadmapShipped: shippedByProduct.get(product.id) ?? 0,
      releases: _count.releases,
    },
  }))
}

/**
 * PRD §6 Phase 2: each product tracked as its own entity, planning →
 * building → live. Gaphatch-only, so there is no division filter here.
 */
productsRouter.get(
  '/',
  route(async (req, res) => {
    const { status } = req.query

    const products = await prisma.product.findMany({
      where: isProductStatus(status) ? { status } : {},
      include: WITH_COUNTS,
      orderBy: [{ createdAt: 'asc' }],
    })

    res.json(await withCounts(products))
  }),
)

productsRouter.get(
  '/:id',
  route(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: WITH_COUNTS,
    })
    if (!product) throw notFound('Product not found')

    const [withCount] = await withCounts([product])
    res.json(withCount)
  }),
)

productsRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)

    const product = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, GAPHATCH, TAG_TYPE.product)
      return tx.product.create({
        data: {
          tag,
          name: str(body, 'name', 120),
          status: oneOf(body, 'status', isProductStatus, PRODUCT_STATUSES),
          description: optionalStr(body, 'description', 2000),
          url: optionalStr(body, 'url', 500),
          repoUrl: optionalStr(body, 'repoUrl', 500),
        },
        include: WITH_COUNTS,
      })
    })

    const [created] = await withCounts([product])
    res.status(201).json(created)
  }),
)

productsRouter.patch(
  '/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Product not found')

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'name') && { name: str(body, 'name', 120) }),
        ...(sent(body, 'status') && {
          status: oneOf(body, 'status', isProductStatus, PRODUCT_STATUSES),
        }),
        ...(sent(body, 'description') && {
          description: optionalStr(body, 'description', 2000),
        }),
        ...(sent(body, 'url') && { url: optionalStr(body, 'url', 500) }),
        ...(sent(body, 'repoUrl') && { repoUrl: optionalStr(body, 'repoUrl', 500) }),
      },
      include: WITH_COUNTS,
    })

    const [updated] = await withCounts([product])
    res.json(updated)
  }),
)

/**
 * Roadmap items and releases cascade with the product — they have no meaning
 * detached from it. The client confirms before calling this.
 */
productsRouter.delete(
  '/:id',
  route(async (req, res) => {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Product not found')

    await prisma.product.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
