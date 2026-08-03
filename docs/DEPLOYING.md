# Deploying Tuenx OS to tuenx.com

Written 2026-08-03, when the founder asked for `admin.tuenx.com`,
`team.tuenx.com`, and `client.tuenx.com`.

**Nothing here has been done.** DNS records and hosting accounts need
credentials nobody has given this repo, and two of the steps below are things
that have to be decided rather than run. The app-side half — a hostname
choosing which portal opens — is built and committed.

---

## ⛔ Stop here first: three things make this unsafe to publish today

Putting the current build on a public domain would expose the whole company's
data to anyone who finds the URL. In order of severity:

| | What | Why it matters on a public domain |
|---|---|---|
| 1 | **The login bypass is on, for every route** | `POST /api/auth/dev-session` mints an admin session with no credentials. It refuses non-loopback addresses, so it fails once deployed — which means **nobody can get in at all**, since the app now expects it. Set `AUTH_BYPASS=false` and the password login underneath takes over. That login works and is tested. |
| 2 | **The client portal has no password** | An email address is the entire credential. On localhost that is a deliberate decision (master plan §7). On `client.tuenx.com` it means anyone who guesses a client's email address reads that client's invoices and contract value. |
| 3 | **Seed passwords are in the repo** | `tuenx1234`, and the founder's own `11223344`. Fine for a local demo database. Not fine anywhere else. Real accounts have to be created fresh. |

Fixed already, so not on the list: the session cookie now carries `Secure`
whenever `COOKIE_SECURE=true` or `NODE_ENV=production`.

---

## What the subdomains do once they exist

Built and working — the app reads its own hostname:

| Hostname | Opens |
|---|---|
| `admin.tuenx.com` | Internal app |
| `team.tuenx.com` | Internal app |
| `client.tuenx.com` | Client portal |
| anything else | Internal app |

The hash still wins, so `client.tuenx.com/#/team` reaches the internal app for
whoever is testing both sides. **This picks the front door, not the
permissions** — a client session gets 403 from every internal route whatever
hostname it arrived on, and that is what actually holds the line.

Three hostnames, one deployment. There is no reason to run three copies, and
three copies of a SQLite file would be three different companies.

---

## Steps you have to run

### 1. Pick a host that runs Node and keeps a disk

This is not a static site. It is a Node/Express API plus a Vite build, and the
database is a **SQLite file on disk**. That rules out the plain serverless
tiers — their filesystems reset, so every deploy would silently lose the data.

Either:

- **A container or VM** (Fly.io, Railway, Render, a small VPS) with a
  persistent volume mounted where `DATABASE_URL` points. Simplest, keeps SQLite.
- **Postgres**, which is a two-line change — `provider = "postgresql"` in
  `prisma/schema.prisma` and a new `DATABASE_URL` — and then any host will do.
  ADR-0001 anticipated this; nothing in the application code changes.

### 2. DNS, at your registrar

Three records pointing at the host. Exact values come from whichever host you
pick; the shape is:

```
admin.tuenx.com    CNAME   <host target>
team.tuenx.com     CNAME   <host target>
client.tuenx.com   CNAME   <host target>
```

Apex `tuenx.com` needs an A record (or ALIAS/ANAME) instead — CNAME is not
valid at the apex.

### 3. Environment

```
AUTH_BYPASS=false          # non-negotiable off-machine
COOKIE_SECURE=true         # or NODE_ENV=production
DATABASE_URL=file:/data/prod.db   # or a postgres:// URL
```

### 4. First run

```bash
npm ci
npm run build
npx prisma migrate deploy    # NOT `migrate dev`, and never `db:seed`
```

`npm run db:seed` is destructive and full of demo data. It must never run
against production.

### 5. Create the real accounts

There is no signup flow — accounts are created by an admin from the Users
module. Which is a chicken-and-egg problem on an empty database: the first
admin has to be inserted directly, with a hash from `hashPassword` in
`server/auth.ts` rather than a plain string.

Worth building a one-off `npm run create-admin` script before this is needed.
Not built yet.

---

## Not decided

- **Whether the client portal gets a password before it is public.** It is one
  column on `ClientAccount` and one comparison in `auth.ts`. The founder's call.
- **Backups.** A SQLite file with no backup is one bad disk from losing the
  company's records.
