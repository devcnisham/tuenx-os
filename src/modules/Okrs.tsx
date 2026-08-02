import { useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { pluralise } from '../lib/format.ts'
import {
  DIVISIONS,
  DIVISION_LABEL,
  KEY_RESULT_STATUSES,
  KEY_RESULT_STATUS_LABEL,
  OBJECTIVE_SCOPES,
  type Division,
  type KeyResult,
  type KeyResultStatus,
  type Objective,
  type ObjectiveScope,
  type Product,
} from '../types.ts'
import { PageHeader, Toolbar } from '../components/PageHeader.tsx'
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
import { Icon } from '../components/Icon.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))
const KR_STATUS_OPTIONS = KEY_RESULT_STATUSES.map((s) => ({
  value: s,
  label: KEY_RESULT_STATUS_LABEL[s],
}))

/** Colour is status, and a key result's status is exactly that. */
const KR_TONE: Record<KeyResultStatus, PillTone> = {
  on_track: 'ready',
  at_risk: 'pending',
  off_track: 'alert',
  done: 'ready',
}

/** Current quarter, for prefilling the period on a new objective. */
function currentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`
}

/**
 * PRD §6 Phase 5: objectives with key results, scoped to the group, a
 * division, or one Gaphatch product, tracked per period.
 *
 * Progress is derived from the key results rather than typed in — an
 * objective whose stated progress can disagree with its measurements is worse
 * than no progress bar at all.
 */
export function Okrs() {
  const [division, setDivision] = useState<Division | ''>('')
  const [period, setPeriod] = useState('')
  const [editing, setEditing] = useState<Objective | 'new' | null>(null)
  const [addingKrTo, setAddingKrTo] = useState<Objective | null>(null)
  const [editingKr, setEditingKr] = useState<KeyResult | null>(null)

  const objectives = useResource<Objective[]>(
    () => api.get('/okrs', { division, period }),
    [division, period],
  )
  const products = useResource<Product[]>(() => api.get('/products'), [])

  const periods = useMemo(() => {
    const seen = new Set((objectives.data ?? []).map((o) => o.period))
    seen.add(currentPeriod())
    return [...seen].sort().reverse().map((p) => ({ value: p, label: p }))
  }, [objectives.data])

  const reload = () => objectives.reload()

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Goals"
        title="OKRs"
        description="What the group is trying to achieve this period, and the measurements that say whether it is happening."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            New objective
          </Button>
        }
      />

      <Toolbar>
        <FilterSelect
          ariaLabel="Filter by division"
          placeholder="All divisions"
          value={division}
          options={DIVISION_OPTIONS}
          onChange={setDivision}
        />
        <FilterSelect
          ariaLabel="Filter by period"
          placeholder="All periods"
          value={period}
          options={periods}
          onChange={(v) => setPeriod(v)}
        />
        {(division || period) && (
          <Button
            size="sm"
            onClick={() => {
              setDivision('')
              setPeriod('')
            }}
          >
            Clear
          </Button>
        )}
        <span className="ml-auto font-mono text-[10px] text-faint">
          {pluralise(objectives.data?.length ?? 0, 'objective')}
        </span>
      </Toolbar>

      {objectives.error ? (
        <ErrorState message={objectives.error} onRetry={objectives.reload} />
      ) : objectives.loading ? (
        <Skeleton rows={3} />
      ) : (objectives.data ?? []).length === 0 ? (
        <EmptyState
          icon="okrs"
          title="No objectives set"
          hint="Write down what would make this period a success, then the two or three numbers that would prove it."
          action={{ label: 'New objective', onClick: () => setEditing('new') }}
        />
      ) : (
        <div className="space-y-4">
          {objectives.data!.map((objective) => (
            <ObjectiveCard
              key={objective.id}
              objective={objective}
              onEdit={() => setEditing(objective)}
              onAddKr={() => setAddingKrTo(objective)}
              onEditKr={setEditingKr}
              onChanged={reload}
            />
          ))}
        </div>
      )}

      {editing && (
        <ObjectiveForm
          objective={editing === 'new' ? null : editing}
          products={products.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}

      {(addingKrTo || editingKr) && (
        <KeyResultForm
          objectiveId={addingKrTo?.id ?? editingKr!.objectiveId}
          keyResult={editingKr}
          onClose={() => {
            setAddingKrTo(null)
            setEditingKr(null)
          }}
          onSaved={() => {
            setAddingKrTo(null)
            setEditingKr(null)
            reload()
          }}
        />
      )}
    </>
  )
}

function ObjectiveCard({
  objective,
  onEdit,
  onAddKr,
  onEditKr,
  onChanged,
}: {
  objective: Objective
  onEdit: () => void
  onAddKr: () => void
  onEditKr: (kr: KeyResult) => void
  onChanged: () => void
}) {
  const pct = Math.round(objective.progress * 100)

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Tag tag={objective.tag} />
          <span>{objective.period}</span>
          {objective.product && (
            <span className="normal-case">· {objective.product.name}</span>
          )}
        </span>
      }
      actions={
        <>
          <Button size="sm" icon="plus" onClick={onAddKr}>
            Key result
          </Button>
          <Button size="sm" icon="edit" onClick={onEdit}>
            Edit
          </Button>
        </>
      }
      bodyClassName="p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-72">
          <h3 className="font-display text-xl leading-tight font-semibold text-ink">
            {objective.title}
          </h3>
          <p className="mt-1.5 font-mono text-[10px] text-faint">
            {DIVISION_LABEL[objective.division]}
            {objective.owner && ` · ${objective.owner}`}
          </p>
        </div>

        <div className="w-40 shrink-0">
          <div className="flex items-baseline justify-between">
            <span className="label-mono">Progress</span>
            <span
              className={`font-display text-lg leading-none font-semibold tabular-nums ${
                mark(objective.division).text
              }`}
            >
              {pct}%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-wash">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${pct}%`, ...mark(objective.division).fill }}
            />
          </div>
          <p className="mt-1.5 font-mono text-[10px] text-faint">
            averaged across {pluralise(objective.keyResults.length, 'key result')}
          </p>
        </div>
      </div>

      {objective.keyResults.length === 0 ? (
        <p className="mt-5 flex items-center gap-2 border-t border-rule-soft pt-4 font-mono text-[11px] text-faint">
          <Icon name="alert" size={13} />
          No key results yet — this objective has nothing measuring it.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-rule-soft border-t border-rule-soft">
          {objective.keyResults.map((kr) => (
            <KeyResultRow
              key={kr.id}
              keyResult={kr}
              division={objective.division}
              onEdit={() => onEditKr(kr)}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </Panel>
  )
}

function KeyResultRow({
  keyResult,
  division,
  onEdit,
  onChanged,
}: {
  keyResult: KeyResult
  division: Division
  onEdit: () => void
  onChanged: () => void
}) {
  const ratio =
    keyResult.targetValue === 0
      ? keyResult.currentValue > 0
        ? 1
        : 0
      : Math.min(keyResult.currentValue / keyResult.targetValue, 1)

  const fmt = (n: number) =>
    `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })}${keyResult.unit ?? ''}`

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex items-center gap-2">
          <Tag tag={keyResult.tag} />
          <Pill tone={KR_TONE[keyResult.status]}>
            {KEY_RESULT_STATUS_LABEL[keyResult.status]}
          </Pill>
        </div>
        <p className="mt-1.5 text-sm text-ink">{keyResult.title}</p>
      </div>

      <div className="w-44 shrink-0">
        <div className="flex items-baseline justify-between font-mono text-[11px]">
          <span className="tabular-nums text-ink">{fmt(keyResult.currentValue)}</span>
          <span className="tabular-nums text-faint">of {fmt(keyResult.targetValue)}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-wash">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${ratio * 100}%`, ...mark(division).fill }}
          />
        </div>
      </div>

      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="subtle" onClick={onEdit}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="subtle"
          onClick={async () => {
            if (!confirm(`Delete ${keyResult.tag}?`)) return
            await api.del(`/okrs/key-results/${keyResult.id}`)
            onChanged()
          }}
        >
          <Icon name="trash" size={13} />
        </Button>
      </div>
    </li>
  )
}

function ObjectiveForm({
  objective,
  products,
  onClose,
  onSaved,
}: {
  objective: Objective | null
  products: Product[]
  onClose: () => void
  onSaved: () => void
}) {
  const [scopeKind, setScopeKind] = useState<ObjectiveScope | ''>(
    objective?.scopeKind ?? 'division',
  )
  const [division, setDivision] = useState<Division | ''>(objective?.division ?? 'tuenx')
  const [productId, setProductId] = useState(objective?.productId ?? '')
  const [title, setTitle] = useState(objective?.title ?? '')
  const [period, setPeriod] = useState(objective?.period ?? currentPeriod())
  const [owner, setOwner] = useState(objective?.owner ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = { scopeKind, division, productId, title, period, owner }
      if (objective) await api.patch(`/okrs/${objective.id}`, payload)
      else await api.post('/okrs', payload)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!objective) return
    if (
      !confirm(
        `Delete ${objective.title} (${objective.tag})?\n\n` +
          `Its ${pluralise(objective.keyResults.length, 'key result')} go with it.`,
      )
    )
      return
    setSaving(true)
    try {
      await api.del(`/okrs/${objective.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={objective ? 'Edit objective' : 'New objective'}
      subtitle={
        objective ? (
          <Tag tag={objective.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            A tag is issued on save, e.g. TNX-O003
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-5 py-5">
          <TextField
            label="Objective"
            value={title}
            onChange={setTitle}
            required
            autoFocus
            placeholder="What would make this period a success?"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Scope"
              value={scopeKind}
              options={OBJECTIVE_SCOPES.map((s) => ({
                value: s,
                label: s === 'division' ? 'A division' : 'One product',
              }))}
              onChange={(v) => setScopeKind(v)}
            />
            <TextField
              label="Period"
              value={period}
              onChange={setPeriod}
              required
              hint="2026-Q3, 2026-H2 — whatever you actually run."
            />
          </div>

          {scopeKind === 'product' ? (
            <SelectField
              label="Product"
              value={productId}
              options={products.map((p) => ({ value: p.id, label: `${p.name} · ${p.tag}` }))}
              onChange={(v) => setProductId(v)}
              hint="Products are Gaphatch-only, so this objective is tagged GPH."
            />
          ) : (
            <SelectField
              label="Division"
              value={division}
              options={DIVISION_OPTIONS}
              onChange={setDivision}
              hint="Tuenx covers group-level goals."
            />
          )}

          <TextField label="Owner" value={owner} onChange={setOwner} placeholder="Who carries it" />

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {objective && (
            <Button
              type="button"
              variant="danger"
              icon="trash"
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
            {saving ? 'Saving…' : objective ? 'Save changes' : 'Create objective'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}

function KeyResultForm({
  objectiveId,
  keyResult,
  onClose,
  onSaved,
}: {
  objectiveId: string
  keyResult: KeyResult | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(keyResult?.title ?? '')
  const [targetValue, setTargetValue] = useState(String(keyResult?.targetValue ?? ''))
  const [currentValue, setCurrentValue] = useState(String(keyResult?.currentValue ?? '0'))
  const [unit, setUnit] = useState(keyResult?.unit ?? '')
  const [status, setStatus] = useState<KeyResultStatus | ''>(keyResult?.status ?? 'on_track')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title,
        targetValue: targetValue === '' ? 0 : Number(targetValue),
        currentValue: currentValue === '' ? 0 : Number(currentValue),
        unit,
        status,
      }
      if (keyResult) await api.patch(`/okrs/key-results/${keyResult.id}`, payload)
      else await api.post(`/okrs/${objectiveId}/key-results`, payload)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={keyResult ? 'Edit key result' : 'New key result'}
      subtitle={
        keyResult ? (
          <Tag tag={keyResult.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            The measurement that proves the objective
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-5 py-5">
          <TextField
            label="Key result"
            value={title}
            onChange={setTitle}
            required
            autoFocus
            placeholder="Ship Scholr to 400 paying seats"
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Current"
              type="number"
              min={0}
              value={currentValue}
              onChange={setCurrentValue}
            />
            <TextField
              label="Target"
              type="number"
              min={0}
              value={targetValue}
              onChange={setTargetValue}
              required
            />
            <TextField
              label="Unit"
              value={unit}
              onChange={setUnit}
              placeholder="%, seats, $"
            />
          </div>

          <SelectField
            label="Status"
            value={status}
            options={KR_STATUS_OPTIONS}
            onChange={setStatus}
            hint="Progress comes from the numbers. Status is your read on whether it will land."
          />

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : keyResult ? 'Save changes' : 'Add key result'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}
