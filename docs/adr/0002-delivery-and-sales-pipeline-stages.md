# ADR-0002 — Pipeline stages come from the founder's workflow diagram

**Date:** 2026-08-03
**Status:** Accepted
**Supersedes:** the four project statuses chosen during the v2 build

## Context

`Project.status` was `planning | active | on_hold | delivered`. The TRD leaves
project status unspecified (§3 Phase 3 lists `status` with no values), so those
four were chosen during the build rather than specified.

On 2026-08-03 the founder supplied a diagram of how the Agency actually runs:

```
Lead/Discovery → Proposal & Contract → Kickoff & Requirements → Build (dev
sprints) → QA & Review → Delivery & Handoff → Support & Warranty (offer as
monthly retainer)
```

and a sales pipeline:

```
New Lead → Discovery Call → Proposal Sent → Contract Signed → Onboarding
```

Against the diagram, `active` was carrying four distinct stages — kickoff,
build, QA, and handoff. That is precisely the information a status field exists
to hold, so the field was answering "is it moving" when the team needed "where
has it got to".

## Decision

**Project stages become `kickoff | build | qa | handoff | support | closed`.**

The diagram's first two boxes are not project stages. Lead/Discovery and
Proposal & Contract happen before a project exists — they are CRM stages, and
they are where the sales pipeline below picks them up. A project starts at
kickoff.

`support` is the warranty period the diagram ends on, and the point at which
the retainer conversation happens. `closed` is after that; nothing in the
diagram names it, but work has to be able to finish.

**`on_hold` stops being a stage and becomes `Project.onHold`, a flag.**

Work stalls on client sign-off *from* a stage and comes back to that same
stage. As a status it destroyed the record of where the project stopped, and
forced a lie on the way back in — everything resumed as "active" regardless of
whether it had been in build or in QA.

**Contact stages become `lead | discovery | proposal | signed | onboarding |
active | closed | lost`.**

`discovery`, `signed`, and `onboarding` are the diagram's; the old four buried
them inside `lead` and `active`. `closed` and `lost` are not on the diagram and
are kept regardless — a pipeline with nowhere to put a deal that went away
either lies about its value or leaks records.

## Consequences

- One migration, `20260803060107_delivery_pipeline_stages`. Project rows map
  `planning→kickoff`, `active→build`, `delivered→closed`, and `on_hold→build`
  with `onHold = true`. The last is the only lossy one: the old schema never
  recorded which stage a held project had stopped in, so `build` is a guess and
  is stated as one here rather than presented as a migration.
- **No contact rows move.** The new stages are additive and every pre-existing
  `closed` contact was closed *won*, which is what `closed` still means.
- Both boards scroll sideways now. Six and eight columns do not fit at any
  width worth designing for, and squeezing them turns every card into a column
  of single words.
- `isProjectClosed` and `isContactOpen` are exported from `src/types.ts` rather
  than left as string comparisons scattered across the calendar, the portal,
  the right rail, and the overview rollup. Five call sites had to change for
  this ADR; the next rename should touch one.

## Alternatives considered

**Keep four stages and add a sub-status.** Two fields to keep in step, and the
board can only draw one of them. Rejected.

**Adopt the diagram literally, including Lead/Discovery as project stages.**
Would mean a project exists before there is a signed contract, which
contradicts what a project *is* here — it wraps a client, a contract, and
tasks. Those two boxes are the CRM's job, and the CRM now has them.
