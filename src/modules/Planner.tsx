import { useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { pluralise } from '../lib/format.ts'
import {
  DIVISIONS,
  DIVISION_LABEL,
  PLAN_EFFORTS,
  PLAN_EFFORT_LABEL,
  PLAN_EFFORT_WEIGHT,
  PLAN_STATUSES,
  PLAN_STATUS_LABEL,
  type Division,
  type Objective,
  type PlanEffort,
  type PlanItem,
  type PlanStatus,
  type Product,
} from '../types.ts'
import { PageHeader, Toolbar } from '../components/PageHeader.tsx'
import {
  Button,
  ErrorState,
  Panel,
  Pill,
  Skeleton,
  type PillTone,
} from '../components/ui.tsx'
import { FilterSelect, SelectField, TextAreaField, TextField } from '../components/Field.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { Tag } from '../components/Tag.tsx'
import { LinkedRecords } from '../components/LinkedRecords.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))
const STATUS_OPTIONS = PLAN_STATUSES.map((s) => ({ value: s, label: PLAN_STATUS_LABEL[s] }))
const EFFORT_OPTIONS = PLAN_EFFORTS.map((e) => ({ value: e, label: PLAN_EFFORT_LABEL[e] }))

const STATUS_TONE: Record<PlanStatus, PillTone> = {
  planned: 'neutral',
  committed: 'pending',
  in_progress: 'pending',
  done: 'ready',
  dropped: 'neutral',
}

/** The four quarters starting from the current one. */
export function upcomingPeriods(count = 4): string[] {
  const now = new Date()
  let year = now.getFullYear()
  let quarter = Math.floor(now.getMonth() / 3) + 1

  return Array.from({ length: count }, () => {
    const period = `${year}-Q${quarter}`
    quarter += 1
    if (quarter > 4) {
      quarter = 1
      year += 1
    }
    return period
  })
}

/**
 * The quarter planner: what the group intends to do, by period.
 *
 * Deliberately not the task board. A task is work someone is doing now; a plan
 * item is an intention for a period that may never become tasks at all.
 * Merging the two turns the task board into a wishlist.
 *
 * Each column carries a load bar built from rough effort sizes rather than
 * hours. Hours imply a precision nobody has at planning time, and the question
 * a planner has to answer is "is this quarter heavier than the last one", which
 * relative weight answers honestly.
 */
export function Planner() {
  const [division, setDivision] = useState<Division | ''>('')
  const [editing, setEditing] = useState<PlanItem | 'new' | null>(null)
  const [newInPeriod, setNewInPeriod] = useState<string | null>(null)

  const items = useResource<PlanItem[]>(() => api.get('/planner/items', { division }), [division])
  const objectives = useResource<Objective[]>(() => api.get('/okrs'), [])
  const products = useResource<Product[]>(() => api.get('/products'), [])

  /** Columns are the next four quarters, plus any period already in use. */
  const periods = useMemo(() => {
    const set = new Set(upcomingPeriods())
    for (const item of items.data ?? []) set.add(item.period)
    return [...set].sort()
  }, [items.data])

  const columns = useMemo(
    () =>
      periods.map((period) => {
        const inPeriod = (items.data ?? []).filter((i) => i.period === period)
        const load = inPeriod
          .filter((i) => i.status !== 'dropped' && i.status !== 'done')
          .reduce((sum, i) => sum + PLAN_EFFORT_WEIGHT[i.effort], 0)
        return { period, items: inPeriod, load }
      }),
    [periods, items.data],
  )

  const heaviest = Math.max(...columns.map((c) => c.load), 1)

  /** Optimistic: the card moves immediately, and reverts if the API says no. */
  const movePeriod = async (item: PlanItem, period: string) => {
    const previous = items.data ?? []
    items.set(previous.map((i) => (i.id === item.id ? { ...i, period } : i)))
    try {
      await api.patch(`/planner/items/${item.id}`, { period })
    } catch {
      items.set(previous)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Planning"
        title="Planner"
        description="What the group intends to do, by quarter. Drag an item to move it between periods."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            New plan item
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
        {division && (
          <Button size="sm" onClick={() => setDivision('')}>
            Clear
          </Button>
        )}
        <span className="ml-auto font-mono text-[10px] text-faint">
          {pluralise(items.data?.length ?? 0, 'item')} across{' '}
          {pluralise(periods.length, 'period')}
        </span>
      </Toolbar>

      {items.error ? (
        <ErrorState message={items.error} onRetry={items.reload} />
      ) : items.loading ? (
        <Skeleton rows={4} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {columns.map(({ period, items: inPeriod, load }) => (
            <PeriodColumn
              key={period}
              period={period}
              items={inPeriod}
              load={load}
              heaviest={heaviest}
              onDropItem={(id) => {
                const dropped = items.data?.find((i) => i.id === id)
                if (dropped && dropped.period !== period) movePeriod(dropped, period)
              }}
              onEdit={setEditing}
              onAdd={() => {
                setNewInPeriod(period)
                setEditing('new')
              }}
            />
          ))}
        </div>
      )}

      <p className="mt-4 font-mono text-[10px] leading-relaxed text-faint">
        Load is the sum of rough sizes — small 1, medium 3, large 8 — counting only items still
        open. It answers “is this quarter heavier than the last one”, not “how many hours is
        this”.
      </p>

      {editing && (
        <PlanItemForm
          item={editing === 'new' ? null : editing}
          defaultPeriod={newInPeriod ?? upcomingPeriods(1)[0]!}
          objectives={objectives.data ?? []}
          products={products.data ?? []}
          onClose={() => {
            setEditing(null)
            setNewInPeriod(null)
          }}
          onSaved={() => {
            setEditing(null)
            setNewInPeriod(null)
            items.reload()
          }}
        />
      )}
    </>
  )
}

function PeriodColumn({
  period,
  items,
  load,
  heaviest,
  onDropItem,
  onEdit,
  onAdd,
}: {
  period: string
  items: PlanItem[]
  load: number
  heaviest: number
  onDropItem: (id: string) => void
  onEdit: (item: PlanItem) => void
  onAdd: () => void
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <Panel
      title={period}
      subtitle={
        <div className="mt-1 w-full">
          <div className="flex items-baseline justify-between font-mono text-[10px] text-faint">
            <span>{pluralise(items.length, 'item')}</span>
            <span className="tabular-nums">load {load}</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-wash">
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-500"
              style={{ width: `${(load / heaviest) * 100}%` }}
            />
          </div>
        </div>
      }
      actions={
        <Button size="sm" variant="subtle" icon="plus" onClick={onAdd} aria-label={`Add to ${period}`} />
      }
      className={`transition-shadow ${dragOver ? 'shadow-lift' : ''}`}
      bodyClassName="p-2 min-h-32"
    >
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const id = e.dataTransfer.getData('text/plain')
          if (id) onDropItem(id)
        }}
        className="space-y-2"
      >
        {items.length === 0 ? (
          <p className="py-8 text-center font-mono text-[10px] text-faint">Nothing planned</p>
        ) : (
          items.map((item) => <PlanCard key={item.id} item={item} onEdit={() => onEdit(item)} />)
        )}
      </div>
    </Panel>
  )
}

function PlanCard({ item, onEdit }: { item: PlanItem; onEdit: () => void }) {
  const dimmed = item.status === 'dropped' || item.status === 'done'

  return (
    <article
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
      className={`card-interactive relative overflow-hidden rounded-sm py-2.5 pr-2 pl-3.5 ${
        dimmed ? 'opacity-55' : ''
      }`}
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={mark(item.division).fill}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-2">
        <Tag tag={item.tag} />
        <span className="flex items-center gap-1">
          <Pill>{PLAN_EFFORT_LABEL[item.effort]}</Pill>
          <Pill tone={STATUS_TONE[item.status]}>{PLAN_STATUS_LABEL[item.status]}</Pill>
        </span>
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="mt-2 block w-full text-left text-[13px] leading-snug text-ink underline-offset-2 hover:underline"
      >
        {item.title}
      </button>

      {(item.objective || item.product) && (
        <p className="mt-1.5 flex flex-wrap items-center gap-1 font-mono text-[10px] text-faint">
          {item.objective && <Tag tag={item.objective.tag} />}
          {item.product && <Tag tag={item.product.tag} />}
          <span className="truncate">
            {item.objective?.title ?? item.product?.name}
          </span>
        </p>
      )}

      {item.owner && (
        <p className="mt-1 font-mono text-[10px] text-faint">{item.owner}</p>
      )}

      {item.ideaId && (
        <p className="mt-1 font-mono text-[10px] text-faint">From a brainstorm</p>
      )}
    </article>
  )
}

function PlanItemForm({
  item,
  defaultPeriod,
  objectives,
  products,
  onClose,
  onSaved,
}: {
  item: PlanItem | null
  defaultPeriod: string
  objectives: Objective[]
  products: Product[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [division, setDivision] = useState<Division | ''>(item?.division ?? 'tuenx')
  const [period, setPeriod] = useState(item?.period ?? defaultPeriod)
  const [status, setStatus] = useState<PlanStatus | ''>(item?.status ?? 'planned')
  const [effort, setEffort] = useState<PlanEffort | ''>(item?.effort ?? 'm')
  const [owner, setOwner] = useState(item?.owner ?? '')
  const [objectiveId, setObjectiveId] = useState(item?.objectiveId ?? '')
  const [productId, setProductId] = useState(item?.productId ?? '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title,
        division,
        period,
        status,
        effort,
        owner,
        objectiveId,
        productId,
        notes,
      }
      if (item) await api.patch(`/planner/items/${item.id}`, payload)
      else await api.post('/planner/items', payload)
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
      await api.del(`/planner/items/${item.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={item ? 'Edit plan item' : 'New plan item'}
      subtitle={
        item ? (
          <Tag tag={item.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            A tag is issued on save, e.g. TNX-Q004
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-5 py-5">
          <TextField
            label="What"
            value={title}
            onChange={setTitle}
            required
            autoFocus
            placeholder="The thing you intend to do"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Division"
              value={division}
              options={DIVISION_OPTIONS}
              onChange={setDivision}
            />
            <TextField
              label="Period"
              value={period}
              onChange={setPeriod}
              required
              hint="2026-Q3, 2026-H2 — matches OKR periods."
            />
            <SelectField
              label="Status"
              value={status}
              options={STATUS_OPTIONS}
              onChange={setStatus}
            />
            <SelectField
              label="Size"
              value={effort}
              options={EFFORT_OPTIONS}
              onChange={setEffort}
              hint="Rough, not hours."
            />
          </div>

          <TextField label="Owner" value={owner} onChange={setOwner} placeholder="Who carries it" />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Serves objective"
              value={objectiveId}
              placeholder="Not linked"
              options={objectives.map((o) => ({
                value: o.id,
                label: `${o.title} · ${o.tag}`,
              }))}
              onChange={(v) => setObjectiveId(v)}
            />
            <SelectField
              label="For product"
              value={productId}
              placeholder="Not linked"
              options={products.map((p) => ({ value: p.id, label: `${p.name} · ${p.tag}` }))}
              onChange={(v) => setProductId(v)}
            />
          </div>

          <TextAreaField label="Notes" value={notes} onChange={setNotes} rows={4} />

          {item && <LinkedRecords type="plan" id={item.id} />}

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {item && (
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
            {saving ? 'Saving…' : item ? 'Save changes' : 'Add to plan'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}
