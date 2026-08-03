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
  optionalDate,
  optionalId,
  optionalStr,
  route,
  sent,
  str,
} from '../http.ts'
import {
  CAMPAIGN_STATUSES,
  CANDIDATE_STAGES,
  CONTRACT_KINDS,
  DIVISIONS,
  LEAVE_STATUSES,
  LEAVE_TYPES,
  TAG_TYPE,
  isCampaignStatus,
  isCandidateStage,
  isContractKind,
  isDivision,
  isLeaveStatus,
  isLeaveType,
} from '../../src/types.ts'

export const peopleOpsRouter = Router()

/**
 * Phase 6 — hiring, time off, vendors, campaigns, and the contracts repository.
 *
 * Five small entities behind one router rather than five files. They share a
 * shape (division-tagged, list/create/update/delete, no relations of their own
 * beyond a member) and splitting them would be five near-identical files to
 * keep in step.
 *
 * Explicitly still not payroll or tax filing — master plan §4, permanent.
 * Time off here is a record of who is away, nothing more.
 */

// ---------------------------------------------------------------------------
// Candidates — hiring pipeline
// ---------------------------------------------------------------------------

peopleOpsRouter.get(
  '/candidates',
  route(async (req, res) => {
    const { division, stage } = req.query
    const where: Prisma.CandidateWhereInput = {}
    if (isDivision(division)) where.division = division
    if (isCandidateStage(stage)) where.stage = stage

    res.json(await prisma.candidate.findMany({ where, orderBy: [{ createdAt: 'desc' }] }))
  }),
)

peopleOpsRouter.post(
  '/candidates',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)

    const candidate = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.candidate)
      return tx.candidate.create({
        data: {
          tag,
          division,
          name: str(body, 'name', 120),
          role: str(body, 'role', 120),
          stage: oneOf(body, 'stage', isCandidateStage, CANDIDATE_STAGES),
          source: optionalStr(body, 'source', 120),
          notes: optionalStr(body, 'notes', 2000),
        },
      })
    })

    res.status(201).json(candidate)
  }),
)

peopleOpsRouter.patch(
  '/candidates/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    if (!(await prisma.candidate.findUnique({ where: { id: req.params.id } }))) {
      throw notFound('Candidate not found')
    }

    res.json(
      await prisma.candidate.update({
        where: { id: req.params.id },
        data: {
          ...(sent(body, 'name') && { name: str(body, 'name', 120) }),
          ...(sent(body, 'role') && { role: str(body, 'role', 120) }),
          ...(sent(body, 'division') && {
            division: oneOf(body, 'division', isDivision, DIVISIONS),
          }),
          ...(sent(body, 'stage') && {
            stage: oneOf(body, 'stage', isCandidateStage, CANDIDATE_STAGES),
          }),
          ...(sent(body, 'source') && { source: optionalStr(body, 'source', 120) }),
          ...(sent(body, 'notes') && { notes: optionalStr(body, 'notes', 2000) }),
        },
      }),
    )
  }),
)

peopleOpsRouter.delete(
  '/candidates/:id',
  route(async (req, res) => {
    if (!(await prisma.candidate.findUnique({ where: { id: req.params.id } }))) {
      throw notFound('Candidate not found')
    }
    await prisma.candidate.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

// ---------------------------------------------------------------------------
// Leave — who is away, and when
// ---------------------------------------------------------------------------

peopleOpsRouter.get(
  '/leave',
  route(async (req, res) => {
    const { memberId, status, upcoming } = req.query
    const where: Prisma.LeaveRequestWhereInput = {}
    if (typeof memberId === 'string' && memberId !== '') where.memberId = memberId
    if (isLeaveStatus(status)) where.status = status
    // Past leave is history; the useful default is what is still ahead.
    if (upcoming === 'true') where.endDate = { gte: new Date() }

    res.json(
      await prisma.leaveRequest.findMany({
        where,
        include: { member: { select: { id: true, tag: true, name: true, division: true } } },
        orderBy: [{ startDate: 'asc' }],
      }),
    )
  }),
)

peopleOpsRouter.post(
  '/leave',
  route(async (req, res) => {
    const body = asBody(req.body)
    const memberId = str(body, 'memberId', 60)

    const member = await prisma.teamMember.findUnique({
      where: { id: memberId },
      select: { id: true, division: true },
    })
    if (!member) throw badRequest('`memberId` does not match a team member')

    const startDate = date(body, 'startDate')
    const endDate = date(body, 'endDate')
    if (endDate < startDate) throw badRequest('`endDate` cannot be before `startDate`')

    const leave = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, member.division as never, TAG_TYPE.leave)
      return tx.leaveRequest.create({
        data: {
          tag,
          memberId,
          type: oneOf(body, 'type', isLeaveType, LEAVE_TYPES),
          status: oneOf(body, 'status', isLeaveStatus, LEAVE_STATUSES),
          startDate,
          endDate,
          notes: optionalStr(body, 'notes', 1000),
        },
        include: { member: { select: { id: true, tag: true, name: true, division: true } } },
      })
    })

    res.status(201).json(leave)
  }),
)

peopleOpsRouter.patch(
  '/leave/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Leave request not found')

    const startDate = sent(body, 'startDate') ? date(body, 'startDate') : existing.startDate
    const endDate = sent(body, 'endDate') ? date(body, 'endDate') : existing.endDate
    if (endDate < startDate) throw badRequest('`endDate` cannot be before `startDate`')

    res.json(
      await prisma.leaveRequest.update({
        where: { id: req.params.id },
        data: {
          ...(sent(body, 'type') && { type: oneOf(body, 'type', isLeaveType, LEAVE_TYPES) }),
          ...(sent(body, 'status') && {
            status: oneOf(body, 'status', isLeaveStatus, LEAVE_STATUSES),
          }),
          ...(sent(body, 'startDate') && { startDate }),
          ...(sent(body, 'endDate') && { endDate }),
          ...(sent(body, 'notes') && { notes: optionalStr(body, 'notes', 1000) }),
        },
        include: { member: { select: { id: true, tag: true, name: true, division: true } } },
      }),
    )
  }),
)

peopleOpsRouter.delete(
  '/leave/:id',
  route(async (req, res) => {
    if (!(await prisma.leaveRequest.findUnique({ where: { id: req.params.id } }))) {
      throw notFound('Leave request not found')
    }
    await prisma.leaveRequest.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

// ---------------------------------------------------------------------------
// Vendors — what is paid for, when it renews, who owns it
// ---------------------------------------------------------------------------

peopleOpsRouter.get(
  '/vendors',
  route(async (req, res) => {
    const { division } = req.query
    const where: Prisma.VendorWhereInput = {}
    if (isDivision(division)) where.division = division

    const vendors = await prisma.vendor.findMany({
      where,
      include: { owner: { select: { id: true, tag: true, name: true } } },
      // Soonest renewal first — the whole point is not being surprised.
      orderBy: [{ renewalDate: { sort: 'asc', nulls: 'last' } }],
    })

    const monthlyTotal = vendors.reduce((sum, v) => sum + v.monthlyCost, 0)
    res.json({ vendors, monthlyTotal, annualTotal: monthlyTotal * 12 })
  }),
)

peopleOpsRouter.post(
  '/vendors',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)
    const ownerId = optionalId(body, 'ownerId')
    if (ownerId && !(await prisma.teamMember.findUnique({ where: { id: ownerId } }))) {
      throw badRequest('`ownerId` does not match a team member')
    }

    const vendor = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.vendor)
      return tx.vendor.create({
        data: {
          tag,
          division,
          ownerId,
          name: str(body, 'name', 120),
          monthlyCost: num(body, 'monthlyCost'),
          renewalDate: optionalDate(body, 'renewalDate'),
          notes: optionalStr(body, 'notes', 1000),
        },
        include: { owner: { select: { id: true, tag: true, name: true } } },
      })
    })

    res.status(201).json(vendor)
  }),
)

peopleOpsRouter.patch(
  '/vendors/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    if (!(await prisma.vendor.findUnique({ where: { id: req.params.id } }))) {
      throw notFound('Vendor not found')
    }

    res.json(
      await prisma.vendor.update({
        where: { id: req.params.id },
        data: {
          ...(sent(body, 'name') && { name: str(body, 'name', 120) }),
          ...(sent(body, 'division') && {
            division: oneOf(body, 'division', isDivision, DIVISIONS),
          }),
          ...(sent(body, 'monthlyCost') && { monthlyCost: num(body, 'monthlyCost') }),
          ...(sent(body, 'renewalDate') && { renewalDate: optionalDate(body, 'renewalDate') }),
          ...(sent(body, 'ownerId') && { ownerId: optionalId(body, 'ownerId') }),
          ...(sent(body, 'notes') && { notes: optionalStr(body, 'notes', 1000) }),
        },
        include: { owner: { select: { id: true, tag: true, name: true } } },
      }),
    )
  }),
)

peopleOpsRouter.delete(
  '/vendors/:id',
  route(async (req, res) => {
    if (!(await prisma.vendor.findUnique({ where: { id: req.params.id } }))) {
      throw notFound('Vendor not found')
    }
    await prisma.vendor.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

// ---------------------------------------------------------------------------
// Campaigns — marketing, shared across Agency and Gaphatch
// ---------------------------------------------------------------------------

peopleOpsRouter.get(
  '/campaigns',
  route(async (req, res) => {
    const { division, status, productId } = req.query
    const where: Prisma.CampaignWhereInput = {}
    if (isDivision(division)) where.division = division
    if (isCampaignStatus(status)) where.status = status
    if (typeof productId === 'string' && productId !== '') where.productId = productId

    res.json(
      await prisma.campaign.findMany({
        where,
        include: { product: { select: { id: true, tag: true, name: true } } },
        orderBy: [{ date: 'desc' }],
      }),
    )
  }),
)

peopleOpsRouter.post(
  '/campaigns',
  route(async (req, res) => {
    const body = asBody(req.body)
    const productId = optionalId(body, 'productId')

    // Same scope split as Objective: a campaign runs for a division, or for one
    // specific Gaphatch product.
    let division = oneOf(body, 'division', isDivision, DIVISIONS)
    let scopeKind = 'division'
    if (productId) {
      if (!(await prisma.product.findUnique({ where: { id: productId } }))) {
        throw badRequest('`productId` does not match a product')
      }
      division = 'gaphatch'
      scopeKind = 'product'
    }

    const campaign = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.campaign)
      return tx.campaign.create({
        data: {
          tag,
          scopeKind,
          division,
          productId,
          title: str(body, 'title', 200),
          channel: str(body, 'channel', 80),
          status: oneOf(body, 'status', isCampaignStatus, CAMPAIGN_STATUSES),
          date: date(body, 'date'),
          notes: optionalStr(body, 'notes', 2000),
        },
        include: { product: { select: { id: true, tag: true, name: true } } },
      })
    })

    res.status(201).json(campaign)
  }),
)

peopleOpsRouter.patch(
  '/campaigns/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    if (!(await prisma.campaign.findUnique({ where: { id: req.params.id } }))) {
      throw notFound('Campaign not found')
    }

    res.json(
      await prisma.campaign.update({
        where: { id: req.params.id },
        data: {
          ...(sent(body, 'title') && { title: str(body, 'title', 200) }),
          ...(sent(body, 'channel') && { channel: str(body, 'channel', 80) }),
          ...(sent(body, 'status') && {
            status: oneOf(body, 'status', isCampaignStatus, CAMPAIGN_STATUSES),
          }),
          ...(sent(body, 'date') && { date: date(body, 'date') }),
          ...(sent(body, 'notes') && { notes: optionalStr(body, 'notes', 2000) }),
        },
        include: { product: { select: { id: true, tag: true, name: true } } },
      }),
    )
  }),
)

peopleOpsRouter.delete(
  '/campaigns/:id',
  route(async (req, res) => {
    if (!(await prisma.campaign.findUnique({ where: { id: req.params.id } }))) {
      throw notFound('Campaign not found')
    }
    await prisma.campaign.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

// ---------------------------------------------------------------------------
// Contracts repository — company-wide, distinct from CRM contract terms
// ---------------------------------------------------------------------------

peopleOpsRouter.get(
  '/contracts',
  route(async (req, res) => {
    const { division, type } = req.query
    const where: Prisma.ContractWhereInput = {}
    if (isDivision(division)) where.division = division
    if (isContractKind(type)) where.type = type

    res.json(
      await prisma.contract.findMany({
        where,
        orderBy: [{ endDate: { sort: 'asc', nulls: 'last' } }],
      }),
    )
  }),
)

peopleOpsRouter.post(
  '/contracts',
  route(async (req, res) => {
    const body = asBody(req.body)
    const division = oneOf(body, 'division', isDivision, DIVISIONS)

    const startDate = optionalDate(body, 'startDate')
    const endDate = optionalDate(body, 'endDate')
    if (startDate && endDate && endDate < startDate) {
      throw badRequest('`endDate` cannot be before `startDate`')
    }

    const contract = await prisma.$transaction(async (tx) => {
      const tag = await allocateTag(tx, division, TAG_TYPE.contract)
      return tx.contract.create({
        data: {
          tag,
          division,
          party: str(body, 'party', 160),
          type: oneOf(body, 'type', isContractKind, CONTRACT_KINDS),
          value: num(body, 'value'),
          startDate,
          endDate,
          // A path or URL, not an upload. File storage is out of scope, and a
          // link is more honest than a fake attachment.
          fileRef: optionalStr(body, 'fileRef', 500),
          notes: optionalStr(body, 'notes', 2000),
        },
      })
    })

    res.status(201).json(contract)
  }),
)

peopleOpsRouter.patch(
  '/contracts/:id',
  route(async (req, res) => {
    const body = asBody(req.body)
    if (!(await prisma.contract.findUnique({ where: { id: req.params.id } }))) {
      throw notFound('Contract not found')
    }

    res.json(
      await prisma.contract.update({
        where: { id: req.params.id },
        data: {
          ...(sent(body, 'party') && { party: str(body, 'party', 160) }),
          ...(sent(body, 'division') && {
            division: oneOf(body, 'division', isDivision, DIVISIONS),
          }),
          ...(sent(body, 'type') && { type: oneOf(body, 'type', isContractKind, CONTRACT_KINDS) }),
          ...(sent(body, 'value') && { value: num(body, 'value') }),
          ...(sent(body, 'startDate') && { startDate: optionalDate(body, 'startDate') }),
          ...(sent(body, 'endDate') && { endDate: optionalDate(body, 'endDate') }),
          ...(sent(body, 'fileRef') && { fileRef: optionalStr(body, 'fileRef', 500) }),
          ...(sent(body, 'notes') && { notes: optionalStr(body, 'notes', 2000) }),
        },
      }),
    )
  }),
)

peopleOpsRouter.delete(
  '/contracts/:id',
  route(async (req, res) => {
    if (!(await prisma.contract.findUnique({ where: { id: req.params.id } }))) {
      throw notFound('Contract not found')
    }
    await prisma.contract.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
