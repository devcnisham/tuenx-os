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
  optionalStr,
  route,
  sent,
  str,
} from '../http'
import {
  SUBSCRIPTION_STATUSES,
  TAG_TYPE,
  isSubscriptionStatus,
} from '../../src/types'

export const customersRouter = Router()

/**
 * Phase 7 — the subscriber base, per product.
 *
 * Hangs off a product rather than a division, like tickets: a subscriber
 * belongs to the thing they subscribe to, and the division follows (always
 * Gaphatch). No division column, and the tag is allocated as Gaphatch's.
 *
 * Deliberately separate from CRM `Contact`. A Contact is a deal being worked
 * by a person; a Customer is an account already paying for one product. They
 * have different lifecycles, and merging them would mean every self-serve
 * signup lands in the sales pipeline.
 */

const WITH_PRODUCT = {
  product: { select: { id: true, tag: true, name: true } },
  _count: { select: { tickets: true } },
} satisfies Prisma.CustomerInclude

async function resolveProduct(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw badRequest('`productId` does not match a product')
  return product
}

const shape = <T extends { _count: { tickets: number } }>(row: T) => {
  const { _count, ...customer } = row
  return { ...customer, counts: { tickets: _count.tickets } }
}

customersRouter.get(
  '/',
  route(async (req, res) => {
    const { productId, subscriptionStatus, q } = req.query

    const where: Prisma.CustomerWhereInput = {}
    if (typeof productId === 'string' && productId !== '') where.productId = productId
    if (isSubscriptionStatus(subscriptionStatus)) where.subscriptionStatus = subscriptionStatus
    if (typeof q === 'string' && q.trim() !== '') {
      const term = q.trim()
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { tag: { contains: term.toUpperCase() } },
      ]
    }

    const customers = await prisma.customer.findMany({
      where,
      include: WITH_PRODUCT,
      // Newest subscribers first — the question asked of this list is almost
      // always "who just signed up", not "who has been here longest".
      orderBy: [{ since: 'desc' }],
    })

    res.json(customers.map(shape))
  }),
)

customersRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)
    const productId = str(body, 'productId', 60)
    await resolveProduct(productId)

    const customer = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, 'gaphatch', TAG_TYPE.customer)
      return tx.customer.create({
        data: {
          tag,
          productId,
          name: str(body, 'name', 160),
          email: optionalStr(body, 'email', 200),
          subscriptionStatus: oneOf(
            body,
            'subscriptionStatus',
            isSubscriptionStatus,
            SUBSCRIPTION_STATUSES,
          ),
          since: date(body, 'since'),
        },
        include: WITH_PRODUCT,
      })
    })

    res.status(201).json(shape(customer))
  }),
)

customersRouter.patch(
  '/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.customer.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Customer not found')

    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'name') && { name: str(body, 'name', 160) }),
        ...(sent(body, 'email') && { email: optionalStr(body, 'email', 200) }),
        ...(sent(body, 'subscriptionStatus') && {
          subscriptionStatus: oneOf(
            body,
            'subscriptionStatus',
            isSubscriptionStatus,
            SUBSCRIPTION_STATUSES,
          ),
        }),
        ...(sent(body, 'since') && { since: date(body, 'since') }),
      },
      include: WITH_PRODUCT,
    })

    res.json(shape(customer))
  }),
)

/**
 * Tickets survive — the relation is `onDelete: SetNull`, so deleting a
 * subscriber does not delete the bugs they reported. The ticket keeps its
 * free-text `customerContact` as the remaining trace of who raised it.
 */
customersRouter.delete(
  '/:id',
  route(async (req, res) => {
    if (!(await prisma.customer.findUnique({ where: { id: req.params.id } }))) {
      throw notFound('Customer not found')
    }
    await prisma.customer.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
