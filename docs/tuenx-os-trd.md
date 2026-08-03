# Tuenx OS — Technical Requirements Document (TRD)

## 1. Architecture overview

Current state (v1): a single-file React app rendered as a Claude artifact. Persistence uses `window.storage`, a shared key-value store scoped to the artifact — no backend server, no database, no authentication. Anyone with the artifact link reads and writes the same data.

Future state (Phase 9): migrate to a real backend once individual logins and permissions are required. Recommended: Supabase (Postgres + built-in auth) — matches the current relational shape of the data model without much redesign.

This TRD assumes the artifact-based approach through Phase 8, with migration as the final phase.

> **Superseded — see `docs/adr/0001-sqlite-from-phase-1.md`.** The v2 build replaces `window.storage` with SQLite + Prisma from Phase 1, and **SQLite was replaced by Postgres on 2026-08-03** when the app was deployed to Vercel, whose filesystem cannot hold a database file. Sections 4 and 5 (limitations 1–3) below describe the artifact build and no longer apply. The entity definitions in sections 2 and 3 remain authoritative, with the additions recorded in §3 below.

## 2. Current data model (built)

```
Task
  id, tag, title, division, status, priority, assignee, dueDate, createdAt

Contact (CRM)
  id, tag, name, company, division, stage, value, email, notes, createdAt

TeamMember
  id, name, role, division, email, createdAt
```

Storage: each entity type lives under one shared storage key as a JSON array (`tasks`, `crm`, `team`). Reads happen once on mount; writes happen on every mutation, with try/catch around each call and a visible error banner on failure.

## 3. Planned data model, by phase

### Phase 2 — Gaphatch Products

```
Product
  id, name, status (planning | building | live), description, createdAt
  + url, repoUrl                              ← added 2026-08-03

RoadmapItem
  id, productId, title, status (backlog | building | shipped), createdAt

Release
  id, productId, version, notes, date
```

New storage keys: `products`, `roadmap`, `releases`.

### Phase 3 — Agency operations

```
Contact — add fields:
  contractType (retainer | project), contractValue, startDate, endDate
  stage widened 2026-08-03 to the founder's sales pipeline:
    lead | discovery | proposal | signed | onboarding | active | closed | lost

Project
  id, contactId, title, status, dueDate
  status rewritten 2026-08-03 to the delivery pipeline — ADR-0002:
    kickoff | build | qa | handoff | support | closed
  + onHold (boolean) — stalled work keeps the stage it stalled in

Invoice
  id, contactId, amount, status (draft | sent | paid | overdue), issueDate, dueDate
```

New storage keys: `projects`, `invoices`.

### Phase 4 — Fund/Treasury

```
FundEntry
  id, division (tuenx | agency | gaphatch), type (income | expense | allocation),
  amount, category, date, notes
```

New storage key: `fund-entries`. Runway = current balance ÷ average monthly net burn, computed client-side from entries.

### Phase 5 — OKRs + Docs

```
Objective
  id, scope (tuenx | agency | gaphatch | productId), title, period, owner

KeyResult
  id, objectiveId, title, targetValue, currentValue, unit, status

Doc
  id, title, division, category, body, updatedAt
```

New storage keys: `objectives`, `key-results`, `docs`.

### Phase 6 — People, ops, marketing

```
Candidate
  id, role, stage, source, notes

LeaveRequest
  id, memberId, startDate, endDate, status

Vendor
  id, name, division, monthlyCost, renewalDate, owner

Campaign
  id, scope (agency | productId), title, channel, status, date

Contract
  id, party, division, type, value, startDate, endDate, fileRef
```

New storage keys: `candidates`, `leave-requests`, `vendors`, `campaigns`, `contracts`.

### Phase 7 — Gaphatch customer-facing

```
Ticket
  id, productId, customerContact, subject, status, priority, createdAt
  + kind (bug | issue | feature), body, customerId,
    externalId ("gh:1234"), externalUrl        ← added 2026-08-03

MetricSnapshot
  id, productId, date, mrr, activeUsers, churnRate

Customer
  id, productId, name, email, subscriptionStatus, since
```

New storage keys: `tickets`, `metrics`, `customers`.

**Built:** `Ticket` only. `MetricSnapshot` and `Customer` have schema and
migrations and no routes.

`kind` was added because the founder asked for features, issues, and bugs
together; they share one queue because they compete for the same engineer.
`externalId` is unique per product, which is what makes a re-sync from GitHub
update rather than duplicate — NULL is exempt, so hand-written tickets are
unaffected.

### Phase 8 — KPI dashboard

No new storage. Computed/aggregated views pulling from every module above — read-only.

### Phase 9 — Backend migration

- ~~Move all storage keys above from `window.storage` JSON blobs into Postgres tables~~ — **done differently.** The build went straight to a relational store (SQLite via Prisma) at Phase 1; see ADR-0001. The remaining move to Postgres is `provider` + `DATABASE_URL`.
- ~~Add authentication (per-person accounts).~~ **Done 2026-08-03**, pulled forward because team and client portals were requested. scrypt-hashed passwords, server-side sessions, httpOnly cookies. See master plan §7.
- Add role-based permissions: Admin / Division lead / Member. **Partial.** `admin` is real and gates account management and `/api/people`. `lead` and `member` are currently identical to each other — the division-scoped and assigned-only restrictions are still outstanding.
- Add an audit log table: `who changed what, when` — **still absent.** The one part of Phase 9 not started.
- ~~Recommended: Supabase (Postgres + built-in auth)~~ — **done 2026-08-03, half of it.** Postgres yes; the auth is this app's own, since it was built before the migration and works. The move was `provider` plus a URL, exactly as ADR-0001 predicted.

**Not in the original data model, built anyway:** `Epic`, `Sprint`, `TimeEntry`,
and `Task.parentId` (task depth); `CalendarEntry`, `PlanItem`, `Idea`,
`RecordLink`, `Channel`, `ChannelMember`, `Message`, `UserAccount`,
`ClientAccount`, `Session`, `TagCounter`.

> **Also now in scope, and not in the original plan:** a read-only client-facing
> portal (PRD §4 had ruled it out) and messaging (PRD §4 had ruled it out). Both
> reversals are recorded in master plan §7.
>
> **A credential-free login bypass is currently enabled for development** —
> `#/team` and `#/client` open with no password. See `docs/HANDOFF.md`.

## 4. Storage design (current phase, through Phase 8)

> Superseded by ADR-0001. Retained for historical context.

- One shared key per entity type, holding a JSON array (`shared: true` so all team members using the artifact link see the same data).
- Reads: `Promise.all` on mount, each wrapped in try/catch (missing key ≠ error, treated as empty array).
- Writes: full array re-saved on every mutation. Acceptable at current scale (6–15 users, low write frequency); would need batching or a real DB before this becomes a bottleneck.
- IDs: client-generated (`timestamp + random string`), not globally guaranteed unique across concurrent creation — acceptable risk at this team size, revisit at Phase 9.

## 5. Known limitations (flagging explicitly, not accidentally)

- No authentication. Anyone with the artifact link has full read/write access to everything. *(Still true in v2 — deferred to Phase 9.)*
- No audit trail. No record of who changed what. *(Still true in v2 — deferred to Phase 9.)*
- Last-write-wins. No conflict resolution if two people edit the same record simultaneously. *(Still true in v2.)*
- Single-tenant, hardcoded. Division keys (`tuenx`/`agency`/`gaphatch`) are baked into the code, not configurable — deliberate, per the decision that this stays internal-only.

## 6. Non-functional requirements

- Responsive down to mobile — sidebar collapses to a top bar on small screens.
- Graceful degradation on storage failure — visible error state, not a silent data loss.
- Each module should load its own data independently where possible, so one module's failure doesn't block the rest of the app.

## 7. Build sequencing (technical view)

Mirrors the phase order in the PRD and master plan. Each phase before Phase 9 is additive — new storage keys and UI modules, no changes to existing entities beyond the noted field additions in Phase 3. This keeps every phase shippable independently without a big-bang rewrite.
