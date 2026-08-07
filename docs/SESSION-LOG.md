# Session log — 2026-08-02 to 2026-08-03

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

Compliance was raised with the founder as a tag-letter decision — all 26 letters
are taken — and the question was **dismissed without a choice**, so it remains
open and blocking. See HANDOFF "Pick these up first" §3.
