import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { allocateTag } from '../tags'
import { asBody, notFound, oneOf, optionalStr, route, sent, str } from '../http'
import { DIVISIONS, TAG_TYPE, isDivision } from '../../src/types'

export const docsRouter = Router()

/** Body is trimmed off the list response — a wiki index shouldn't ship every page. */
const LIST_SELECT = {
  id: true,
  tag: true,
  title: true,
  division: true,
  category: true,
  updatedAt: true,
  createdAt: true,
} satisfies Prisma.DocSelect

/**
 * PRD §6 Phase 5: docs and knowledge base for SOPs, playbooks, onboarding, and
 * policies, tagged by division.
 *
 * The list omits `body` deliberately. An index of fifty pages that ships fifty
 * page bodies gets slow exactly when the knowledge base starts being useful.
 */
docsRouter.get(
  '/',
  route(async (req, res) => {
    const { division, category, q } = req.query

    const where: Prisma.DocWhereInput = {}
    if (isDivision(division)) where.division = division
    if (typeof category === 'string' && category !== '') where.category = category
    if (typeof q === 'string' && q.trim() !== '') {
      const term = q.trim()
      where.OR = [
        { title: { contains: term } },
        { body: { contains: term } },
        { tag: { contains: term.toUpperCase() } },
      ]
    }

    const docs = await prisma.doc.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ updatedAt: 'desc' }],
    })

    res.json(docs)
  }),
)

/** The only endpoint that returns a body. */
docsRouter.get(
  '/:id',
  route(async (req, res) => {
    const doc = await prisma.doc.findUnique({ where: { id: req.params.id } })
    if (!doc) throw notFound('Doc not found')
    res.json(doc)
  }),
)

docsRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)

    const doc = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.doc)
      return tx.doc.create({
        data: {
          tag,
          title: str(body, 'title', 200),
          division,
          // Free text, not an enum: a knowledge base that rejects an
          // unanticipated category stops getting written in.
          category: str(body, 'category', 60),
          body: optionalStr(body, 'body', 100_000) ?? '',
        },
      })
    })

    res.status(201).json(doc)
  }),
)

docsRouter.patch(
  '/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.doc.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Doc not found')

    const doc = await prisma.doc.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'title') && { title: str(body, 'title', 200) }),
        ...(sent(body, 'division') && {
          division: oneOf(body, 'division', isDivision, DIVISIONS),
        }),
        ...(sent(body, 'category') && { category: str(body, 'category', 60) }),
        ...(sent(body, 'body') && { body: optionalStr(body, 'body', 100_000) ?? '' }),
      },
    })

    res.json(doc)
  }),
)

docsRouter.delete(
  '/:id',
  route(async (req, res) => {
    const existing = await prisma.doc.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Doc not found')

    await prisma.doc.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
