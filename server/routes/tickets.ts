import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db.ts'
import { allocateTag } from '../tags.ts'
import {
  asBody,
  badRequest,
  notFound,
  oneOf,
  optionalId,
  optionalStr,
  route,
  sent,
  str,
} from '../http.ts'
import {
  TAG_TYPE,
  TASK_PRIORITIES,
  TICKET_KINDS,
  TICKET_STATUSES,
  isTaskPriority,
  isTicketKind,
  isTicketStatus,
} from '../../src/types.ts'

export const ticketsRouter = Router()

/**
 * Phase 7 — bugs, issues, and feature requests against a Gaphatch product.
 *
 * Everything here hangs off a product rather than a division: a bug belongs to
 * the thing it is a bug in, and the division follows from the product (always
 * Gaphatch). That is why tickets have no division column and their tag is
 * allocated as Gaphatch's.
 *
 * One queue for all three kinds, deliberately. Bugs and feature requests
 * compete for the same week of the same engineer, and splitting them into two
 * systems is how a bug list quietly becomes something nobody opens.
 */

const WITH_PRODUCT = {
  product: { select: { id: true, tag: true, name: true } },
} satisfies Prisma.TicketInclude

/** Refuses a productId that doesn't resolve rather than storing a dangling FK. */
async function resolveProduct(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw badRequest('`productId` does not match a product')
  return product
}

ticketsRouter.get(
  '/',
  route(async (req, res) => {
    const { productId, status, kind, q } = req.query

    const where: Prisma.TicketWhereInput = {}
    if (typeof productId === 'string' && productId !== '') where.productId = productId
    if (isTicketStatus(status)) where.status = status
    if (isTicketKind(kind)) where.kind = kind
    if (typeof q === 'string' && q.trim() !== '') {
      const term = q.trim()
      where.OR = [
        { subject: { contains: term } },
        { body: { contains: term } },
        { tag: { contains: term.toUpperCase() } },
      ]
    }

    res.json(
      await prisma.ticket.findMany({
        where,
        include: WITH_PRODUCT,
        // Open work first, then most recent. A resolved ticket is history.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
    )
  }),
)

ticketsRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)
    const productId = str(body, 'productId', 60)
    await resolveProduct(productId)

    const customerId = optionalId(body, 'customerId')
    if (customerId) {
      const found = await prisma.customer.count({ where: { id: customerId, productId } })
      // A customer of a different product reporting this one's bug is almost
      // always a mistake, and silently accepting it makes the count lie.
      if (found === 0) throw badRequest('`customerId` is not a customer of this product')
    }

    const ticket = await prisma.$transaction(async (tx) => {
      // Products are Gaphatch-only, so its tickets are too.
      const tag = await allocateTag(tx, 'gaphatch', TAG_TYPE.ticket)
      return tx.ticket.create({
        data: {
          tag,
          productId,
          customerId,
          customerContact: optionalStr(body, 'customerContact', 160),
          subject: str(body, 'subject', 200),
          body: optionalStr(body, 'body', 4000),
          kind: oneOf(body, 'kind', isTicketKind, TICKET_KINDS),
          status: oneOf(body, 'status', isTicketStatus, TICKET_STATUSES),
          priority: oneOf(body, 'priority', isTaskPriority, TASK_PRIORITIES),
        },
        include: WITH_PRODUCT,
      })
    })

    res.status(201).json(ticket)
  }),
)

ticketsRouter.patch(
  '/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Ticket not found')

    res.json(
      await prisma.ticket.update({
        where: { id: req.params.id },
        data: {
          ...(sent(body, 'subject') && { subject: str(body, 'subject', 200) }),
          ...(sent(body, 'body') && { body: optionalStr(body, 'body', 4000) }),
          ...(sent(body, 'kind') && { kind: oneOf(body, 'kind', isTicketKind, TICKET_KINDS) }),
          ...(sent(body, 'status') && {
            status: oneOf(body, 'status', isTicketStatus, TICKET_STATUSES),
          }),
          ...(sent(body, 'priority') && {
            priority: oneOf(body, 'priority', isTaskPriority, TASK_PRIORITIES),
          }),
          ...(sent(body, 'customerContact') && {
            customerContact: optionalStr(body, 'customerContact', 160),
          }),
        },
        include: WITH_PRODUCT,
      }),
    )
  }),
)

ticketsRouter.delete(
  '/:id',
  route(async (req, res) => {
    if (!(await prisma.ticket.findUnique({ where: { id: req.params.id } }))) {
      throw notFound('Ticket not found')
    }
    await prisma.ticket.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
