import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { allocateTag } from '../tags'
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
} from '../http'
import { CHANNEL_KINDS, DIVISIONS, TAG_TYPE, isChannelKind, isDivision } from '../../src/types'

export const messagesRouter = Router()

const MEMBER_SELECT = { select: { id: true, tag: true, name: true, division: true } }

const WITH_MEMBERS = {
  members: { include: { member: MEMBER_SELECT } },
  _count: { select: { messages: true } },
} satisfies Prisma.ChannelInclude

/**
 * Channels, DMs, and record conversations.
 *
 * Messaging was an explicit non-goal until the founder reversed it — see master
 * plan §7. The reversal's justification is `recordType`/`recordId`: a channel
 * bound to a record means the conversation about AGY-I004 lives on the invoice
 * rather than scrolling away in a general channel. That is the one thing Slack
 * cannot do here, and the only reason this module earns its place.
 */
messagesRouter.get(
  '/channels',
  route(async (req, res) => {
    const { division, kind, recordType, recordId, includeArchived } = req.query

    const where: Prisma.ChannelWhereInput = {}
    if (isDivision(division)) where.division = division
    if (isChannelKind(kind)) where.kind = kind
    if (typeof recordType === 'string' && recordType !== '') where.recordType = recordType
    if (typeof recordId === 'string' && recordId !== '') where.recordId = recordId
    if (includeArchived !== 'true') where.archived = false

    const channels = await prisma.channel.findMany({
      where,
      include: WITH_MEMBERS,
      orderBy: [{ createdAt: 'asc' }],
    })

    // Last message per channel, for the list preview. One grouped query rather
    // than N — a sidebar of twenty channels shouldn't be twenty round trips.
    const latest = await prisma.message.findMany({
      where: { channelId: { in: channels.map((c) => c.id) } },
      orderBy: { createdAt: 'desc' },
      distinct: ['channelId'],
      include: { author: MEMBER_SELECT },
    })
    const latestByChannel = new Map(latest.map((m) => [m.channelId, m]))

    res.json(
      channels.map(({ _count, members, ...channel }) => ({
        ...channel,
        members: members.map((m) => m.member),
        messageCount: _count.messages,
        lastMessage: latestByChannel.get(channel.id) ?? null,
      })),
    )
  }),
)

messagesRouter.post(
  '/channels',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)
    const kind = oneOf(body, 'kind', isChannelKind, CHANNEL_KINDS)

    const memberIds = Array.isArray(body.memberIds)
      ? body.memberIds.filter((id): id is string => typeof id === 'string')
      : []

    if (kind === 'dm' && memberIds.length !== 2) {
      throw badRequest('A direct message needs exactly two people')
    }

    if (memberIds.length > 0) {
      const found = await prisma.teamMember.count({ where: { id: { in: memberIds } } })
      if (found !== memberIds.length) throw badRequest('One of those people does not exist')
    }

    const recordType = optionalStr(body, 'recordType', 40)
    const recordId = optionalId(body, 'recordId')
    if ((recordType === null) !== (recordId === null)) {
      throw badRequest('`recordType` and `recordId` must be given together')
    }

    // One conversation per record. A second channel about the same invoice
    // splits the discussion, which is exactly what this was meant to prevent.
    if (recordType && recordId) {
      const existing = await prisma.channel.findFirst({
        where: { recordType, recordId },
        include: WITH_MEMBERS,
      })
      if (existing) {
        res.status(200).json({
          ...existing,
          members: existing.members.map((m) => m.member),
          messageCount: existing._count.messages,
          lastMessage: null,
        })
        return
      }
    }

    const channel = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.channel)
      return tx.channel.create({
        data: {
          tag,
          division,
          kind,
          name: str(body, 'name', 120),
          purpose: optionalStr(body, 'purpose', 500),
          recordType,
          recordId,
          members: { create: memberIds.map((memberId) => ({ memberId })) },
        },
        include: WITH_MEMBERS,
      })
    })

    res.status(201).json({
      ...channel,
      members: channel.members.map((m) => m.member),
      messageCount: 0,
      lastMessage: null,
    })
  }),
)

messagesRouter.patch(
  '/channels/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.channel.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Channel not found')

    const channel = await prisma.channel.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'name') && { name: str(body, 'name', 120) }),
        ...(sent(body, 'purpose') && { purpose: optionalStr(body, 'purpose', 500) }),
        ...(sent(body, 'archived') && { archived: body.archived === true }),
      },
      include: WITH_MEMBERS,
    })

    res.json({
      ...channel,
      members: channel.members.map((m) => m.member),
      messageCount: channel._count.messages,
      lastMessage: null,
    })
  }),
)

/** Messages cascade — a channel's history has no meaning without the channel. */
messagesRouter.delete(
  '/channels/:id',
  route(async (req, res) => {
    const existing = await prisma.channel.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Channel not found')

    await prisma.channel.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

messagesRouter.get(
  '/channels/:id/messages',
  route(async (req, res) => {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    })
    if (!channel) throw notFound('Channel not found')

    const messages = await prisma.message.findMany({
      where: { channelId: channel.id },
      include: { author: MEMBER_SELECT },
      // Oldest first — a conversation reads downward.
      orderBy: { createdAt: 'asc' },
      take: 300,
    })

    res.json(messages)
  }),
)

messagesRouter.post(
  '/channels/:id/messages',
  route(async (req, res) => {
    const body = asBody(req.body)
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    })
    if (!channel) throw notFound('Channel not found')

    // Nullable until Phase 9 gives people accounts — until then the author is
    // picked, which is honest about the fact that nothing is authenticated.
    const authorId = optionalId(body, 'authorId')
    if (authorId) {
      const found = await prisma.teamMember.count({ where: { id: authorId } })
      if (found === 0) throw badRequest('`authorId` does not match a team member')
    }

    const message = await prisma.message.create({
      data: { channelId: channel.id, authorId, body: str(body, 'body', 4000) },
      include: { author: MEMBER_SELECT },
    })

    res.status(201).json(message)
  }),
)

messagesRouter.patch(
  '/messages/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.message.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Message not found')

    const message = await prisma.message.update({
      where: { id: req.params.id },
      // editedAt is set rather than the body silently changing — a message that
      // has been rewritten should say so.
      data: { body: str(body, 'body', 4000), editedAt: new Date() },
      include: { author: MEMBER_SELECT },
    })

    res.json(message)
  }),
)

messagesRouter.delete(
  '/messages/:id',
  route(async (req, res) => {
    const existing = await prisma.message.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Message not found')

    await prisma.message.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
