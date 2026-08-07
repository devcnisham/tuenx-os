# Tuenx OS — v2 scope map

**Status: partly built now.** Written as a proposal on 2026-08-03; the founder
answered the same day and several items shipped. §5 records what was decided,
§6 what is still open. Kept as written rather than rewritten, so the reasoning
behind each recommendation stays checkable against what was then built. It
maps the 38-system "Business OS" list (founder, 2026-08-03) and the workflow
diagrams sent with it against what Tuenx OS already is, so the next decision is
made against facts rather than a wish list.

Three of the 38 conflict with decisions recorded as permanent in master plan §4.
They are marked ⛔ and are **not** built pending an explicit reversal — that is
what §7 is for.

---

## 1. The short version

Of the 38 systems, roughly:

| | Count | Meaning |
|---|---|---|
| ✅ Built | 12 | Exists and is used |
| 🟡 Partial | 9 | Real, missing a named piece |
| ⬜ Planned | 6 | Already in the phase plan. **All six have since shipped** — see §6 |
| ⛔ Conflicts | 3 | Contradicts a locked non-goal |
| ➖ Not recommended | 8 | Better served by the tool that already does it |

**Nothing in the 38 changes the architecture.** Every one of them is a module in
the existing shell: a Prisma model, a router below `requireTeam`, a tag letter, a
screen. The build order is the only real question.

**The tag alphabet is the one hard constraint.** 26 letters, 26 taken. Any new
record type needs either a second-letter scheme (`AGY-TA001`) or a decision that
some types share. Worth resolving before, not during, the next module.

---

## 2. System-by-system

### Already built

| # | System | Where it lives now |
|---|---|---|
| 1 | Company Management | Overview, OKRs, Docs, Calendar, Planner. Decision logs = `docs/adr/` |
| 2 | CRM | CRM module — leads, companies, contacts, pipeline, contract terms |
| 3 | Project Management | Tasks + Projects. Epics, sprints, subtasks and time exist in the **API only** |
| 4 | Product Management | Products, roadmap, releases, Brainstorms (ideas) |
| 8 | Documentation | Docs, body-searchable, staleness flag |
| 11 | Client Management | CRM + Projects + Invoices + the client portal |
| 13 | Marketing | People & Ops → Marketing (campaigns) |
| 16 | Operations | People & Ops, Planner, Calendar |
| 17 | Asset Management | People & Ops → Vendors (subscriptions and licences) |
| 24 | Legal | People & Ops → Contracts repository |
| 25 | Procurement | Vendors covers the subscription half; no PO flow |
| 27 | Communication | Messages — channels, DMs, record-bound conversations |

### Partial — the named gap is the work

| # | System | Missing |
|---|---|---|
| 3 | Project Management | ~~Epics, sprints, subtasks, time and workload have endpoints and no screens~~ — **built 2026-08-03.** Gantt/timeline/dependencies still absent |
| 9 | HRMS | Employees ✅, recruitment ✅, leave ✅, onboarding/offboarding checklists ✅. Performance reviews and attendance absent. Payroll ⛔ |
| 10 | Finance | Income/expense/invoices/cash position ✅ via Treasury + Invoices. Budgets, P&L, banking absent. Tax ⛔ |
| 14 | Sales | Pipeline ✅. Forecasting, commission, quotes absent |
| 15 | Analytics & BI | Overview is a live dashboard and the company-wide KPI board ✅ shipped 2026-08-03. Ad-hoc querying and exports absent |
| 19 | Security | Auth ✅, division-scoped roles ✅, audit log ✅ — all of Phase 9 done 2026-08-03. Devices, backups, and monitoring are still IT's problem, not this app's |
| 18 | IT | User accounts and permissions ✅. Devices, backups, monitoring absent |
| 35 | Knowledge Management | Docs ✅. Templates and FAQs are content, not a module |
| 38 | Executive Dashboard | Overview, the KPI board, and per-product MRR/churn ✅ all shipped 2026-08-03 |

### Planned, in the phase order already

| # | System | Phase |
|---|---|---|
| 6 | Issue & Bug Tracking | ✅ **built 2026-08-03** — one queue per product, with GitHub sync |
| 12 | Customer Support | ✅ same queue. Metrics and the customer base are still schema-only |
| 15 | Analytics & BI | 8 |
| 19 | Security (audit log) | 9 |
| 32 | Innovation | Brainstorms exists; research/experiments/MVP tracking would extend it |
| 36 | Admin | Approvals and expenses fold into People & Ops |

### ⛔ Conflicts with a locked non-goal

| # | System | The conflict |
|---|---|---|
| 9 | **Payroll** | Master plan §4: "Not building payroll or tax filing. Regulated territory — integrate with a real provider (Gusto, Deel) later." Unchanged since the plan was written |
| 10 | **Taxes / accounting** | Same decision. Tuenx OS records money moving; it is not a book of record for a tax authority |
| 22/23 | **SaaS Management, Subscription & Billing** | Reads two ways. If it means *Gaphatch's own customers on Gaphatch products* — plans, subscriptions, MRR — that is **Phase 7 and already in scope**. If it means organisations/workspaces/tenants inside Tuenx OS, that is multi-tenancy, a permanent non-goal (§4, PRD §4). **Needs your answer before either is built** |

### ➖ Recommend not building

Not "impossible" — these would each be real work whose output is worse than the
tool that already does the job. The Slack reversal is the test to apply: it was
reversed because a record-bound conversation is something Slack genuinely cannot
do. Unless the same kind of answer exists here, the integration beats the rebuild.

| # | System | Why |
|---|---|---|
| 5 | Engineering (repos, PRs, CI/CD) | GitHub already is this — and the recommendation was taken, in the direction predicted: products carry `url` and `repoUrl`, and issues sync one-directionally from GitHub. CI is GitHub Actions, CD is Vercel. **The build/deploy mirror on the product page is still the open half** |
| 20 | DevOps (docker, k8s, scaling) | Vercel/host dashboards. Same argument |
| 21 | API Management | Belongs with whatever serves the API |
| 26 | Inventory | No physical stock at 6–15 people, services + SaaS |
| 29 | AI Management | Worth revisiting when there is real spend to track |
| 30 | Investor & Fundraising | Master plan §4 fixes the fund as internal-only, no external LPs. A **cap table for Tuenx itself** is a different thing and is not excluded — but it is also not in any phase. Say the word and it gets a row in §7 |
| 31 | Partner Management | Nothing to manage yet. The CRM holds a partner as a contact today |
| 33 | QA | Test cases and release approval live where the tests do. Release approval as a **gate on the delivery pipeline** is worth having — see §3 |
| 34 | Risk | A doc until there is something to track |

---

## 3. The workflow diagrams

These are more actionable than the 38-system list, because they describe how the
Agency **actually works** and the app currently disagrees with them.

### Delivery pipeline — the app is missing four stages

Diagram: `Lead/Discovery → Proposal & Contract → Kickoff & Requirements →
Build (dev sprints) → QA & Review → Delivery & Handoff → Support & Warranty
(offer as monthly retainer)`.

`Project.status` today: `planning | active | on_hold | delivered`.

`active` is doing the work of four distinct stages — kickoff, build, QA, and
handoff — which is exactly the information a status field exists to carry. The
diagram's shape is better. Changing it is a migration plus a mapping of existing
rows, and `Project.status` was chosen here rather than specified (TRD leaves it
open, ADR-0002), so this is a cheap correction rather than a reversal.

**Recommend:** adopt the diagram's stages, keep `on_hold` as a flag rather than a
stage — work stalls on client sign-off from any stage, and today that fact
destroys the record of which stage it stalled in.

### Sales pipeline — five stages against the app's four

Diagram: `New Lead → Discovery Call → Proposal Sent → Contract Signed →
Onboarding`.

`Contact.stage` today: `lead | proposal | active | closed`.

The diagram splits discovery out of lead and names onboarding as its own step.
`closed` in the app means "closed won or lost", which the diagram doesn't have at
all — worth keeping, since a lost deal has to go somewhere.

**Recommend:** `lead → discovery → proposal → signed → onboarding → active`,
plus `lost`. This is a real migration of existing rows and needs your go-ahead.

### Team structure — already supported

`Owner → PM → Dev 1, Dev 2` maps onto the existing roles and teams. The PM row
was the case for making `lead` and `member` differ, and **they now do** as of
2026-08-03: a lead writes inside their own division, a member writes only what
is assigned to them. Whether that is too strict for nine people is a question
for real use rather than for design — see `HANDOFF.md`.

### Templates — content, not a module

The contract/SOW skeleton, requirements doc template, and outreach templates are
three seeded Docs. They need no new model. Cheapest useful thing on this page.

---

## 4. What this would cost, in order

Ordered by value per unit of work, not by the numbering above:

1. ~~**Task depth UI**~~ — ✅ built
2. ~~**Templates as seeded docs**~~ — ✅ built
3. ~~**Delivery + sales pipeline stages**~~ — ✅ built, ADR-0002
4. **Phase 7** — ✅ tickets. ❌ metrics and customers, so MRR and churn still cannot be shown
5. **Onboarding/offboarding checklists + performance reviews** — the named HRMS gaps that aren't payroll. Untouched
6. **Phase 8 KPI dashboard** — wants Phase 7's metrics to be worth building
7. **Audit log** — Phase 9, and the last thing standing between this and "who changed what"
8. **Compliance register** — added after the founder confirmed Tuenx owns compliance. Nothing exists

---

## 5. Answered 2026-08-03

1. **SaaS/billing (22, 23) — Gaphatch's own customers only.** Answered "both", then corrected to "only for the internal". Phase 7 customer billing proceeds; **multi-tenancy stays out**, and Tuenx OS stays single-tenant. Master plan §7 records both the reversal and its reinstatement — nothing was built against it
2. **Pipeline stages — adopt the diagrams' and migrate.** Both the delivery and sales pipelines
3. **Build order — all four**, in the order listed in §4

## 6. Still open

1. ~~**Compliance has no module.**~~ **Built 2026-08-03.** `ComplianceItem` with
   an owner, a recurrence, and a next-due date, projected onto the calendar
   exactly as the note asked. Marking one done advances the date rather than
   closing it. Original note: The founder confirmed (2026-08-03) that Tuenx
   handles legal, accounts, finance, and compliance for the whole group. The
   first three have homes — the contracts repository, Treasury, Invoices. There
   is no register of obligations, filings, or their deadlines. Smallest useful
   version: a `ComplianceItem` with an owner, a recurrence, and a next-due
   date, projected onto the calendar the way every other deadline already is
2. **Cap table (30)** — for Tuenx itself? Not excluded, not planned
2. ~~**Tag alphabet**~~ **Resolved 2026-08-03: two-letter codes.** Compliance took `CO`, the first of them. `server/tags.ts` allocates on a (division, type) pair and never cared how long `type` is, so nothing structural changed
3. ~~**`lead` vs `member`**~~ **Made to differ in Phase 9**, per PRD §5: a lead writes inside their own division, a member writes only records assigned to them. Whether that is too strict for nine people is now a question for real use, not for design
