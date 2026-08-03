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
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TICKET_KINDS,
  TICKET_KIND_LABEL,
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  type Product,
  type Release,
  type RoadmapItem,
  type RoadmapStatus,
  type TaskPriority,
  type Ticket,
  type TicketKind,
  type TicketStatus,
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
import { LinkedRecords } from '../components/LinkedRecords.tsx'
import { SelectField, TextAreaField, TextField } from '../components/Field.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { Tag } from '../components/Tag.tsx'
import { PRODUCT_STATUS_TONE, ProductForm, ProductLinks } from './Products.tsx'
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
            <ProductLinks product={p} />
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

      <Issues productId={productId} />

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
                className="relative overflow-hidden rounded-sm border border-rule bg-surface py-2 pr-2 pl-3 transition-colors hover:border-ink"
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

/* -------------------------------------------------------------------------- */
/* Issues — bugs, issues, feature requests                                    */
/* -------------------------------------------------------------------------- */

const TICKET_KIND_TONE: Record<TicketKind, PillTone> = {
  bug: 'alert',
  issue: 'pending',
  feature: 'neutral',
}

/**
 * Phase 7's queue, on the product it belongs to.
 *
 * One list for bugs, issues, and feature requests rather than three. They
 * compete for the same week of the same engineer, and a separate bug tracker
 * is how a bug list becomes something nobody opens. The kind is a chip, not a
 * filing cabinet.
 *
 * Resolved tickets are hidden by default and counted in the header — history
 * that has to be asked for, since the useful question is almost always "what
 * is still open".
 */
function Issues({ productId }: { productId: string }) {
  const [showResolved, setShowResolved] = useState(false)
  const [editing, setEditing] = useState<Ticket | 'new' | null>(null)

  const tickets = useResource<Ticket[]>(() => api.get('/tickets', { productId }), [productId])

  const all = tickets.data ?? []
  const open = all.filter((t) => t.status !== 'resolved')
  const shown = showResolved ? all : open
  const bugs = open.filter((t) => t.kind === 'bug').length

  const move = async (ticket: Ticket, status: TicketStatus) => {
    const previous = all
    tickets.set(previous.map((t) => (t.id === ticket.id ? { ...t, status } : t)))
    try {
      await api.patch(`/tickets/${ticket.id}`, { status })
    } catch {
      tickets.set(previous)
    }
  }

  return (
    <>
      <Panel
        className="mb-6"
        title="Issues"
        subtitle={
          <span className="font-mono text-[10px] text-faint">
            {open.length} open
            {bugs > 0 && <span className="text-alert"> · {pluralise(bugs, 'bug')}</span>}
            {all.length > open.length && ` · ${all.length - open.length} resolved`}
          </span>
        }
        actions={
          <>
            {all.length > open.length && (
              <Button size="sm" variant="subtle" onClick={() => setShowResolved((v) => !v)}>
                {showResolved ? 'Hide resolved' : 'Show resolved'}
              </Button>
            )}
            <Button size="sm" onClick={() => setEditing('new')}>
              + Report
            </Button>
          </>
        }
        bodyClassName="p-0"
      >
        {tickets.error ? (
          <div className="p-4">
            <ErrorState message={tickets.error} onRetry={tickets.reload} />
          </div>
        ) : tickets.loading ? (
          <div className="p-4">
            <Skeleton rows={2} />
          </div>
        ) : shown.length === 0 ? (
          <p className="px-4 py-8 text-center font-mono text-[11px] text-faint">
            {all.length === 0
              ? 'Nothing reported. Bugs, issues, and feature requests all land here.'
              : 'Nothing open.'}
          </p>
        ) : (
          <ul className="divide-y divide-rule-soft">
            {shown.map((ticket) => (
              <li key={ticket.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <Tag tag={ticket.tag} />
                <Pill tone={TICKET_KIND_TONE[ticket.kind]}>{TICKET_KIND_LABEL[ticket.kind]}</Pill>

                <button
                  type="button"
                  onClick={() => setEditing(ticket)}
                  className={`min-w-0 flex-1 basis-64 truncate text-left text-[13px] underline-offset-2 hover:underline ${
                    ticket.status === 'resolved' ? 'text-faint line-through' : 'text-ink'
                  }`}
                >
                  {ticket.subject}
                </button>

                <span className="shrink-0 font-mono text-[10px] text-faint">
                  {ticket.customerContact ?? '—'}
                </span>
                <Pill tone={ticket.priority === 'high' ? 'alert' : 'neutral'}>
                  {TASK_PRIORITY_LABEL[ticket.priority]}
                </Pill>
                <Pill tone={ticket.status === 'resolved' ? 'ready' : 'pending'}>
                  {TICKET_STATUS_LABEL[ticket.status]}
                </Pill>

                <span className="flex shrink-0 gap-1 font-mono text-[10px]">
                  <MoveButton
                    label={`Move ${ticket.tag} back`}
                    disabled={TICKET_STATUSES.indexOf(ticket.status) === 0}
                    onClick={() =>
                      move(ticket, TICKET_STATUSES[TICKET_STATUSES.indexOf(ticket.status) - 1]!)
                    }
                  >
                    ←
                  </MoveButton>
                  <MoveButton
                    label={`Move ${ticket.tag} forward`}
                    disabled={TICKET_STATUSES.indexOf(ticket.status) === TICKET_STATUSES.length - 1}
                    onClick={() =>
                      move(ticket, TICKET_STATUSES[TICKET_STATUSES.indexOf(ticket.status) + 1]!)
                    }
                  >
                    →
                  </MoveButton>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {editing && (
        <TicketForm
          productId={productId}
          ticket={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            tickets.reload()
          }}
        />
      )}
    </>
  )
}

function TicketForm({
  productId,
  ticket,
  onClose,
  onSaved,
}: {
  productId: string
  ticket: Ticket | null
  onClose: () => void
  onSaved: () => void
}) {
  const [subject, setSubject] = useState(ticket?.subject ?? '')
  const [body, setBody] = useState(ticket?.body ?? '')
  const [kind, setKind] = useState<TicketKind | ''>(ticket?.kind ?? 'bug')
  const [status, setStatus] = useState<TicketStatus | ''>(ticket?.status ?? 'open')
  const [priority, setPriority] = useState<TaskPriority | ''>(ticket?.priority ?? 'medium')
  const [customerContact, setCustomerContact] = useState(ticket?.customerContact ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = { productId, subject, body, kind, status, priority, customerContact }
      if (ticket) await api.patch(`/tickets/${ticket.id}`, payload)
      else await api.post('/tickets', payload)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!ticket || !confirm(`Delete ${ticket.tag}? This cannot be undone.`)) return
    setSaving(true)
    try {
      await api.del(`/tickets/${ticket.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={ticket ? 'Edit issue' : 'Report an issue'}
      subtitle={
        ticket ? (
          <Tag tag={ticket.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">Tagged on save, e.g. GPH-S004</span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-4 py-4">
          <TextField label="Subject" value={subject} onChange={setSubject} required autoFocus />

          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label="Kind"
              value={kind}
              options={TICKET_KINDS.map((k) => ({ value: k, label: TICKET_KIND_LABEL[k] }))}
              onChange={setKind}
            />
            <SelectField
              label="Status"
              value={status}
              options={TICKET_STATUSES.map((t) => ({ value: t, label: TICKET_STATUS_LABEL[t] }))}
              onChange={setStatus}
            />
            <SelectField
              label="Priority"
              value={priority}
              options={TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABEL[p] }))}
              onChange={setPriority}
            />
          </div>

          <TextField
            label="Reported by"
            value={customerContact}
            onChange={setCustomerContact}
            placeholder="Name or email"
            hint="Free text until the customer base exists — a reporter who is not a tracked customer still has to go somewhere."
          />

          <TextAreaField
            label="Detail"
            value={body}
            onChange={setBody}
            rows={5}
            placeholder="What happened, and what should have happened."
          />

          {ticket && <LinkedRecords type="ticket" id={ticket.id} />}

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {ticket && (
            <Button type="button" variant="danger" onClick={remove} disabled={saving} className="mr-auto">
              Delete
            </Button>
          )}
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : ticket ? 'Save changes' : 'Report it'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}
