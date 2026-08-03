import { Router } from 'express'
import { prisma } from '../db.ts'
import { requireClient } from '../auth.ts'
import { HttpError, route } from '../http.ts'

export const portalRouter = Router()

/**
 * The client portal's only endpoint.
 *
 * Read-only, and scoped by the session rather than by anything the caller
 * sends. There is deliberately no `?contactId=` — a client cannot ask for
 * another client's data because there is no parameter through which to ask.
 *
 * Everything returned here is chosen field by field. Contact rows carry
 * `notes` and `value`, which are internal sales commentary and pipeline
 * weighting; neither belongs in front of the client they are about. Tasks are
 * omitted entirely — internal chatter about a client's project is not for the
 * client.
 */
portalRouter.get(
  '/',
  requireClient,
  route(async (req, res) => {
    const contactId = req.viewer?.client?.contactId
    if (!contactId) throw new HttpError(401, 'Sign in to continue')

    const [contact, projects, invoices] = await Promise.all([
      prisma.contact.findUnique({
        where: { id: contactId },
        select: {
          id: true,
          tag: true,
          name: true,
          company: true,
          contractType: true,
          contractValue: true,
          startDate: true,
          endDate: true,
          // `notes`, `value`, `stage`, and `division` are omitted on purpose.
        },
      }),
      prisma.project.findMany({
        where: { contactId },
        select: { id: true, tag: true, title: true, status: true, dueDate: true },
        orderBy: [{ createdAt: 'desc' }],
      }),
      prisma.invoice.findMany({
        where: {
          contactId,
          // A draft invoice has not been sent. Showing it would put a number
          // in front of a client before anyone decided to bill it.
          status: { not: 'draft' },
        },
        select: {
          id: true,
          tag: true,
          amount: true,
          status: true,
          issueDate: true,
          dueDate: true,
          project: { select: { tag: true, title: true } },
          // `notes` are internal — they hold things like "chased twice".
        },
        orderBy: [{ issueDate: 'desc' }],
      }),
    ])

    if (!contact) throw new HttpError(404, 'Account not found')

    const outstanding = invoices
      .filter((i) => i.status !== 'paid')
      .reduce((sum, i) => sum + i.amount, 0)

    res.json({
      contact,
      projects,
      invoices,
      totals: {
        outstanding,
        paid: invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0),
        openProjects: projects.filter((p) => p.status !== 'closed').length,
      },
    })
  }),
)
