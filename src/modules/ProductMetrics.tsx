import { useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { fullDate, moneyShort, pluralise, todayInputValue, dateInputValue } from '../lib/format.ts'
import {
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_LABEL,
  type Customer,
  type DerivedMetrics,
  type MetricSnapshot,
  type SubscriptionStatus,
} from '../types.ts'
import {
  Button,
  EmptyState,
  ErrorState,
  Panel,
  Pill,
  Skeleton,
  type PillTone,
} from '../components/ui.tsx'
import { FilterSelect, SelectField, TextField } from '../components/Field.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { Tag } from '../components/Tag.tsx'

/**
 * Phase 7 — the subscriber base and the numbers, both hanging off one product.
 *
 * Colour follows the house rule: red and green only, and only for status.
 * A subscription is either working (green), gone (red), or not yet decided
 * (neutral) — trial is deliberately not amber, because amber belongs to Tuenx.
 */
const SUBSCRIPTION_TONE: Record<SubscriptionStatus, PillTone> = {
  trial: 'neutral',
  active: 'ready',
  churned: 'alert',
}

const SUBSCRIPTION_OPTIONS = SUBSCRIPTION_STATUSES.map((s) => ({
  value: s,
  label: SUBSCRIPTION_STATUS_LABEL[s],
}))

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

/** Green when a rise is good, red when it isn't. Churn inverts. */
function Delta({ value, invert = false, format }: { value: number | null; invert?: boolean; format: (n: number) => string }) {
  if (value === null) return <span className="font-mono text-[10px] text-faint">no prior reading</span>
  if (value === 0) return <span className="font-mono text-[10px] text-faint">unchanged</span>

  const good = invert ? value < 0 : value > 0
  return (
    <span className={`font-mono text-[10px] tabular-nums ${good ? 'text-ready' : 'text-alert'}`}>
      {value > 0 ? '+' : '−'}
      {format(Math.abs(value))} since last
    </span>
  )
}

export function Metrics({ productId }: { productId: string }) {
  const snapshots = useResource<MetricSnapshot[]>(
    () => api.get('/metrics', { productId }),
    [productId],
  )
  const [editing, setEditing] = useState<MetricSnapshot | 'new' | null>(null)

  const rows = snapshots.data ?? []
  const [latest, previous] = rows
  const peak = Math.max(...rows.map((r) => r.mrr), 1)

  const change = (now: number | undefined, before: number | undefined) =>
    now === undefined || before === undefined ? null : now - before

  return (
    <>
      <Panel
        className="mb-6"
        title="Metrics"
        subtitle={
          <span className="font-mono text-[10px] text-faint">
            One reading per date · newest first
          </span>
        }
        actions={
          <Button size="sm" onClick={() => setEditing('new')}>
            + Snapshot
          </Button>
        }
        bodyClassName="p-4"
      >
        {snapshots.error ? (
          <ErrorState message={snapshots.error} onRetry={snapshots.reload} />
        ) : snapshots.loading ? (
          <Skeleton rows={2} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No readings yet"
            hint="Take a snapshot at the end of each month and the trend builds itself. Active users and churn can be counted from the subscriber list below; MRR has to be supplied."
          />
        ) : (
          <>
            <div className="mb-5 grid grid-cols-1 gap-5 border-b border-rule pb-5 sm:grid-cols-3">
              <div>
                <p className="label-mono">MRR</p>
                <p className="mt-1.5 font-display text-3xl leading-none font-semibold tabular-nums text-ink">
                  {moneyShort(latest!.mrr)}
                </p>
                <p className="mt-1.5">
                  <Delta value={change(latest?.mrr, previous?.mrr)} format={moneyShort} />
                </p>
              </div>
              <div>
                <p className="label-mono">Active users</p>
                <p className="mt-1.5 font-display text-3xl leading-none font-semibold tabular-nums text-ink">
                  {latest!.activeUsers.toLocaleString()}
                </p>
                <p className="mt-1.5">
                  <Delta
                    value={change(latest?.activeUsers, previous?.activeUsers)}
                    format={(n) => n.toLocaleString()}
                  />
                </p>
              </div>
              <div>
                <p className="label-mono">Churn</p>
                <p className="mt-1.5 font-display text-3xl leading-none font-semibold tabular-nums text-ink">
                  {latest!.churnRate}%
                </p>
                <p className="mt-1.5">
                  {/* Rising churn is bad, so the colours flip here. */}
                  <Delta
                    value={change(latest?.churnRate, previous?.churnRate)}
                    invert
                    format={(n) => `${n.toFixed(1)}pt`}
                  />
                </p>
              </div>
            </div>

            <ol className="divide-y divide-rule">
              {rows.map((snapshot) => (
                <li key={snapshot.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                  <span className="w-24 shrink-0 font-mono text-[11px] text-graphite">
                    {fullDate(snapshot.date)}
                  </span>

                  {/* MRR bar, scaled against the highest reading in the series. */}
                  <span className="hidden h-1.5 w-24 shrink-0 bg-wash sm:block" aria-hidden>
                    <span
                      className="block h-full bg-ink"
                      style={{ width: `${(snapshot.mrr / peak) * 100}%` }}
                    />
                  </span>

                  <span className="w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink">
                    {moneyShort(snapshot.mrr)}
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-graphite">
                    {snapshot.activeUsers.toLocaleString()}
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-graphite">
                    {snapshot.churnRate}%
                  </span>

                  <Tag tag={snapshot.tag} />

                  <button
                    type="button"
                    onClick={() => setEditing(snapshot)}
                    className="ml-auto shrink-0 font-mono text-[10px] text-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
                  >
                    Edit
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
      </Panel>

      {editing && (
        <SnapshotForm
          productId={productId}
          snapshot={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            snapshots.reload()
          }}
        />
      )}
    </>
  )
}

function SnapshotForm({
  productId,
  snapshot,
  onClose,
  onSaved,
}: {
  productId: string
  snapshot: MetricSnapshot | null
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(snapshot ? dateInputValue(snapshot.date) : todayInputValue())
  const [mrr, setMrr] = useState(String(snapshot?.mrr ?? ''))
  const [activeUsers, setActiveUsers] = useState(String(snapshot?.activeUsers ?? ''))
  const [churnRate, setChurnRate] = useState(String(snapshot?.churnRate ?? ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only offered on a new snapshot — recounting the base today tells you
  // nothing about what it was on a date in the past.
  const derived = useResource<DerivedMetrics>(
    () => api.get(`/metrics/derive/${productId}`),
    [productId],
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = {
        date,
        mrr: mrr === '' ? 0 : Number(mrr),
        activeUsers: activeUsers === '' ? 0 : Number(activeUsers),
        churnRate: churnRate === '' ? 0 : Number(churnRate),
      }
      if (snapshot) await api.patch(`/metrics/${snapshot.id}`, body)
      else await api.post('/metrics', { productId, ...body })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!snapshot || !confirm(`Delete ${snapshot.tag}? This cannot be undone.`)) return
    setSaving(true)
    try {
      await api.del(`/metrics/${snapshot.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={snapshot ? 'Edit snapshot' : 'New snapshot'}
      subtitle={
        snapshot ? (
          <Tag tag={snapshot.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            A tag is issued on save, e.g. GPH-Z004
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <TextField label="Date" type="date" value={date} onChange={setDate} required autoFocus />

          <TextField
            label="MRR"
            type="number"
            min={0}
            step={100}
            value={mrr}
            onChange={setMrr}
            placeholder="0"
            hint="Has to be typed. A Customer carries no price, so this database cannot work out what anyone pays."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Active users"
              type="number"
              min={0}
              value={activeUsers}
              onChange={setActiveUsers}
              placeholder="0"
            />
            <TextField
              label="Churn rate %"
              type="number"
              min={0}
              step={0.1}
              value={churnRate}
              onChange={setChurnRate}
              placeholder="0"
            />
          </div>

          {!snapshot && derived.data && (
            <div className="rounded-sm border border-rule bg-wash p-3">
              <p className="label-mono">Counted from the subscriber list</p>
              <p className="mt-1.5 font-mono text-[11px] text-ink">
                {pluralise(derived.data.activeUsers, 'active subscriber')} ·{' '}
                {derived.data.churnRate}% churned
              </p>
              <p className="mt-1 text-[11px] leading-snug text-faint">{derived.data.basis}</p>
              <Button
                type="button"
                size="sm"
                className="mt-2.5"
                onClick={() => {
                  setActiveUsers(String(derived.data!.activeUsers))
                  setChurnRate(String(derived.data!.churnRate))
                }}
              >
                Use these
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {snapshot && (
            <Button
              type="button"
              variant="danger"
              onClick={remove}
              disabled={saving}
              className="mr-auto"
            >
              Delete
            </Button>
          )}
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : snapshot ? 'Save changes' : 'Add snapshot'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}

/* -------------------------------------------------------------------------- */
/* Customers                                                                  */
/* -------------------------------------------------------------------------- */

export function Customers({ productId }: { productId: string }) {
  const [status, setStatus] = useState<SubscriptionStatus | ''>('')
  const [editing, setEditing] = useState<Customer | 'new' | null>(null)

  const customers = useResource<Customer[]>(
    () => api.get('/customers', { productId, subscriptionStatus: status }),
    [productId, status],
  )

  const rows = customers.data ?? []
  const active = rows.filter((c) => c.subscriptionStatus === 'active').length

  return (
    <>
      <Panel
        className="mb-6"
        title="Customers"
        subtitle={
          <span className="font-mono text-[10px] text-faint">
            {status ? pluralise(rows.length, 'match', 'matches') : `${active} active of ${rows.length}`}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <FilterSelect
              ariaLabel="Filter by subscription"
              placeholder="Any status"
              value={status}
              options={SUBSCRIPTION_OPTIONS}
              onChange={setStatus}
            />
            <Button size="sm" onClick={() => setEditing('new')}>
              + Customer
            </Button>
          </div>
        }
        bodyClassName="p-4"
      >
        {customers.error ? (
          <ErrorState message={customers.error} onRetry={customers.reload} />
        ) : customers.loading ? (
          <Skeleton rows={3} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={status ? 'Nothing at that status' : 'No customers yet'}
            hint={
              status
                ? 'Clear the filter to see the rest of the base.'
                : 'Add subscribers here and the active count, churn, and ticket reporters all follow from one list.'
            }
          />
        ) : (
          <ul className="divide-y divide-rule">
            {rows.map((customer) => (
              <li key={customer.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-[13px] font-medium text-ink">{customer.name}</p>
                    <Tag tag={customer.tag} />
                    <Pill tone={SUBSCRIPTION_TONE[customer.subscriptionStatus]}>
                      {SUBSCRIPTION_STATUS_LABEL[customer.subscriptionStatus]}
                    </Pill>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-faint">
                    {customer.email ?? 'no email'} · since {fullDate(customer.since)}
                    {customer.counts.tickets > 0 && (
                      <> · {pluralise(customer.counts.tickets, 'ticket')}</>
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setEditing(customer)}
                  className="shrink-0 font-mono text-[10px] text-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {editing && (
        <CustomerForm
          productId={productId}
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            customers.reload()
          }}
        />
      )}
    </>
  )
}

function CustomerForm({
  productId,
  customer,
  onClose,
  onSaved,
}: {
  productId: string
  customer: Customer | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(customer?.name ?? '')
  const [email, setEmail] = useState(customer?.email ?? '')
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | ''>(
    customer?.subscriptionStatus ?? 'trial',
  )
  const [since, setSince] = useState(
    customer ? dateInputValue(customer.since) : todayInputValue(),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = { name, email, subscriptionStatus, since }
      if (customer) await api.patch(`/customers/${customer.id}`, body)
      else await api.post('/customers', { productId, ...body })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!customer) return
    const warning =
      customer.counts.tickets > 0
        ? `Delete ${customer.name} (${customer.tag})?\n\nTheir ${pluralise(customer.counts.tickets, 'ticket')} stay in the queue, unattached. This cannot be undone.`
        : `Delete ${customer.name} (${customer.tag})? This cannot be undone.`
    if (!confirm(warning)) return

    setSaving(true)
    try {
      await api.del(`/customers/${customer.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={customer ? 'Edit customer' : 'New customer'}
      subtitle={
        customer ? (
          <Tag tag={customer.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            A tag is issued on save, e.g. GPH-U004
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <TextField label="Name" value={name} onChange={setName} required autoFocus />
          <TextField label="Email" type="email" value={email} onChange={setEmail} />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Subscription"
              value={subscriptionStatus}
              options={SUBSCRIPTION_OPTIONS}
              onChange={setSubscriptionStatus}
            />
            <TextField label="Since" type="date" value={since} onChange={setSince} required />
          </div>

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {customer && (
            <Button
              type="button"
              variant="danger"
              onClick={remove}
              disabled={saving}
              className="mr-auto"
            >
              Delete
            </Button>
          )}
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : customer ? 'Save changes' : 'Add customer'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}
