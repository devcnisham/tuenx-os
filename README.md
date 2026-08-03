# Tuenx OS

Internal operations platform for Tuenx Technologies — one place to run the whole group.

**Tuenx Technologies** is the parent, holding, and management entity. It holds treasury and internal capital allocation, owns the shared/cross-division people, and owns the company-wide modules. Two divisions sit under it:

- **Agency** — service-based, client work (name still a placeholder)
- **Gaphatch** — product-based, builds SaaS tools; one product in active development

> **New session?** Read [`docs/HANDOFF.md`](docs/HANDOFF.md) first — it is the live state of the build. [`CLAUDE.md`](CLAUDE.md) covers conventions.

## Running it

```bash
npm install && npm run db:migrate && npm run db:seed && npm run dev
```

Then open http://localhost:5173.

`npm run dev` starts two processes: Vite on 5173 and the API on 5174. Vite proxies `/api` to the API, so the client is single-origin.

### Getting in

Login is **currently bypassed** while building — see [`docs/HANDOFF.md`](docs/HANDOFF.md).

| Route | Opens |
|---|---|
| `#/team` | Owner/admin dashboard, no credentials |
| `#/client` | Client portal, no credentials |
| anything else | Sign-in screen |

The real login still works: `nisham` / `11223344` (admin), or `sara` / `tuenx1234` (member). Client portal: `helen@northwind.co`, no password.

Turn the bypass off with `AUTH_BYPASS=false` in `.env`.

### Scripts

| Script | Does |
|---|---|
| `npm run build` | Typecheck and produce a production bundle |
| `npm run typecheck` | Types only |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:seed` | **Destructive.** Wipes and reinserts demo data |
| `npm run db:studio` | Prisma Studio, to inspect the database |
| `npm run db:reset` | Drop, re-migrate, re-seed — **will not run under Claude Code**, which blocks destructive Prisma migrations. Run it from a normal terminal. |

There is no test suite. Verification is done by running the app and exercising the API.

## Status

| Phase | Scope | API | UI |
|---|---|---|---|
| 1 | Overview, Tasks, CRM, Team | ✅ | ✅ |
| 2 | Products, roadmap, releases | ✅ | ✅ |
| 3 | Contract terms, Projects, Invoicing | ✅ | ✅ |
| 4 | Treasury | ✅ | ✅ |
| 5 | OKRs, Docs | ✅ | ✅ |
| 6 | Hiring, leave, vendors, campaigns, contracts | ✅ | ✗ |
| 7 | Tickets, metrics, customers | ✗ | ✗ |
| 8 | KPI dashboard | ✗ | ✗ |
| 9 | Auth, permissions, audit log | Partial | Partial |

Beyond the original phases: Calendar, Planner, Brainstorms, Messages, Users administration, cross-record links, global search, the client portal, and task depth (epics, sprints, subtasks, time — API only).

## Shape of the code

```
docs/            Planning docs, ADRs, HANDOFF.md. Source of truth.
prisma/          Schema, 10 migrations, demo seed
server/
  index.ts       Route mounting — the requireTeam line IS the security boundary
  auth.ts        scrypt hashing, sessions, the require* gates
  tags.ts        Division-coded ID allocation
  http.ts        Error handling and body validation
  routes/        22 routers
src/
  types.ts       Shared vocabulary — imported by client AND server
  lib/           API client, cache, per-resource loader, router, theme, layout
  components/    Shared UI; components/shell/ for the four-panel chrome
  modules/       One file per screen
```

`src/types.ts` is imported by both sides on purpose: statuses, stages, and division codes cannot drift.

## Record IDs

Every record carries a division-coded tag — `AGY-T003`, `GPH-C012`.

`<DIVISION>-<TYPE><SEQ>`, zero-padded to three digits, counted **per division per type**, so `AGY-T001` and `GPH-T001` are different records.

**Divisions:** `TNX` Tuenx · `AGY` Agency · `GPH` Gaphatch

**Types:**

| | | | |
|---|---|---|---|
| `T` task | `C` contact | `M` member | `P` product |
| `R` roadmap item | `V` release | `J` project | `I` invoice |
| `F` fund entry | `D` doc | `O` objective | `K` key result |
| `H` candidate (hire) | `L` leave | `N` vendor | `G` campaign |
| `A` contract (agreement) | `S` ticket (support) | `Z` metric | `U` customer |
| `B` idea (brainstorm) | `Q` plan item (quarter) | `E` calendar entry | `X` channel |
| `Y` epic | `W` sprint | | |

Several letters are non-obvious because the intuitive one was taken — `J` for project because `P` is the product, `Z` for metric because `M` is member and `E` is a calendar entry.

Allocation happens server-side inside a transaction ([`server/tags.ts`](server/tags.ts)), so concurrent creates cannot collide. Tags are never reissued or renumbered: moving someone from Agency to Gaphatch keeps their `AGY-M004` — the tag is identity, not a category label.

## Design system

Warm canvas with white cards lifted off it; depth from elevation rather than hairlines. Light, dark, or follow the OS — dark is true black with surfaces a few points above it.

- **Division is colour** — Tuenx amber, Agency orange, Gaphatch teal. Flat fills, no textures.
- **Status colour is red and green only.** Amber belongs to Tuenx, so a "pending" state uses ink.
- Type is one superfamily in three roles: Plex Sans Condensed (headings, figures), Plex Mono (tags, labels, data), Plex Sans (body).
- Every ink tone clears WCAG AA on both themes. The smallest text is 11px mono.

Tokens in [`src/index.css`](src/index.css); division marks in [`src/lib/divisions.ts`](src/lib/divisions.ts).

## Security posture

Read this before exposing anything beyond localhost.

| | |
|---|---|
| **Login bypass is ON** | `#/team` and `#/client` need no credentials. Guarded by `AUTH_BYPASS` **and** a loopback-only check, so it cannot be reached from another machine — but while it is on, anyone who reaches the server is an admin. |
| **Client portal has no password** | An email address is the entire credential. Anyone who knows a client's address can read that client's invoices and contract value. Deliberate, per the founder; safe on localhost only. |
| **Session cookie omits `Secure`** | It has to, on `http://localhost`. Must be added before serving over anything else. |
| **No audit trail** | Nothing records who changed what. Phase 9. |
| **Last write wins** | Two people editing one record will clobber each other. |

Passwords themselves are handled properly: scrypt at the OWASP work factor, constant-time comparison, and a password change or deactivation deletes that account's sessions.

## Database

SQLite via Prisma. Nothing in the schema uses a SQLite-only feature.

Moving to Postgres/Supabase (TRD Phase 9) is:

1. `provider = "postgresql"` in `prisma/schema.prisma`
2. A new `DATABASE_URL`
3. `npm run db:migrate`

Enum-typed TRD fields are `String` columns, because Prisma has no native enum on SQLite. Allowed values are TypeScript unions in `src/types.ts`, validated at the API boundary. On Postgres they can become native enums without touching application code.

See [`docs/adr/0001-sqlite-from-phase-1.md`](docs/adr/0001-sqlite-from-phase-1.md) for why this is SQLite from Phase 1, and every divergence from the TRD data model.

## Treasury accounting

**Allocations are excluded from balance, burn, and runway.**

An allocation is capital moved from the Tuenx level into a division — an internal transfer inside one group, so counting it would double-count. It is reported per division instead, because "where has capital been committed" is the question the parent entity actually asks. A division running a negative net while holding a large allocation is a funded product arm, not a problem.

Burn is averaged over a trailing 6 months, so a large founding expense does not drag the average forever. Runway is `null` when income covers spend, rather than reporting a misleading infinity.
