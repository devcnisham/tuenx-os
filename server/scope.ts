import type { NextFunction, Request, Response } from 'express'
import { prisma } from './db'
import { HttpError } from './http'
import type { Division } from '../src/types'

/**
 * Phase 9 — role scoping, per PRD §5.
 *
 *   admin   everything
 *   lead    read everything; write inside their own division
 *   member  read everything; write only what is theirs
 *
 * Reads stay open to the whole team on purpose. The PRD gives a division lead
 * "read access to company-wide rollups", and half the app — Overview, KPIs,
 * search, the calendar — is only useful if it can see across divisions. This
 * gate is about writes.
 *
 * It runs as middleware below `requireTeam` rather than as a call inside each
 * router, for the same reason route position is the security boundary: a
 * router added next month cannot forget to opt in. A resource missing from the
 * table below is denied to anyone who is not an admin, so the failure mode is a
 * visible 403 rather than a silent hole.
 */

type DivisionSource =
  /** The record has its own `division` column. */
  | 'record'
  /** Gaphatch-only by construction — products and everything under them. */
  | 'gaphatch'
  /** Inherited from the contact the record hangs off. */
  | 'viaContact'
  /** Inherited from the objective the key result hangs off. */
  | 'viaObjective'

interface Policy {
  /** Prisma model, in the client's own casing. */
  model: string
  division: DivisionSource
  /**
   * Fields naming the people who own the record. A member may write a record
   * they own, whatever its division.
   */
  owners?: string[]
  /**
   * Shared surfaces any team member may write regardless of division —
   * messaging, links, the calendar, and their own planning. Scoping these by
   * division would stop a Gaphatch engineer replying in an Agency channel,
   * which is the opposite of what a cross-division company needs.
   */
  open?: boolean
}

/**
 * Keyed by the longest matching path prefix, so a multi-model router like
 * `/api/ops` resolves per sub-resource rather than being treated as one thing.
 */
const POLICY: Record<string, Policy> = {
  // Phase 1
  tasks: { model: 'task', division: 'record', owners: ['assigneeId'] },
  contacts: { model: 'contact', division: 'record' },
  team: { model: 'teamMember', division: 'record', owners: ['id'] },

  // Phase 2 — Gaphatch only, so no division column to read
  products: { model: 'product', division: 'gaphatch' },
  roadmap: { model: 'roadmapItem', division: 'gaphatch' },
  releases: { model: 'release', division: 'gaphatch' },

  // Phase 3 — division follows the client
  projects: { model: 'project', division: 'viaContact' },
  invoices: { model: 'invoice', division: 'viaContact' },

  // Phase 4
  'treasury/entries': { model: 'fundEntry', division: 'record' },

  // Phase 5
  docs: { model: 'doc', division: 'record' },
  'okrs/key-results': { model: 'keyResult', division: 'viaObjective' },
  okrs: { model: 'objective', division: 'record' },

  // Phase 6
  'ops/candidates': { model: 'candidate', division: 'record' },
  'ops/leave': { model: 'leaveRequest', division: 'record', owners: ['memberId'] },
  'ops/vendors': { model: 'vendor', division: 'record' },
  'ops/campaigns': { model: 'campaign', division: 'record' },
  'ops/contracts': { model: 'contract', division: 'record' },

  // Compliance. Owner-writable as well as division-writable: the person
  // responsible for a filing has to be able to mark it done, whichever arm
  // they sit in.
  compliance: { model: 'complianceItem', division: 'record', owners: ['ownerId'] },

  // Onboarding. Items are owner-writable so whoever is assigned a step can
  // tick it, whichever arm they sit in — most onboarding steps are done by IT
  // or finance for someone in a different division.
  'checklists/templates': { model: 'checklistTemplate', division: 'record' },
  'checklists/runs': { model: 'checklistRun', division: 'record' },
  'checklists/items': { model: 'checklistRunItem', division: 'record', owners: ['ownerId'], open: true },

  // Phase 7 — Gaphatch only
  tickets: { model: 'ticket', division: 'gaphatch' },
  customers: { model: 'customer', division: 'gaphatch' },
  metrics: { model: 'metricSnapshot', division: 'gaphatch' },
  // Mirrored build data. Syncing is a read from GitHub that happens to write
  // here, so it is scoped like anything else Gaphatch owns.
  deploys: { model: 'deployRun', division: 'gaphatch' },

  // Task depth
  'work/epics': { model: 'epic', division: 'record' },
  'work/sprints': { model: 'sprint', division: 'record' },
  // Logging your own hours is personal, and a lead approving them is not a
  // thing this app models.
  'work/time': { model: 'timeEntry', division: 'record', owners: ['memberId'], open: true },

  // Shared surfaces
  'calendar/entries': { model: 'calendarEntry', division: 'record', open: true },
  'planner/items': { model: 'planItem', division: 'record', open: true },
  'planner/ideas': { model: 'idea', division: 'record', open: true },
  'messages/channels': { model: 'channel', division: 'record', open: true },
  'messages/messages': { model: 'message', division: 'record', open: true },
  links: { model: 'recordLink', division: 'record', open: true },
}

/** Longest-prefix match, so `ops/leave` wins over `ops`. */
function policyFor(segments: string[]): { key: string; policy: Policy } | null {
  for (const length of [2, 1]) {
    const key = segments.slice(0, length).join('/')
    const policy = POLICY[key]
    if (policy) return { key, policy }
  }
  return null
}

/** The id in the path, if the route carries one. */
function idFrom(segments: string[], key: string): string | null {
  const rest = segments.slice(key.split('/').length)
  // `/okrs/:id/key-results` and `/planner/ideas/:id/promote` both put the id
  // first, so taking the leading segment is right in every current shape.
  const candidate = rest[0]
  if (!candidate) return null
  // Sub-resource names are not ids. `key-results` under `/okrs/:id/...` is
  // handled by the longest-prefix match above, so anything left that is a
  // known sub-path is not an id.
  return /^[a-z0-9]{20,}$/i.test(candidate) ? candidate : null
}

async function resolveDivision(
  policy: Policy,
  id: string,
): Promise<{ division: string | null; owners: string[] } | null> {
  const model = (prisma as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[
    policy.model
  ]
  if (!model) return null

  const include =
    policy.division === 'viaContact'
      ? { contact: { select: { division: true } } }
      : policy.division === 'viaObjective'
        ? { objective: { select: { division: true } } }
        : undefined

  const record = (await model.findUnique({ where: { id }, ...(include ? { include } : {}) })) as
    | (Record<string, unknown> & {
        contact?: { division: string }
        objective?: { division: string }
      })
    | null

  if (!record) return null

  const division =
    policy.division === 'gaphatch'
      ? 'gaphatch'
      : policy.division === 'viaContact'
        ? (record.contact?.division ?? null)
        : policy.division === 'viaObjective'
          ? (record.objective?.division ?? null)
          : ((record.division as string | undefined) ?? null)

  const owners = (policy.owners ?? [])
    .map((field) => record[field])
    .filter((v): v is string => typeof v === 'string')

  return { division, owners }
}

/** Division a create is aiming at, from the body or the resource itself. */
function intendedDivision(policy: Policy, body: unknown): string | null {
  if (policy.division === 'gaphatch') return 'gaphatch'
  if (typeof body === 'object' && body !== null && 'division' in body) {
    const value = (body as { division: unknown }).division
    if (typeof value === 'string') return value
  }
  return null
}

/**
 * The gate. Mounted below `requireTeam`, so anonymous and client requests have
 * already been turned away.
 */
export async function requireWriteAccess(req: Request, _res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()

  const viewer = req.viewer
  if (!viewer || viewer.kind !== 'team' || !viewer.account) {
    return next(new HttpError(401, 'Sign in to continue'))
  }

  const { role, division: ownDivision, memberId } = viewer.account
  if (role === 'admin') return next()

  const segments = req.path.split('/').filter(Boolean)
  const match = policyFor(segments)

  if (!match) {
    // Fail closed. An unmapped resource is one nobody has decided the rules
    // for, and guessing "allow" is how a scoping model quietly stops meaning
    // anything.
    return next(
      new HttpError(403, `Only an admin can change ${segments[0] ?? 'that'} right now`),
    )
  }

  const { key, policy } = match
  if (policy.open) return next()

  const id = idFrom(segments, key)

  try {
    if (id === null) {
      // A create, or an action with no record — judge it on what it is aiming at.
      const target = intendedDivision(policy, req.body)
      if (role === 'lead') {
        if (target === null || target === ownDivision) return next()
        return next(
          new HttpError(403, `That would create a ${target} record, and you lead ${ownDivision}`),
        )
      }
      // Members create their own work; anything else is someone else's to file.
      if (policy.owners && policy.owners.length > 0) return next()
      return next(new HttpError(403, 'Only a division lead or an admin can create that'))
    }

    const resolved = await resolveDivision(policy, id)
    // Missing record: let the router answer 404 rather than leaking existence
    // through a 403 here.
    if (resolved === null) return next()

    if (role === 'lead') {
      if (resolved.division === null || resolved.division === ownDivision) return next()
      return next(
        new HttpError(403, `That record belongs to ${resolved.division}, not ${ownDivision}`),
      )
    }

    if (resolved.owners.includes(memberId)) return next()
    return next(new HttpError(403, 'You can only change records assigned to you'))
  } catch (err) {
    next(err)
  }
}

/** Exported for the tests in `docs/HANDOFF.md` and for reuse in the audit map. */
export const SCOPE_POLICY = POLICY
export type { Policy, Division }
