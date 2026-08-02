import type { NextFunction, Request, Response, RequestHandler } from 'express'

/** An error with an intended HTTP status. Anything else becomes a 500. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export const badRequest = (m: string) => new HttpError(400, m)
export const notFound = (m = 'Not found') => new HttpError(404, m)

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export const route =
  (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    handler(req, res).catch(next)
  }

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }

  // Unique constraint — only reachable on the `tag` columns, which would mean a
  // real bug in tag allocation rather than bad input.
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  ) {
    res.status(409).json({ error: 'That record already exists' })
    return
  }

  console.error('[api] unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
}

// ---------------------------------------------------------------------------
// Body parsing
//
// Hand-rolled rather than pulling in a schema library: the surface is small and
// every field is one of a handful of shapes. Each helper throws a 400 with a
// message naming the field.
// ---------------------------------------------------------------------------

export type Body = Record<string, unknown>

export function asBody(value: unknown): Body {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw badRequest('Expected a JSON object body')
  }
  return value as Body
}

/** Required non-empty string. */
export function str(body: Body, field: string, max = 500): string {
  const v = body[field]
  if (typeof v !== 'string' || v.trim() === '') {
    throw badRequest(`\`${field}\` is required`)
  }
  if (v.length > max) throw badRequest(`\`${field}\` must be ${max} characters or fewer`)
  return v.trim()
}

/** Optional string; empty string and null both normalise to null. */
export function optionalStr(body: Body, field: string, max = 5000): string | null {
  const v = body[field]
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string') throw badRequest(`\`${field}\` must be a string`)
  if (v.length > max) throw badRequest(`\`${field}\` must be ${max} characters or fewer`)
  const trimmed = v.trim()
  return trimmed === '' ? null : trimmed
}

/** Value from a fixed set. */
export function oneOf<T extends string>(
  body: Body,
  field: string,
  guard: (v: unknown) => v is T,
  allowed: readonly string[],
): T {
  const v = body[field]
  if (!guard(v)) {
    throw badRequest(`\`${field}\` must be one of: ${allowed.join(', ')}`)
  }
  return v
}

/** Non-negative number, defaulting when absent. */
export function num(body: Body, field: string, fallback = 0): number {
  const v = body[field]
  if (v === undefined || v === null || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) throw badRequest(`\`${field}\` must be a number`)
  if (n < 0) throw badRequest(`\`${field}\` cannot be negative`)
  return n
}

/** Optional date; accepts an ISO string or a yyyy-mm-dd date input value. */
export function optionalDate(body: Body, field: string): Date | null {
  const v = body[field]
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string') throw badRequest(`\`${field}\` must be a date string`)
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) throw badRequest(`\`${field}\` is not a valid date`)
  return d
}

/** Required date. */
export function date(body: Body, field: string): Date {
  const d = optionalDate(body, field)
  if (d === null) throw badRequest(`\`${field}\` is required`)
  return d
}

/** Optional foreign key — empty string normalises to null. */
export function optionalId(body: Body, field: string): string | null {
  const v = body[field]
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string') throw badRequest(`\`${field}\` must be an id`)
  return v
}

/**
 * True when the client actually sent this field. PATCH handlers use it to tell
 * "set to null" apart from "leave alone".
 */
export const sent = (body: Body, field: string) => field in body
