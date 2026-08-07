# Tuenx OS — Master Plan

*Reference document. This captures every decision made while planning Tuenx OS, the internal operating system for Tuenx Technologies. Use this as the source of truth when the PRD or TRD need to be checked against what was actually agreed.*

## 1. Company structure

```
Tuenx Technologies — parent / holding / management entity
                     (treasury + internal capital allocation; no external portfolio, no LPs)
├── Agency   — service-based arm (name not yet finalized, referred to as "Agency")
└── Gaphatch — product-based arm, builds SaaS apps/tools, multi-product
```

> **Clarified 2026-08-02 by the founder.** Tuenx is the parent, holding, *and*
> management entity for the group — not a treasury function alone. Treasury and
> internal capital allocation are things Tuenx does, not the whole of what it
> is. The Tuenx layer also owns the shared/cross-division people and the
> company-wide modules (Overview, Tasks, CRM, Team, and later Docs, People/Ops,
> Contracts, KPIs). The scope decisions in §4 are unaffected: still
> internal-only, still no external LPs or portfolio.
>
> **Extended 2026-08-03 by the founder:** *"Tuenx handles all the legal,
> accounts, finance, compliance and all."* So the back office is Tuenx's
> entirely, not split per division — legal and contracts, accounts and finance,
> and compliance. Agency and Gaphatch run delivery and product; they do not
> keep their own books or their own contracts.
>
> This is already how the app is built — Treasury, Invoices, Docs, and the
> contracts repository are all Tuenx-owned, and every record carries the
> division it *relates to* rather than the division that files it. The one
> The one thing it added at the time was that compliance had no home. **Built
> 2026-08-03**: a register of obligations with an owner, a recurrence, and a
> next-due date, on the calendar alongside every other deadline.
>
> Payroll and tax filing stay out regardless (§4). Handling the finance
> function is not the same as becoming the filing software for it.

Team: 6–15 people. Mixed model — some people are dedicated to one division, others work across both. Every person is tagged with a division: `Tuenx` (shared/cross-division), `Agency`, or `Gaphatch`.

## 2. Complete module map

| Module | Owner | Status |
|---|---|---|
| Overview dashboard | Tuenx | ✅ Built (v1) |
| Task management | Tuenx (cross-division) | ✅ Built (v1) |
| CRM (generic) | Tuenx (cross-division) | ✅ Built (v1) |
| Team directory | Tuenx | ✅ Built (v1) |
| Products (planning/building/live) | Gaphatch | ✅ Built |
| Roadmap (per product) | Gaphatch | ✅ Built |
| Releases/changelog | Gaphatch | ✅ Built |
| CRM contract fields (type, value, dates) | Agency | ✅ Built |
| Projects (client + contract + tasks) | Agency | ✅ Built |
| Invoicing/billing status | Agency | ✅ Built |
| Fund/Treasury | Tuenx | ✅ Built |
| OKRs/Goals | Tuenx (scoped to division/product) | ✅ Built |
| Docs/Knowledge base | Tuenx (scoped to division) | ✅ Built |
| Hiring pipeline | Tuenx (People/HR) | ✅ Built |
| Onboarding/offboarding | Tuenx (People/HR) | ✅ Built 2026-08-03 — templates + runs, in People & Ops |
| Time-off tracking | Tuenx (People/HR) | ✅ Built |
| Vendor & subscription tracker | Tuenx (Ops) | ✅ Built |
| Marketing (campaigns/content calendar) | Tuenx, serves Agency + Gaphatch | ✅ Built |
| Support/helpdesk | Gaphatch | ✅ Built — bugs, issues, feature requests, with GitHub sync |
| Metrics (MRR, users, churn) | Gaphatch, per product | ✅ Built 2026-08-03 — snapshots, one per product per date |
| Customer base | Gaphatch, per product | ✅ Built 2026-08-03 — ticket reporters resolve to real subscribers |
| Contracts repository (company-wide) | Tuenx | ✅ Built |
| Company-wide KPI dashboard | Tuenx | ✅ Built 2026-08-03 — read-only rollup, health list, 12-month trend |
| Real backend (auth, permissions, audit log) | Tuenx | ✅ Built — auth, division-scoped roles, and a field-level audit log |
| Epics, sprints, subtasks, time, workload | Tuenx (cross-division) | ✅ Built — not in the original map |
| Messaging (channels + DMs) | Tuenx | ✅ Built — reversed into scope, §7 |
| Client portal | Agency | ✅ Built — reversed into scope, §7 |
| Calendar, Planner, Brainstorms, Links, Search | Tuenx | ✅ Built — not in the original map |
| Compliance register | Tuenx | ✅ Built 2026-08-03 — obligations, recurrence, next-due |

## 3. Build phases

1. **✅ Done** — Overview, generic Tasks, generic CRM, Team
2. **✅ Done** — Gaphatch Products + per-product roadmap + releases
3. **✅ Done** — Agency contract fields + Projects + Invoicing
4. **✅ Done** — Tuenx Fund/Treasury
5. **✅ Done** — OKRs/Goals + Docs/Knowledge base
6. **✅ Done** — People/HR + Vendor tracker + Marketing + Contracts repository + onboarding/offboarding checklists
7. **✅ Done** — Support/helpdesk (bugs, issues, feature requests, GitHub sync), plus the subscriber base and MRR/churn snapshots
8. **✅ Done** — company-wide KPI dashboard. No new records: a read-only aggregation across every module above
9. **✅ Done** — auth, sessions, division-scoped roles per PRD §5, and an audit log with field-level diffs

Built and never in this list: epics/sprints/subtasks/time, Calendar, Planner,
Brainstorms, cross-record Links, global Search, Messaging, the client portal.
The last two were reversals (§7); the rest were asked for as the build went.

**Deployed 2026-08-03** to `tuenx-os.vercel.app`, on Postgres — still waiting
on a `DATABASE_URL` before anything that touches data will work there.

**Every phase is now complete**, plus the compliance register and onboarding
checklists. Nothing named in this document, the PRD, the TRD, or the v2 scope
list is outstanding.

## 4. Explicit scope decisions

- **Internal only.** Tuenx OS is not being built as a product for other companies. Architecture stays hardcoded to Tuenx/Agency/Gaphatch rather than generic/multi-tenant.
- **Fund is internal-only.** No external LPs, no outside portfolio companies. It's treasury + capital allocation between Agency and Gaphatch.
- **Not building payroll or tax filing.** Regulated territory — integrate with a real provider (Gusto, Deel, etc.) later rather than build it natively.
- ~~**Not building a messaging/chat module.** Existing tools (Slack etc.) cover this.~~
  **Reversed 2026-08-02 by the founder.** Messaging is now in scope: channels
  and direct messages inside Tuenx OS. The original reasoning still stands on
  its own terms — Slack does cover chat — so this is a deliberate trade, not a
  correction. What Tuenx OS adds that Slack cannot is that a conversation can
  be attached to the record it is about: a thread on `AGY-I004` lives on the
  invoice. See §7.

## 5. Open items still to decide

- Agency's real name (currently a placeholder)
- Whether OKRs/Docs need any structure beyond what's in the TRD once actually in use
- ~~Exact trigger point for the Phase 9 backend migration~~ — **settled 2026-08-03.** The trigger turned out to be deployment, not team size: Vercel cannot hold a SQLite file, so Postgres arrived with the deploy
- Whether the client portal gets a password. Confirmed deliberate on 2026-08-03 and deployed open; revisit before real clients are given the link
- ~~**Compliance** — Tuenx owns it (§1) and nothing tracks it~~ — **built 2026-08-03.** Obligations with an owner, a recurrence, and a next-due date, projected onto the calendar

## 6. Status log

- **v1 shipped:** Overview, Tasks (kanban by status, filterable by division), CRM (pipeline by stage, filterable by division), Team roster. Built as a single-file React artifact using shared `window.storage` — anyone with the artifact link reads/writes the same data.
- **v2, 2026-08-02/03:** rebuilt on React + Vite + TypeScript + Express + Prisma. All nine phases complete, plus compliance and onboarding checklists. See `docs/HANDOFF.md` for live state and `docs/SESSION-LOG.md` for how it went.
- **Deployed 2026-08-03** to `tuenx-os.vercel.app` on Postgres, from `github.com/devcnisham/tuenx-os`. Live and awaiting a `DATABASE_URL`.

## 7. Scope reversals

Decisions recorded here changed after the plan was locked. Keeping both the
original and the reversal, rather than editing history, so the reasoning stays
auditable.

| Date | Decision | Was | Now | Why |
|---|---|---|---|---|
| 2026-08-02 | Messaging | Out of scope — Slack covers it | In scope — channels + DMs | Slack cannot attach a conversation to a record. A thread about `AGY-I004` belongs on the invoice, not in a channel where it is lost a week later. |
| 2026-08-02 | Phase 3 gate | Stop and review Phases 1–2 first | Lifted | Founder chose to keep building rather than review at the gate. |
| 2026-08-02 | Authentication | Phase 9, last | Built now — team sign-in with hashed passwords, sessions, roles | Team and client portals were asked for, and neither is possible without an auth boundary. |
| 2026-08-02 | Client-facing portal | Out of scope (PRD §4) | In scope — read-only, scoped to the client's own records | Founder asked for it. **The client portal has no password:** an email address is the entire credential. That is an authentication bypass by design and is safe only on localhost. |
| 2026-08-02 | Design system | Dark "ops console", slate + amber/orange/teal | Light, warm canvas with white cards; divisions keep amber/orange/teal | Founder rejected the dark system on sight, then rejected a typography-only division encoding, then asked for more depth and space. Current state is the third pass. |
| 2026-08-03 | Multi-tenancy | Permanent non-goal (§4, PRD §4) | Briefly reversed, then **reinstated within the hour** | Founder answered "both" when asked whether SaaS Management meant Gaphatch's own customers or tenants inside Tuenx OS, then followed with "update only for the internal". Read as: keep Tuenx OS single-tenant. Nothing was built against the reversal. **Phase 7 customer billing is unaffected** — Gaphatch's own paying customers were always in scope and proceed. |

**Still out of scope, unchanged:** payroll, tax filing, multi-tenancy, and
making the division model configurable.
