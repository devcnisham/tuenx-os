import { useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { daysUntil, dateInputValue, fullDate, pluralise, todayInputValue } from '../lib/format.ts'
import {
  COMPLIANCE_CATEGORIES,
  COMPLIANCE_CATEGORY_LABEL,
  DIVISIONS,
  DIVISION_LABEL,
  RECURRENCES,
  RECURRENCE_LABEL,
  type ComplianceCategory,
  type ComplianceItem,
  type ComplianceSummary,
  type Division,
  type Recurrence,
  type TeamMember,
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
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { Tag } from '../components/Tag.tsx'
import { LinkedRecords } from '../components/LinkedRecords.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))
const CATEGORY_OPTIONS = COMPLIANCE_CATEGORIES.map((c) => ({
  value: c,
  label: COMPLIANCE_CATEGORY_LABEL[c],
}))
const RECURRENCE_OPTIONS = RECURRENCES.map((r) => ({ value: r, label: RECURRENCE_LABEL[r] }))

/** Matches DUE_SOON_DAYS on the server. */
const DUE_SOON_DAYS = 30

/**
 * The compliance register.
 *
 * Tuenx handles legal, accounts, finance, and compliance for the group. The
 * first three had homes — the contracts repository, Treasury, Invoices. This is
 * the fourth: filings, licences, renewals, and audits.
 *
 * Deliberately not the task board. A task is done once and closed; a VAT return
 * is due again the moment you file it. "Mark done" advances the date instead of
 * closing the record, so the register never empties and never misleads about
 * what is coming.
 */
export function Compliance() {
  const [division, setDivision] = useState<Division | ''>('')
  const [category, setCategory] = useState<ComplianceCategory | ''>('')
  const [ownerId, setOwnerId] = useState('')
  const [includeRetired, setIncludeRetired] = useState(false)
  const [editing, setEditing] = useState<ComplianceItem | 'new' | null>(null)

  const items = useResource<ComplianceItem[]>(
    () =>
      api.get('/compliance', {
        division,
        category,
        ownerId,
        includeRetired: includeRetired ? 'true' : '',
      }),
    [division, category, ownerId, includeRetired],
  )
  const summary = useResource<ComplianceSummary>(() => api.get('/compliance/summary'), [])
  const team = useResource<TeamMember[]>(() => api.get('/team'), [])

  const reload = () => {
    items.reload()
    summary.reload()
  }

  const markDone = async (item: ComplianceItem) => {
    const next =
      item.recurrence === 'once'
        ? `Mark ${item.tag} done? A one-off retires — there is no next date.`
        : `Mark ${item.tag} done? The next due date rolls forward from ${fullDate(item.nextDueDate)}, not from today.`
    if (!confirm(next)) return
    try {
      await api.post(`/compliance/${item.id}/done`, {})
      reload()
    } catch {
      reload()
    }
  }

  // Grouped by urgency rather than listed flat: the register is read to find
  // out what is late and what is next, in that order.
  const groups = useMemo(() => {
    const rows = items.data ?? []
    const overdue = rows.filter((i) => !i.retired && daysUntil(i.nextDueDate) < 0)
    const soon = rows.filter(
      (i) => !i.retired && daysUntil(i.nextDueDate) >= 0 && daysUntil(i.nextDueDate) <= DUE_SOON_DAYS,
    )
    const later = rows.filter((i) => !i.retired && daysUntil(i.nextDueDate) > DUE_SOON_DAYS)
    const retired = rows.filter((i) => i.retired)
    return [
      { key: 'overdue', label: 'Overdue', rows: overdue },
      { key: 'soon', label: `Due within ${DUE_SOON_DAYS} days`, rows: soon },
      { key: 'later', label: 'Later', rows: later },
      { key: 'retired', label: 'Retired', rows: retired },
    ].filter((g) => g.rows.length > 0)
  }, [items.data])

  const filtered = Boolean(division || category || ownerId)

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Compliance"
        title="Compliance"
        description="Filings, licences, renewals, and audits — what is owed, to whom, by when, and who is responsible."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            + New obligation
          </Button>
        }
      />

      {summary.data && (
        <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Stat
            label="Overdue"
            value={summary.data.overdue}
            tone={summary.data.overdue > 0 ? 'text-alert' : 'text-faint'}
            hint={summary.data.overdue > 0 ? 'past the deadline' : 'nothing late'}
          />
          <Stat
            label={`Due in ${DUE_SOON_DAYS} days`}
            value={summary.data.dueSoon}
            hint="near enough to act on"
          />
          <Stat label="Later" value={summary.data.upcoming} hint="on the register" />
          <Stat
            label="Unowned"
            value={summary.data.unowned}
            tone={summary.data.unowned > 0 ? 'text-alert' : 'text-faint'}
            // The most common way a filing is missed is that everyone assumed
            // somebody else had it.
            hint={summary.data.unowned > 0 ? 'nobody is reminded' : 'all assigned'}
          />
        </div>
      )}

      <Toolbar>
        <FilterSelect
          ariaLabel="Filter by division"
          placeholder="All divisions"
          value={division}
          options={DIVISION_OPTIONS}
          onChange={setDivision}
        />
        <FilterSelect
          ariaLabel="Filter by category"
          placeholder="Any category"
          value={category}
          options={CATEGORY_OPTIONS}
          onChange={setCategory}
        />
        <FilterSelect
          ariaLabel="Filter by owner"
          placeholder="Anyone"
          value={ownerId}
          options={[
            { value: 'unowned', label: 'Nobody' },
            ...(team.data ?? []).map((m) => ({ value: m.id, label: m.name })),
          ]}
          onChange={(v) => setOwnerId(v)}
        />
        <label className="flex items-center gap-1.5 font-mono text-[11px] text-graphite">
          <input
            type="checkbox"
            checked={includeRetired}
            onChange={(e) => setIncludeRetired(e.target.checked)}
            className="accent-ink"
          />
          Show retired
        </label>
        {filtered && (
          <Button
            size="sm"
            onClick={() => {
              setDivision('')
              setCategory('')
              setOwnerId('')
            }}
          >
            Clear
          </Button>
        )}
        <span className="ml-auto font-mono text-[10px] text-faint">
          {pluralise(items.data?.length ?? 0, 'obligation')}
        </span>
      </Toolbar>

      {items.error ? (
        <ErrorState message={items.error} onRetry={items.reload} />
      ) : items.loading ? (
        <Skeleton rows={5} />
      ) : groups.length === 0 ? (
        <EmptyState
          title={filtered ? 'Nothing matches' : 'Nothing on the register'}
          hint={
            filtered
              ? 'Clear the filters to see the rest.'
              : 'Add the filings and renewals the group owes, and they appear on the calendar and the KPI board too.'
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <Panel
              key={group.key}
              title={
                <span className="flex items-baseline gap-1.5">
                  {group.label}
                  <span className="text-faint">{group.rows.length}</span>
                </span>
              }
              bodyClassName="p-0"
            >
              <ul className="divide-y divide-rule">
                {group.rows.map((item) => (
                  <Row
                    key={item.id}
                    item={item}
                    onEdit={() => setEditing(item)}
                    onDone={() => markDone(item)}
                  />
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}

      {editing && (
        <ObligationForm
          item={editing === 'new' ? null : editing}
          team={team.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </>
  )
}

/** Red only once it is actually late. Colour means status, nothing else. */
function dueTone(item: ComplianceItem): { tone: PillTone; text: string } {
  if (item.retired) return { tone: 'neutral', text: 'Retired' }
  const days = daysUntil(item.nextDueDate)
  if (days < 0) return { tone: 'alert', text: `${Math.abs(days)}d overdue` }
  if (days === 0) return { tone: 'alert', text: 'Due today' }
  if (days <= DUE_SOON_DAYS) return { tone: 'pending', text: `in ${days}d` }
  return { tone: 'neutral', text: fullDate(item.nextDueDate) }
}

function Row({
  item,
  onEdit,
  onDone,
}: {
  item: ComplianceItem
  onEdit: () => void
  onDone: () => void
}) {
  const due = dueTone(item)

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
      <span className="h-8 w-[3px] shrink-0 rounded-xs" style={mark(item.division).fill} aria-hidden />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            className="text-[13px] font-medium text-ink underline-offset-2 hover:underline"
          >
            {item.title}
          </button>
          <Tag tag={item.tag} />
          <Pill tone={due.tone}>{due.text}</Pill>
        </div>
        <p className="mt-0.5 font-mono text-[10px] text-faint">
          {COMPLIANCE_CATEGORY_LABEL[item.category]}
          {item.authority && <> · {item.authority}</>} · {RECURRENCE_LABEL[item.recurrence]} ·{' '}
          {item.owner ? (
            item.owner.name
          ) : (
            <span className="text-alert">nobody responsible</span>
          )}
          {item.lastDoneAt && <> · last done {fullDate(item.lastDoneAt)}</>}
        </p>
      </div>

      {!item.retired && (
        <Button size="sm" onClick={onDone}>
          Mark done
        </Button>
      )}
    </li>
  )
}

function ObligationForm({
  item,
  team,
  onClose,
  onSaved,
}: {
  item: ComplianceItem | null
  team: TeamMember[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [division, setDivision] = useState<Division | ''>(item?.division ?? 'tuenx')
  const [category, setCategory] = useState<ComplianceCategory | ''>(item?.category ?? 'filing')
  const [authority, setAuthority] = useState(item?.authority ?? '')
  const [ownerId, setOwnerId] = useState(item?.ownerId ?? '')
  const [recurrence, setRecurrence] = useState<Recurrence | ''>(item?.recurrence ?? 'annual')
  const [nextDueDate, setNextDueDate] = useState(
    item ? dateInputValue(item.nextDueDate) : todayInputValue(),
  )
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = {
        title,
        division,
        category,
        authority,
        ownerId,
        recurrence,
        nextDueDate,
        notes,
      }
      if (item) await api.patch(`/compliance/${item.id}`, body)
      else await api.post('/compliance', body)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!item || !confirm(`Delete ${item.tag}? This cannot be undone.`)) return
    setSaving(true)
    try {
      await api.del(`/compliance/${item.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={item ? 'Edit obligation' : 'New obligation'}
      subtitle={
        item ? (
          <Tag tag={item.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            A tag is issued on save, e.g. TNX-CO013
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <TextField
            label="What is owed"
            value={title}
            onChange={setTitle}
            required
            autoFocus
            placeholder="VAT return"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Division"
              value={division}
              options={DIVISION_OPTIONS}
              onChange={setDivision}
            />
            <SelectField
              label="Category"
              value={category}
              options={CATEGORY_OPTIONS}
              onChange={setCategory}
            />
            <TextField
              label="Authority"
              value={authority}
              onChange={setAuthority}
              placeholder="HMRC, Companies House, ICO…"
              hint="Who requires it. Free text — the list is not knowable in advance."
            />
            <SelectField
              label="Owner"
              value={ownerId}
              placeholder="Nobody"
              options={team.map((m) => ({ value: m.id, label: `${m.name} · ${m.tag}` }))}
              onChange={(v) => setOwnerId(v)}
              hint="An unowned obligation is the kind that gets missed."
            />
            <SelectField
              label="Recurrence"
              value={recurrence}
              options={RECURRENCE_OPTIONS}
              onChange={setRecurrence}
              hint="A one-off retires when done. The rest roll forward."
            />
            <TextField
              label="Next due"
              type="date"
              value={nextDueDate}
              onChange={setNextDueDate}
              required
            />
          </div>

          <TextAreaField label="Notes" value={notes} onChange={setNotes} rows={3} />

          {item && <LinkedRecords type="compliance" id={item.id} />}

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {item && (
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
            {saving ? 'Saving…' : item ? 'Save changes' : 'Add obligation'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}
