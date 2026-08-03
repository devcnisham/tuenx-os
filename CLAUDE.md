# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

`docs/` holds the planning documents. **They are the source of truth.** If a request conflicts with them, flag the conflict rather than silently picking a side.

- **`docs/HANDOFF.md`** — live state: what is built, what is half-built, what is next. Read this before anything else.
- `docs/tuenx-os-master-plan.md` — structure, module map, phase order, scope decisions. **§7 records every scope reversal** — check it before assuming a documented non-goal still holds. Several already have been reversed.
- `docs/tuenx-os-prd.md` — goals, users, scope by phase, workflows.
- `docs/tuenx-os-trd.md` — data model per phase. §4 and §5 limitations 1–3 are superseded (ADR-0001); §2/§3 entity definitions still authoritative.
- `docs/adr/` — decisions that diverge from the TRD, with reasoning.

## Commands

```bash
npm run dev          # Vite 5173 + API 5174, concurrently
npm run build        # typecheck (tsc -b) then bundle
npm run typecheck    # types only
npm run db:migrate   # create + apply a migration
npm run db:seed      # DESTRUCTIVE — wipes and reseeds demo data
npm run db:studio    # inspect the database
```

`npm run db:reset` **will not run under Claude Code** — Prisma blocks destructive migrations here. Tell the user to run it from a normal terminal.

No test suite. See "Verifying work" below.

## Architecture

Two processes. Vite serves the client on 5173 and proxies `/api` to a Node/Express API on 5174, so the client is single-origin.

```
docs/         planning docs, ADRs, HANDOFF.md
prisma/       schema, 10 migrations, destructive demo seed
server/
  index.ts    route mounting — the requireTeam line IS the security boundary
  auth.ts     scrypt, sessions, require* gates
  tags.ts     division-coded ID allocation (transactional)
  http.ts     error handling + hand-rolled body validation
  routes/     22 routers
src/
  types.ts    shared vocabulary — imported by BOTH client and server
  lib/        api client, cache, useResource, router, theme, layout, divisions
  components/ shared UI + components/shell/ for the four-panel chrome
  modules/    one file per screen
```

### The security boundary

`server/index.ts` mounts routes in a deliberate order:

```
/api/health, /api/auth   open
/api/portal              requireClient (its own gate)
app.use('/api', requireTeam)
…everything else         needs a signed-in team session
```

**Position is the boundary.** A router mounted below that line is default-deny; mounting one above it has to be a deliberate act. When adding a route, put it below unless there is a reason not to, and say why in the diff if not.

`requireAdmin` gates account management and `/api/people`.

### `src/types.ts` is shared

Imported by the server as well as the client, so statuses, stages, division codes, and tag letters cannot drift. Add shared vocabulary there — never inline a status string in a route.

### Record tags

Every record carries a division-coded tag: `AGY-T003`. `<DIVISION>-<TYPE><SEQ>`, zero-padded to three, counted **per division per type**.

Allocation is server-side inside a transaction (`server/tags.ts`). **Never generate a tag client-side.** Tags are never reissued or renumbered — a tag is identity, not a category label.

Type letters live in `TAG_TYPE` in `src/types.ts`. Twenty-six are taken. Several are counter-intuitive because the obvious letter was gone — `J` project (P is product), `Z` metric (M is member, E is calendar entry), `X` channel, `Y` epic, `W` sprint, `H` candidate, `A` contract, `B` idea, `Q` plan item. Adding a type means picking a free letter and commenting why.

### Enums on SQLite

Prisma has no native enum on SQLite, so every TRD-enum field is a `String` column. Allowed values are TypeScript unions in `src/types.ts`, validated at the API boundary via the `oneOf` helper in `server/http.ts`. On Postgres they become native enums with no application change.

### Caching

`api.get` caches in memory, stale-while-revalidate, and dedupes concurrent callers. **Any write clears the whole cache** — blunt on purpose, since creating a task changes the task list, overview totals, calendar, and every rollup. `useResource` defers its loading flag 120ms so cached responses never flash a skeleton.

### Adding a module

1. Model in `prisma/schema.prisma` + `npm run db:migrate`
2. Tag letter, status unions, and the wire interface in `src/types.ts`
3. Router in `server/routes/`, mounted **below** `requireTeam` in `server/index.ts`
4. Module in `src/modules/`, wired into `src/lib/router.ts`, the `NAV` array in `src/App.tsx`, and `MODULE_TITLE` in `src/components/shell/TopBar.tsx`
5. Seed data in `prisma/seed.ts` — **the seed is ordered**; a block referencing another entity must come after it
6. If the record should be findable, add it to `server/routes/search.ts`
7. If it should be linkable, add it to the `RESOLVERS` table in `server/routes/links.ts`

### Cross-cutting pieces

- **`links.ts`** — polymorphic links between any two records. The database cannot enforce a polymorphic target, so the API validates both ends on write and reads drop anything since deleted.
- **`calendar.ts`** — projects deadlines out of tasks/projects/invoices/releases/contracts, read-only, plus user-created entries. Never store a duplicate date; derive it.
- **`search.ts`** — one lookup across every record type.
- **`useResource`** — every module loads its own data with its own loading and error state, per TRD §6. One module failing must not blank the others.

### Design system

Tokens in `src/index.css`, division marks in `src/lib/divisions.ts`.

- Warm canvas, white cards, depth from elevation. Dark theme is **true black** with surfaces a few points above.
- **Division is colour** — Tuenx amber, Agency orange, Gaphatch teal. Flat fills, **no textures** (tried and rejected).
- **Status colour is red and green only.** Amber belongs to Tuenx; a "pending" state uses ink.
- One superfamily, three roles: Plex Sans Condensed (headings, figures), Plex Mono (tags, labels, data), Plex Sans (body).
- Check contrast before darkening backgrounds or lightening text — the smallest text is 11px mono on the lightest ink tone.

## Constraints that are decisions, not oversights

- **Login is currently bypassed** — `#/team` and `#/client` need no credentials. Guarded by `AUTH_BYPASS` and a loopback check. See `docs/HANDOFF.md`. Do not "fix" it without asking.
- **The client portal has no password** by the founder's explicit instruction. Flag it, don't silently harden it.
- **No audit trail, last-write-wins.** Phase 9.
- **Divisions are hardcoded**, no multi-tenancy. Master plan §4 — permanent.
- **Not payroll, not tax filing.** Master plan §4 — permanent.
- Messaging and the client portal *were* non-goals and are now in scope — master plan §7.

## Verifying work

No tests, so claims need backing. Before saying something works:

- `npm run typecheck` and `npm run build`.
- Exercise the API directly and read the response — **including the failure cases the route is supposed to reject**. For anything touching auth, verify the negative case: that the wrong viewer gets a 403.
- For anything visible, open it in the browser preview and look at it.

Report what actually happened. If something is backend-only, say so rather than implying a working feature.

## Commits

Small, reviewable chunks per module — never one large commit. The body should explain *why* a non-obvious choice was made, not restate the diff.

Commit messages containing backticks, double quotes, or `$` must be passed via `git commit -F <file>`; inline `-m` breaks on them.

## Keeping docs current

Update `docs/HANDOFF.md` when a module is finished, a decision is reversed, or something is left half-built. Add a row to master plan §7 whenever a locked decision changes.
