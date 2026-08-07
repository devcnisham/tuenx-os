import { useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { fullDate } from '../lib/format.ts'
import {
  AUDIT_ACTION_LABEL,
  type AuditAction,
  type AuditEntry,
  type AuditFacets,
  type AuditPage,
} from '../types.ts'
import { PageHeader, Toolbar } from '../components/PageHeader.tsx'
import { Button, EmptyState, ErrorState, Panel, Pill, Skeleton, type PillTone } from '../components/ui.tsx'
import { FilterSelect } from '../components/Field.tsx'
import { Tag } from '../components/Tag.tsx'

/**
 * Phase 9 — who changed what, when. Admin-only; the API refuses anyone else.
 *
 * Read-only by construction. There is no edit affordance here and no write
 * route behind it, because a log people can edit answers a different question
 * from the one it looks like it answers.
 */

/** Colour is status only: a delete or a failed sign-in is the alarming one. */
const ACTION_TONE: Record<AuditAction, PillTone> = {
  create: 'ready',
  update: 'neutral',
  delete: 'alert',
  sign_in: 'neutral',
  sign_in_failed: 'alert',
  sign_out: 'neutral',
  portal_access: 'neutral',
  dev_session: 'neutral',
}

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

export function Audit() {
  const [resource, setResource] = useState('')
  const [action, setAction] = useState('')
  const [actorId, setActorId] = useState('')
  /** Pages already loaded, oldest request last. Keyset, so they concatenate. */
  const [pages, setPages] = useState<AuditEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const facets = useResource<AuditFacets>(() => api.get('/audit/facets'), [])

  const page = useResource<AuditPage>(
    () =>
      api.get<AuditPage>('/audit', { resource, action, actorId }).then((result) => {
        // A filter change restarts paging — keeping the old rows would mix two
        // different questions in one list.
        setPages(result.entries)
        setCursor(result.nextCursor)
        return result
      }),
    [resource, action, actorId],
  )

  const loadMore = async () => {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const next = await api.get<AuditPage>('/audit', {
        resource,
        action,
        actorId,
        before: cursor,
      })
      setPages((current) => [...current, ...next.entries])
      setCursor(next.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  const filtered = Boolean(resource || action || actorId)

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Security"
        title="Audit log"
        description="Every create, update, and delete, plus sign-ins. Admin-only, and read-only — nothing in the app can edit this."
      />

      <Toolbar>
        <FilterSelect
          ariaLabel="Filter by resource"
          placeholder="All resources"
          value={resource}
          options={(facets.data?.resources ?? []).map((r) => ({
            value: r.value,
            label: `${r.value} · ${r.count}`,
          }))}
          onChange={(v) => setResource(v)}
        />
        <FilterSelect
          ariaLabel="Filter by action"
          placeholder="Any action"
          value={action}
          options={(facets.data?.actions ?? []).map((a) => ({
            value: a.value,
            label: `${AUDIT_ACTION_LABEL[a.value as AuditAction] ?? a.value} · ${a.count}`,
          }))}
          onChange={(v) => setAction(v)}
        />
        <FilterSelect
          ariaLabel="Filter by person"
          placeholder="Anyone"
          value={actorId}
          options={(facets.data?.actors ?? []).map((a) => ({
            value: a.id,
            label: `${a.name} · ${a.count}`,
          }))}
          onChange={(v) => setActorId(v)}
        />
        {filtered && (
          <Button
            size="sm"
            onClick={() => {
              setResource('')
              setAction('')
              setActorId('')
            }}
          >
            Clear
          </Button>
        )}
        <span className="ml-auto font-mono text-[10px] text-faint">
          {pages.length} shown{cursor ? ' · more available' : ''}
        </span>
      </Toolbar>

      {page.error ? (
        <ErrorState message={page.error} onRetry={page.reload} />
      ) : page.loading ? (
        <Skeleton rows={6} />
      ) : pages.length === 0 ? (
        <EmptyState
          title={filtered ? 'Nothing matches' : 'Nothing recorded yet'}
          hint={
            filtered
              ? 'Clear the filters to see the rest of the log.'
              : 'Entries appear as soon as anyone creates, changes, or deletes a record.'
          }
        />
      ) : (
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-rule">
            {pages.map((entry) => (
              <Entry key={entry.id} entry={entry} />
            ))}
          </ul>

          {cursor && (
            <div className="border-t border-rule p-3 text-center">
              <Button size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load older'}
              </Button>
            </div>
          )}
        </Panel>
      )}
    </>
  )
}

function Entry({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false)
  const changed = entry.changes ? Object.entries(entry.changes) : []
  const at = new Date(entry.at)

  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 shrink-0 font-mono text-[10px] text-faint">
          {fullDate(entry.at)} {TIME.format(at)}
        </span>

        <Pill tone={ACTION_TONE[entry.action] ?? 'neutral'}>
          {AUDIT_ACTION_LABEL[entry.action] ?? entry.action}
        </Pill>

        <span className="text-[13px] text-ink">{entry.actorName}</span>
        <span className="font-mono text-[10px] text-faint">{entry.actorRole}</span>

        <span className="font-mono text-[10px] text-graphite">{entry.resource}</span>
        {entry.recordTag && <Tag tag={entry.recordTag} />}

        {changed.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-auto font-mono text-[10px] text-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            {open ? 'Hide' : `${changed.length} field${changed.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>

      {open && changed.length > 0 && (
        <dl className="mt-2 ml-28 space-y-1 border-l border-rule pl-3">
          {changed.map(([field, { from, to }]) => (
            <div key={field} className="flex flex-wrap items-baseline gap-2">
              <dt className="label-mono">{field}</dt>
              <dd className="font-mono text-[11px]">
                <span className="text-faint line-through">{render(from)}</span>
                <span className="mx-1.5 text-faint">→</span>
                <span className="text-ink">{render(to)}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  )
}

/** Values come back as raw JSON, so null and empty need to stay tellable apart. */
function render(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (value === '') return '(empty)'
  if (typeof value === 'string') return value.length > 60 ? `${value.slice(0, 60)}…` : value
  return JSON.stringify(value)
}
