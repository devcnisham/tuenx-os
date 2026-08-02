import { useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { href, navigate } from '../lib/router.ts'
import { dateInputValue, fullDate, pluralise, todayInputValue } from '../lib/format.ts'
import { mark } from '../lib/divisions.ts'
import {
  PRODUCT_STATUS_LABEL,
  ROADMAP_STATUSES,
  ROADMAP_STATUS_LABEL,
  type Product,
  type Release,
  type RoadmapItem,
  type RoadmapStatus,
} from '../types.ts'
import { Button, EmptyState, ErrorState, Panel, Pill, Skeleton } from '../components/ui.tsx'
import { SelectField, TextAreaField, TextField } from '../components/Field.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { Tag } from '../components/Tag.tsx'
import { PRODUCT_STATUS_TONE, ProductForm } from './Products.tsx'
import { MoveButton } from './Tasks.tsx'

const ROADMAP_OPTIONS = ROADMAP_STATUSES.map((s) => ({ value: s, label: ROADMAP_STATUS_LABEL[s] }))

/**
 * PRD §6 Phase 2 and the workflow in PRD §7: the Gaphatch team creates a
 * roadmap item under a product, moves it backlog → building → shipped, and
 * logs it in the release notes. Both live on this one screen so that whole
 * loop happens without navigating away.
 *
 * Each of the three resources loads independently (TRD §6) — a failed release
 * log still leaves the roadmap usable.
 */
export function ProductDetail({ productId }: { productId: string }) {
  const product = useResource<Product>(() => api.get(`/products/${productId}`), [productId])
  const roadmap = useResource<RoadmapItem[]>(() => api.get('/roadmap', { productId }), [productId])
  const releases = useResource<Release[]>(() => api.get('/releases', { productId }), [productId])

  const [editingProduct, setEditingProduct] = useState(false)
  const [editingItem, setEditingItem] = useState<RoadmapItem | 'new' | null>(null)
  const [editingRelease, setEditingRelease] = useState<Release | 'new' | null>(null)

  const columns = useMemo(
    () =>
      ROADMAP_STATUSES.map((status) => ({
        status,
        items: (roadmap.data ?? []).filter((i) => i.status === status),
      })),
    [roadmap.data],
  )

  const moveItem = async (item: RoadmapItem, status: RoadmapStatus) => {
    const previous = roadmap.data ?? []
    roadmap.set(previous.map((i) => (i.id === item.id ? { ...i, status } : i)))
    try {
      await api.patch(`/roadmap/${item.id}`, { status })
      // The header's shipped count is derived from these, so refresh it.
      product.reload()
    } catch {
      roadmap.set(previous)
    }
  }

  if (product.error) {
    return (
      <>
        <BackLink />
        <ErrorState message={product.error} onRetry={product.reload} />
      </>
    )
  }

  if (product.loading || !product.data) {
    return (
      <>
        <BackLink />
        <Skeleton rows={4} />
      </>
    )
  }

  const p = product.data

  return (
    <>
      <BackLink />

      <header className="mb-5 border-b border-ink pb-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tag={p.tag} size="md" />
              <Pill tone={PRODUCT_STATUS_TONE[p.status]}>{PRODUCT_STATUS_LABEL[p.status]}</Pill>
            </div>
            <h1 className="mt-2 font-display text-3xl leading-none font-semibold tracking-tight text-ink">
              {p.name}
            </h1>
            {p.description && (
              <p className="mt-2 max-w-2xl text-sm leading-snug text-graphite">{p.description}</p>
            )}
            <p className="mt-2 font-mono text-[10px] text-faint">
              {p.counts.roadmapShipped}/{p.counts.roadmapTotal} roadmap items shipped ·{' '}
              {pluralise(p.counts.releases, 'release')}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button onClick={() => setEditingProduct(true)}>Edit product</Button>
            <Button variant="primary" onClick={() => setEditingItem('new')}>
              + Roadmap item
            </Button>
          </div>
        </div>
      </header>

      <section className="mb-6">
        {roadmap.error ? (
          <ErrorState message={roadmap.error} onRetry={roadmap.reload} />
        ) : roadmap.loading ? (
          <Skeleton rows={3} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {columns.map(({ status, items }) => (
              <RoadmapColumn
                key={status}
                status={status}
                items={items}
                onDropItem={(id) => {
                  const dropped = roadmap.data?.find((i) => i.id === id)
                  if (dropped && dropped.status !== status) moveItem(dropped, status)
                }}
                onMove={moveItem}
                onEdit={setEditingItem}
              />
            ))}
          </div>
        )}
      </section>

      <Panel
        title="Releases"
        subtitle={<span className="font-mono text-[10px] text-faint">Newest first</span>}
        actions={
          <Button size="sm" onClick={() => setEditingRelease('new')}>
            + Log release
          </Button>
        }
        bodyClassName="p-4"
      >
        {releases.error ? (
          <ErrorState message={releases.error} onRetry={releases.reload} />
        ) : releases.loading ? (
          <Skeleton rows={2} />
        ) : (releases.data ?? []).length === 0 ? (
          <EmptyState
            title="No releases logged"
            hint="Log one when something ships, so the changelog writes itself over time."
          />
        ) : (
          <ol className="divide-y divide-rule">
            {releases.data!.map((release) => (
              <li key={release.id} className="flex gap-4 py-3 first:pt-0 last:pb-0">
                {/* The version is the anchor — set in display, hung on the spine. */}
                <span className="w-16 shrink-0 font-display text-lg leading-none font-semibold tabular-nums text-ink">
                  {release.version}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag tag={release.tag} />
                    <span className="font-mono text-[10px] text-faint">
                      {fullDate(release.date)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingRelease(release)}
                      className="ml-auto font-mono text-[10px] text-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  {release.notes && (
                    <p className="mt-1 text-[13px] leading-snug text-graphite">{release.notes}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {editingProduct && (
        <ProductForm
          product={p}
          onClose={() => setEditingProduct(false)}
          onSaved={() => {
            setEditingProduct(false)
            product.reload()
          }}
          onDeleted={() => navigate('products')}
        />
      )}

      {editingItem && (
        <RoadmapItemForm
          productId={productId}
          item={editingItem === 'new' ? null : editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null)
            roadmap.reload()
            product.reload()
          }}
        />
      )}

      {editingRelease && (
        <ReleaseForm
          productId={productId}
          release={editingRelease === 'new' ? null : editingRelease}
          onClose={() => setEditingRelease(null)}
          onSaved={() => {
            setEditingRelease(null)
            releases.reload()
            product.reload()
          }}
        />
      )}
    </>
  )
}

function BackLink() {
  return (
    <a
      href={href('products')}
      className="mb-4 inline-block font-mono text-[10px] tracking-wider text-graphite uppercase underline-offset-2 transition-colors hover:text-ink hover:underline"
    >
      ← All products
    </a>
  )
}

function RoadmapColumn({
  status,
  items,
  onDropItem,
  onMove,
  onEdit,
}: {
  status: RoadmapStatus
  items: RoadmapItem[]
  onDropItem: (id: string) => void
  onMove: (item: RoadmapItem, status: RoadmapStatus) => void
  onEdit: (item: RoadmapItem) => void
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <Panel
      title={
        <span className="flex items-baseline gap-1.5">
          {ROADMAP_STATUS_LABEL[status]}
          <span className="text-faint">{items.length}</span>
        </span>
      }
      className={`transition-colors ${dragOver ? 'border-ink' : ''}`}
      bodyClassName="p-2 min-h-24"
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
        className="space-y-1.5"
      >
        {items.length === 0 ? (
          <p className="py-6 text-center font-mono text-[10px] text-faint">Nothing here</p>
        ) : (
          items.map((item) => {
            const index = ROADMAP_STATUSES.indexOf(item.status)
            return (
              <article
                key={item.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
                className="relative overflow-hidden rounded-[3px] border border-rule bg-paper py-2 pr-2 pl-3 transition-colors hover:border-ink"
              >
                {/* Roadmap items belong to Gaphatch products — the dotted mark. */}
                <span
                  className="absolute inset-y-0 left-0 w-[3px]"
                  style={mark('gaphatch').fill}
                  aria-hidden
                />

                <Tag tag={item.tag} />
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="mt-1.5 block w-full text-left text-[13px] leading-snug text-ink underline-offset-2 hover:underline"
                >
                  {item.title}
                </button>

                <div className="mt-1.5 flex justify-end gap-1 font-mono text-[10px]">
                  <MoveButton
                    label={`Move ${item.tag} back`}
                    disabled={index === 0}
                    onClick={() => onMove(item, ROADMAP_STATUSES[index - 1]!)}
                  >
                    ←
                  </MoveButton>
                  <MoveButton
                    label={`Move ${item.tag} forward`}
                    disabled={index === ROADMAP_STATUSES.length - 1}
                    onClick={() => onMove(item, ROADMAP_STATUSES[index + 1]!)}
                  >
                    →
                  </MoveButton>
                </div>
              </article>
            )
          })
        )}
      </div>
    </Panel>
  )
}

function RoadmapItemForm({
  productId,
  item,
  onClose,
  onSaved,
}: {
  productId: string
  item: RoadmapItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [status, setStatus] = useState<RoadmapStatus | ''>(item?.status ?? 'backlog')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (item) await api.patch(`/roadmap/${item.id}`, { title, status })
      else await api.post('/roadmap', { productId, title, status })
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
      await api.del(`/roadmap/${item.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={item ? 'Edit roadmap item' : 'New roadmap item'}
      subtitle={
        item ? (
          <Tag tag={item.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            A tag is issued on save, e.g. GPH-R008
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-4 py-4">
          <TextField label="Title" value={title} onChange={setTitle} required autoFocus />
          <SelectField label="Status" value={status} options={ROADMAP_OPTIONS} onChange={setStatus} />
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
            {saving ? 'Saving…' : item ? 'Save changes' : 'Add item'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}

function ReleaseForm({
  productId,
  release,
  onClose,
  onSaved,
}: {
  productId: string
  release: Release | null
  onClose: () => void
  onSaved: () => void
}) {
  const [version, setVersion] = useState(release?.version ?? '')
  const [date, setDate] = useState(release ? dateInputValue(release.date) : todayInputValue())
  const [notes, setNotes] = useState(release?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (release) await api.patch(`/releases/${release.id}`, { version, date, notes })
      else await api.post('/releases', { productId, version, date, notes })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!release || !confirm(`Delete release ${release.version}? This cannot be undone.`)) return
    setSaving(true)
    try {
      await api.del(`/releases/${release.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={release ? 'Edit release' : 'Log release'}
      subtitle={
        release ? (
          <Tag tag={release.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            A tag is issued on save, e.g. GPH-V004
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Version"
              value={version}
              onChange={setVersion}
              required
              autoFocus
              placeholder="0.4.0"
            />
            <TextField label="Date" type="date" value={date} onChange={setDate} required />
          </div>
          <TextAreaField
            label="Notes"
            value={notes}
            onChange={setNotes}
            rows={4}
            placeholder="What shipped, in the words you'd use telling a customer."
          />
          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {release && (
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
            {saving ? 'Saving…' : release ? 'Save changes' : 'Log release'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}
