import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.ts'
import { navigateToHit } from '../lib/router.ts'
import type { SearchHit } from '../types.ts'
import { Tag } from './Tag.tsx'

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  task: 'Task',
  contact: 'Contact',
  member: 'Team',
  product: 'Product',
  project: 'Project',
  invoice: 'Invoice',
}

/**
 * One box that finds any record, by title or by tag.
 *
 * Typing `AGY-` lists everything Agency; typing `T003` finds the task. That
 * only works because every record carries a division-coded tag — this is the
 * payoff for the tag scheme rather than a feature of its own, which is why it
 * sits in the shell rather than inside a module.
 *
 * `/` focuses it from anywhere, the way it works in the tools this team
 * already uses.
 */
export function GlobalSearch() {
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // `/` focuses, unless the user is already typing into something.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable

      if (e.key === '/' && !typing) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Click outside closes the results.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Debounced, and guarded against a slow earlier response landing last.
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
          setHits(result.hits)
          setActive(0)
          setOpen(true)
        })
        .catch(() => {
          if (!cancelled) setHits([])
        })
    }, 150)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term])

  const go = (hit: SearchHit) => {
    navigateToHit(hit.route)
    setOpen(false)
    setTerm('')
    inputRef.current?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
      return
    }
    if (!open || hits.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % hits.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + hits.length) % hits.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = hits[active]
      if (hit) go(hit)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search records…"
        aria-label="Search all records"
        className="w-full rounded-[3px] border border-rule bg-paper py-1.5 pr-8 pl-2.5 font-mono text-[11px] text-ink placeholder:text-faint transition-colors hover:border-graphite focus:border-ink focus:outline-none"
      />
      <kbd
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-[2px] border border-rule px-1 font-mono text-[9px] text-faint"
      >
        /
      </kbd>

      {open && (
        // Wider than the rail it sits in — record titles are the thing being
        // read here, and clipping them to 224px defeats the point.
        <div className="absolute top-full left-0 z-50 mt-1 max-h-96 w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-[3px] border border-ink bg-paper shadow-lg shadow-ink/5">
          {hits.length === 0 ? (
            <p className="px-3 py-4 text-center font-mono text-[10px] text-faint">
              Nothing matches “{term}”
            </p>
          ) : (
            <ul className="divide-y divide-rule">
              {hits.map((hit, i) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(hit)}
                    className={`flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors ${
                      i === active ? 'bg-wash' : ''
                    }`}
                  >
                    <Tag tag={hit.tag} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] leading-tight text-ink">
                        {hit.title}
                      </span>
                      {hit.detail && (
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-faint">
                          {hit.detail}
                        </span>
                      )}
                    </span>
                    <span className="label-mono shrink-0">{KIND_LABEL[hit.kind]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
