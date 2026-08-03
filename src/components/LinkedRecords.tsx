import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import type { SearchHit } from '../types.ts'
import { Tag } from './Tag.tsx'
import { Button, Pill } from './ui.tsx'
import { Icon } from './Icon.tsx'

/** Record types that can be linked. Mirrors the resolver table on the server. */
export type LinkType =
  | 'task'
  | 'contact'
  | 'member'
  | 'product'
  | 'project'
  | 'invoice'
  | 'doc'
  | 'objective'
  | 'entry'
  | 'plan'
  | 'idea'
  | 'candidate'
  | 'vendor'
  | 'campaign'
  | 'contract'
  | 'epic'
  | 'sprint'

interface Link {
  linkId: string
  note: string | null
  type: LinkType
  typeLabel: string
  id: string
  tag: string
  title: string
  route: string
}

/** Global search returns its own kinds; map them onto link types. */
const KIND_TO_LINK: Partial<Record<SearchHit['kind'], LinkType>> = {
  task: 'task',
  contact: 'contact',
  member: 'member',
  product: 'product',
  project: 'project',
  invoice: 'invoice',
  doc: 'doc',
  candidate: 'candidate',
  vendor: 'vendor',
  campaign: 'campaign',
  contract: 'contract',
  epic: 'epic',
  sprint: 'sprint',
}

/**
 * Links this record to any other — a meeting to its agenda doc, a task to the
 * objective it serves, a project to the SOP that governs it.
 *
 * Links are undirected in meaning: one created here shows on the other record
 * too, which is the only behaviour that makes sense to someone looking at that
 * record instead.
 *
 * The picker reuses global search rather than a type-then-record cascade —
 * every record already carries a searchable tag, so typing `AGY-D001` or a
 * title finds the target in one step.
 */
export function LinkedRecords({ type, id }: { type: LinkType; id: string }) {
  const links = useResource<{ links: Link[] }>(
    () => api.get('/links', { type, id }),
    [type, id],
  )
  const [adding, setAdding] = useState(false)

  const remove = async (linkId: string) => {
    await api.del(`/links/${linkId}`)
    links.reload()
  }

  const items = links.data?.links ?? []

  return (
    <section className="border-t border-rule-soft pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="label-mono">Linked records</p>
        <Button size="sm" variant="subtle" icon="plus" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Done' : 'Link'}
        </Button>
      </div>

      {adding && (
        <LinkPicker
          excludeType={type}
          excludeId={id}
          onPick={async (hit) => {
            const toType = KIND_TO_LINK[hit.kind]
            if (!toType) return
            await api.post('/links', { fromType: type, fromId: id, toType, toId: hit.id })
            links.reload()
          }}
        />
      )}

      {items.length === 0 ? (
        <p className="py-2 font-mono text-[10px] text-faint">
          Nothing linked yet. Attach the doc, the objective, or the meeting this belongs to.
        </p>
      ) : (
        <ul className="divide-y divide-rule-soft">
          {items.map((link) => (
            <li key={link.linkId} className="flex items-center gap-2 py-2">
              <Tag tag={link.tag} />
              <a
                href={link.route}
                className="min-w-0 flex-1 truncate text-[13px] text-ink underline-offset-2 hover:underline"
              >
                {link.title}
              </a>
              <Pill>{link.typeLabel}</Pill>
              <button
                type="button"
                onClick={() => remove(link.linkId)}
                aria-label={`Unlink ${link.tag}`}
                className="shrink-0 rounded-xs p-1 text-faint transition-colors hover:text-alert"
              >
                <Icon name="close" size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function LinkPicker({
  excludeType,
  excludeId,
  onPick,
}: {
  excludeType: LinkType
  excludeId: string
  onPick: (hit: SearchHit) => void | Promise<void>
}) {
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  useEffect(() => {
    if (term.trim().length < 2) {
      setHits([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      api
        .get<{ hits: SearchHit[] }>('/search', { q: term })
        .then((result) => {
          if (cancelled) return
          // Can't link a record to itself.
          setHits(
            result.hits.filter(
              (h) => !(KIND_TO_LINK[h.kind] === excludeType && h.id === excludeId),
            ),
          )
        })
        .catch(() => {
          if (!cancelled) setHits([])
        })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term, excludeType, excludeId])

  return (
    <div className="mb-3 rounded-sm border border-rule bg-wash p-2">
      <input
        ref={inputRef}
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search by title or tag…"
        aria-label="Find a record to link"
        className="w-full rounded-xs border border-rule bg-surface px-2 py-1.5 font-mono text-[11px] text-ink placeholder:text-faint focus:border-ink focus:outline-none"
      />

      {term.trim().length >= 2 && (
        <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
          {hits.length === 0 ? (
            <li className="px-1 py-2 font-mono text-[10px] text-faint">Nothing matches</li>
          ) : (
            hits.map((hit) => (
              <li key={`${hit.kind}-${hit.id}`}>
                <button
                  type="button"
                  onClick={async () => {
                    await onPick(hit)
                    setTerm('')
                    setHits([])
                  }}
                  className="flex w-full items-center gap-2 rounded-xs px-1.5 py-1.5 text-left transition-colors hover:bg-surface"
                >
                  <Tag tag={hit.tag} />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{hit.title}</span>
                  <Icon name="plus" size={12} className="text-faint" />
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
