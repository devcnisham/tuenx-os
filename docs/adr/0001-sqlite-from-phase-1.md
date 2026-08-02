# ADR-0001 — SQLite + Prisma from Phase 1, not Phase 9

**Status:** Accepted
**Date:** 2026-08-02

## Context

TRD §1 and §4 specify that persistence uses `window.storage` (a shared key-value store scoped to a Claude artifact) through Phase 8, with a migration to Postgres only at Phase 9.

The v2 build brief specifies React + Vite + TypeScript + Tailwind with SQLite (via Prisma or Drizzle) starting at Phase 1.

This is a direct conflict between the TRD and the build brief.

## Decision

Use **SQLite + Prisma from Phase 1**. TRD §4 (storage design) and §5 limitations 1–3 are superseded. TRD §2 and §3 (entity definitions) remain authoritative and are mapped 1:1 onto the Prisma schema.

## Rationale

- `window.storage` was a constraint of the claude.ai artifact runtime, not an architectural choice. It does not exist outside that environment, so it cannot be carried into a Vite app.
- TRD §9 already names Postgres/Supabase as the destination. Starting on a relational store removes the JSON-blob-to-relational migration entirely rather than deferring it.
- The `*Id` fields in TRD §3 already describe foreign keys. Modelling them as real relations now is a truer reading of the intent than encoding them in JSON arrays.

## Consequences

- Phase 9 becomes a connection-string change plus auth, not a rewrite. Swapping to Postgres/Supabase means changing `provider` and `DATABASE_URL` in `prisma/schema.prisma`.
- Prisma on SQLite does not support native enums. Enum-typed fields in TRD §2/§3 are stored as `String` and constrained by TypeScript union types in `src/types.ts`, shared by client and server. On Postgres these can become native enums without changing application code.
- No auth in this pass, per the brief and TRD Phase 9. Every table is structured so a `users` table and `createdById` / `assigneeId` foreign keys can be added additively — no restructuring of existing tables required.
- TRD §5 limitations 1, 2, and 4 (no auth, no audit trail, hardcoded divisions) still hold and remain deliberate.

## Divergences from TRD §2/§3, and why

| Change | Reason |
|---|---|
| `tag` added to `TeamMember`, `Product`, `RoadmapItem`, `Release` | TRD lists `tag` only on `Task` and `Contact`. The build brief specifies a division-coded ID tag on every record as the signature visual element. Read as additive, not conflicting. |
| `Task.assignee` is a `TeamMember` relation, not a free-text string | TRD writes `assignee` without a type. A relation makes the "filter Tasks by my own name" workflow (PRD §7) reliable, and pre-wires the Phase 9 permission model. Nullable, so unassigned tasks are still valid. |
| `Product` has no `division` field | Products are Gaphatch-only per the master plan module map. Division is implied, and their tags are always `GPH-*`. Not made configurable, per the internal-only decision. |
| `Release.date` and `RoadmapItem.createdAt` kept as specified | No change; noted only because `Release` has no `createdAt` in the TRD and that was left as-is rather than "corrected". |

## Tag format

`<DIVISION>-<TYPE><SEQ>` — e.g. `AGY-T003`, `GPH-C012`.

- Division codes: `TNX` (Tuenx), `AGY` (Agency), `GPH` (Gaphatch). `TNX` confirmed by the founder; the brief supplied `AGY` and `GPH`.
- Type letters: `T` task, `C` contact, `M` team member, `P` product, `R` roadmap item, `V` release.
- Sequence: zero-padded to 3 digits, counted **per division per type** — confirmed by the founder. `AGY-T001` and `GPH-T001` both exist and are distinct records.
- Allocation is server-side inside a transaction (see `server/tags.ts`), so concurrent creates cannot collide. This closes TRD §4's client-generated-ID risk ahead of schedule.
