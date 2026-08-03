# Tuenx OS — session handoff

**Start here.** Live state of the build, so a new session can pick up without
re-reading the repository. Update it when a module is finished, a decision is
reversed, or something is left half-built.

**Last updated:** 2026-08-03 · 50 commits · working tree clean

---

## Start the app

```bash
npm install && npm run db:migrate && npm run db:seed && npm run dev
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

`npm run db:reset` **will not run under Claude Code** — Prisma blocks destructive
migrations in this environment. Run it from a normal terminal.

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
| **Login bypass is ON** | `POST /api/auth/dev-session` mints a session with no credentials. Guarded by the `AUTH_BYPASS` env var **and** a loopback-only address check, so it cannot be reached from another machine. **While on, anyone who reaches the server is an admin.** Turn off with `AUTH_BYPASS=false`, or delete the route — the password login underneath is untouched. |
| **Client portal has no password** | An email address is the entire credential. Anyone who knows a client's address can read that client's invoices and contract value. Deliberate, per the founder. Closing it is one column on `ClientAccount` and one comparison in `auth.ts`. |
| **Session cookie needs `COOKIE_SECURE=true`** | `Secure` is now added whenever `COOKIE_SECURE=true` or `NODE_ENV=production`. It cannot be unconditional — on `http://localhost` a Secure cookie is never set at all. |

The client boundary holds even with the bypass on — a client session entered via
`#/client` still gets 403 from every internal route. Verified.

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
| Products | ✅ | ✅ | Roadmap, releases, live/repo links, and an issues queue |
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

### 1. Phase 7, the other two thirds

`Ticket` is done — routes, UI, seed. **`MetricSnapshot` and `Customer` still
have schema and migrations only**, so MRR, churn, and the subscriber base do
not exist. Tag letters are reserved: `Z` metric, `U` customer.

Until customers exist, a ticket's reporter is free text.

### 2. Compliance has no home

The founder confirmed Tuenx handles legal, accounts, finance, **and
compliance** for the group. The first three have modules. Compliance has
nothing — no register of obligations, filings, or their deadlines. Smallest
useful version is in `docs/tuenx-os-v2-scope.md` §6.

### 3. Smaller

- Grid/list layouts on modules other than Tasks and Docs (`useRecordLayout` + `LayoutSwitch` already exist — it is a per-module wiring job)
- Threads, reactions, and mentions in Messages
- Conversations bound to a CRM contact — `Channel.recordType`/`recordId` support it; nothing creates one yet
- Team workspaces (a per-team view aggregating that team's work)
- Product/project update trackers
- Phase 8 KPI dashboard
- Phase 9 proper: real role scoping, audit log

### 4. The v2 scope list

`docs/tuenx-os-v2-scope.md` maps the founder's 38-system Business OS list and
the workflow diagrams (2026-08-03) against what exists. §5 records what was
decided on the day; §6 holds what is still open. Payroll, tax filing, and
multi-tenancy remain out — multi-tenancy was reversed into scope and then
straight back out within the hour, both recorded in master plan §7.

---

## Decisions worth not relitigating

- **SQLite from Phase 1**, not the TRD's `window.storage` — ADR-0001. Postgres swap is `provider` + `DATABASE_URL`.
- **Allocations are excluded from treasury balance, burn, and runway.** Internal transfer inside one group; counting it double-counts. Shown per division instead.
- **Division is colour** — amber/orange/teal, flat fills, **no textures**. Status colour is red and green only; amber belongs to Tuenx. Arrived at over three passes: the founder rejected the original dark slate system, then rejected a typography-only encoding, then rejected hatch/dot textures.
- **Dark theme is true black**, surfaces a few points above. Requested explicitly.
- **Subtask nesting caps at one level.** A subtask of a subtask means the parent should have been an epic.
- **Calendar is deadlines, not appointments** for derived events; user-created entries carry times. Contract end dates are not draggable.
- **Messaging and the client portal were non-goals** and were reversed into scope — master plan §7.
- **Any write clears the whole API cache.** Enumerating what to drop is how a cache starts lying.

---

## Open questions for the founder

- **CI/CD was asked for and not built** — "ci and cd for the projects prducts" reads two ways: GitHub Actions for this repo, or a module inside Tuenx OS mirroring build and deploy status per product. Products now carry a `repoUrl`, which either reading needs. The repo is `github.com/devcnisham/tuenx-os`; nothing has been pushed to it.
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
