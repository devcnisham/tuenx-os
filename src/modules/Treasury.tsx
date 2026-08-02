import { useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { dateInputValue, money, moneyShort, shortDate, todayInputValue } from '../lib/format.ts'
import {
  DIVISIONS,
  DIVISION_CODE,
  DIVISION_LABEL,
  FUND_TYPES,
  FUND_TYPE_LABEL,
  type Division,
  type FundEntry,
  type FundType,
  type Treasury as TreasuryData,
} from '../types.ts'
import { PageHeader, Toolbar } from '../components/PageHeader.tsx'
import {
  Button,
  EmptyState,
  ErrorState,
  Panel,
  Pill,
  Skeleton,
  Stat,
  type PillTone,
} from '../components/ui.tsx'
import { FilterSelect, SelectField, TextAreaField, TextField } from '../components/Field.tsx'
import { Modal, ModalFooter } from '../components/Modal.tsx'
import { Tag } from '../components/Tag.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))
const TYPE_OPTIONS = FUND_TYPES.map((t) => ({ value: t, label: FUND_TYPE_LABEL[t] }))

const TYPE_TONE: Record<FundType, PillTone> = {
  income: 'ready',
  expense: 'alert',
  allocation: 'neutral',
}

/**
 * PRD §6 Phase 4: income, expenses, and budget at the Tuenx level, capital
 * allocation visible per division, and runway.
 *
 * Tuenx is the parent entity, so this is the group's book. Allocations —
 * capital moved from Tuenx into a division — are shown per division but kept
 * out of balance and burn: an internal transfer inside one group is not
 * income or spend, and counting it would double-count the same money.
 */
export function Treasury() {
  const [division, setDivision] = useState<Division | ''>('')
  const [type, setType] = useState<FundType | ''>('')
  const [editing, setEditing] = useState<FundEntry | 'new' | null>(null)

  const treasury = useResource<TreasuryData>(() => api.get('/treasury'), [])
  const entries = useResource<FundEntry[]>(
    () => api.get('/treasury/entries', { division, type }),
    [division, type],
  )

  const reloadAll = () => {
    treasury.reload()
    entries.reload()
  }

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Treasury"
        title="Treasury"
        description="The group's book. Income and spend per division, capital allocated into each arm, and how long the balance lasts."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            + New entry
          </Button>
        }
      />

      {treasury.error ? (
        <ErrorState message={treasury.error} onRetry={treasury.reload} />
      ) : treasury.loading || !treasury.data ? (
        <Skeleton rows={3} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Stat
              label="Balance"
              value={moneyShort(treasury.data.balance)}
              tone={treasury.data.balance < 0 ? 'text-alert' : 'text-ink'}
              hint="income less spend"
            />
            <Stat label="Income" value={moneyShort(treasury.data.income)} hint="all time" />
            <Stat label="Spend" value={moneyShort(treasury.data.expenses)} hint="all time" />
            <Stat
              label="Runway"
              value={
                treasury.data.runwayMonths === null
                  ? '—'
                  : `${treasury.data.runwayMonths.toFixed(1)}mo`
              }
              tone={
                treasury.data.runwayMonths !== null && treasury.data.runwayMonths < 6
                  ? 'text-alert'
                  : 'text-ink'
              }
              hint={
                treasury.data.monthlyBurn === null
                  ? 'income covers spend'
                  : `at ${moneyShort(treasury.data.monthlyBurn)}/mo burn`
              }
            />
          </div>

          <DivisionBook byDivision={treasury.data.byDivision} />
        </>
      )}

      <Panel
        title="Entries"
        subtitle={<span className="font-mono text-[10px] text-faint">Newest first</span>}
        className="mt-6"
        bodyClassName="p-0"
      >
        <div className="border-b border-rule px-3 py-2">
          <Toolbar>
            <FilterSelect
              ariaLabel="Filter by division"
              placeholder="All divisions"
              value={division}
              options={DIVISION_OPTIONS}
              onChange={setDivision}
            />
            <FilterSelect
              ariaLabel="Filter by type"
              placeholder="Any type"
              value={type}
              options={TYPE_OPTIONS}
              onChange={setType}
            />
            {(division || type) && (
              <Button
                size="sm"
                onClick={() => {
                  setDivision('')
                  setType('')
                }}
              >
                Clear
              </Button>
            )}
            <span className="ml-auto font-mono text-[10px] text-faint">
              {entries.data?.length ?? 0} entries
            </span>
          </Toolbar>
        </div>

        {entries.error ? (
          <div className="p-4">
            <ErrorState message={entries.error} onRetry={entries.reload} />
          </div>
        ) : entries.loading ? (
          <div className="p-4">
            <Skeleton rows={4} />
          </div>
        ) : (entries.data ?? []).length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No entries"
              hint="Record income, spend, or capital allocated into a division."
            />
          </div>
        ) : (
          <ul className="divide-y divide-rule">
            {entries.data!.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onEdit={() => setEditing(entry)} />
            ))}
          </ul>
        )}
      </Panel>

      {editing && (
        <EntryForm
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reloadAll()
          }}
        />
      )}
    </>
  )
}

/**
 * Per-division book. Net is income less spend; allocated is capital committed
 * from the Tuenx level, shown alongside rather than folded in — Gaphatch
 * running a negative net while holding a large allocation is the normal shape
 * of a product arm being funded, not a problem.
 */
function DivisionBook({ byDivision }: { byDivision: TreasuryData['byDivision'] }) {
  const peak = Math.max(...byDivision.map((d) => Math.max(d.income, d.expenses, d.allocated)), 1)

  return (
    <Panel title="By division" bodyClassName="p-5">
      <div className="grid gap-6 sm:grid-cols-3">
        {byDivision.map((d) => (
          <div key={d.division}>
            <div className="flex items-center gap-1.5 border-b border-ink pb-2">
              <span
                className={`shrink-0 rounded-[2px] px-1 py-px font-mono text-[9px] font-medium ${
                  mark(d.division).tag
                }`}
              >
                {DIVISION_CODE[d.division]}
              </span>
              <span className="font-display text-sm text-ink">{DIVISION_LABEL[d.division]}</span>
              <span
                className={`ml-auto font-mono text-xs tabular-nums ${
                  d.net < 0 ? 'text-alert' : mark(d.division).text
                }`}
              >
                {d.net >= 0 ? '+' : ''}
                {moneyShort(d.net)}
              </span>
            </div>

            <dl className="mt-3 space-y-2.5">
              {(
                [
                  ['Income', d.income],
                  ['Spend', d.expenses],
                  ['Allocated', d.allocated],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <div className="leader">
                    <dt className="label-mono order-0">{label}</dt>
                    <dd className="order-2 font-mono text-[11px] tabular-nums text-ink">
                      {moneyShort(value)}
                    </dd>
                  </div>
                  <div className="mt-1 h-1 bg-wash">
                    <div
                      className="h-full transition-[width] duration-500"
                      style={{ width: `${(value / peak) * 100}%`, ...mark(d.division).fill }}
                    />
                  </div>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <p className="mt-5 border-t border-rule pt-3 font-mono text-[10px] leading-relaxed text-faint">
        Allocated is capital committed from the Tuenx level into that division. It is excluded
        from balance, burn, and runway — an internal transfer inside one group is not income or
        spend. Bars scale against the largest figure on this panel.
      </p>
    </Panel>
  )
}

function EntryRow({ entry, onEdit }: { entry: FundEntry; onEdit: () => void }) {
  // Spend reads as a negative; income and allocation read as positive.
  const signed = entry.type === 'expense' ? -entry.amount : entry.amount

  return (
    <li className="relative flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 pr-3 pl-4">
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={mark(entry.division).fill}
        aria-hidden
      />

      <div className="flex min-w-0 flex-1 basis-64 items-center gap-2">
        <Tag tag={entry.tag} />
        <div className="min-w-0">
          <p className="truncate text-[13px] leading-tight text-ink">{entry.category}</p>
          {entry.notes && (
            <p className="mt-0.5 truncate font-mono text-[10px] text-faint">{entry.notes}</p>
          )}
        </div>
      </div>

      <Pill tone={TYPE_TONE[entry.type]}>{FUND_TYPE_LABEL[entry.type]}</Pill>

      <span className="w-16 shrink-0 font-mono text-[10px] text-faint">
        {shortDate(entry.date)}
      </span>

      <span
        className={`w-24 shrink-0 text-right font-mono text-[13px] tabular-nums ${
          entry.type === 'expense' ? 'text-alert' : 'text-ink'
        }`}
      >
        {signed < 0 ? '−' : '+'}
        {money(Math.abs(signed))}
      </span>

      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 font-mono text-[10px] text-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
      >
        Edit
      </button>
    </li>
  )
}

function EntryForm({
  entry,
  onClose,
  onSaved,
}: {
  entry: FundEntry | null
  onClose: () => void
  onSaved: () => void
}) {
  const [division, setDivision] = useState<Division | ''>(entry?.division ?? 'tuenx')
  const [type, setType] = useState<FundType | ''>(entry?.type ?? 'expense')
  const [amount, setAmount] = useState(String(entry?.amount ?? ''))
  const [category, setCategory] = useState(entry?.category ?? '')
  const [date, setDate] = useState(entry ? dateInputValue(entry.date) : todayInputValue())
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = {
        division,
        type,
        amount: amount === '' ? 0 : Number(amount),
        category,
        date,
        notes,
      }
      if (entry) await api.patch(`/treasury/entries/${entry.id}`, body)
      else await api.post('/treasury/entries', body)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!entry || !confirm(`Delete ${entry.tag}? This cannot be undone.`)) return
    setSaving(true)
    try {
      await api.del(`/treasury/entries/${entry.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={entry ? 'Edit entry' : 'New entry'}
      subtitle={
        entry ? (
          <Tag tag={entry.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            A tag is issued on save, e.g. TNX-F016
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Division"
              value={division}
              options={DIVISION_OPTIONS}
              onChange={setDivision}
            />
            <SelectField
              label="Type"
              value={type}
              options={TYPE_OPTIONS}
              onChange={setType}
              hint={
                type === 'allocation'
                  ? 'Internal transfer — excluded from balance and runway.'
                  : undefined
              }
            />
            <TextField
              label="Amount"
              type="number"
              min={0}
              step={100}
              value={amount}
              onChange={setAmount}
              required
              placeholder="0"
            />
            <TextField label="Date" type="date" value={date} onChange={setDate} required />
          </div>

          <TextField
            label="Category"
            value={category}
            onChange={setCategory}
            required
            placeholder="Client revenue, Contractor fees, Software & tools, …"
          />

          <TextAreaField label="Notes" value={notes} onChange={setNotes} rows={2} />

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <ModalFooter>
          {entry && (
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
            {saving ? 'Saving…' : entry ? 'Save changes' : 'Create entry'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
