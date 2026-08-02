import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db.ts'
import { allocateTag } from '../tags.ts'
import {
  asBody,
  notFound,
  num,
  oneOf,
  optionalStr,
  route,
  sent,
  str,
} from '../http.ts'
import {
  CONTACT_STAGES,
  DIVISIONS,
  TAG_TYPE,
  isContactStage,
  isDivision,
} from '../../src/types.ts'

export const contactsRouter = Router()

/**
 * TRD §2 Contact. PRD §6 Phase 1: pipeline by stage, filterable by division.
 *
 * Phase 3 adds contractType / contractValue / startDate / endDate here — a
 * field addition on the same model, no restructuring.
 */
contactsRouter.get(
  '/',
  route(async (req, res) => {
    const { division, stage } = req.query

    const where: Prisma.ContactWhereInput = {}
    if (isDivision(division)) where.division = division
    if (isContactStage(stage)) where.stage = stage

    const contacts = await prisma.contact.findMany({
      where,
      orderBy: [{ value: 'desc' }, { createdAt: 'desc' }],
    })

    res.json(contacts)
  }),
)

contactsRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)

    const contact = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.contact)
      return tx.contact.create({
        data: {
          tag,
          name: str(body, 'name', 160),
          company: optionalStr(body, 'company', 160),
          division,
          stage: oneOf(body, 'stage', isContactStage, CONTACT_STAGES),
          value: num(body, 'value'),
          email: optionalStr(body, 'email', 200),
          notes: optionalStr(body, 'notes'),
        },
      })
    })

    res.status(201).json(contact)
  }),
)

/** Also the endpoint the pipeline board uses to move a deal between stages. */
contactsRouter.patch(
  '/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.contact.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Contact not found')

    const contact = await prisma.contact.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'name') && { name: str(body, 'name', 160) }),
        ...(sent(body, 'company') && { company: optionalStr(body, 'company', 160) }),
        ...(sent(body, 'division') && {
          division: oneOf(body, 'division', isDivision, DIVISIONS),
        }),
        ...(sent(body, 'stage') && {
          stage: oneOf(body, 'stage', isContactStage, CONTACT_STAGES),
        }),
        ...(sent(body, 'value') && { value: num(body, 'value') }),
        ...(sent(body, 'email') && { email: optionalStr(body, 'email', 200) }),
        ...(sent(body, 'notes') && { notes: optionalStr(body, 'notes') }),
      },
    })

    res.json(contact)
  }),
)

contactsRouter.delete(
  '/:id',
  route(async (req, res) => {
    const existing = await prisma.contact.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Contact not found')

    await prisma.contact.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
