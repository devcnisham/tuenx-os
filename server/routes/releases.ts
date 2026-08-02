import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db.ts'
import { GAPHATCH, allocateTag } from '../tags.ts'
import {
  asBody,
  badRequest,
  date,
  notFound,
  optionalDate,
  optionalStr,
  route,
  sent,
  str,
} from '../http.ts'
import { TAG_TYPE } from '../../src/types.ts'

export const releasesRouter = Router()

async function assertProductExists(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  })
  if (!product) throw badRequest('`productId` does not match a product')
}

/** PRD §6 Phase 2: per-product release log. Newest first — it reads as a changelog. */
releasesRouter.get(
  '/',
  route(async (req, res) => {
    const { productId } = req.query

    const where: Prisma.ReleaseWhereInput = {}
    if (typeof productId === 'string' && productId !== '') where.productId = productId

    const releases = await prisma.release.findMany({
      where,
      orderBy: [{ date: 'desc' }],
    })

    res.json(releases)
  }),
)

releasesRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)
    const productId = str(body, 'productId', 60)
    await assertProductExists(productId)

    const release = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, GAPHATCH, TAG_TYPE.release)
      return tx.release.create({
        data: {
          tag,
          productId,
          // Free-form on purpose: TRD types this as a string, and Gaphatch
          // products aren't all going to use semver.
          version: str(body, 'version', 40),
          notes: optionalStr(body, 'notes', 5000),
          date: date(body, 'date'),
        },
      })
    })

    res.status(201).json(release)
  }),
)

releasesRouter.patch(
  '/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.release.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Release not found')

    const nextDate = sent(body, 'date') ? optionalDate(body, 'date') : undefined
    if (nextDate === null) throw badRequest('`date` is required')

    const release = await prisma.release.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'version') && { version: str(body, 'version', 40) }),
        ...(sent(body, 'notes') && { notes: optionalStr(body, 'notes', 5000) }),
        ...(nextDate !== undefined && { date: nextDate }),
      },
    })

    res.json(release)
  }),
)

releasesRouter.delete(
  '/:id',
  route(async (req, res) => {
    const existing = await prisma.release.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Release not found')

    await prisma.release.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
