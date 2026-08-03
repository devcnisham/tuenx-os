import { Router } from 'express'
import { prisma } from '../db.ts'
import {
  clearSessionCookie,
  hashPassword,
  newSessionToken,
  requireAdmin,
  sessionExpiry,
  setSessionCookie,
  verifyPassword,
} from '../auth.ts'
import { asBody, badRequest, notFound, oneOf, route, sent, str } from '../http.ts'
import { ROLES, isRole } from '../../src/types.ts'

export const authRouter = Router()

/**
 * Same message and roughly the same work for every failed team login,
 * whatever went wrong.
 *
 * Saying "no such user" tells an attacker which addresses exist, and returning
 * early on an unknown user leaks the same thing through timing. So an unknown
 * identifier still runs a scrypt comparison against a throwaway hash.
 */
const LOGIN_FAILED = 'Those details did not match'
const DUMMY = {
  salt: '00000000000000000000000000000000',
  hash: '0'.repeat(128),
}

authRouter.get(
  '/me',
  route(async (req, res) => {
    if (!req.viewer) {
      res.json({ viewer: null })
      return
    }
    res.json({ viewer: req.viewer })
  }),
)

/** Team login: email or username, plus a password. */
authRouter.post(
  '/login',
  route(async (req, res) => {
    const body = asBody(req.body)
    const identifier = str(body, 'identifier', 200).toLowerCase()
    const password = str(body, 'password', 200)

    const account = await prisma.userAccount.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
      include: { member: true },
    })

    // Run the comparison either way — see the note on DUMMY above.
    const ok = await verifyPassword(
      password,
      account?.passwordSalt ?? DUMMY.salt,
      account?.passwordHash ?? DUMMY.hash,
    )

    if (!account || !ok || !account.active) throw badRequest(LOGIN_FAILED)

    const token = newSessionToken()
    await prisma.$transaction([
      prisma.session.create({
        data: { token, kind: 'team', userAccountId: account.id, expiresAt: sessionExpiry() },
      }),
      prisma.userAccount.update({
        where: { id: account.id },
        data: { lastLoginAt: new Date() },
      }),
    ])

    setSessionCookie(res, token)
    res.json({
      viewer: {
        kind: 'team',
        account: {
          id: account.id,
          role: account.role,
          memberId: account.memberId,
          name: account.member.name,
          division: account.member.division,
        },
      },
    })
  }),
)

/**
 * Client login: email address only.
 *
 * NO PASSWORD, by the founder's explicit instruction. Possession of the email
 * address is the entire credential, which means anyone who knows a client's
 * address can read that client's invoices, projects, and contract value.
 *
 * That is an authentication bypass by design, acceptable only while this runs
 * on localhost. To close it, add a code or password column to ClientAccount and
 * one comparison here — nothing else in the system has to change.
 */
authRouter.post(
  '/client-login',
  route(async (req, res) => {
    const body = asBody(req.body)
    const email = str(body, 'email', 200).toLowerCase()

    const account = await prisma.clientAccount.findUnique({
      where: { email },
      include: { contact: true },
    })

    // Same message whether the address is unknown or deactivated, so the portal
    // is not a directory of who the clients are.
    if (!account || !account.active) throw badRequest('That address is not set up for the portal')

    const token = newSessionToken()
    await prisma.$transaction([
      prisma.session.create({
        data: { token, kind: 'client', clientAccountId: account.id, expiresAt: sessionExpiry() },
      }),
      prisma.clientAccount.update({
        where: { id: account.id },
        data: { lastLoginAt: new Date() },
      }),
    ])

    setSessionCookie(res, token)
    res.json({
      viewer: {
        kind: 'client',
        client: {
          id: account.id,
          contactId: account.contactId,
          name: account.contact.name,
          company: account.contact.company,
        },
      },
    })
  }),
)

authRouter.post(
  '/logout',
  route(async (req, res) => {
    if (req.viewer) {
      await prisma.session.delete({ where: { id: req.viewer.sessionId } }).catch(() => {})
    }
    clearSessionCookie(res)
    res.status(204).end()
  }),
)

// ---------------------------------------------------------------------------
// Account management — admin only
// ---------------------------------------------------------------------------

authRouter.get(
  '/accounts',
  requireAdmin,
  route(async (_req, res) => {
    const accounts = await prisma.userAccount.findMany({
      include: { member: { select: { id: true, tag: true, name: true, division: true, team: true } } },
      orderBy: { createdAt: 'asc' },
    })

    // Never send the hash or the salt, even to an admin. There is no screen
    // that needs them and every copy is another place they can leak.
    res.json(
      accounts.map(({ passwordHash: _h, passwordSalt: _s, ...account }) => account),
    )
  }),
)

authRouter.post(
  '/accounts',
  requireAdmin,
  route(async (req, res) => {
    const body = asBody(req.body)
    const memberId = str(body, 'memberId', 60)
    const password = str(body, 'password', 200)
    if (password.length < 8) throw badRequest('Password must be at least 8 characters')

    const member = await prisma.teamMember.findUnique({ where: { id: memberId } })
    if (!member) throw badRequest('`memberId` does not match a team member')

    const { passwordHash, passwordSalt } = await hashPassword(password)

    const account = await prisma.userAccount.create({
      data: {
        memberId,
        email: str(body, 'email', 200).toLowerCase(),
        username: str(body, 'username', 60).toLowerCase(),
        role: oneOf(body, 'role', isRole, ROLES),
        passwordHash,
        passwordSalt,
      },
      include: { member: { select: { id: true, tag: true, name: true, division: true, team: true } } },
    })

    const { passwordHash: _h, passwordSalt: _s, ...safe } = account
    res.status(201).json(safe)
  }),
)

authRouter.patch(
  '/accounts/:id',
  requireAdmin,
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.userAccount.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Account not found')

    let credentials = {}
    if (sent(body, 'password')) {
      const password = str(body, 'password', 200)
      if (password.length < 8) throw badRequest('Password must be at least 8 characters')
      credentials = await hashPassword(password)

      // A password change ends every existing session for that account —
      // otherwise resetting a compromised password leaves the attacker signed in.
      await prisma.session.deleteMany({ where: { userAccountId: existing.id } })
    }

    const account = await prisma.userAccount.update({
      where: { id: req.params.id },
      data: {
        ...credentials,
        ...(sent(body, 'email') && { email: str(body, 'email', 200).toLowerCase() }),
        ...(sent(body, 'username') && { username: str(body, 'username', 60).toLowerCase() }),
        ...(sent(body, 'role') && { role: oneOf(body, 'role', isRole, ROLES) }),
        ...(sent(body, 'active') && { active: body.active === true }),
      },
      include: { member: { select: { id: true, tag: true, name: true, division: true, team: true } } },
    })

    // Deactivating an account should log it out now, not at expiry.
    if (account.active === false) {
      await prisma.session.deleteMany({ where: { userAccountId: account.id } })
    }

    const { passwordHash: _h, passwordSalt: _s, ...safe } = account
    res.json(safe)
  }),
)

authRouter.delete(
  '/accounts/:id',
  requireAdmin,
  route(async (req, res) => {
    const existing = await prisma.userAccount.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Account not found')

    // Sessions cascade with the account, so deleting it signs the person out.
    await prisma.userAccount.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

// ---------------------------------------------------------------------------
// Client accounts — admin only
// ---------------------------------------------------------------------------

authRouter.get(
  '/client-accounts',
  requireAdmin,
  route(async (_req, res) => {
    const accounts = await prisma.clientAccount.findMany({
      include: { contact: { select: { id: true, tag: true, name: true, company: true } } },
      orderBy: { createdAt: 'asc' },
    })
    res.json(accounts)
  }),
)

authRouter.post(
  '/client-accounts',
  requireAdmin,
  route(async (req, res) => {
    const body = asBody(req.body)
    const contactId = str(body, 'contactId', 60)

    const contact = await prisma.contact.findUnique({ where: { id: contactId } })
    if (!contact) throw badRequest('`contactId` does not match a contact')

    const account = await prisma.clientAccount.create({
      data: { contactId, email: str(body, 'email', 200).toLowerCase() },
      include: { contact: { select: { id: true, tag: true, name: true, company: true } } },
    })

    res.status(201).json(account)
  }),
)

authRouter.patch(
  '/client-accounts/:id',
  requireAdmin,
  route(async (req, res) => {
    const body = asBody(req.body)
    const existing = await prisma.clientAccount.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Client account not found')

    const account = await prisma.clientAccount.update({
      where: { id: req.params.id },
      data: {
        ...(sent(body, 'email') && { email: str(body, 'email', 200).toLowerCase() }),
        ...(sent(body, 'active') && { active: body.active === true }),
      },
      include: { contact: { select: { id: true, tag: true, name: true, company: true } } },
    })

    if (account.active === false) {
      await prisma.session.deleteMany({ where: { clientAccountId: account.id } })
    }

    res.json(account)
  }),
)

authRouter.delete(
  '/client-accounts/:id',
  requireAdmin,
  route(async (req, res) => {
    const existing = await prisma.clientAccount.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Client account not found')

    await prisma.clientAccount.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)
