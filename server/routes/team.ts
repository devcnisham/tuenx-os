import { Router } from 'express'
import { prisma } from '../db.ts'
import { allocateTag } from '../tags.ts'
import {
  asBody,
  notFound,
  oneOf,
  optionalStr,
  route,
  sent,
  str,
} from '../http.ts'
import { DIVISIONS, TAG_TYPE, TEAMS, isDivision, isTeam } from '../../src/types.ts'

export const teamRouter = Router()

/** TRD §2 TeamMember. PRD §6: roster with role and division tag. */
teamRouter.get(
  '/',
  route(async (req, res) => {
    const { division, team } = req.query
    const members = await prisma.teamMember.findMany({
      where: {
        ...(isDivision(division) ? { division } : {}),
        ...(isTeam(team) ? { team } : {}),
      },
      orderBy: [{ division: 'asc' }, { name: 'asc' }],
    })
    res.json(members)
  }),
)

teamRouter.post(
  '/',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)

    const member = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.member)
      return tx.teamMember.create({
        data: {
          tag,
          name: str(body, 'name', 120),
          role: str(body, 'role', 120),
          division,
          team: body.team === undefined || body.team === null || body.team === ''
            ? null
            : oneOf(body, 'team', isTeam, TEAMS),
          email: optionalStr(body, 'email', 200),
        },
      })
    })

    res.status(201).json(member)
  }),
)

/**
 * The tag is deliberately not patchable — it is the record's stable identity.
 * Division is, and changing it does not re-issue the tag; a member who moves
 * from Agency to Gaphatch keeps AGY-M004 so existing references stay valid.
 */
teamRouter.patch(
  '/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.teamMember.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Team member not found')

    const member = await prisma.teamMember.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'name') && { name: str(body, 'name', 120) }),
        ...(sent(body, 'role') && { role: str(body, 'role', 120) }),
        ...(sent(body, 'division') && {
          division: oneOf(body, 'division', isDivision, DIVISIONS),
        }),
        ...(sent(body, 'team') && {
          team:
            body.team === null || body.team === ''
              ? null
              : oneOf(body, 'team', isTeam, TEAMS),
        }),
        ...(sent(body, 'email') && { email: optionalStr(body, 'email', 200) }),
      },
    })

    res.json(member)
  }),
)

/**
 * Tasks assigned to this member are not deleted — the relation is
 * `onDelete: SetNull`, so they survive as unassigned rather than vanishing
 * with the person.
 */
teamRouter.delete(
  '/:id',
  route(async (req, res) => {
    const existing = await prisma.teamMember.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Team member not found')

    await prisma.teamMember.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
