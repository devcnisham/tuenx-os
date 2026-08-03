import { Router } from 'express'
import { prisma } from '../db'
import { requireAdmin } from '../auth'
import { route } from '../http'

export const peopleRouter = Router()

/**
 * Everyone, with what they actually have on: account, role, team, open work,
 * logged hours, and when they last signed in.
 *
 * Admin-only. Assembling one view of a person's workload from six tables is
 * exactly the kind of thing that should not be available to everyone before
 * the permission model in Phase 9 exists.
 *
 * Every count is one grouped query rather than a per-person lookup, so this
 * stays a fixed number of round trips whether the roster is nine people or
 * ninety.
 */
peopleRouter.get(
  '/',
  requireAdmin,
  route(async (_req, res) => {
    const [members, accounts, openTasks, doneTasks, hours, leave, sessions] = await Promise.all([
      prisma.teamMember.findMany({ orderBy: [{ division: 'asc' }, { name: 'asc' }] }),
      prisma.userAccount.findMany(),
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: { status: { not: 'done' } },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: { status: 'done' },
        _count: { _all: true },
      }),
      prisma.timeEntry.groupBy({ by: ['memberId'], _sum: { hours: true } }),
      prisma.leaveRequest.groupBy({
        by: ['memberId'],
        where: { status: 'approved', endDate: { gte: new Date() } },
        _count: { _all: true },
      }),
      // Live sessions per account — "signed in right now", not just ever.
      prisma.session.groupBy({
        by: ['userAccountId'],
        where: { kind: 'team', expiresAt: { gt: new Date() } },
        _count: { _all: true },
      }),
    ])

    const accountByMember = new Map(accounts.map((a) => [a.memberId, a]))
    const openByMember = new Map(openTasks.map((t) => [t.assigneeId, t._count._all]))
    const doneByMember = new Map(doneTasks.map((t) => [t.assigneeId, t._count._all]))
    const hoursByMember = new Map(hours.map((h) => [h.memberId, h._sum.hours ?? 0]))
    const leaveByMember = new Map(leave.map((l) => [l.memberId, l._count._all]))
    const liveByAccount = new Map(sessions.map((s) => [s.userAccountId, s._count._all]))

    res.json(
      members.map((member) => {
        const account = accountByMember.get(member.id)
        return {
          ...member,
          // Never the hash or the salt. There is no screen that needs them.
          account: account
            ? {
                id: account.id,
                email: account.email,
                username: account.username,
                role: account.role,
                active: account.active,
                lastLoginAt: account.lastLoginAt,
                signedIn: (liveByAccount.get(account.id) ?? 0) > 0,
              }
            : null,
          activity: {
            openTasks: openByMember.get(member.id) ?? 0,
            doneTasks: doneByMember.get(member.id) ?? 0,
            loggedHours: hoursByMember.get(member.id) ?? 0,
            upcomingLeave: leaveByMember.get(member.id) ?? 0,
          },
        }
      }),
    )
  }),
)
