# Tuenx OS — session handoff

Live state of the build. Update this whenever a module is finished, a decision
is reversed, or something is left half-built. It exists so a new session can
pick up without re-reading the whole repository.

**Last updated:** 2026-08-03

---

## Current state

Working tree clean. Typecheck and production build both green. `git fsck` clean.

Run it with `npm run dev` (Vite 5173 + API 5174), after `npm run db:migrate && npm run db:seed`.

## Modules

| Module | API | UI | Notes |
|---|---|---|---|
| Overview | ✅ | ✅ | Comparative division ledger + Phase 3/4 roll-ups |
| Tasks | ✅ | ✅ | Board/grid/list. Depth fields exist in the API but not the UI — see below |
| CRM | ✅ | ✅ | Includes Phase 3 contract terms |
| Projects | ✅ | ✅ | Board by status, inherits client's division |
| Invoices | ✅ | ✅ | Ledger, request-time overdue sweep |
| Treasury | ✅ | ✅ | Allocations excluded from balance/burn — see below |
| Team | ✅ | ✅ | |
| Products | ✅ | ✅ | Roadmap board + release log per product |
| Docs | ✅ | ✅ | Body-searchable, staleness flag at 3 months |
| OKRs | ✅ | ✅ | Progress derived from key results |
| Calendar | ✅ | ✅ | Day/week/month, derived deadlines + own entries |
| Planner | ✅ | ✅ | Quarter columns, load bar from rough sizes |
| Brainstorms | ✅ | ✅ | Ideas promote into plan items |
| Messages | ✅ | ✅ | Channels + DMs; record channels are the point of it |
| Users | ✅ | ✅ | Admin-only. Accounts, roles, teams, workload, live sessions |
| Sign-in | ✅ | ✅ | scrypt, server-side sessions. **Currently bypassed — see below** |
| Client portal | ✅ | ✅ | Read-only, scoped. **No password by design** |
| Links | ✅ | ✅ | Any record to any other |
| Search | ✅ | ✅ | Global, `/` to focus |

### ⚠️ Login is currently bypassed

`#/team` and `#/client` open straight into their portals with no credentials,
via `POST /api/auth/dev-session`. The founder asked for this while building.

**While it is on, anyone who can reach the server is an admin.** It is guarded
two ways — the `AUTH_BYPASS` env var and a loopback-only address check — so it
cannot be reached from another machine. Turn it off with `AUTH_BYPASS=false`,
or delete the `/dev-session` route: the real password login is untouched and
still works.

The client boundary still holds even with the bypass on — a client session
entered this way still gets 403 from every internal route. Verified.

### Half-built — pick these up first

- **Task depth** (`server/routes/work.ts`, commit `bf9a433`). Epics, sprints, subtasks, and time entries all have schema, migration, and endpoints. **No UI at all.** Tasks now returns `subtasks`, `epic`, `sprint`, `estimateHours`, and `loggedHours`, and the board lists roots only — but nothing renders them yet.
- **Phase 6** (`server/routes/people-ops.ts`) — candidates, leave, vendors, campaigns, and the contracts repository all have working endpoints. **No UI.**
- **Phase 7** — Ticket, MetricSnapshot, and Customer have schema and migrations. **No routes, no UI.**

### Not started

- Team workspaces (a per-team view aggregating that team's work)
- Product/project update trackers
- Grid/list layouts on modules other than Tasks and Docs
- Threads, reactions, and mentions in Messages
- Conversations bound to a CRM contact (the schema supports it via `recordType`/`recordId`; nothing creates one yet)
- Phase 8 KPI dashboard
- Phase 9 auth, permissions, audit log

## Decisions worth not relitigating

- **SQLite from Phase 1**, not the TRD's `window.storage` — ADR-0001. Postgres swap is `provider` + `DATABASE_URL`.
- **Allocations are excluded from treasury balance, burn, and runway.** Moving capital from Tuenx into a division is an internal transfer; counting it double-counts. Shown per division instead.
- **Messaging was reversed into scope** — master plan §7. It earns its place through record-bound channels, not general chat.
- **Division is colour** (amber/orange/teal), flat fills, no textures. Status colour is red and green only — amber belongs to Tuenx. This was arrived at over three passes; the founder rejected both the original dark system and a typography-only encoding.
- **Subtask nesting is capped at one level.** A subtask of a subtask means the parent should have been an epic.
- **Calendar is deadlines, not appointments** for derived events; user-created entries can carry times.

## Open questions for the founder

- `Project.status` (`planning | active | on_hold | delivered`) was chosen here — the TRD leaves it unspecified.
- Agency's real name is still a placeholder.
- Real Google Workspace integration (Meet/Docs/Chat) needs a Google Cloud project, OAuth credentials, and consent scopes from the founder. Nothing has been built toward it; the internal equivalents exist instead.

## Conventions

See `CLAUDE.md`. The two that catch people out:

- Tags are allocated server-side in a transaction. Never client-side.
- `src/types.ts` is imported by the server too — add shared vocabulary there.
