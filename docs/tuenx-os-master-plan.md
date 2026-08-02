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

Team: 6–15 people. Mixed model — some people are dedicated to one division, others work across both. Every person is tagged with a division: `Tuenx` (shared/cross-division), `Agency`, or `Gaphatch`.

## 2. Complete module map

| Module | Owner | Status |
|---|---|---|
| Overview dashboard | Tuenx | ✅ Built (v1) |
| Task management | Tuenx (cross-division) | ✅ Built (v1) |
| CRM (generic) | Tuenx (cross-division) | ✅ Built (v1) |
| Team directory | Tuenx | ✅ Built (v1) |
| Products (planning/building/live) | Gaphatch | Planned — Phase 2 |
| Roadmap (per product) | Gaphatch | Planned — Phase 2 |
| Releases/changelog | Gaphatch | Planned — Phase 2 |
| CRM contract fields (type, value, dates) | Agency | Planned — Phase 3 |
| Projects (client + contract + tasks) | Agency | Planned — Phase 3 |
| Invoicing/billing status | Agency | Planned — Phase 3 |
| Fund/Treasury | Tuenx | Planned — Phase 4 |
| OKRs/Goals | Tuenx (scoped to division/product) | Planned — Phase 5 |
| Docs/Knowledge base | Tuenx (scoped to division) | Planned — Phase 5 |
| Hiring pipeline | Tuenx (People/HR) | Planned — Phase 6 |
| Onboarding/offboarding | Tuenx (People/HR) | Planned — Phase 6 |
| Time-off tracking | Tuenx (People/HR) | Planned — Phase 6 |
| Vendor & subscription tracker | Tuenx (Ops) | Planned — Phase 6 |
| Marketing (campaigns/content calendar) | Tuenx, serves Agency + Gaphatch | Planned — Phase 6 |
| Support/helpdesk | Gaphatch | Planned — Phase 7 (once a product is live) |
| Metrics (MRR, users, churn) | Gaphatch, per product | Planned — Phase 7 |
| Customer base | Gaphatch, per product | Planned — Phase 7 |
| Contracts repository (company-wide) | Tuenx | Planned — Phase 6 |
| Company-wide KPI dashboard | Tuenx | Planned — Phase 8 |
| Real backend (auth, permissions, audit log) | Tuenx | Planned — Phase 9 |

## 3. Build phases

1. **✅ Done** — Overview, generic Tasks, generic CRM, Team (React artifact, shared storage)
2. Gaphatch Products + per-product roadmap + releases — *most time-sensitive, one product actively building*
3. Agency contract fields + Projects + Invoicing
4. Tuenx Fund/Treasury
5. OKRs/Goals + Docs/Knowledge base
6. People/HR + Vendor tracker + Marketing + Contracts repository
7. Gaphatch Support/helpdesk (activates once a product nears live)
8. Company-wide KPI dashboard
9. Real backend/auth — individual logins and permissions instead of one shared artifact link

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
- Exact trigger point for the Phase 9 backend migration (team size? relying on it daily? both?)

## 6. Status log

- **v1 shipped:** Overview, Tasks (kanban by status, filterable by division), CRM (pipeline by stage, filterable by division), Team roster. Built as a single-file React artifact using shared `window.storage` — anyone with the artifact link reads/writes the same data.

## 7. Scope reversals

Decisions recorded here changed after the plan was locked. Keeping both the
original and the reversal, rather than editing history, so the reasoning stays
auditable.

| Date | Decision | Was | Now | Why |
|---|---|---|---|---|
| 2026-08-02 | Messaging | Out of scope — Slack covers it | In scope — channels + DMs | Slack cannot attach a conversation to a record. A thread about `AGY-I004` belongs on the invoice, not in a channel where it is lost a week later. |
| 2026-08-02 | Phase 3 gate | Stop and review Phases 1–2 first | Lifted | Founder chose to keep building rather than review at the gate. |
| 2026-08-02 | Design system | Dark "ops console", slate + amber/orange/teal | Light, warm canvas with white cards; divisions keep amber/orange/teal | Founder rejected the dark system on sight, then rejected a typography-only division encoding, then asked for more depth and space. Current state is the third pass. |

**Still out of scope, unchanged:** payroll, tax filing, multi-tenancy, and
making the division model configurable.
