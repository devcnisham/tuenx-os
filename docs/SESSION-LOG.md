# Session log — 2026-08-02 to 2026-08-03

> **This file is history, not state.** Entries describe what was true when they
> were written. For what is true now, read `HANDOFF.md`.

What happened in the first build session, and why. Kept separate from
`HANDOFF.md`, which is the *current state*; this is the *history* behind it.

Useful mainly for understanding why something is the way it is before changing
it.

---

## How it started

The brief was: read the three planning docs, then re-implement Phase 1 on a
real stack (React + Vite + TS + Tailwind + SQLite), then Phase 2, then stop for
review before Phase 3.

**The docs were not in the repository.** The working directory held nothing but
a `.DS_Store`. Work stopped until the founder pasted them in — building the
locked module map, phase order, and data model from guesswork would have been
worthless.

Almost nothing after that followed the original plan. The founder kept adding
scope, and most of the session was built in response rather than to the
sequence in the master plan.

## Conflicts flagged and how they resolved

| Conflict | Resolution |
|---|---|
| TRD §1/§4 mandated `window.storage` through Phase 8; the brief said SQLite now | SQLite. `window.storage` was an artifact-runtime constraint, not an architecture decision, and TRD §9 already named Postgres as the destination. ADR-0001. |
| TRD gave `tag` only to Task and Contact; the brief wanted one on every record | Tagged everything. Read as additive rather than conflicting. |
| Brief said stop before Phase 3 for review | Founder lifted the gate and kept going. Master plan §7. |
| PRD §4 ruled out messaging | Founder reversed it. Justified by record-bound channels — the thing Slack cannot do. §7. |
| PRD §4 ruled out a client-facing portal | Founder reversed it. §7. |
| TRD put auth in Phase 9 | Pulled forward when portals were requested. §7. |

Two things were **refused rather than built**: payroll/tax filing and
multi-tenancy, both permanent non-goals in master plan §4 and never asked for.

## The design went through four passes

1. **Dark "ops console"** — slate/amber/orange/teal, per the brief's locked design section. Rejected on sight.
2. **Light "datasheet"** — typographic division encoding, colour reserved for status. The founder had explicitly chosen "typography, not colour" when asked, then reversed it on seeing it: *"there where yellow colors and other color in those i want that."*
3. **Colour restored** — amber/orange/teal back, with hatch and dot textures distinguishing divisions on bars. Textures rejected: *"remove that double line dotted and all keep the first one for all."*
4. **Rebuilt with depth** — after *"too plain, too cramped, doesn't feel like a real product."* 15px base type (up from 13px), white cards on a warm canvas, two-layer shadows, a hand-drawn 30-glyph icon set, motion. Then dark mode, then true black on request.

**Lesson for next time:** two full redesigns were thrown away before asking what
was actually wrong. Asking first — with concrete options — is what produced the
version that stuck.

## Mistakes worth knowing about

- **I corrupted the git repository.** While cleaning up a stale index I deleted a git object I had verified as unreachable; it was referenced. `git status` began failing. The working tree was intact, so I backed up the broken `.git`, reinitialised, and replayed the same commit sequence. History before that point is a reconstruction, not the original commits. Nothing was lost from the code.
- **The OKR seed block referenced product ids before products were created.** Caught by running the seed rather than assuming it worked. The seed is ordered — that constraint is now documented in three places.
- **scrypt silently lost its work factor.** `promisify(scrypt)` picks the 3-argument overload, which drops the options object. Typed the wrapper by hand. Separately, `maxmem` had to be raised — N=2¹⁵ needs ~33MB against node's 32MB default, and lowering N to fit would have weakened every password.
- **Global search shipped without indexing docs.** Caught by testing the search rather than the module. Same pass: contacts matched on `name` but not `company`, so searching a client's company name found nothing.
- **The search dropdown was clipped to the 224px nav rail**, truncating every title to "Owen…". Caught by looking at a screenshot.

## What was verified, not assumed

Every claim of "it works" in this session was backed by exercising the thing:

- **Auth boundary** — anonymous requests to `/tasks` and `/treasury` return 401; a signed-in *client* gets 403 from tasks, contacts, treasury, invoices, team, overview, messages, search, and docs. Re-verified after the login bypass was added.
- **No user enumeration** — wrong password and unknown user return the same message, and an unknown identifier still runs a scrypt comparison so the timing matches.
- **No hash leakage** — account responses stripped, checked by string-searching the JSON.
- **Client portal field selection** — no internal notes, no pipeline value or stage, no draft invoices.
- **Tag allocation** — per division per type, zero-padded, no collision under concurrent creates.
- **Calendar drag** — a task and a timed entry both moved days; the entry kept its time.
- **Links** — mirror duplicate returns 200 not a second row; self-link and unknown target both 400; a link made from a task is visible from the doc.
- **Treasury** — status bar and Overview agreed exactly, which is how a drift in the demo data got noticed rather than a calculation bug being blamed.

## Things the founder asked for that were not built

- **Real Google Workspace integration** (Meet/Docs/Chat). Needs a Google Cloud project, OAuth credentials, and consent scopes from the founder. The internal equivalents — calendar, docs, messaging, record links — were built instead, and the gap was stated rather than papered over.
- **Phase 6 UI, Phase 7 entirely, task-depth UI.** Endpoints exist for the first and third; see `HANDOFF.md`.

## Where the passwords came from

Seed accounts use `tuenx1234`. The founder's own account was set to
`nisham@tuenx.com` / `nisham` / `11223344` on request. Both are weak and fine
for a seeded local database — they are not how a real account should be created,
and the seed says so.

---

# Session two — 2026-08-03

Started as "read the docs and continue the work". Became fourteen requests
arriving faster than they could be finished, and ended with the app deployed.

## The founder's requests, in order

1. Continue from HANDOFF → Phase 6 UI
2. A 38-system "Business OS" list, as v2 scope
3. "fix all the errors and loading it should load and display fast"
4. Two workflow diagrams — delivery pipeline, sales pipeline, team structure, templates
5. "i want also to see the team and client portal give the link"
6. "now lets bypass all the logins"
7. A Google-Calendar-style calendar
8. "update only for the internal"
9. Subdomains on tuenx.com
10. "ci and cd for the projects prducts"
11. "tuenx handels all the legal accounts finance compliance and all"
12. Links, features, issues and bugs on product cards; pull them from the repo
13. Push to GitHub, fix every page, make cards clickable
14. Deploy to Vercel

## The slowness was not the app

The loudest complaint — every page taking ten to twenty seconds — turned out to
have nothing to do with the code. A second `npm run dev` had left Vite bound to
`[::1]:5174`, the API's port on the other address family. macOS resolves
`localhost` to `::1` first, so `/api` requests reached Vite, which proxied them
to `localhost:5174` — itself. The loop resolved eventually rather than failing,
so it presented as "slow app" rather than "two dev servers".

Measured before and after: 13–21s → 1–23ms. `strictPort` now makes the second
stack fail loudly instead.

**Lesson:** the reported symptom named the wrong subsystem. `/api/health`
taking 13 seconds — an endpoint that touches nothing — was the tell, and
checking it first would have saved twenty minutes of reading module code.

## Conflicts flagged rather than silently resolved

| Conflict | Resolution |
|---|---|
| 38-system list vs master plan §4 non-goals | Three flagged as conflicts (payroll, tax, multi-tenancy) and not built. Mapped the rest in `tuenx-os-v2-scope.md` |
| "SaaS Management" — Gaphatch's customers, or tenants in Tuenx OS? | Asked. Answered "both", so multi-tenancy was reversed into scope — then "update only for the internal" arrived and it was reversed back out within the hour. Both recorded in §7; nothing was built against either |
| Delivery diagram vs `Project.status` | Diagram won. `active` had been doing the work of four stages. ADR-0002 |
| Client portal password before a public deploy | Asked. Founder chose to deploy it open. Recorded, deployed |

## Four deploys to get one working

Vercel needed three separate fixes, each found by deploying and reading the
logs rather than by guessing:

1. **TS5097 on every `.ts` import.** Vercel type-checks the function against
   the nearest tsconfig; the repo root is a solution file with only references,
   so it fell back to defaults. Added `api/tsconfig.json`.
2. **`ERR_MODULE_NOT_FOUND: /var/task/server/index.ts`.** The entry was
   compiled to `.js`, the import specifier was not rewritten.
3. **Same error without the extension.** The real cause: Vercel compiles the
   entry file and *nothing behind it*, so no `server/*.js` ever existed.
   Dropping extensions had only changed the error message. Fixed by bundling
   the whole server with esbuild.

**Lesson:** step 2's fix looked correct and was not. The error changing shape
was mistaken for progress; the second identical failure is what forced the
right diagnosis.

## Mistakes worth knowing about

- **Two records moved one stage on their own**, once on the hiring board and
  once on projects. Reads were proven not to mutate — a read-only pass over
  every endpoint left the data unchanged — and the data was correct after
  reseeding. Most likely a stray click of mine during browser verification. It
  was reported rather than quietly reseeded away, and it has not recurred.
- **A JSX className was truncated by a careless scripted edit**, twice, leaving
  an unterminated string. Caught by typecheck immediately, but a slower way to
  make a small change than opening the file.
- **The seed's delete list was missed** when Phase 6 tables were added. It
  matters more than it looks: the seed clears `TagCounter`, so leftover rows
  would collide with reallocated tags on the next run.

## What was verified rather than assumed

- Every endpoint, on SQLite and again on Postgres — 21 of them, all 200
- Tag allocation under concurrency, on Postgres: three simultaneous creates,
  three distinct tags
- The auth boundary at every step: anonymous 401, client-session 403 on
  candidates, vendors, contracts, tickets — and again against the deployment
- GitHub sync against real repositories: 147 issues in, re-sync created 0 and
  updated 147, hand-written tickets untouched
- SSRF refusal on the sync: `http://127.0.0.1:5174/...` and a non-GitHub host
  both rejected
- Card clicks on all six boards, by driving the browser rather than reasoning
  about the JSX

---

# Session 2 — 2026-08-03 (continued)

Short session. Picked up from a clean tree at 20 commits and closed out the one
phase that still had schema without code.

## What landed

**Phase 7 completes.** `MetricSnapshot` and `Customer` had migrations only, so
MRR, churn, and the subscriber base did not exist. Both now have routes
(`server/routes/customers.ts`, `server/routes/metrics.ts`), UI
(`src/modules/ProductMetrics.tsx`, mounted on the product page between Issues
and Releases), seed data, and a place in global search. Tag letters `U` and `Z`
were already reserved, so no decision was needed.

## Two judgment calls worth knowing about

**MRR is typed, never derived.** A `Customer` carries no price, so what a
subscriber pays is not knowable from this database. `/metrics/derive/:productId`
returns only the two figures the base can support — active users and churn —
and prints its own basis alongside them, because that churn is a share of all
non-trial subscribers *all-time*, not a period rate. A period rate needs a
subscription-history table that does not exist. Filling revenue in from a
guessed seat price would have been the easy version and a lie on a dashboard.

**Metrics are snapshots, not a live calculation.** A product's MRR on the 1st of
last month is a fact that should not change because someone churned today, and
comparing months is the entire point. One row per product per date, enforced by
the schema. A duplicate date is refused *by name* — "GPH-Z004 already covers
that date" — rather than as a bare unique-constraint violation, because the
useful thing to know is which row to go and edit.

**The seed now creates customers before tickets.** A reporter who turns out to
be a tracked subscriber resolves to the real record; anyone else keeps their
free-text line. That closes the "until customers exist, a ticket's reporter is
free text" note that had been sitting in HANDOFF.

## Verified rather than assumed

- List, create, patch, delete on both new resources, against the running API
- The negative cases: 401 anonymous, 400 on an unknown `productId`, 400 on an
  out-of-set subscription status, 400 on a duplicate snapshot date
- `/metrics/summary` deltas against the seeded series, and `/metrics/derive`
  against the seeded base — 3 active, 40% churned, matching the latest snapshot
- Global search finds a customer by name
- The product page in the browser: both sections render, ticket counts show
  (Ashfield 2, Lattice 1), and the snapshot form's derive panel populates

## One false alarm, recorded so it isn't re-investigated

The derive panel appeared to be missing from the snapshot form. It was not —
`label-mono` uppercases its heading and the check regex was case-sensitive. No
bug. Worth remembering when grepping rendered text in this codebase: the mono
labels are uppercased by CSS, not in the source.

## Left deliberately undone

Phase 8 and Phase 9 were not started. Each is a several-hour chunk and the
session preferred to land Phase 7 verified over leaving two things half-built.
*(Both shipped later the same day — see the entries below. This log is history;
`HANDOFF.md` is the current state.)*

Compliance was raised with the founder as a tag-letter decision — all 26 letters
are taken — and the question was **dismissed without a choice**, so it remains
open and blocking. See HANDOFF "Pick these up first" §3.

## Phase 8 — the KPI dashboard

Built the same session, straight after Phase 7. TRD §3 Phase 8 asks for "no new
storage, computed views pulling from every module, read-only" — so no table, no
migration, and no tag letter, which is what made it the cheapest phase left.

**Kept distinct from Overview on purpose.** Overview answers "how do the three
divisions compare right now". KPIs answers "how is the company doing, and what
needs attention". Building a second division ledger would have been the easy
version and would have made both pages worth skipping.

**The health list only speaks when it has something to say.** Nine passing
checks rendered as green ticks is a board people stop reading, so "all clear" is
one line and each real warning names the records behind it by tag. Covers
overdue invoices, missed task dates, unresolved high-priority bugs, key results
off track or at risk, held projects, contracts inside 60 days, rising churn,
unassigned work, and stale docs.

**Two refusals worth keeping:**

- Allocations stay out of cash, burn, and net-by-division, matching
  `treasury.ts` so the two can never disagree. A negative net on a product arm
  is that arm being funded — the footnote says so rather than colouring it red
  and implying a problem.
- Income and spend share one scale on the trend chart. Separate scales would
  make a thin month of income look like a fat one, which is the most common way
  a chart of this shape lies.

**One defect found by looking rather than reasoning.** The chart first rendered
completely empty: `h-full` inside an auto-height flex column resolves to zero,
so every percentage bar height collapsed. The legend totals were correct the
whole time, which is exactly why reading the code would not have caught it.

Also worth knowing: **a new export in `router.ts` cannot fast-refresh.** The
route rendered Overview under a `#/kpi` hash until a full reload. Not a bug —
but it looks exactly like one, and cost a few minutes here.

## Phase 9 — role scoping and the audit trail

The last two gaps in the original plan, built the same session.

**Both went in as middleware below `requireTeam`, not as calls inside routers.**
26 routers is 26 chances to forget, and the point of a security boundary being a
*position* is that a router added next month cannot opt out of something it
never opted into. Scope runs first, so a refused write is never recorded as one
that happened.

**Scoping fails closed.** `server/scope.ts` holds a policy table mapping each
resource to how its division is resolved — own column, Gaphatch by construction,
or inherited via contact or objective. A resource missing from that table is
denied to anyone but an admin. An omission therefore surfaces as a visible 403
rather than as a silent hole, which is the failure mode worth having.

Shared surfaces — messages, links, calendar, planner, your own logged hours —
are explicitly open. Scoping those by division would stop a Gaphatch engineer
replying in an Agency channel, which is the opposite of what a cross-division
company needs.

**The audit log has no division tag, deliberately.** Every other record carries
one because people cite it by name; nobody says "go and look at TNX-?012". An
audit row is evidence, not a record — which also sidesteps the exhausted
tag-letter alphabet entirely. Actor name and role are denormalised for a
related reason: "account 7f3a deleted the Halcyon contract" is worthless once
7f3a is gone, and deleting the account is exactly what someone covering their
tracks would do.

**The diff bug worth remembering.** First version diffed the union of the
database row and the API response. The response carries joined relations and
computed extras, so every single update claimed that `subtasks`, `counts`,
`assignee`, and `loggedHours` had changed. Caught by reading the output, not the
code. The fix is to iterate the *before* row's keys only — those are the real
columns. A log that reports changes nobody made is worse than no log, because
people believe it.

Also fixed on the way through: `prisma/migrations/migration_lock.toml` was
missing, so `prisma migrate diff` refused to run at all ("could not determine
the connector"). Creating it with `provider = "postgresql"` was the whole fix,
and a shadow database is needed for the diff — `createdb tuenx_os_shadow`.

**Verified, not assumed:** 13 scoping cases against the running API, all
passing — lead writes in-division and 403s out of it, member writes own records
and 403s on others and on contacts, admin unrestricted, reads open to everyone,
`/api/audit` 403s for both member and lead. Audit rows confirmed for
create/update/delete with a clean three-field diff, and for sign-in and
sign-in-failed.

**Left open for the founder:** whether a lead and a member should really be this
strict. PRD §5 was implemented literally, so a member cannot fix a typo on
someone else's task. That may be wrong for a 9-person team — worth a week of use
before deciding.

## Compliance — the fourth thing Tuenx handles

Built immediately after Phase 9, which is what unblocked it: the tag-letter
question had to be settled first.

**The modelling decision that matters: an obligation is not a task.** A task is
done once and closed. A VAT return is due again the moment you file it. So
"mark done" advances `nextDueDate` rather than setting a status, and the
register never empties.

**And it rolls forward from the due date, not from today.** A return filed
three days late is still due on the same day next quarter. Advancing from the
completion date would let every deadline drift a little further each cycle
until it quietly detached from the statutory one — a bug that would take a year
to become visible and would then be a fine. The confirm dialog names the date
it is rolling from, so nobody has to infer it.

A `once` obligation retires instead of rolling, and a second completion is
refused with a 400 rather than silently doing nothing.

**First two-letter tag code.** `CO`, giving `TNX-CO001`. Worth recording how
cheap it was: `allocateTag` works on a `(division, type)` pair and never cared
how long `type` is, and `divisionFromTag` reads the first three characters,
which is the division prefix either way. The entire change was one `TAG_TYPE`
entry. The alphabet exhaustion had been carried as a blocker in HANDOFF for
several sessions and turned out to cost nothing to resolve — worth remembering
before treating a documented blocker as expensive.

**Wired into what already existed rather than standing alone:** calendar
projection (read-only, never a second copy of the date), KPI health as its own
alert line, global search, and links. The unowned-obligation warning is
deliberate — the most common way a filing is missed is that everyone assumed
somebody else had it, so the seed ships one unowned item to make the warning
real on a fresh database.

**Verified:** quarterly roll-forward lands on the exact expected date; a
one-off retires and refuses a second completion; scoping holds (403 for an
out-of-division lead and for a non-owning member, 200 admin, 401 anonymous);
both enum validators reject; calendar returns 6 events in-window; KPI returns
both health rows; search finds it by title.

## Onboarding checklists — the last named gap

Built last, and the last thing named anywhere in the planning docs.

**Two models, not one.** A template is a reusable definition and is never
ticked; a run is one person going through it and is the only thing with state.
The important part is that a run **copies** its steps at creation. A template
edited next year must not silently rewrite what someone was asked to do last
year — the run is the record of what actually happened, which is the entire
reason to keep one. Verified by rewriting a template down to a single step and
confirming the in-progress run still held its eleven items.

**Day offsets are relative and usually negative.** Contract signed, right to
work checked, laptop ordered, accounts created — most of onboarding happens
before day one. The seeded engineer template runs from −10 to +60. A checklist
that starts on the start date has already failed, and modelling the offset
rather than an absolute date is what makes the template reusable at all.

**Completion is derived, never set by the client.** `completedAt` is
recomputed from the items inside the same transaction on every change, and
un-ticking a step reopens the run. A run that stays "complete" after someone
reopens a line is lying; letting the client set the flag directly is how one
ends up marked done with three things outstanding.

**Lines are untagged, deliberately** — the second time this decision has come
up, after the audit log. The test is whether anyone would ever cite the thing
by name. Nobody says "TNX-??014 is blocked", they say "Rafa's onboarding". The
run gets `OB`, the template gets `CT`, and the lines get nothing.

`personName` is denormalised on the run so an offboarding run outlives the
member row — deleting the member is often the last step on the list. Same
reasoning as `actorName` on the audit entry.

**Verified:** negative offsets land on the right dates, ticking the last item
completes the run and un-ticking reopens it, steps can be added mid-run, a
template rewrite leaves runs alone, 403 for an out-of-division lead, 200 for a
member ticking an item (items are deliberately open — onboarding steps are
usually done by IT or finance for someone in another division), both validators
reject, 401 anonymous, 7 calendar events, search finds the run.

## CD status mirroring — and the CI failure it found

The last item on the HANDOFF smaller list. `repoUrl` already existed and the
issue sync had set the pattern, so most of the work was deciding what *not* to
do.

**Cached, not live.** Unauthenticated GitHub allows 60 requests an hour.
Fetching on page load would break the page for everyone the moment two people
opened a product at once, so runs are stored and refreshed by a deliberate
Sync, and the panel states how stale it is. A CI panel quietly showing
yesterday's green tick is worse than showing nothing.

**No re-run button.** This app cannot re-run a workflow, and a button that
half-triggers a deploy is worse than none. Read-only, one-directional, same as
the issue sync.

**Untagged** — third time this call has come up, after the audit log and
checklist lines. A build is mirrored external data; nobody cites one by a Tuenx
tag.

**`parseRepo` reused rather than reimplemented**, so the host restriction still
holds. Verified against a loopback URL, an unrelated host, and a
`github.com.evil.com` prefix attack — all refused. That function is the security
boundary of both GitHub features, and duplicating it would have meant two places
to get it wrong.

### The thing worth remembering

Pointing the mirror at the real repository showed **11 runs, every one red**.
CI had never passed in the repository's history — broken since the Postgres
swap on 2026-08-03, because `npx prisma validate` resolves `env()` in the
datasource block before it parses anything and so fails without `DATABASE_URL`,
despite never opening a connection. The fix is a placeholder URL on that step.

Five sessions had pushed to `main` without noticing, including four of mine.
Nothing in the local loop catches it: `typecheck` and `build` both pass locally,
and nobody had opened the Actions tab. The feature built to surface build status
surfaced it within a minute of being pointed at real data — which is the best
argument for it that could have been made.

**Check CI after pushing.** `gh run list --limit 1` is two seconds.
