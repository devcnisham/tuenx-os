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
