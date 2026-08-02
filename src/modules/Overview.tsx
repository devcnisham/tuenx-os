import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { dueLabel, moneyShort, pluralise } from '../lib/format.ts'
import { href } from '../lib/router.ts'
import {
  DIVISION_CODE,
  DIVISION_LABEL,
  TASK_STATUS_LABEL,
  type DivisionSummary,
  type Overview as OverviewData,
} from '../types.ts'
import { PageHeader } from '../components/PageHeader.tsx'
import { EmptyState, ErrorState, Panel, Pill, Skeleton, Stat } from '../components/ui.tsx'
import { Tag } from '../components/Tag.tsx'

/**
 * PRD §6 Phase 1 Overview, and the workflow in PRD §7: the founder opens this
 * and answers "how is the company doing" without visiting another module.
 *
 * Built as a comparative ledger rather than a row of KPI tiles. Tuenx is a
 * two-division holding company, so the question is never "what is the number"
 * but "how do the divisions compare" — the three sit side by side, each metric
 * drawn against a shared baseline.
 *
 * Airy by design: this is the page read cold, so it gets room. The boards
 * (Tasks, CRM, Team) stay compact for daily work.
 */
export function Overview() {
  const overview = useResource<OverviewData>(() => api.get('/overview'), [])

  if (overview.error) {
    return (
      <>
        <OverviewHeader />
        <ErrorState message={overview.error} onRetry={overview.reload} />
      </>
    )
  }

  if (overview.loading || !overview.data) {
    return (
      <>
        <OverviewHeader />
        <Skeleton rows={6} />
      </>
    )
  }

  const { divisions, totals, needsAttention } = overview.data

  return (
    <>
      <OverviewHeader />

      {/* Company line. */}
      <div className="mb-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
        <Stat
          label="Open tasks"
          value={totals.openTasks}
          hint={`across ${pluralise(divisions.filter((d) => d.openTasks > 0).length, 'division')}`}
        />
        <Stat
          label="Pipeline in play"
          value={moneyShort(totals.pipelineValue)}
          hint={`${pluralise(totals.activeDeals, 'deal')} active`}
        />
        <Stat label="Headcount" value={totals.headcount} hint="group-wide" />
        <Stat
          label="Products"
          value={`${totals.productsBuilding}/${totals.productsLive}`}
          hint="building / live"
        />
      </div>

      {/* Phase 3 and 4 roll-ups. Money owed and money held, side by side. */}
      <div className="mb-8 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-rule pt-6 sm:grid-cols-4">
        <Stat
          label="Outstanding"
          value={moneyShort(totals.outstandingInvoiced)}
          hint="billed, not collected"
        />
        <Stat
          label="Overdue"
          value={totals.overdueInvoices}
          tone={totals.overdueInvoices > 0 ? 'text-alert' : 'text-faint'}
          hint={totals.overdueInvoices > 0 ? 'chase these' : 'none past due'}
        />
        <Stat
          label="Treasury"
          value={moneyShort(totals.treasuryBalance)}
          tone={totals.treasuryBalance < 0 ? 'text-alert' : 'text-ink'}
          hint="group balance"
        />
        <div className="flex items-end">
          <a
            href={href('treasury')}
            className="font-mono text-[10px] text-graphite underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            Open treasury →
          </a>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <DivisionLedger divisions={divisions} />
        <NeedsAttention tasks={needsAttention} />
      </div>
    </>
  )
}

function OverviewHeader() {
  return (
    <PageHeader
      eyebrow="Tuenx · Group"
      title="Overview"
      description="Tuenx Technologies is the parent, holding, and management entity for the group. Agency and Gaphatch sit under it."
    />
  )
}

/**
 * The three divisions, compared. Every bar in a row is scaled to the largest
 * value in that row, so a glance reads relative weight rather than absolute
 * size — which is the actual question when allocating between two arms.
 *
 * Bars are filled with each division's mark (solid / hatched / dotted) rather
 * than a colour, so the encoding matches the tags and survives greyscale.
 */
function DivisionLedger({ divisions }: { divisions: DivisionSummary[] }) {
  const rows = [
    { label: 'Open tasks', get: (d: DivisionSummary) => d.openTasks, render: String },
    { label: 'Pipeline in play', get: (d: DivisionSummary) => d.pipelineValue, render: moneyShort },
    { label: 'Active deals', get: (d: DivisionSummary) => d.activeDeals, render: String },
    { label: 'Headcount', get: (d: DivisionSummary) => d.headcount, render: String },
  ]

  return (
    <Panel title="By division" bodyClassName="p-5">
      {/* Column header doubles as the legend for every row below. */}
      <div className="mb-6 grid grid-cols-3 gap-4 border-b border-ink pb-2">
        {divisions.map((d) => (
          <div key={d.division} className="flex items-center gap-1.5">
            <span
              className={`shrink-0 rounded-[2px] px-1 py-px font-mono text-[9px] font-medium ${
                mark(d.division).tag
              }`}
            >
              {DIVISION_CODE[d.division]}
            </span>
            <span className="truncate font-display text-sm text-ink">
              {DIVISION_LABEL[d.division]}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        {rows.map((row) => {
          const values = divisions.map(row.get)
          const peak = Math.max(...values, 1)

          return (
            <div key={row.label}>
              <p className="label-mono mb-2.5">{row.label}</p>
              <div className="grid grid-cols-3 gap-4">
                {divisions.map((d, i) => {
                  const value = values[i]!
                  return (
                    <div key={d.division}>
                      <p
                        className={`font-display text-2xl leading-none font-semibold tabular-nums ${
                          value === 0 ? 'text-faint' : mark(d.division).text
                        }`}
                      >
                        {row.render(value)}
                      </p>
                      <div className="mt-2 h-1.5 bg-wash">
                        <div
                          className="h-full transition-[width] duration-500"
                          style={{
                            width: `${(value / peak) * 100}%`,
                            ...mark(d.division).fill,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-6 border-t border-rule pt-3 font-mono text-[10px] leading-relaxed text-faint">
        Bars are scaled per row against the highest division, not a fixed maximum.
        Pipeline excludes closed deals.
      </p>
    </Panel>
  )
}

/** PRD §6: "needs-attention list of high-priority open tasks." */
function NeedsAttention({ tasks }: { tasks: OverviewData['needsAttention'] }) {
  return (
    <Panel
      title="Needs attention"
      subtitle={<span className="font-mono text-[10px] text-faint">High priority, still open</span>}
      actions={
        <a
          href={href('tasks')}
          className="font-mono text-[10px] text-graphite underline-offset-2 transition-colors hover:text-ink hover:underline"
        >
          All tasks →
        </a>
      }
      bodyClassName="px-4 py-1"
    >
      {tasks.length === 0 ? (
        <div className="py-3">
          <EmptyState title="Nothing urgent" hint="No high-priority task is open right now." />
        </div>
      ) : (
        <ul className="divide-y divide-rule">
          {tasks.map((task) => {
            const due = task.dueDate ? dueLabel(task.dueDate) : null

            return (
              <li key={task.id} className="py-3">
                <div className="flex items-center gap-2">
                  <Tag tag={task.tag} />
                  {due && (
                    <Pill tone={due.tone === 'overdue' ? 'alert' : due.tone === 'soon' ? 'pending' : 'neutral'}>
                      {due.text}
                    </Pill>
                  )}
                </div>
                <p className="mt-1.5 text-sm leading-snug text-ink">{task.title}</p>
                <p className="mt-1 font-mono text-[10px] text-faint">
                  {task.assignee?.name ?? 'Unassigned'} · {TASK_STATUS_LABEL[task.status]}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
