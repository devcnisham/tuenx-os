# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

`docs/` holds the three planning documents. **They are the source of truth.** If a request conflicts with them, flag the conflict rather than silently picking a side.

- `docs/tuenx-os-master-plan.md` — structure, module map, build phase order, scope decisions. **§7 records every scope reversal** and why; check it before assuming a documented non-goal still holds.
- `docs/tuenx-os-prd.md` — goals, users, scope by phase, workflows.
- `docs/tuenx-os-trd.md` — data model per phase. §4 and §5 limitations 1–3 are superseded (see ADR-0001); §2 and §3 entity definitions are still authoritative.
- `docs/adr/` — decisions that diverge from the TRD, with reasoning.
- `docs/HANDOFF.md` — live session state: what is built, what is half-built, what is next.

## Commands

```bash
npm run dev          # Vite on 5173 + API on 5174, concurrently
npm run build        # typecheck (tsc -b) then bundle
npm run typecheck    # types only
npm run db:migrate   # create + apply a migration
npm run db:seed      # DESTRUCTIVE — wipes and reseeds demo data
npm run db:studio    # inspect the database
npm run db:reset     # drop, re-migrate, re-seed
```

There is no test suite. Verification is done by running the app and exercising the API — see "Verifying work" below.

## Architecture

Two processes. Vite serves the client on 5173 and proxies `/api` to a Node/Express API on 5174, so the client is single-origin and no CORS handling has to be carried into Phase 9.

```
docs/         planning docs + ADRs + HANDOFF.md
prisma/       schema, migrations, destructive demo seed
server/       Express API, one router per entity
  tags.ts     division-coded ID allocation (transactional)
  http.ts     error handling + hand-rolled body validation
src/
  types.ts    shared vocabulary — imported by BOTH client and server
  lib/        api client, per-resource loader, router, division marks, layout prefs
  components/ shared UI + components/shell/ for the four-panel chrome
  modules/    one file per module
```

**`src/types.ts` is imported by the server as well as the client.** That is deliberate: statuses, stages, division codes, and tag letters cannot drift between the two. Add new enum-ish values there, never inline in a route.

### Record tags

Every record carries a division-coded tag: `AGY-T003`, `GPH-C012`. Format is `<DIVISION>-<TYPE><SEQ>`, zero-padded to three digits, counted **per division per type** — `AGY-T001` and `GPH-T001` are different records.

Allocation happens server-side inside a transaction (`server/tags.ts`). Never generate a tag client-side. Tags are never reissued or renumbered: moving a person from Agency to Gaphatch keeps their `AGY-M004`, because the tag is identity, not a category label.

Type letters live in `TAG_TYPE` in `src/types.ts`. Several are non-obvious because the intuitive letter was taken — `J` project (P is product), `Z` metric (M is member, E is calendar entry), `X` channel, `Y` epic, `W` sprint. Adding a record type means picking a free letter and commenting why.

### Enums on SQLite

Prisma has no native enum on SQLite, so every TRD-enum field is a `String` column. The allowed values are TypeScript unions in `src/types.ts`, validated at the API boundary via the `oneOf` helper in `server/http.ts`. On Postgres these can become native enums without touching application code.

### Adding a module

The established shape, worth following so modules stay consistent:

1. Model in `prisma/schema.prisma` + `npm run db:migrate`
2. Tag letter and status unions in `src/types.ts`, plus the wire interface
3. Router in `server/routes/`, mounted in `server/index.ts`
4. Module in `src/modules/`, wired into `src/lib/router.ts`, the `NAV` array in `src/App.tsx`, and `MODULE_TITLE` in `src/components/shell/TopBar.tsx`
5. Seed data in `prisma/seed.ts` — the seed is ordered, so a block referencing another entity must come after it
6. If the record should be findable, add it to `server/routes/search.ts`

### Cross-cutting pieces

- **`server/routes/links.ts`** — polymorphic links between any two records. Adding a linkable type is one entry in its `RESOLVERS` table. The database cannot enforce a polymorphic target, so the API validates both ends on write and reads drop anything since deleted.
- **`server/routes/calendar.ts`** — projects deadlines out of tasks/projects/invoices/releases/contracts, read-only, plus user-created entries. Never store a duplicate date; derive it.
- **`server/routes/search.ts`** — one lookup across every record type, matching title, tag, and (for client-owned records) the client name.
- **`useResource`** (`src/lib/useResource.ts`) — every module loads its own data with its own loading and error state, per TRD §6. One module failing must not blank the others.

### Design system

Tokens in `src/index.css`, division marks in `src/lib/divisions.ts`.

- Warm canvas, white cards lifted by two-layer shadows. Depth from elevation, not hairlines.
- **Division is colour: Tuenx amber, Agency orange, Gaphatch teal** — flat fills, no textures. Tag chips additionally carry a typographic treatment so they survive greyscale.
- **Status colour is red and green only.** Amber belongs to Tuenx; a "pending" state uses ink, never amber.
- Type is one superfamily in three roles: Plex Sans Condensed (headings, figures), Plex Mono (tags, labels, data), Plex Sans (body).
- Every ink tone clears WCAG AA on both canvas and surface. The smallest text is 11px mono on the lightest tone — check contrast before darkening backgrounds or lightening text.

## Constraints that are decisions, not oversights

- **No authentication.** PRD §5, TRD §5. Phase 9 work. The API binds to `127.0.0.1`. Where identity is needed (message author, time entry) it is *picked*, and the UI says so rather than implying an identity the system does not have.
- **No audit trail, last-write-wins.** Also Phase 9.
- **Divisions are hardcoded**, no multi-tenancy. Master plan §4 — permanent, not deferred.
- **Not payroll, not tax filing.** Master plan §4 — permanent.
- Messaging *was* a non-goal and is now in scope; see master plan §7.

## Verifying work

There are no tests, so claims have to be backed by something. Before saying a thing works:

- Run `npm run typecheck` and `npm run build`.
- Exercise the API directly and read the actual response — including the failure cases the route is supposed to reject.
- For anything visible, open it in the browser preview and look at it.

Report what actually happened. If something is backend-only, say so rather than implying a working feature.

## Commits

Small, reviewable chunks per module — never one large commit. The commit body should explain *why* a non-obvious choice was made, not restate the diff.

Commit messages containing backticks or double quotes must be passed via `git commit -F <file>`; inline `-m` will break on them.

## Keeping docs current

`docs/HANDOFF.md` is the handoff for the next session. Update it when a module is finished, a decision is reversed, or something is left half-built. `docs/tuenx-os-master-plan.md` §7 gets a row whenever a locked decision changes.
