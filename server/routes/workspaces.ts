import { Router } from 'express'
import { prisma } from '../db'
import { badRequest, route } from '../http'
import { TEAMS, isTeam } from '../../src/types'

export const workspacesRouter = Router()

/** Time window the "hours logged" figure covers. */
const HOURS_WINDOW_DAYS = 30

/**
 * Team workspaces — one page answering "what is my team on the hook for".
 *
 * Mounted at `/api/workspaces` rather than `/api/teams`, because `/api/team`
 * already serves the directory and a singular/plural pair one letter apart is
 * a trap for whoever reads this next.
 *
 * Deliberately **not** admin-only, unlike `/api/people`. That endpoint
 * assembles one person's workload across six tables and is a management view;
 * this is the team looking at its own work, which everyone on it needs.
 *
 * No new storage and no new tag: a workspace is a question asked of records
 * that already exist. `TeamMember.team` is the only thing it needs, and that
 * column predates this feature.
 *
 * Team is orthogonal to division on purpose — an Agency designer and a
 * Gaphatch designer are the same craft in different arms — so nothing here
 * filters by division. A workspace crosses the divisions by design.
 */

function daysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

/** Headline counts per team, for the picker. */
workspacesRouter.get(
  '/',
  route(async (_req, res) => {
    const now = new Date()

    const [members, openByMember, overdueByMember] = await Promise.all([
      prisma.teamMember.findMany({
        select: { id: true, team: true },
      }),
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: { status: { not: 'done' }, assigneeId: { not: null } },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: { status: { not: 'done' }, dueDate: { lt: now }, assigneeId: { not: null } },
        _count: { _all: true },
      }),
    ])

    const openBy = new Map(openByMember.map((r) => [r.assigneeId!, r._count._all]))
    const overdueBy = new Map(overdueByMember.map((r) => [r.assigneeId!, r._count._all]))

    const summaries = TEAMS.map((team) => {
      const mine = members.filter((m) => m.team === team)
      return {
        team,
        headcount: mine.length,
        openTasks: mine.reduce((n, m) => n + (openBy.get(m.id) ?? 0), 0),
        overdueTasks: mine.reduce((n, m) => n + (overdueBy.get(m.id) ?? 0), 0),
      }
    })

    // Nobody on a team means no workspace worth opening.
    res.json({
      teams: summaries.filter((s) => s.headcount > 0),
      // Reported rather than hidden: `team` is nullable, and people who slot
      // into none are invisible on every workspace page.
      unassigned: members.filter((m) => !m.team).length,
    })
  }),
)

/** One team's workspace. */
workspacesRouter.get(
  '/:team',
  route(async (req, res) => {
    const team = req.params.team
    if (!isTeam(team)) {
      throw badRequest(`\`team\` must be one of: ${TEAMS.join(', ')}`)
    }

    const now = new Date()
    const windowStart = daysAgo(HOURS_WINDOW_DAYS)

    const members = await prisma.teamMember.findMany({
      where: { team },
      select: { id: true, tag: true, name: true, role: true, division: true },
      orderBy: { name: 'asc' },
    })
    const ids = members.map((m) => m.id)

    if (ids.length === 0) {
      res.json({
        team,
        members: [],
        totals: { headcount: 0, openTasks: 0, overdueTasks: 0, hoursLogged: 0 },
        byStatus: [],
        sprints: [],
        epics: [],
        projects: [],
        away: [],
        needsAttention: [],
      })
      return
    }

    const assigned = { assigneeId: { in: ids } }

    const [
      openByMember,
      overdueByMember,
      hoursByMember,
      byStatus,
      sprintRows,
      epicRows,
      projectRows,
      away,
      needsAttention,
    ] = await Promise.all([
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: { ...assigned, status: { not: 'done' } },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: { ...assigned, status: { not: 'done' }, dueDate: { lt: now } },
        _count: { _all: true },
      }),
      prisma.timeEntry.groupBy({
        by: ['memberId'],
        where: { memberId: { in: ids }, date: { gte: windowStart } },
        _sum: { hours: true },
      }),
      prisma.task.groupBy({
        by: ['status'],
        where: assigned,
        _count: { _all: true },
      }),

      // What the team's work rolls up into. Grouped rather than fetched per
      // task — a team of six can easily have sixty tasks across a dozen
      // containers, and N+1 here is how a page that felt instant stops being.
      prisma.task.groupBy({
        by: ['sprintId'],
        where: { ...assigned, sprintId: { not: null }, status: { not: 'done' } },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ['epicId'],
        where: { ...assigned, epicId: { not: null }, status: { not: 'done' } },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ['projectId'],
        where: { ...assigned, projectId: { not: null }, status: { not: 'done' } },
        _count: { _all: true },
      }),

      // Who is out. A team view that cannot answer "is anyone away next week"
      // sends people back to a spreadsheet.
      prisma.leaveRequest.findMany({
        where: {
          memberId: { in: ids },
          status: { not: 'declined' },
          endDate: { gte: now },
        },
        include: { member: { select: { id: true, tag: true, name: true } } },
        orderBy: { startDate: 'asc' },
        take: 10,
      }),

      prisma.task.findMany({
        where: {
          ...assigned,
          status: { not: 'done' },
          OR: [{ priority: 'high' }, { dueDate: { lt: now } }],
        },
        include: { assignee: { select: { id: true, tag: true, name: true, division: true } } },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: 8,
      }),
    ])

    const openBy = new Map(openByMember.map((r) => [r.assigneeId!, r._count._all]))
    const overdueBy = new Map(overdueByMember.map((r) => [r.assigneeId!, r._count._all]))
    const hoursBy = new Map(hoursByMember.map((r) => [r.memberId!, r._sum.hours ?? 0]))

    // Resolve the containers the groupings pointed at, in one query each.
    const [sprints, epics, projects] = await Promise.all([
      prisma.sprint.findMany({
        where: { id: { in: sprintRows.map((r) => r.sprintId!) } },
        select: { id: true, tag: true, name: true, status: true, endDate: true },
      }),
      prisma.epic.findMany({
        where: { id: { in: epicRows.map((r) => r.epicId!) } },
        select: { id: true, tag: true, title: true, status: true },
      }),
      prisma.project.findMany({
        where: { id: { in: projectRows.map((r) => r.projectId!) } },
        select: {
          id: true,
          tag: true,
          title: true,
          status: true,
          onHold: true,
          contact: { select: { name: true, company: true } },
        },
      }),
    ])

    // Busiest container first — a workspace is read to find out where the
    // team's attention is actually going.
    const withCount = <T extends { id: string }>(rows: T[], counts: Map<string, number>) =>
      rows
        .map((row) => ({ ...row, openTasks: counts.get(row.id) ?? 0 }))
        .sort((a, b) => b.openTasks - a.openTasks)

    const countsFrom = <K extends string>(
      rows: ({ _count: { _all: number } } & Record<K, string | null>)[],
      key: K,
    ) => new Map(rows.filter((r) => r[key] !== null).map((r) => [r[key] as string, r._count._all]))

    res.json({
      team,
      members: members.map((m) => ({
        ...m,
        openTasks: openBy.get(m.id) ?? 0,
        overdueTasks: overdueBy.get(m.id) ?? 0,
        hoursLogged: Number((hoursBy.get(m.id) ?? 0).toFixed(1)),
      })),
      totals: {
        headcount: members.length,
        openTasks: [...openBy.values()].reduce((a, b) => a + b, 0),
        overdueTasks: [...overdueBy.values()].reduce((a, b) => a + b, 0),
        hoursLogged: Number([...hoursBy.values()].reduce((a, b) => a + b, 0).toFixed(1)),
      },
      hoursWindowDays: HOURS_WINDOW_DAYS,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      sprints: withCount(sprints, countsFrom(sprintRows, 'sprintId')),
      epics: withCount(epics, countsFrom(epicRows, 'epicId')),
      projects: withCount(projects, countsFrom(projectRows, 'projectId')),
      away,
      needsAttention,
    })
  }),
)
