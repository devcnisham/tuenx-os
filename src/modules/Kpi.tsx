import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { money, moneyShort } from '../lib/format.ts'
import {
  DIVISION_CODE,
  DIVISION_LABEL,
  type Kpi as KpiData,
  type KpiDivisionRow,
  type KpiHealthItem,
  type KpiTrendPoint,
} from '../types.ts'
import { PageHeader } from '../components/PageHeader.tsx'
import { EmptyState, ErrorState, Panel, Skeleton, Stat } from '../components/ui.tsx'
import { Icon } from '../components/Icon.tsx'
import { Tag } from '../components/Tag.tsx'

/**
 * PRD §6 Phase 8: a company-wide KPI dashboard aggregating every module.
 *
 * Deliberately not a second Overview. Overview answers "how do the three
 * divisions compare right now". This answers "how is the company doing, and
 * what needs attention" — the figures a founder would report, a scorecard, a
 * year of trend, and a list of things that are actually wrong.
 *
 * Read-only throughout. There is nothing to edit here: every number belongs to
 * a record another module owns, and the health list links back to that module
 * rather than trying to fix anything in place.
 */
export function Kpi() {
  const kpi = useResource<KpiData>(() => api.get('/kpi'), [])

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Reporting"
        title="KPIs"
        description="The whole group on one page — what came in, what is committed, how long the money lasts, and what needs attention."
      />

      {kpi.error ? (
        <ErrorState message={kpi.error} onRetry={kpi.reload} />
      ) : kpi.loading || !kpi.data ? (
        <Skeleton rows={6} />
      ) : (
        <>
          <Headline data={kpi.data} />

          {/* items-start so the chart panel sizes to its content instead of
              stretching to match a long health list and leaving dead space. */}
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
            <Trend points={kpi.data.trend} />
            <Health items={kpi.data.health} />
          </div>

          <Scorecard rows={kpi.data.divisions} />
        </>
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Headline                                                                   */
/* -------------------------------------------------------------------------- */

function Headline({ data }: { data: KpiData }) {
  const h = data.headline

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">
      <Stat
        label="Collected"
        value={moneyShort(h.revenueCollected)}
        hint="invoices marked paid"
      />
      <Stat
        label="Outstanding"
        value={moneyShort(h.outstandingInvoiced)}
        tone={h.outstandingInvoiced > 0 ? 'text-ink' : 'text-faint'}
        hint="billed, not collected"
      />
      <Stat
        label="Cash"
        value={moneyShort(h.cashBalance)}
        tone={h.cashBalance < 0 ? 'text-alert' : 'text-ink'}
        hint="allocations excluded"
      />
      <Stat
        label="Runway"
        value={h.runwayMonths === null ? '—' : `${h.runwayMonths.toFixed(1)}mo`}
        // Under six months is the point at which it stops being a number and
        // starts being a decision.
        tone={h.runwayMonths !== null && h.runwayMonths < 6 ? 'text-alert' : 'text-ink'}
        hint={
          h.monthlyBurn === null
            ? 'income covers spend'
            : `at ${moneyShort(h.monthlyBurn)}/mo burn`
        }
      />
      <Stat
        label="MRR"
        value={moneyShort(h.mrr)}
        hint={
          h.mrrChange === null || h.mrrChange === 0 ? (
            'latest reading per product'
          ) : (
            <span className={h.mrrChange > 0 ? 'text-ready' : 'text-alert'}>
              {h.mrrChange > 0 ? '+' : '−'}
              {moneyShort(Math.abs(h.mrrChange))} since last
            </span>
          )
        }
      />
      <Stat
        label="Pipeline"
        value={moneyShort(h.openPipeline)}
        hint="open deals, not yet won"
      />

      {/* Second row: the counts, which need less weight than the money. */}
      <div className="col-span-2 border-t border-rule pt-4 sm:col-span-3 xl:col-span-6">
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <Counter label="Headcount" value={h.headcount} />
          <Counter label="Products live" value={h.productsLive} />
          <Counter label="Products building" value={h.productsBuilding} />
          <Counter label="Active users" value={h.activeUsers} />
          <Counter label="Open roles in play" value={h.openCandidates} />
          <Counter label="Campaigns live" value={h.liveCampaigns} />
        </dl>
      </div>
    </div>
  )
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="label-mono">{label}</dt>
      <dd className="font-display text-lg leading-none font-semibold tabular-nums text-ink">
        {value}
      </dd>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Trend                                                                      */
/* -------------------------------------------------------------------------- */

const MONTH_LABEL = new Intl.DateTimeFormat('en-GB', { month: 'short' })

/**
 * Twelve months of money in and money out, as paired bars on a shared scale.
 *
 * One scale for both series on purpose: separate scales would make a small
 * month of income look like a big one, which is the single most common way a
 * chart like this lies.
 */
function Trend({ points }: { points: KpiTrendPoint[] }) {
  const peak = Math.max(...points.flatMap((p) => [p.income, p.expense]), 1)
  const totalIn = points.reduce((n, p) => n + p.income, 0)
  const totalOut = points.reduce((n, p) => n + p.expense, 0)

  return (
    <Panel
      title="Twelve months"
      subtitle={
        <span className="font-mono text-[10px] text-faint">
          Income and spend, on one scale
        </span>
      }
      bodyClassName="p-4"
    >
      <div className="flex items-end gap-1.5" style={{ height: 170 }}>
        {points.map((p) => {
          const [year, month] = p.month.split('-')
          const label = MONTH_LABEL.format(new Date(Number(year), Number(month) - 1, 1))
          const empty = p.income === 0 && p.expense === 0

          return (
            <div key={p.month} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
              {/* flex-1 + min-h-0 gives this a definite height, which is what
                  the percentage heights on the bars resolve against. `h-full`
                  here would resolve to zero and the chart would render empty. */}
              <div className="flex w-full min-h-0 flex-1 items-end justify-center gap-[2px]">
                <span
                  className="w-1/2 rounded-t-xs bg-ready/70"
                  style={{ height: `${(p.income / peak) * 100}%` }}
                  title={`${label} in: ${money(p.income)}`}
                />
                <span
                  className="w-1/2 rounded-t-xs bg-alert/70"
                  style={{ height: `${(p.expense / peak) * 100}%` }}
                  title={`${label} out: ${money(p.expense)}`}
                />
              </div>
              <span
                className={`font-mono text-[9px] ${empty ? 'text-faint/50' : 'text-faint'}`}
              >
                {label}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-rule pt-3">
        <Legend swatch="bg-ready/70" label="In" value={moneyShort(totalIn)} />
        <Legend swatch="bg-alert/70" label="Out" value={moneyShort(totalOut)} />
        <span className="ml-auto font-mono text-[10px] text-faint">
          net{' '}
          <span className={totalIn - totalOut < 0 ? 'text-alert' : 'text-ready'}>
            {moneyShort(totalIn - totalOut)}
          </span>
        </span>
      </div>
    </Panel>
  )
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-xs ${swatch}`} aria-hidden />
      <span className="label-mono">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-ink">{value}</span>
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What is actually wrong, and where to go about it.
 *
 * The server only emits an item when it has something to say, so an empty list
 * genuinely means nothing needs attention — which is why this shows one line
 * rather than a wall of green ticks. A dashboard full of ticks is one people
 * stop reading.
 */
function Health({ items }: { items: KpiHealthItem[] }) {
  return (
    <Panel
      title="Needs attention"
      subtitle={
        <span className="font-mono text-[10px] text-faint">
          {items.length === 0 ? 'Nothing flagged' : `${items.length} across the group`}
        </span>
      }
      bodyClassName="p-0"
    >
      {items.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="All clear"
            hint="No overdue invoices, no missed dates, no key results off track."
          />
        </div>
      ) : (
        <ul className="divide-y divide-rule">
          {items.map((item) => (
            <li key={item.key}>
              <a
                href={item.route}
                className="flex gap-3 px-4 py-3 transition-colors hover:bg-wash"
              >
                <Icon
                  name={item.tone === 'alert' ? 'alert' : 'clock'}
                  size={14}
                  className={`mt-0.5 ${item.tone === 'alert' ? 'text-alert' : 'text-faint'}`}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`font-display text-lg leading-none font-semibold tabular-nums ${
                        item.tone === 'alert' ? 'text-alert' : 'text-ink'
                      }`}
                    >
                      {item.value}
                    </span>
                    <span className="text-[13px] font-medium text-ink">{item.label}</span>
                    {item.amount !== undefined && item.amount > 0 && (
                      <span className="ml-auto font-mono text-[11px] tabular-nums text-ink">
                        {money(item.amount)}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-[12px] leading-snug text-graphite">{item.detail}</p>

                  {item.records.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.records.map((r) => (
                        <Tag key={r.tag} tag={r.tag} />
                      ))}
                    </div>
                  )}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/* -------------------------------------------------------------------------- */
/* Scorecard                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The three divisions on the metrics that differ between them.
 *
 * Money is per division here because Tuenx is the parent and carries the
 * group's costs — a negative net for Gaphatch is a product arm being funded,
 * not a problem, so it is shown plainly rather than flagged red.
 */
function Scorecard({ rows }: { rows: KpiDivisionRow[] }) {
  return (
    <Panel className="mt-6" title="By division" bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-lg border-collapse text-left">
          <thead>
            <tr className="border-b border-rule">
              <th className="label-mono px-4 py-2">Division</th>
              <th className="label-mono px-4 py-2 text-right">Open tasks</th>
              <th className="label-mono px-4 py-2 text-right">Overdue</th>
              <th className="label-mono px-4 py-2 text-right">Pipeline</th>
              <th className="label-mono px-4 py-2 text-right">Headcount</th>
              <th className="label-mono px-4 py-2 text-right">Net cash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.map((row) => (
              <tr key={row.division}>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-xs"
                      style={mark(row.division).fill}
                      aria-hidden
                    />
                    <span className="text-[13px] font-medium text-ink">
                      {DIVISION_LABEL[row.division]}
                    </span>
                    <span className="font-mono text-[10px] text-faint">
                      {DIVISION_CODE[row.division]}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink">
                  {row.openTasks}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-mono text-[12px] tabular-nums ${
                    row.overdueTasks > 0 ? 'text-alert' : 'text-faint'
                  }`}
                >
                  {row.overdueTasks}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink">
                  {moneyShort(row.pipelineValue)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink">
                  {row.headcount}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink">
                  {moneyShort(row.netCash)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-rule px-4 py-2.5 font-mono text-[10px] leading-relaxed text-faint">
        Net cash excludes allocations — capital moved from Tuenx into a division is
        an internal transfer, so counting it would double-count the same money. A
        negative net on a product arm is that arm being funded, not a problem.
      </p>
    </Panel>
  )
}
