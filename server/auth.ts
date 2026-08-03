import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { NextFunction, Request, Response } from 'express'
import { prisma } from './db.ts'
import { HttpError } from './http.ts'

/**
 * `promisify` picks the 3-argument overload of scrypt, which drops the options
 * object and with it the work factor. Typing the wrapper explicitly keeps the
 * 4-argument form — silently falling back to scrypt's weak defaults is exactly
 * the kind of thing that would never show up in testing.
 */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/**
 * OWASP-recommended scrypt work factor at the time of writing.
 *
 * `maxmem` has to be raised explicitly: N=2^15 with r=8 needs roughly
 * 128 * N * r ≈ 33 MB, and node's default ceiling is 32 MB, so the call fails
 * with ERR_CRYPTO_INVALID_SCRYPT_PARAMS. Raising the ceiling is right; lowering
 * N to fit under it would quietly weaken every password in the system.
 */
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const
const KEYLEN = 64

export const SESSION_COOKIE = 'tuenx_session'
const SESSION_DAYS = 14

/**
 * Password hashing.
 *
 * scrypt from node's own crypto rather than a bcrypt/argon2 dependency: it is
 * memory-hard, it is in the standard library, and it needs no native build.
 * Nothing recoverable is ever stored — only the salt and the derived key.
 */
export async function hashPassword(password: string) {
  const passwordSalt = randomBytes(16).toString('hex')
  const derived = await scryptAsync(password, passwordSalt, KEYLEN, SCRYPT)
  return { passwordSalt, passwordHash: derived.toString('hex') }
}

/**
 * Compares in constant time. A plain `===` on hex strings leaks how much of the
 * hash matched through timing, which is enough to reconstruct it given enough
 * attempts.
 */
export async function verifyPassword(password: string, salt: string, expectedHex: string) {
  const derived = await scryptAsync(password, salt, KEYLEN, SCRYPT)
  const expected = Buffer.from(expectedHex, 'hex')
  if (expected.length !== derived.length) return false
  return timingSafeEqual(derived, expected)
}

/** 256 bits from a CSPRNG. Guessing one is not a realistic attack. */
export const newSessionToken = () => randomBytes(32).toString('hex')

export const sessionExpiry = () => new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

/**
 * Express does not parse cookies and the app has no other use for a cookie
 * library, so this reads the one header it needs.
 */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  return null
}

/**
 * `Secure` on anything that is not plain-http localhost.
 *
 * It cannot be unconditional: on `http://localhost` a Secure cookie is never
 * set at all, so the whole app would fail to sign anyone in. It also cannot be
 * omitted once this is served over HTTPS, so it is a switch rather than a
 * decision — set `COOKIE_SECURE=true` (or `NODE_ENV=production`) wherever this
 * is deployed. See `docs/DEPLOYING.md`.
 */
const SECURE_COOKIE =
  process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production'

export function setSessionCookie(res: Response, token: string) {
  res.setHeader(
    'Set-Cookie',
    [
      `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
      'Path=/',
      // httpOnly so a script on the page cannot read it, SameSite=Lax so it is
      // not sent on cross-site requests.
      'HttpOnly',
      'SameSite=Lax',
      ...(SECURE_COOKIE ? ['Secure'] : []),
      `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
    ].join('; '),
  )
}

export function clearSessionCookie(res: Response) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${SECURE_COOKIE ? '; Secure' : ''}; Max-Age=0`,
  )
}

export interface Viewer {
  kind: 'team' | 'client'
  sessionId: string
  /** Team viewers only. */
  account?: {
    id: string
    role: string
    memberId: string
    name: string
    division: string
  }
  /** Client viewers only. */
  client?: {
    id: string
    contactId: string
    name: string
    company: string | null
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      viewer?: Viewer
    }
  }
}

/**
 * Resolves the session cookie onto `req.viewer`, and never throws — routes
 * decide what an anonymous request means. Expired sessions are deleted on
 * sight rather than left to accumulate.
 */
export async function attachViewer(req: Request, _res: Response, next: NextFunction) {
  const token = readCookie(req, SESSION_COOKIE)
  if (!token) return next()

  try {
    const session = await prisma.session.findUnique({
      where: { token },
      include: {
        userAccount: { include: { member: true } },
        clientAccount: { include: { contact: true } },
      },
    })

    if (!session) return next()

    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
      return next()
    }

    if (session.kind === 'team' && session.userAccount?.active) {
      req.viewer = {
        kind: 'team',
        sessionId: session.id,
        account: {
          id: session.userAccount.id,
          role: session.userAccount.role,
          memberId: session.userAccount.memberId,
          name: session.userAccount.member.name,
          division: session.userAccount.member.division,
        },
      }
    } else if (session.kind === 'client' && session.clientAccount?.active) {
      req.viewer = {
        kind: 'client',
        sessionId: session.id,
        client: {
          id: session.clientAccount.id,
          contactId: session.clientAccount.contactId,
          name: session.clientAccount.contact.name,
          company: session.clientAccount.contact.company,
        },
      }
    }
  } catch {
    // A failed lookup must not take the request down — it just means anonymous.
  }

  next()
}

/**
 * Gate for everything a client must never reach.
 *
 * This is the boundary that matters: the client portal exists to show one
 * client their own records, and nothing else in the API is safe to expose to
 * them. Default-deny — a route is internal unless it explicitly opts out.
 */
export function requireTeam(req: Request, _res: Response, next: NextFunction) {
  if (!req.viewer) return next(new HttpError(401, 'Sign in to continue'))
  if (req.viewer.kind !== 'team') {
    return next(new HttpError(403, 'That is not available on the client portal'))
  }
  next()
}

export function requireClient(req: Request, _res: Response, next: NextFunction) {
  if (!req.viewer) return next(new HttpError(401, 'Sign in to continue'))
  if (req.viewer.kind !== 'client') {
    return next(new HttpError(403, 'Client portal only'))
  }
  next()
}

/** Admin-only, for account management. Roles are otherwise still Phase 9 work. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.viewer || req.viewer.kind !== 'team') {
    return next(new HttpError(401, 'Sign in to continue'))
  }
  if (req.viewer.account?.role !== 'admin') {
    return next(new HttpError(403, 'Only an admin can do that'))
  }
  next()
}
