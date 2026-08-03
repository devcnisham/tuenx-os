# Deploying Tuenx OS to tuenx.com

Written 2026-08-03, when the founder asked for `admin.tuenx.com`,
`team.tuenx.com`, and `client.tuenx.com`.

**Updated 2026-08-03 for the Vercel deploy.** The code side is done: Postgres,
a serverless entry point, an admin bootstrap script, and CI. What is left needs
a Vercel account and a database, which is yours to click.

---

## ⛔ Stop here first: three things make this unsafe to publish today

Putting the current build on a public domain would expose the whole company's
data to anyone who finds the URL. In order of severity:

| | What | Why it matters on a public domain |
|---|---|---|
| 1 | **The login bypass must be turned off** | `POST /api/auth/dev-session` mints an admin session with no credentials. It refuses non-loopback addresses, so it fails once deployed — which means **nobody can get in at all**, because the app now expects it. Set `AUTH_BYPASS=false`; the password login underneath takes over, and `npm run create-admin` makes the first account. |
| 2 | **The client portal has no password** | An email address is the entire credential. **Confirmed as deliberate on 2026-08-03 and deployed anyway** — the founder's call, recorded here rather than quietly. Anyone who guesses a client's email address reads that client's invoices and contract value. |
| 3 | **Seed passwords are in a public repo** | `tuenx1234`, and `11223344`. Fine for a local demo database, and `npm run db:seed` must never run against production. If `11223344` is used anywhere real, change it there — it is in public git history now. |

Fixed already: the session cookie carries `Secure` whenever `COOKIE_SECURE=true`
or `NODE_ENV=production`, and the database is Postgres rather than a SQLite file.

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

### 1. Vercel — three clicks and two environment variables

Done in the repo already: Postgres, `vercel.json`, and `api/index.ts` (one
serverless function handing requests to the same Express app, so there is no
second routing table to keep in step).

1. **Import the repo** at vercel.com/new → `devcnisham/tuenx-os`. Name the
   project `tuenx-os` to get `tuenx-os.vercel.app`.
2. **Add a Postgres database** — Storage → Create → Postgres, then connect it
   to the project. Vercel sets `DATABASE_URL` itself. Neon's free tier works
   the same way if you would rather not use Vercel's.
3. **Add two environment variables** (Settings → Environment Variables):

   ```
   AUTH_BYPASS=false
   COOKIE_SECURE=true
   ```

   Optionally `GITHUB_TOKEN`, which raises the issue sync from 60 requests an
   hour to 5,000 and lets it read private repositories.

The build command already runs `prisma migrate deploy`, so the schema is
created on the first deploy. Then, once:

```bash
npm run create-admin -- --name "Nisham" --email nisham@tuenx.com --username nisham
```

with `ADMIN_PASSWORD` set in the environment, pointed at the production
`DATABASE_URL`.

**Untested against a real Vercel build.** The configuration is written from the
documented behaviour, not from a deploy that has run — the first one may need a
nudge, most likely around how the function resolves `.ts` import extensions.

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
