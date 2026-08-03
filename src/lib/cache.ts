/**
 * In-memory GET cache, stale-while-revalidate.
 *
 * Every module refetches on mount, so moving between screens re-requests data
 * that has not changed. This serves the last response immediately and
 * revalidates behind it, which is what makes a second visit feel instant
 * rather than showing a skeleton for a round trip.
 *
 * Deliberately not persisted. A cache that survives a reload has to reason
 * about schema changes and stale writes; this one dies with the tab, which is
 * the right trade for a tool a handful of people use.
 */

interface Entry {
  data: unknown
  at: number
  /** In flight, so concurrent callers share one request instead of racing. */
  inflight?: Promise<unknown>
}

const store = new Map<string, Entry>()

/** How long a cached response is served without a background refresh. */
const FRESH_MS = 30_000

/** How long it may be served *with* one. Beyond this it is not used at all. */
const STALE_MS = 5 * 60_000

export const cacheKey = (path: string, params?: Record<string, string | undefined>) =>
  params ? `${path}?${JSON.stringify(params)}` : path

export function peek<T>(key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.at > STALE_MS) {
    store.delete(key)
    return undefined
  }
  return entry.data as T
}

export const isFresh = (key: string) => {
  const entry = store.get(key)
  return entry !== undefined && Date.now() - entry.at < FRESH_MS
}

export function put(key: string, data: unknown) {
  store.set(key, { data, at: Date.now() })
}

/** Shares an in-flight request, so two components mounting together fetch once. */
export function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const entry = store.get(key)
  if (entry?.inflight) return entry.inflight as Promise<T>

  const inflight = run()
    .then((data) => {
      put(key, data)
      return data
    })
    .finally(() => {
      const current = store.get(key)
      if (current) delete current.inflight
    })

  store.set(key, { data: entry?.data, at: entry?.at ?? 0, inflight } as Entry)
  return inflight
}

/**
 * Drops cached entries whose key contains `fragment`.
 *
 * Called after a write. Broad on purpose: creating a task changes the task
 * list, the overview totals, and any epic or sprint rollup, and guessing which
 * of those to keep is how a cache starts lying.
 */
export function invalidate(fragment?: string) {
  if (!fragment) {
    store.clear()
    return
  }
  for (const key of store.keys()) {
    if (key.includes(fragment)) store.delete(key)
  }
}
