# Tuenx OS — session handoff

Live state of the build. Update this whenever a module is finished, a decision
is reversed, or something is left half-built. It exists so a new session can
pick up without re-reading the whole repository.

**Last updated:** 2026-08-02

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
| Links | ✅ | ✅ | Any record to any other |
| Search | ✅ | ✅ | Global, `/` to focus |

### Half-built — pick these up first

- **Task depth** (`server/routes/work.ts`, commit `bf9a433`). Epics, sprints, subtasks, and time entries all have schema, migration, and endpoints. **No UI at all.** Tasks now returns `subtasks`, `epic`, `sprint`, `estimateHours`, and `loggedHours`, and the board lists roots only — but nothing renders them yet.
- **Phases 6 and 7** — schema and migrations applied for Candidate, LeaveRequest, Vendor, Campaign, Contract, Ticket, MetricSnapshot, Customer. **No routes, no UI.**

### Not started

- Team workspaces (a per-team view aggregating that team's work)
- Product/project update trackers
- Grid/list layouts on modules other than Tasks and Docs
- Dark mode toggle (requested, not built)
- Separate message threads for individuals and for clients (requested, not built — current DMs are person-to-person only; nothing links a conversation to a CRM contact yet)
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
