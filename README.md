# Tuenx OS

Internal operations platform for Tuenx Technologies — one place to run the whole group.

**Tuenx Technologies** is the parent, holding, and management entity. It holds treasury and internal capital allocation, owns the shared/cross-division people, and owns the company-wide modules. Two divisions sit under it:

- **Agency** — service-based, client work (name still a placeholder)
- **Gaphatch** — product-based, builds SaaS tools; one product in active development

Internal-only. Not multi-tenant, not a product for other companies. See [`docs/tuenx-os-master-plan.md`](docs/tuenx-os-master-plan.md) §4.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Overview, Tasks, CRM, Team | ✅ Built |
| 2 | Gaphatch Products, per-product roadmap, releases | ✅ Built |
| 3 | Agency contracts, Projects, Invoicing | ⏸ Gated on founder review of 1–2 |
| 4–9 | Treasury, OKRs/Docs, People/Ops, Support/Metrics, KPIs, Auth | Planned |

**No authentication.** Deliberate, per PRD §5 and TRD §5 — accounts and role-based permissions arrive in Phase 9. The API binds to `127.0.0.1`; don't expose it.

## Running it

```bash
npm install && npm run db:migrate && npm run db:seed && npm run dev
```

Then open http://localhost:5173.

`npm run dev` starts two processes: Vite on 5173 and the API on 5174. Vite proxies `/api` to the API, so the client is single-origin.

### Other scripts

| Script | Does |
|---|---|
| `npm run build` | Typecheck and produce a production bundle |
| `npm run typecheck` | Types only |
| `npm run db:seed` | **Destructive.** Wipes and reinserts demo data |
| `npm run db:studio` | Prisma Studio, to inspect the database directly |
| `npm run db:reset` | Drop, re-migrate, re-seed |

## Shape of the code

```
docs/            The three planning docs + ADRs. Source of truth.
prisma/          Schema, migrations, demo seed
server/          Node API — one router per entity
  tags.ts        Division-coded ID allocation
  http.ts        Error handling and body validation
src/
  types.ts       Shared vocabulary — imported by client AND server
  lib/           API client, per-resource loader, router, division marks
  components/    Shared UI
  modules/       One file per module
```

`src/types.ts` is imported by both sides on purpose: statuses, stages, and division codes cannot drift between the client and the API.

## Record IDs

Every record carries a division-coded tag — `AGY-T003`, `GPH-C012`.

`<DIVISION>-<TYPE><SEQ>`, sequence zero-padded to three digits and counted **per division per type**, so `AGY-T001` and `GPH-T001` are different records.

| | |
|---|---|
| Divisions | `TNX` Tuenx · `AGY` Agency · `GPH` Gaphatch |
| Types | `T` task · `C` contact · `M` member · `P` product · `R` roadmap item · `V` release |

Allocation happens server-side inside a transaction ([`server/tags.ts`](server/tags.ts)), so two concurrent creates can never collide.

Tags are never reissued or renumbered. Moving a person from Agency to Gaphatch keeps their `AGY-M004` — the tag is identity, not a category label.

## Design system

Light, printed-instrument feel. One rule drives everything:

> **Division is typographic. Colour is status.**

Divisions are told apart by how their tag is *set* — Tuenx a filled block, Agency an outlined frame, Gaphatch a letter-spaced underscore — with matching fill / hatch / dot markers on cards and bars. Colour is then free to mean exactly one thing: `alert`, `ready`, `pending`. The interface stays readable in greyscale and to colour-blind readers.

Type is one superfamily in three roles: **Plex Sans Condensed** for headings and figures, **Plex Mono** for tags, labels, and all data, **Plex Sans** for body copy.

Every ink tone clears WCAG AA against paper (17:1 / 8.3:1 / 4.6:1) — the smallest text is 10px mono and it sits on the lightest tone.

Tokens live in [`src/index.css`](src/index.css); division marks in [`src/lib/divisions.ts`](src/lib/divisions.ts).

## Database

SQLite via Prisma for local dev. Nothing in the schema uses a SQLite-only feature.

Moving to Postgres/Supabase (TRD Phase 9) is:

1. `provider = "postgresql"` in `prisma/schema.prisma`
2. A new `DATABASE_URL`
3. `npm run db:migrate`

Enum-typed TRD fields are `String` columns, because Prisma has no native enum on SQLite. The allowed values are enforced by TypeScript unions in `src/types.ts` and validated at the API boundary. On Postgres they can become native enums without touching application code.

See [`docs/adr/0001-sqlite-from-phase-1.md`](docs/adr/0001-sqlite-from-phase-1.md) for why this is SQLite from Phase 1 rather than the artifact key-value store the TRD originally specified, and for every divergence from the TRD data model.

## Known gaps

Carried deliberately, not overlooked (TRD §5):

- No authentication or per-person accounts
- No audit trail — nothing records who changed what
- Last write wins; two people editing one record will clobber each other
- Divisions are hardcoded and not configurable

All four are Phase 9 work, except the last, which stays as-is by decision.
