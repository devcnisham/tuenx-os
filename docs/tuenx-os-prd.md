# Tuenx OS — Product Requirements Document (PRD)

## 1. Summary

Tuenx OS is the internal operating system for Tuenx Technologies — a single place to run Tuenx (treasury), Agency (services), and Gaphatch (products), instead of tasks, clients, and money being tracked across scattered tools and spreadsheets.

## 2. Problem

- The founder needs one place to see the health of both divisions and the company overall, without opening several disconnected tools.
- A team of 6–15 people, some dedicated to one division and some working across both, needs shared visibility into tasks, clients, and products without each division inventing its own process.
- Gaphatch is a multi-product arm (one product building, more planned) — tracking needs to work per-product, not as one undifferentiated bucket.
- Agency runs client services with contracts and invoicing — generic task/CRM tools don't capture that shape of work.

## 3. Goals

- Single source of truth for tasks, CRM, team, and finances across Tuenx, Agency, and Gaphatch.
- Every record is tagged by division and rolls up into a company-wide view — division-aware, not siloed.
- Native support for Gaphatch's multi-product reality: each product tracked separately (roadmap, releases, metrics, customers).
- Native support for Agency's client-services workflow: contracts, projects, invoicing.
- A real-time "how is the company doing" view for leadership.

## 4. Non-goals

- **Not a generic product.** This stays Tuenx-internal; no multi-tenant support for other companies.
- **Not payroll or tax/compliance software.** Integrate with a real provider later; don't build regulated financial infrastructure from scratch.
- ~~**Not a messaging tool.** No chat/DM module — existing tools cover that.~~ **Reversed 2026-08-02** — messaging is in scope. See master plan §7. Channels and DMs, with conversations attachable to records.
- **Not (yet) a client-facing portal.** All views in this PRD are internal-only.

## 5. Users

| Role | Access |
|---|---|
| Founder / Admin | Full visibility and control across every division and module |
| Division lead | Full access within their division, read access to company-wide rollups |
| Team member | Scoped to what's assigned to them (their tasks, their deals, their projects) |

*(Note: today's build has no per-user login — anyone with the artifact link has full access. Role-based access becomes real in Phase 9, see TRD.)*

## 6. Scope by phase

### Phase 1 — Core shell (built)
- **Overview** — division summary cards, open task counts, active pipeline value, needs-attention list of high-priority open tasks
- **Tasks** — kanban by status (To do / In progress / Done), filterable by division, priority, assignee, due date
- **CRM** — pipeline by stage (Lead → Proposal → Active → Closed), filterable by division, deal value
- **Team** — roster with role and division tag

### Phase 2 — Gaphatch Products
- Each product tracked as its own entity with a status: planning → building → live
- Per-product roadmap (backlog → building → shipped)
- Per-product release log

### Phase 3 — Agency operations
- CRM contacts gain contract fields: type (retainer/project), value, start/end date
- Projects wrap a client + contract + tasks into one trackable unit
- Invoicing: draft → sent → paid → overdue status per invoice

### Phase 4 — Tuenx Fund/Treasury
- Income, expenses, and budget tracked at the Tuenx level
- Capital allocation visible per division
- Runway calculation

### Phase 5 — OKRs + Docs
- Objectives with key results, scoped to Tuenx, a division, or a specific Gaphatch product; tracked per quarter
- Docs/knowledge base for SOPs, playbooks, onboarding, and policies, tagged by division

### Phase 6 — People, ops, marketing
- Hiring pipeline (open roles → candidates → stage)
- Onboarding/offboarding checklists
- Time-off tracking
- Vendor & subscription tracker (what's paid for, renewal dates, owner)
- Marketing (campaigns/content calendar), shared across Agency and Gaphatch
- Company-wide contracts repository

### Phase 7 — Gaphatch customer-facing
- Support/helpdesk, activates once a product is live
- Metrics: MRR, active users, churn, per product
- Customer/subscriber base, per product

### Phase 8 — Reporting
- Company-wide KPI dashboard aggregating every module above

### Phase 9 — Access & security
- Individual logins per person
- Role-based permissions (Admin / Division lead / Member)
- Audit log of who changed what

## 7. Key workflows

- **Founder checks company health:** opens Overview → sees open tasks, pipeline value, and team size per division at a glance, without visiting each module.
- **Gaphatch team ships a feature:** creates a roadmap item under the relevant product, moves it through backlog → building → shipped, and logs it in the release notes.
- **Agency lands a new client:** adds a CRM contact at "Lead," moves it through Proposal → Active as the deal progresses, then spins up a Project once signed, with an invoice attached.
- **Anyone checks "what am I on the hook for":** filters Tasks by their own name and division.
- **Founder reviews spend:** opens Fund/Treasury, sees income/expense by division, checks runway.

## 8. Success metrics

- The founder can answer "how is the company doing" without opening more than one tool.
- Every task, deal, and dollar is tagged to the correct division — no untracked/orphaned records.
- No critical operational info lives only in someone's head, DMs, or a personal notes app.
- Team actually uses it daily rather than reverting to spreadsheets — the real test of whether the tool earned its place.

## 9. Risks & open questions

- **No auth today.** Acceptable at current team size (6–15, high trust), but a real gap — flagged explicitly, not accidentally ignored. Addressed in Phase 9.
- **OKRs and Docs are only as useful as the discipline to keep them updated.** Worth revisiting after a month of real use — if they go stale, reconsider scope.
- **Agency's name is still a placeholder.** Cosmetic now, but worth resolving before the tool is used daily.
