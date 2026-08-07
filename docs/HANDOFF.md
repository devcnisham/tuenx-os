# Tuenx OS — session handoff

**Start here.** Live state of the build, so a new session can pick up without
re-reading the repository. Update it when a module is finished, a decision is
reversed, or something is left half-built.

**Last updated:** 2026-08-03 · every named module built · CI green · working tree clean

| | |
|---|---|
| Repo | [github.com/devcnisham/tuenx-os](https://github.com/devcnisham/tuenx-os) — **public** |
| Deployed | [tuenx-os.vercel.app](https://tuenx-os.vercel.app) — live, **no database yet** |
| Database | Postgres. SQLite was swapped out for the deploy — ADR-0001 |

---

## Start the app

```bash
createdb tuenx_os          # Postgres now, not SQLite — see ADR-0001
npm install && npx prisma migrate deploy && npm run db:seed && npm run dev
```

http://localhost:5173. Verified working from this state on 2026-08-03 — **5
migrations** applied (the Postgres baseline plus four since; the SQLite ones are
archived in `docs/migrations-sqlite-archive/`), and the seed produces:

> 9 team members, 19 tasks (14 roots + 5 subtasks), 9 contacts, 3 products,
> 9 docs, 10 plan items, 6 ideas, 7 calendar entries, 11 messages, 6 accounts,
> 6 candidates, 7 vendors, 6 contracts, 3 epics, 3 sprints, 6 time entries,
> 6 issues, 7 customers, 4 metric snapshots, 12 compliance obligations,
> 2 checklist runs.

If those numbers do not match after a seed, something is wrong — the seed is
deterministic apart from dates, which are relative to today.

**Run one dev stack, not two.** Vite now fails on a taken 5173 rather than
walking to the next port — it used to land on 5174, bind `::1` while the API
held `127.0.0.1`, and proxy `/api` to itself. That loop made every request take
10–20 seconds and read as "the app is slow".

`prisma migrate dev` **will not run under Claude Code** — it is interactive and
Prisma refuses. Generate SQL with `prisma migrate diff --from-migrations
prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`, save it
as a migration folder by hand, and apply with `npm run db:deploy`. That is how
the Postgres baseline and every migration since was made.

Two things that are not obvious and both cost time here:

- `prisma/migrations/migration_lock.toml` must exist, or `migrate diff` refuses
  with "could not determine the connector".
- `--from-migrations` needs a shadow database: `createdb tuenx_os_shadow` once,
  then pass `--shadow-database-url postgresql://$USER@localhost:5432/tuenx_os_shadow`.

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
| **Login bypass is ON locally, OFF in production** | `POST /api/auth/dev-session` mints a session with no credentials, for **every** route rather than just two. Guarded by `AUTH_BYPASS` **and** a loopback check, so it cannot be reached from another machine. **While on, anyone who reaches the server is an admin.** The deployment sets `AUTH_BYPASS=false`; verified returning 400 there. |
| **Client portal has no password** | An email address is the entire credential. Anyone who knows a client's address can read that client's invoices and contract value. Deliberate, per the founder. Closing it is one column on `ClientAccount` and one comparison in `auth.ts`. |
| **Session cookie needs `COOKIE_SECURE=true`** | `Secure` is now added whenever `COOKIE_SECURE=true` or `NODE_ENV=production`. It cannot be unconditional — on `http://localhost` a Secure cookie is never set at all. |

The client boundary holds even with the bypass on — a client session entered via
`#/client` still gets 403 from every internal route. Verified locally and again
against the deployment, where an anonymous `/api/tasks` returns 401.

**The repo is public and `prisma/seed.ts` contains `11223344`.** If that string
is a real password anywhere, change it there — deleting the line will not
remove it from git history.

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
| Products | ✅ | ✅ | Roadmap, releases, live/repo links, issues queue, GitHub issue + build sync |
| Customers | ✅ | ✅ | Per product. Reporters on tickets resolve to a real subscriber |
| Metrics | ✅ | ✅ | MRR/actives/churn snapshots, one per product per date |
| KPIs | ✅ | ✅ | Phase 8. Read-only rollup, health list, 12-month trend |
| Docs | ✅ | ✅ | Body-searchable, staleness flag at 3 months |
| OKRs | ✅ | ✅ | Progress derived from key results |
| Calendar | ✅ | ✅ | Time grid + mini-month, drag to reschedule, meeting planner |
| Planner | ✅ | ✅ | Quarter columns, load bar from rough sizes |
| Brainstorms | ✅ | ✅ | Ideas promote into plan items |
| People & Ops | ✅ | ✅ | Phase 6 — hiring, **onboarding**, time off, vendors, marketing, contracts, in six tabs |
| Messages | ✅ | ✅ | Channels + DMs; record-bound channels are the point |
| Sign-in | ✅ | ✅ | scrypt, server-side sessions. **Currently bypassed** |
| Role scoping | ✅ | — | Phase 9. Middleware below requireTeam; fails closed |
| Audit log | ✅ | ✅ | Phase 9. Admin-only, read-only, field-level diffs |
| Compliance | ✅ | ✅ | Obligations register. Recurrence rolls forward, not closed |
| Onboarding | ✅ | ✅ | Templates + runs, a tab in People & Ops. Runs copy their steps |
| Builds (CD) | ✅ | ✅ | GitHub Actions mirrored per product. Cached, one-directional |
| Client portal | ✅ | ✅ | Read-only, scoped. **No password by design** |
| Links | ✅ | ✅ | Any record to any other |
| Search | ✅ | ✅ | Global, `/` to focus |

---

## Pick these up first

Ordered by what unblocks the most. Item 1 needs the founder, not effort — do
not start it on a guess.

### 1. Give the deployment a database — needs the founder

`tuenx-os.vercel.app` is live and every route that touches data returns 500,
because `DATABASE_URL` is not set. One variable — Vercel Postgres, or a
Supabase project's **pooled** string (port 6543; the direct port runs out of
connections under serverless). Then redeploy, and `npm run create-admin` for
the first account. `docs/DEPLOYING.md` has the detail.

**A session cannot do this alone.** It needs the founder's Vercel or Supabase
account and a secret. Ask; do not attempt a workaround.

### 2. Smaller, all unblocked  ← pick from here

> **CI was red for the repository's entire history until 2026-08-03.** `npx
> prisma validate` resolves `env()` in the datasource before parsing, so it
> failed without `DATABASE_URL` even though it never connects. Fixed with a
> placeholder on that step. Worth knowing because nothing surfaced it for five
> sessions — the build-status mirror found it within a minute of pointing at
> the real repository, which is a fair argument for the feature.

**Nothing named in the master plan, the PRD, the TRD, or the v2 scope list is
outstanding.** Phases 1–9, compliance, and onboarding checklists are all built.
What is left is the list below, the deployment database above, and whatever the
founder asks for next.

- Grid/list layouts on modules other than Tasks and Docs (`useRecordLayout` + `LayoutSwitch` already exist — a per-module wiring job)
- Threads, reactions, and mentions in Messages
- Conversations bound to a CRM contact — `Channel.recordType`/`recordId` support it; nothing creates one yet
- Team workspaces (a per-team view aggregating that team's work)
- Product/project update trackers
- **Customers, checklist runs, and builds are not in `links.ts` `RESOLVERS`** — a per-type entry each, roughly ten lines. Metrics and audit rows deliberately stay out: a snapshot is a reading and an audit row is evidence, neither is a record anyone cross-references
- No test suite. Verification is by exercising the API and opening the app, which is honest but does not scale — if anything here grows, this is the gap that will hurt first

### 3. The v2 scope list

`docs/tuenx-os-v2-scope.md` maps the founder's 38-system Business OS list and
the workflow diagrams (2026-08-03) against what exists. §5 records what was
decided on the day; §6 holds what is still open. Payroll, tax filing, and
multi-tenancy remain out — multi-tenancy was reversed into scope and then
straight back out within the hour, both recorded in master plan §7.

---

## Decisions worth not relitigating

- **SQLite from Phase 1**, then **Postgres from 2026-08-03** — ADR-0001. The swap was `provider` plus a URL exactly as promised; no application code changed, because the TRD's enums were TypeScript unions rather than database enums.
- **Delivery and sales stages come from the founder's diagram** — ADR-0002. `on_hold` is a flag, not a stage: work stalls *from* a stage and returns to it.
- **Bugs, issues, and feature requests share one queue.** They compete for the same week of the same engineer.
- **The GitHub sync is one-directional.** GitHub owns what it knows; nothing is written back. A two-way sync that mishandles a conflict quietly reopens issues someone closed.
- **Allocations are excluded from treasury balance, burn, and runway.** Internal transfer inside one group; counting it double-counts. Shown per division instead.
- **Division is colour** — amber/orange/teal, flat fills, **no textures**. Status colour is red and green only; amber belongs to Tuenx. Arrived at over three passes: the founder rejected the original dark slate system, then rejected a typography-only encoding, then rejected hatch/dot textures.
- **Dark theme is true black**, surfaces a few points above. Requested explicitly.
- **Subtask nesting caps at one level.** A subtask of a subtask means the parent should have been an epic.
- **Calendar is deadlines, not appointments** for derived events; user-created entries carry times. Contract end dates are not draggable.
- **Messaging and the client portal were non-goals** and were reversed into scope — master plan §7.
- **Any write clears the whole API cache.** Enumerating what to drop is how a cache starts lying.
- **Not every record gets a tag.** Audit rows, checklist lines, and mirrored builds have none. The test is whether a person would ever cite the thing by name: nobody says "TNX-??014 is blocked", they say "Rafa's onboarding". Tag codes are scarce enough not to spend on things nobody quotes.
- **Mirrored GitHub data is cached, never fetched on page load.** 60 requests an hour unauthenticated does not survive a page that fetches on render. Sync is a deliberate act and the UI states how stale it is.
- **An obligation is not a task.** Marking a compliance item done advances its due date rather than closing it, and rolls forward from the *due date* rather than today — otherwise every deadline drifts a little further each cycle.
- **A checklist run copies its steps.** Editing a template must never change a run in progress; the run is the record of what was actually asked for.
- **Roles are enforced as middleware, and fail closed.** Scoping lives below `requireTeam` rather than in each router, so a new router cannot forget it.

---

## Open questions for the founder

- **Do `lead` and `member` now behave as you want?** Phase 9 implemented PRD §5 literally: a lead writes only inside their own division, a member writes only records assigned to them. That is stricter than a 9-person team may want in practice — a member cannot currently fix a typo on someone else's task. Worth a week of real use before deciding.
- ~~**CI/CD, half answered.**~~ **Fully answered 2026-08-03.** GitHub Actions runs typecheck, build, and `prisma validate` on every push; Vercel deploys from the same branch; and build status is now mirrored per product on the product page. Nothing outstanding here unless you want deploy status from Vercel too, which would need a Vercel token.
- Agency's real name is still a placeholder.
- Real Google Workspace integration (Meet/Docs/Chat) needs a Google Cloud project, OAuth credentials, and consent scopes. Nothing built toward it; internal equivalents exist instead.

---

## Conventions

Full detail in `CLAUDE.md`. The ones that catch people out:

1. **Route position is the security boundary.** Anything mounted below `app.use('/api', requireTeam)` in `server/index.ts` is default-deny.
2. **Tags are allocated server-side in a transaction.** Never client-side, never reissued. All 26 single letters are used, so **new record types get two-letter codes** — compliance was the first (`TNX-CO001`). The allocator does not care about length; only add the `TAG_TYPE` entry.
3. **`src/types.ts` is imported by the server too** — shared vocabulary goes there.
4. **The seed is ordered.** A block referencing another entity must come after it. This has bitten once already.
5. **Relative imports under `server/`, `api/`, `prisma/` carry no extension.** Vercel emits the specifier verbatim and Node cannot resolve `./db.ts` at runtime. Client imports keep theirs — Vite bundles them.
6. **A new router must be added to `SCOPE_POLICY` in `server/scope.ts`.** Anything missing from that table is denied to everyone but an admin — deliberately, so the omission shows up as a 403 rather than a hole. Writes below `requireTeam` are also audited automatically; neither is opt-in.
7. **Check CI after pushing.** `gh run list --limit 1`. It was red for the repository's entire history and nothing local caught it, because `typecheck` and `build` both pass on a machine that has a `.env`.
