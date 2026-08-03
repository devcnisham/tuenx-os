# Tuenx OS — session handoff

**Start here.** Live state of the build, so a new session can pick up without
re-reading the repository. Update it when a module is finished, a decision is
reversed, or something is left half-built.

**Last updated:** 2026-08-03 · 40 commits · working tree clean

---

## Start the app

```bash
npm install && npm run db:migrate && npm run db:seed && npm run dev
```

http://localhost:5173. Verified working from this state — 10 migrations applied,
seed produces 9 team members, 14 tasks, 9 contacts, 3 products, 6 docs, 10 plan
items, 6 ideas, 7 calendar entries, 11 messages, 6 accounts.

`npm run db:reset` **will not run under Claude Code** — Prisma blocks destructive
migrations in this environment. Run it from a normal terminal.

### Getting in

| Route | Opens |
|---|---|
| `#/team` | Owner/admin dashboard, no credentials |
| `#/client` | Client portal, no credentials |
| anything else | Sign-in screen |

Real credentials still work: `nisham` / `11223344` (admin), `sara` / `tuenx1234`
(member), `helen@northwind.co` (client, no password).

---

## ⚠️ Read before exposing this anywhere

| | |
|---|---|
| **Login bypass is ON** | `POST /api/auth/dev-session` mints a session with no credentials. Guarded by the `AUTH_BYPASS` env var **and** a loopback-only address check, so it cannot be reached from another machine. **While on, anyone who reaches the server is an admin.** Turn off with `AUTH_BYPASS=false`, or delete the route — the password login underneath is untouched. |
| **Client portal has no password** | An email address is the entire credential. Anyone who knows a client's address can read that client's invoices and contract value. Deliberate, per the founder. Closing it is one column on `ClientAccount` and one comparison in `auth.ts`. |
| **Session cookie omits `Secure`** | Required on `http://localhost`. Must be added before serving over anything else. |

The client boundary holds even with the bypass on — a client session entered via
`#/client` still gets 403 from every internal route. Verified.

---

## Modules

| Module | API | UI | Notes |
|---|---|---|---|
| Overview | ✅ | ✅ | Comparative division ledger + Phase 3/4 roll-ups |
| Tasks | ✅ | ✅ | Board/grid/list. **Depth fields exist in the API but not the UI** |
| CRM | ✅ | ✅ | Includes Phase 3 contract terms |
| Projects | ✅ | ✅ | Board by status, inherits client's division |
| Invoices | ✅ | ✅ | Ledger, request-time overdue sweep |
| Treasury | ✅ | ✅ | Allocations excluded from balance/burn |
| Team | ✅ | ✅ | Roster, grouped by division |
| Users | ✅ | ✅ | Admin-only. Accounts, roles, teams, workload, live sessions |
| Products | ✅ | ✅ | Roadmap board + release log per product |
| Docs | ✅ | ✅ | Body-searchable, staleness flag at 3 months |
| OKRs | ✅ | ✅ | Progress derived from key results |
| Calendar | ✅ | ✅ | Day/week/month, drag to reschedule, meeting planner |
| Planner | ✅ | ✅ | Quarter columns, load bar from rough sizes |
| Brainstorms | ✅ | ✅ | Ideas promote into plan items |
| Messages | ✅ | ✅ | Channels + DMs; record-bound channels are the point |
| Sign-in | ✅ | ✅ | scrypt, server-side sessions. **Currently bypassed** |
| Client portal | ✅ | ✅ | Read-only, scoped. **No password by design** |
| Links | ✅ | ✅ | Any record to any other |
| Search | ✅ | ✅ | Global, `/` to focus |

---

## Pick these up first

Everything here has working endpoints and no screens. Building the UI is the
whole job — no schema or API work needed.

### 1. Task depth — `server/routes/work.ts`

Epics, sprints, subtasks, and time entries. `GET /api/tasks` already returns
`subtasks`, `epic`, `sprint`, `estimateHours`, and `loggedHours`, and the board
lists roots only (`?includeSubtasks=true` opts out). Nothing renders any of it.

Endpoints: `/api/work/epics`, `/api/work/sprints`, `/api/work/time`.

### 2. Phase 6 — `server/routes/people-ops.ts`

Candidates (hiring pipeline), leave, vendors, campaigns, and the contracts
repository. All five have list/create/update/delete under `/api/ops/*`.
Vendors return `monthlyTotal` and `annualTotal` alongside the list.

Suggested shape: one "People & Ops" module with tabs, rather than five nav
entries — they are small and related.

### 3. Phase 7 — nothing yet

`Ticket`, `MetricSnapshot`, and `Customer` have schema and migrations only.
Needs routes as well as UI. Tag letters are already reserved: `S`, `Z`, `U`.

### 4. Smaller

- Grid/list layouts on modules other than Tasks and Docs (`useRecordLayout` + `LayoutSwitch` already exist — it is a per-module wiring job)
- Threads, reactions, and mentions in Messages
- Conversations bound to a CRM contact — `Channel.recordType`/`recordId` support it; nothing creates one yet
- Team workspaces (a per-team view aggregating that team's work)
- Product/project update trackers
- Phase 8 KPI dashboard
- Phase 9 proper: real role scoping, audit log

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

- `Project.status` (`planning | active | on_hold | delivered`) was chosen here — the TRD leaves it unspecified.
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
