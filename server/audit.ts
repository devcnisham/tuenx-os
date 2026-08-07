import type { NextFunction, Request, Response } from 'express'
import { prisma } from './db'
import { SCOPE_POLICY } from './scope'

/**
 * Phase 9 — the audit trail. TRD §9, and the last gap in the original plan.
 *
 * Middleware rather than a call inside each router, for the same reason the
 * scope gate is: 26 routers is 26 chances to forget, and a log with holes in it
 * is worse than no log because people trust it. Anything mounted below this
 * point is recorded whether its author thought about auditing or not.
 *
 * Only successful writes are recorded. A rejected request changed nothing, and
 * filling the table with 400s would bury the one row that matters.
 */

/** Fields that say nothing useful in a diff, or should never be written down. */
const SKIP_FIELDS = new Set([
  'updatedAt',
  'createdAt',
  'passwordHash',
  'passwordSalt',
  'token',
])

type Row = Record<string, unknown>

/**
 * Field-level diff.
 *
 * Only over the keys present in `before` — that is the database row, so its
 * keys are exactly the record's real columns. `after` is the API response,
 * which carries joined relations and computed extras (`assignee`, `subtasks`,
 * `counts`, `loggedHours`) that were never columns and never changed. Diffing
 * the union of both would report those as edits on every single update, and a
 * log that claims changes nobody made is worse than no log at all.
 *
 * Dates are compared by their ISO value: two Date objects for the same instant
 * are never `===`, and without this every update would claim every date field
 * changed.
 */
export function diff(before: Row, after: Row): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {}

  for (const key of Object.keys(before)) {
    // A column the response omits is not a change — PATCH responses routinely
    // select a subset.
    if (!(key in after)) continue
    if (SKIP_FIELDS.has(key)) continue

    const from = before[key]
    const to = after[key]
    const a = from instanceof Date ? from.toISOString() : from
    const b = to instanceof Date ? to.toISOString() : to

    if (a === b) continue
    if (a === undefined && b === undefined) continue
    // Absent on one side and null on the other is not a change anyone made.
    if ((a ?? null) === (b ?? null)) continue

    changes[key] = { from: a ?? null, to: b ?? null }
  }

  return changes
}

/** Longest-prefix match against the scope table, which already knows the models. */
function resolve(segments: string[]) {
  for (const length of [2, 1]) {
    const key = segments.slice(0, length).join('/')
    const policy = SCOPE_POLICY[key]
    if (policy) return { key, policy, rest: segments.slice(length) }
  }
  return null
}

const looksLikeId = (s: string | undefined) => Boolean(s) && /^[a-z0-9]{20,}$/i.test(s!)

/**
 * Writes one row. Never throws and never rejects: an audit failure must not
 * turn a successful write into a 500 the user cannot act on. It is logged
 * loudly instead, because silently losing audit rows is its own problem.
 */
async function write(entry: {
  actorId: string | null
  actorName: string
  actorRole: string
  action: string
  resource: string
  recordId?: string | null
  recordTag?: string | null
  changes?: unknown
  ip?: string | null
}) {
  try {
    await prisma.auditEntry.create({
      data: {
        actorId: entry.actorId,
        actorName: entry.actorName,
        actorRole: entry.actorRole,
        action: entry.action,
        resource: entry.resource,
        recordId: entry.recordId ?? null,
        recordTag: entry.recordTag ?? null,
        changes: (entry.changes ?? undefined) as never,
        ip: entry.ip ?? null,
      },
    })
  } catch (err) {
    console.error('[audit] failed to record entry:', err)
  }
}

/** Client IP, honouring the proxy header Vercel sets. */
const ipOf = (req: Request) => {
  const forwarded = req.headers['x-forwarded-for']
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded
  return (value?.split(',')[0] ?? req.socket.remoteAddress ?? null)?.trim() ?? null
}

/**
 * Records sign-ins, sign-outs, and portal access.
 *
 * Called from the auth routes rather than inferred here, because a failed
 * sign-in returns 401 and the write middleware deliberately ignores anything
 * that is not a successful mutation — yet a run of failed sign-ins is the most
 * interesting thing an audit log can show.
 */
export async function recordAuthEvent(
  req: Request,
  action: 'sign_in' | 'sign_in_failed' | 'sign_out' | 'portal_access' | 'dev_session',
  actor: { id: string | null; name: string; role: string },
) {
  await write({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    resource: 'auth',
    ip: ipOf(req),
  })
}

/**
 * Records every successful create, update, and delete below this point.
 *
 * For an update it loads the record first so the diff has a "from" side; for a
 * delete it loads it so the log still names what went. Both are one indexed
 * lookup by primary key on a request that is about to write anyway.
 */
export async function auditWrites(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()

  const viewer = req.viewer
  if (!viewer || viewer.kind !== 'team' || !viewer.account) return next()

  const segments = req.path.split('/').filter(Boolean)
  const match = resolve(segments)
  if (!match) return next()

  const { key, policy, rest } = match
  const id = looksLikeId(rest[0]) ? rest[0]! : null

  const client = (prisma as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[
    policy.model
  ]

  // The "before" side. Loaded now because after the handler runs it is either
  // changed or gone.
  let before: Row | null = null
  if (id && client) {
    before = (await client.findUnique({ where: { id } }).catch(() => null)) as Row | null
  }

  const actor = {
    id: viewer.account.id,
    name: viewer.account.name,
    role: viewer.account.role,
  }
  const ip = ipOf(req)

  // Wrapping res.json is what gives the "after" side without touching a single
  // router. Every handler in this codebase answers with res.json or a 204.
  const originalJson = res.json.bind(res)
  let captured: unknown = null
  res.json = (body: unknown) => {
    captured = body
    return originalJson(body)
  }

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return

    const after = (captured ?? null) as Row | null
    const action = req.method === 'POST' ? (id ? 'update' : 'create') : req.method === 'DELETE' ? 'delete' : 'update'

    const record = after ?? before
    const recordId = (record?.id as string | undefined) ?? id ?? null
    const recordTag = (record?.tag as string | undefined) ?? null

    void write({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action,
      resource: key,
      recordId,
      recordTag,
      // A create or delete is the whole record, so a field diff adds nothing;
      // an update is only interesting for what actually moved.
      changes: before && after && action === 'update' ? diff(before, after) : undefined,
      ip,
    })
  })

  next()
}
