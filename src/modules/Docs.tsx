import { useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { useRecordLayout } from '../lib/recordLayout.ts'
import { fullDate, pluralise } from '../lib/format.ts'
import {
  DIVISIONS,
  DIVISION_LABEL,
  DOC_CATEGORIES,
  type Division,
  type Doc,
} from '../types.ts'
import { PageHeader, Toolbar } from '../components/PageHeader.tsx'
import { LayoutSwitch } from '../components/LayoutSwitch.tsx'
import { Button, EmptyState, ErrorState, Panel, Pill, Skeleton } from '../components/ui.tsx'
import { FilterSelect, SelectField, TextAreaField, TextField } from '../components/Field.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { Tag } from '../components/Tag.tsx'
import { LinkedRecords } from '../components/LinkedRecords.tsx'
import { Icon } from '../components/Icon.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))

/** Index rows omit the body — see the docs route. */
type DocSummary = Omit<Doc, 'body'>

/**
 * PRD §6 Phase 5: docs and knowledge base for SOPs, playbooks, onboarding, and
 * policies, tagged by division.
 *
 * PRD §9 flags the real risk here — a knowledge base is only as good as the
 * discipline to keep it current. Two things push against that: the index
 * sorts by last-updated so stale pages sink, and every row shows its age, so
 * a page nobody has touched in months says so.
 */
export function Docs() {
  const [division, setDivision] = useState<Division | ''>('')
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Doc | 'new' | null>(null)
  const [reading, setReading] = useState<string | null>(null)
  const [layout, setLayout] = useRecordLayout('docs', 'grid')

  const docs = useResource<DocSummary[]>(
    () => api.get('/docs', { division, category, q: query }),
    [division, category, query],
  )

  // Categories are free text, so the filter is built from what actually exists
  // rather than from a fixed list that would drift from the data.
  const categories = useMemo(() => {
    const seen = new Set((docs.data ?? []).map((d) => d.category))
    for (const c of DOC_CATEGORIES) seen.add(c)
    return [...seen].sort().map((c) => ({ value: c, label: c }))
  }, [docs.data])

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Knowledge"
        title="Docs"
        description="SOPs, playbooks, onboarding, and policy. Anything that would otherwise live only in someone's head."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            New doc
          </Button>
        }
      />

      <Toolbar>
        <label className="relative">
          <span className="sr-only">Search docs</span>
          <Icon
            name="search"
            size={13}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title and body…"
            className="w-56 rounded-sm border border-rule bg-surface py-1.5 pr-2.5 pl-7 font-mono text-[11px] text-ink placeholder:text-faint transition-colors hover:border-faint focus:border-ink focus:outline-none"
          />
        </label>

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
          options={categories}
          onChange={(v) => setCategory(v)}
        />
        {(division || category || query) && (
          <Button
            size="sm"
            onClick={() => {
              setDivision('')
              setCategory('')
              setQuery('')
            }}
          >
            Clear
          </Button>
        )}

        <span className="ml-auto font-mono text-[10px] text-faint">
          {pluralise(docs.data?.length ?? 0, 'doc')}
        </span>
        <LayoutSwitch value={layout} onChange={setLayout} available={['grid', 'list']} />
      </Toolbar>

      {docs.error ? (
        <ErrorState message={docs.error} onRetry={docs.reload} />
      ) : docs.loading ? (
        <Skeleton rows={4} />
      ) : (docs.data ?? []).length === 0 ? (
        <EmptyState
          icon="docs"
          title={query ? 'No doc matches that' : 'No docs yet'}
          hint={
            query
              ? 'Try a different term, or clear the filters.'
              : 'Write down the thing you explain most often. That is usually the first doc worth having.'
          }
          action={query ? undefined : { label: 'New doc', onClick: () => setEditing('new') }}
        />
      ) : layout === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {docs.data!.map((doc) => (
            <DocCard key={doc.id} doc={doc} onOpen={() => setReading(doc.id)} />
          ))}
        </div>
      ) : (
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-rule-soft">
            {docs.data!.map((doc) => (
              <DocRow key={doc.id} doc={doc} onOpen={() => setReading(doc.id)} />
            ))}
          </ul>
        </Panel>
      )}

      {reading && (
        <DocReader
          docId={reading}
          onClose={() => setReading(null)}
          onEdit={(doc) => {
            setReading(null)
            setEditing(doc)
          }}
        />
      )}

      {editing && (
        <DocForm
          doc={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            docs.reload()
          }}
        />
      )}
    </>
  )
}

/** Months since last touched. Anything over three is worth flagging as stale. */
function staleness(updatedAt: string) {
  const months = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24 * 30)
  return months >= 3 ? Math.floor(months) : null
}

function DocCard({ doc, onOpen }: { doc: DocSummary; onOpen: () => void }) {
  const stale = staleness(doc.updatedAt)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card-interactive relative overflow-hidden rounded-md p-5 pl-6 text-left"
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={mark(doc.division).fill}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-2">
        <Tag tag={doc.tag} />
        <Pill>{doc.category}</Pill>
      </div>

      <h2 className="mt-3 font-display text-lg leading-tight font-semibold text-ink">
        {doc.title}
      </h2>

      <p className="mt-3 flex items-center gap-1.5 font-mono text-[10px] text-faint">
        <Icon name="clock" size={11} />
        Updated {fullDate(doc.updatedAt)}
        {stale !== null && (
          <Pill tone="pending" className="ml-1">
            {stale}mo old
          </Pill>
        )}
      </p>
    </button>
  )
}

function DocRow({ doc, onOpen }: { doc: DocSummary; onOpen: () => void }) {
  const stale = staleness(doc.updatedAt)

  return (
    <li className="relative">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-3 pr-4 pl-5 text-left transition-colors hover:bg-wash"
      >
        <span
          className="absolute inset-y-0 left-0 w-[3px]"
          style={mark(doc.division).fill}
          aria-hidden
        />
        <Tag tag={doc.tag} />
        <span className="min-w-0 flex-1 basis-64 truncate text-sm text-ink">{doc.title}</span>
        <Pill>{doc.category}</Pill>
        {stale !== null && <Pill tone="pending">{stale}mo old</Pill>}
        <span className="w-28 shrink-0 text-right font-mono text-[10px] text-faint">
          {fullDate(doc.updatedAt)}
        </span>
      </button>
    </li>
  )
}

/**
 * Reading view. Fetched on open rather than with the index, because the index
 * deliberately doesn't carry bodies.
 *
 * The body renders as preformatted text, not Markdown — a renderer is a
 * dependency and a decision about syntax that hasn't been made yet. Line
 * breaks and spacing survive, which is what a pasted SOP actually needs.
 */
function DocReader({
  docId,
  onClose,
  onEdit,
}: {
  docId: string
  onClose: () => void
  onEdit: (doc: Doc) => void
}) {
  const doc = useResource<Doc>(() => api.get(`/docs/${docId}`), [docId])

  return (
    <RecordView
      title={doc.data?.title ?? 'Loading…'}
      subtitle={
        doc.data ? (
          <span className="flex items-center gap-2">
            <Tag tag={doc.data.tag} />
            <Pill>{doc.data.category}</Pill>
            <span className="font-mono text-[10px] text-faint">
              Updated {fullDate(doc.data.updatedAt)}
            </span>
          </span>
        ) : undefined
      }
      onClose={onClose}
    >
      <div className="px-5 py-5">
        {doc.error ? (
          <ErrorState message={doc.error} onRetry={doc.reload} />
        ) : doc.loading || !doc.data ? (
          <Skeleton rows={3} />
        ) : doc.data.body.trim() === '' ? (
          <EmptyState
            icon="docs"
            title="This page is empty"
            hint="Open it for editing and write the first line."
          />
        ) : (
          <article className="font-sans text-[15px] leading-relaxed whitespace-pre-wrap text-ink">
            {doc.data.body}
          </article>
        )}
      </div>

      <RecordFooter>
        <Button onClick={onClose}>Close</Button>
        {doc.data && (
          <Button variant="primary" icon="edit" onClick={() => onEdit(doc.data!)}>
            Edit
          </Button>
        )}
      </RecordFooter>
    </RecordView>
  )
}

function DocForm({
  doc,
  onClose,
  onSaved,
}: {
  doc: Doc | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(doc?.title ?? '')
  const [division, setDivision] = useState<Division | ''>(doc?.division ?? 'tuenx')
  const [category, setCategory] = useState(doc?.category ?? 'SOP')
  const [body, setBody] = useState(doc?.body ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = { title, division, category, body }
      if (doc) await api.patch(`/docs/${doc.id}`, payload)
      else await api.post('/docs', payload)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!doc || !confirm(`Delete ${doc.title} (${doc.tag})? This cannot be undone.`)) return
    setSaving(true)
    try {
      await api.del(`/docs/${doc.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={doc ? 'Edit doc' : 'New doc'}
      subtitle={
        doc ? (
          <Tag tag={doc.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            A tag is issued on save, e.g. TNX-D004
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 px-5 py-5">
          <TextField label="Title" value={title} onChange={setTitle} required autoFocus />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Division"
              value={division}
              options={DIVISION_OPTIONS}
              onChange={setDivision}
            />
            <TextField
              label="Category"
              value={category}
              onChange={setCategory}
              required
              hint="SOP, Playbook, Onboarding, Policy — or your own."
            />
          </div>

          <TextAreaField
            label="Body"
            value={body}
            onChange={setBody}
            rows={16}
            placeholder="Write it the way you would explain it to someone on their first day."
          />

          {doc && <LinkedRecords type="doc" id={doc.id} />}

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {doc && (
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
            {saving ? 'Saving…' : doc ? 'Save changes' : 'Create doc'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}
