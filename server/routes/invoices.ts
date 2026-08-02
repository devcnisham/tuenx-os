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
  INVOICE_STATUSES,
  TAG_TYPE,
  isDivision,
  isInvoiceStatus,
  type Division,
} from '../../src/types.ts'

export const invoicesRouter = Router()

const WITH_RELATIONS = {
  contact: { select: { id: true, tag: true, name: true, company: true, division: true } },
  project: { select: { id: true, tag: true, title: true } },
} satisfies Prisma.InvoiceInclude

async function resolveContact(contactId: string) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, division: true },
  })
  if (!contact) throw badRequest('`contactId` does not match a contact')
  return contact
}

/** A project-linked invoice must belong to that project's own client. */
async function assertProjectMatches(projectId: string | null, contactId: string) {
  if (projectId === null) return
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { contactId: true },
  })
  if (!project) throw badRequest('`projectId` does not match a project')
  if (project.contactId !== contactId) {
    throw badRequest('That project belongs to a different client')
  }
}

/** PRD §6 Phase 3: draft → sent → paid → overdue, per invoice. */
invoicesRouter.get(
  '/',
  route(async (req, res) => {
    const { status, contactId, projectId, division } = req.query

    const where: Prisma.InvoiceWhereInput = {}
    if (isInvoiceStatus(status)) where.status = status
    if (typeof contactId === 'string' && contactId !== '') where.contactId = contactId
    if (typeof projectId === 'string' && projectId !== '') where.projectId = projectId
    if (isDivision(division)) where.contact = { division }

    const invoices = await prisma.invoice.findMany({
      where,
      include: WITH_RELATIONS,
      orderBy: [{ issueDate: 'desc' }],
    })

    res.json(invoices)
  }),
)

invoicesRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)
    const contactId = str(body, 'contactId', 60)
    const contact = await resolveContact(contactId)

    const projectId = optionalId(body, 'projectId')
    await assertProjectMatches(projectId, contactId)

    const issueDate = date(body, 'issueDate')
    const dueDate = date(body, 'dueDate')
    if (dueDate < issueDate) throw badRequest('`dueDate` cannot be before `issueDate`')

    const invoice = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, contact.division as Division, TAG_TYPE.invoice)
      return tx.invoice.create({
        data: {
          tag,
          contactId,
          projectId,
          amount: num(body, 'amount'),
          status: oneOf(body, 'status', isInvoiceStatus, INVOICE_STATUSES),
          issueDate,
          dueDate,
          notes: optionalStr(body, 'notes', 2000),
        },
        include: WITH_RELATIONS,
      })
    })

    res.status(201).json(invoice)
  }),
)

invoicesRouter.patch(
  '/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.invoice.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Invoice not found')

    const contactId = sent(body, 'contactId') ? str(body, 'contactId', 60) : existing.contactId
    if (sent(body, 'contactId')) await resolveContact(contactId)

    if (sent(body, 'projectId') || sent(body, 'contactId')) {
      const projectId = sent(body, 'projectId')
        ? optionalId(body, 'projectId')
        : existing.projectId
      await assertProjectMatches(projectId, contactId)
    }

    const issueDate = sent(body, 'issueDate') ? date(body, 'issueDate') : existing.issueDate
    const dueDate = sent(body, 'dueDate') ? date(body, 'dueDate') : existing.dueDate
    if (dueDate < issueDate) throw badRequest('`dueDate` cannot be before `issueDate`')

    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'contactId') && { contactId }),
        ...(sent(body, 'projectId') && { projectId: optionalId(body, 'projectId') }),
        ...(sent(body, 'amount') && { amount: num(body, 'amount') }),
        ...(sent(body, 'status') && {
          status: oneOf(body, 'status', isInvoiceStatus, INVOICE_STATUSES),
        }),
        ...(sent(body, 'issueDate') && { issueDate }),
        ...(sent(body, 'dueDate') && { dueDate }),
        ...(sent(body, 'notes') && { notes: optionalStr(body, 'notes', 2000) }),
      },
      include: WITH_RELATIONS,
    })

    res.json(invoice)
  }),
)

invoicesRouter.delete(
  '/:id',
  route(async (req, res) => {
    const existing = await prisma.invoice.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Invoice not found')

    await prisma.invoice.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

/**
 * Marks every sent invoice past its due date as overdue.
 *
 * Called by the client when the Invoices module loads. Deliberately explicit
 * rather than a cron: with no auth and no scheduler in this phase, a
 * request-time sweep is the honest version, and it is idempotent.
 */
invoicesRouter.post(
  '/sweep-overdue',
  route(async (_req, res) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { count } = await prisma.invoice.updateMany({
      where: { status: 'sent', dueDate: { lt: today } },
      data: { status: 'overdue' },
    })

    res.json({ updated: count })
  }),
)
