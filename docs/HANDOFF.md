# Tuenx OS — session handoff

**Start here.** Live state of the build, so a new session can pick up without
re-reading the repository. Update it when a module is finished, a decision is
reversed, or something is left half-built.

**Last updated:** 2026-08-03 · 62 commits · working tree clean

| | |
|---|---|
| Repo | [github.com/devcnisham/tuenx-os](https://github.com/devcnisham/tuenx-os) — **public** |
| Deployed | [tuenx-os.vercel.app](https://tuenx-os.vercel.app) — live, **no database yet** |
| Database | Postgres. SQLite was swapped out for the deploy — ADR-0001 |

---

## Start the app

```bash
createdb tuenx_os          # Postgres now, not SQLite — see ADR-0001
npm install && npx prisma migrate deploy && npm run db:seed && npm run dev
```

http://localhost:5173. Verified working from this state — 13 migrations applied,
seed produces 9 team members, 19 tasks (14 roots + 5 subtasks), 9 contacts, 3
products, 9 docs, 10 plan items, 6 ideas, 7 calendar entries, 11 messages, 6
accounts, 6 candidates, 5 leave records, 7 vendors, 5 campaigns, 6 contracts, 3
epics, 3 sprints, 6 time entries, 6 issues.

**Run one dev stack, not two.** Vite now fails on a taken 5173 rather than
walking to the next port — it used to land on 5174, bind `::1` while the API
held `127.0.0.1`, and proxy `/api` to itself. That loop made every request take
10–20 seconds and read as "the app is slow".

`prisma migrate dev` **will not run under Claude Code** — it is interactive and
Prisma refuses. Generate SQL with `prisma migrate diff --from-migrations
prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`, save it
as a migration folder by hand, and apply with `prisma migrate deploy`. That is
how the Postgres baseline and the last three migrations were made.

### Getting in

| Route | Opens |
|---|---|
| `#/client` | Client portal, no credentials |
| anything else | Owner/admin dashboard, no credentials |

**Every route is bypassed now**, not just the two — asked for on 2026-08-03.
The sign-in screen is only reached if the dev endpoint refuses. Either side
swaps to the other: `#/client` while signed in as the team mints a client
session rather than doing nothing.

Sign-out warns that it will sign you straight back in, because it will.

Hostname does the same job once deployed: `client.tuenx.com` opens the portal,
`admin.` and `team.` the internal app. See `docs/DEPLOYING.md`.

Real credentials still work: `nisham` / `11223344` (admin), `sara` / `tuenx1234`
(member), `helen@northwind.co` (client, no password).

---

## ⚠️ Read before exposing this anywhere

| | |
|---|---|
| **Login bypass is ON locally, OFF in production** | `POST /api/auth/dev-session` mints a session with no credentials, for **every** route rather than just two. Guarded by `AUTH_BYPASS` **and** a loopback check, so it cannot be reached from another machine. **While on, anyone who reaches the server is an admin.** The deployment sets `AUTH_BYPASS=false`; verified returning 400 there. |
| **Client portal has no password** | An email address is the entire credential. Anyone who knows a client's address can read that client's invoices and contract value. Deliberate, per the founder. Closing it is one column on `ClientAccount` and one comparison in `auth.ts`. |
| **Session cookie needs `COOKIE_SECURE=true`** | `Secure` is now added whenever `COOKIE_SECURE=true` or `NODE_ENV=production`. It cannot be unconditional — on `http://localhost` a Secure cookie is never set at all. |

The client boundary holds even with the bypass on — a client session entered via
`#/client` still gets 403 from every internal route. Verified locally and again
against the deployment, where an anonymous `/api/tasks` returns 401.

**The repo is public and `prisma/seed.ts` contains `11223344`.** If that string
is a real password anywhere, change it there — deleting the line will not
remove it from git history.

---

## Modules

| Module | API | UI | Notes |
|---|---|---|---|
| Overview | ✅ | ✅ | Comparative division ledger + Phase 3/4 roll-ups |
| Tasks | ✅ | ✅ | Board/grid/list, with epic/sprint/subtask/hours on the card |
| Sprints & Epics | ✅ | ✅ | Epics, sprints, workload. Time logs live on the task |
| CRM | ✅ | ✅ | Includes Phase 3 contract terms |
| Projects | ✅ | ✅ | Board by status, inherits client's division |
| Invoices | ✅ | ✅ | Ledger, request-time overdue sweep |
| Treasury | ✅ | ✅ | Allocations excluded from balance/burn |
| Team | ✅ | ✅ | Roster, grouped by division |
| Users | ✅ | ✅ | Admin-only. Accounts, roles, teams, workload, live sessions |
| Products | ✅ | ✅ | Roadmap, releases, live/repo links, issues queue, GitHub sync |
| Docs | ✅ | ✅ | Body-searchable, staleness flag at 3 months |
| OKRs | ✅ | ✅ | Progress derived from key results |
| Calendar | ✅ | ✅ | Time grid + mini-month, drag to reschedule, meeting planner |
| Planner | ✅ | ✅ | Quarter columns, load bar from rough sizes |
| Brainstorms | ✅ | ✅ | Ideas promote into plan items |
| People & Ops | ✅ | ✅ | Phase 6 — hiring, time off, vendors, marketing, contracts, in five tabs |
| Messages | ✅ | ✅ | Channels + DMs; record-bound channels are the point |
| Sign-in | ✅ | ✅ | scrypt, server-side sessions. **Currently bypassed** |
| Client portal | ✅ | ✅ | Read-only, scoped. **No password by design** |
| Links | ✅ | ✅ | Any record to any other |
| Search | ✅ | ✅ | Global, `/` to focus |

---

## Pick these up first

### 1. Give the deployment a database

`tuenx-os.vercel.app` is live and every route that touches data returns 500,
because `DATABASE_URL` is not set. One variable — Vercel Postgres, or a
Supabase project's **pooled** string (port 6543; the direct port runs out of
connections under serverless). Then redeploy, and `npm run create-admin` for
the first account. `docs/DEPLOYING.md` has the detail.

### 2. Phase 7, the other two thirds

`Ticket` is done — routes, UI, seed, and a GitHub issue sync.
**`MetricSnapshot` and `Customer` still have schema and migrations only**, so
MRR, churn, and the subscriber base do not exist. Tag letters are reserved:
`Z` metric, `U` customer.

Until customers exist, a ticket's reporter is free text.

### 3. Compliance has no home

The founder confirmed Tuenx handles legal, accounts, finance, **and
compliance** for the group. The first three have modules. Compliance has
nothing — no register of obligations, filings, or their deadlines. Smallest
useful version is in `docs/tuenx-os-v2-scope.md` §6.

### 4. Smaller

- Grid/list layouts on modules other than Tasks and Docs (`useRecordLayout` + `LayoutSwitch` already exist — it is a per-module wiring job)
- Threads, reactions, and mentions in Messages
- Conversations bound to a CRM contact — `Channel.recordType`/`recordId` support it; nothing creates one yet
- Team workspaces (a per-team view aggregating that team's work)
- Product/project update trackers
- Phase 8 KPI dashboard
- Phase 9 proper: real role scoping, audit log
- A CD half for the products themselves — build/deploy status mirrored onto a product page, now that `repoUrl` exists to hang it off

### 5. The v2 scope list

`docs/tuenx-os-v2-scope.md` maps the founder's 38-system Business OS list and
the workflow diagrams (2026-08-03) against what exists. §5 records what was
decided on the day; §6 holds what is still open. Payroll, tax filing, and
multi-tenancy remain out — multi-tenancy was reversed into scope and then
straight back out within the hour, both recorded in master plan §7.

---

## Decisions worth not relitigating

- **SQLite from Phase 1**, then **Postgres from 2026-08-03** — ADR-0001. The swap was `provider` plus a URL exactly as promised; no application code changed, because the TRD's enums were TypeScript unions rather than database enums.
- **Delivery and sales stages come from the founder's diagram** — ADR-0002. `on_hold` is a flag, not a stage: work stalls *from* a stage and returns to it.
- **Bugs, issues, and feature requests share one queue.** They compete for the same week of the same engineer.
- **The GitHub sync is one-directional.** GitHub owns what it knows; nothing is written back. A two-way sync that mishandles a conflict quietly reopens issues someone closed.
- **Allocations are excluded from treasury balance, burn, and runway.** Internal transfer inside one group; counting it double-counts. Shown per division instead.
- **Division is colour** — amber/orange/teal, flat fills, **no textures**. Status colour is red and green only; amber belongs to Tuenx. Arrived at over three passes: the founder rejected the original dark slate system, then rejected a typography-only encoding, then rejected hatch/dot textures.
- **Dark theme is true black**, surfaces a few points above. Requested explicitly.
- **Subtask nesting caps at one level.** A subtask of a subtask means the parent should have been an epic.
- **Calendar is deadlines, not appointments** for derived events; user-created entries carry times. Contract end dates are not draggable.
- **Messaging and the client portal were non-goals** and were reversed into scope — master plan §7.
- **Any write clears the whole API cache.** Enumerating what to drop is how a cache starts lying.

---

## Open questions for the founder

- **CI/CD, half answered.** GitHub Actions runs typecheck, build, and `prisma validate` on every push; Vercel deploys from the same branch. The other reading — build and deploy status *mirrored into Tuenx OS per product* — is not built. `repoUrl` exists to hang it off.
- Agency's real name is still a placeholder.
- Real Google Workspace integration (Meet/Docs/Chat) needs a Google Cloud project, OAuth credentials, and consent scopes. Nothing built toward it; internal equivalents exist instead.
- Whether `lead` and `member` should actually differ. Today they are identical — only `admin` is enforced.

---

## Conventions

Full detail in `CLAUDE.md`. The four that catch people out:

1. **Route position is the security boundary.** Anything mounted below `app.use('/api', requireTeam)` in `server/index.ts` is default-deny.
2. **Tags are allocated server-side in a transaction.** Never client-side, never reissued.
3. **`src/types.ts` is imported by the server too** — shared vocabulary goes there.
4. **The seed is ordered.** A block referencing another entity must come after it. This has bitten once already.
5. **Relative imports under `server/`, `api/`, `prisma/` carry no extension.** Vercel emits the specifier verbatim and Node cannot resolve `./db.ts` at runtime. Client imports keep theirs — Vite bundles them.
