import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { allocateTag } from '../tags'
import { asBody, badRequest, date, notFound, num, route, sent, str } from '../http'
import { TAG_TYPE } from '../../src/types'

export const metricsRouter = Router()

/**
 * Phase 7 — MRR, active users, and churn, per product.
 *
 * Snapshots rather than a live calculation. A product's MRR on the 1st of last
 * month is a fact that should not change because someone churned today, and
 * the whole point of the series is comparing one month against another. The
 * schema enforces one snapshot per product per date.
 *
 * `activeUsers` and `churnRate` can be derived from the subscriber base (see
 * the derive endpoint). MRR cannot — a Customer carries no price, so what a
 * subscriber pays is not knowable from this database and has to be supplied.
 * Said plainly rather than guessed at with a hardcoded seat price.
 */

const WITH_PRODUCT = {
  product: { select: { id: true, tag: true, name: true } },
} satisfies Prisma.MetricSnapshotInclude

async function resolveProduct(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw badRequest('`productId` does not match a product')
  return product
}

metricsRouter.get(
  '/',
  route(async (req, res) => {
    const { productId } = req.query

    const where: Prisma.MetricSnapshotWhereInput = {}
    if (typeof productId === 'string' && productId !== '') where.productId = productId

    res.json(
      await prisma.metricSnapshot.findMany({
        where,
        include: WITH_PRODUCT,
        orderBy: [{ date: 'desc' }],
      }),
    )
  }),
)

/**
 * Latest reading per product, with the change since the one before it.
 *
 * Deltas are computed here rather than in the client because "since the
 * previous snapshot" depends on what rows exist, and two clients disagreeing
 * about that is how a dashboard starts lying.
 */
metricsRouter.get(
  '/summary',
  route(async (_req, res) => {
    const products = await prisma.product.findMany({
      select: { id: true, tag: true, name: true, status: true },
      orderBy: { createdAt: 'asc' },
    })

    const summaries = await Promise.all(
      products.map(async (product) => {
        // Two most recent, so the delta is against the previous reading rather
        // than against a fixed period that may have no snapshot in it.
        const [latest, previous] = await prisma.metricSnapshot.findMany({
          where: { productId: product.id },
          orderBy: { date: 'desc' },
          take: 2,
        })

        const delta = (now: number | undefined, before: number | undefined) =>
          now === undefined || before === undefined ? null : now - before

        return {
          product,
          latest: latest ?? null,
          previous: previous ?? null,
          change: {
            mrr: delta(latest?.mrr, previous?.mrr),
            activeUsers: delta(latest?.activeUsers, previous?.activeUsers),
            churnRate: delta(latest?.churnRate, previous?.churnRate),
          },
        }
      }),
    )

    const totals = summaries.reduce(
      (acc, s) => ({
        mrr: acc.mrr + (s.latest?.mrr ?? 0),
        activeUsers: acc.activeUsers + (s.latest?.activeUsers ?? 0),
      }),
      { mrr: 0, activeUsers: 0 },
    )

    res.json({ summaries, totals })
  }),
)

metricsRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)
    const productId = str(body, 'productId', 60)
    await resolveProduct(productId)

    const when = date(body, 'date')
    const clash = await prisma.metricSnapshot.findFirst({
      where: { productId, date: when },
      select: { tag: true },
    })
    // The unique index would catch this as a 409, but naming the existing row
    // is more use than "that record already exists".
    if (clash) throw badRequest(`${clash.tag} already covers that date — edit it instead`)

    const snapshot = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, 'gaphatch', TAG_TYPE.metric)
      return tx.metricSnapshot.create({
        data: {
          tag,
          productId,
          date: when,
          mrr: num(body, 'mrr'),
          activeUsers: Math.round(num(body, 'activeUsers')),
          churnRate: num(body, 'churnRate'),
        },
        include: WITH_PRODUCT,
      })
    })

    res.status(201).json(snapshot)
  }),
)

metricsRouter.patch(
  '/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.metricSnapshot.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Snapshot not found')

    res.json(
      await prisma.metricSnapshot.update({
        where: { id: req.params.id },
        data: {
          ...(sent(body, 'date') && { date: date(body, 'date') }),
          ...(sent(body, 'mrr') && { mrr: num(body, 'mrr') }),
          ...(sent(body, 'activeUsers') && {
            activeUsers: Math.round(num(body, 'activeUsers')),
          }),
          ...(sent(body, 'churnRate') && { churnRate: num(body, 'churnRate') }),
        },
        include: WITH_PRODUCT,
      }),
    )
  }),
)

metricsRouter.delete(
  '/:id',
  route(async (req, res) => {
    if (!(await prisma.metricSnapshot.findUnique({ where: { id: req.params.id } }))) {
      throw notFound('Snapshot not found')
    }
    await prisma.metricSnapshot.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

/**
 * Counts the subscriber base and hands back the two figures it can actually
 * know, for today. Does not write — the client puts them in the form next to
 * an MRR the person has to supply, so nobody is ever shown a revenue number
 * this database invented.
 *
 * Churn here is churned ÷ (active + churned) over the whole base, not a
 * period rate. A period rate needs a subscription history table, which does
 * not exist; calling this "churn" without saying so would overstate it.
 */
metricsRouter.get(
  '/derive/:productId',
  route(async (req, res) => {
    await resolveProduct(req.params.productId)

    const counts = await prisma.customer.groupBy({
      by: ['subscriptionStatus'],
      where: { productId: req.params.productId },
      _count: { _all: true },
    })

    const count = (status: string) =>
      counts.find((c) => c.subscriptionStatus === status)?._count._all ?? 0

    const active = count('active')
    const churned = count('churned')
    const base = active + churned

    res.json({
      activeUsers: active,
      trialUsers: count('trial'),
      churnedUsers: churned,
      churnRate: base === 0 ? 0 : Number(((churned / base) * 100).toFixed(1)),
      basis: 'Share of all non-trial subscribers who have churned, all-time — not a period rate.',
    })
  }),
)
