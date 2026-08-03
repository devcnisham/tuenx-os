import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api.ts'

export interface Resource<T> {
  data: T | null
  error: string | null
  loading: boolean
  /** Refetch. Used after a mutation, and by the retry button on the error state. */
  reload: () => void
  /** Apply a local change without a round trip. */
  set: (next: T) => void
}

/**
 * Loads one endpoint, with its own loading and error state.
 *
 * Deliberately per-resource rather than one app-wide store: TRD §6 asks that a
 * module load independently so one module's failure doesn't take the rest of
 * the app down with it.
 *
 * @param load  fetcher; re-run whenever `deps` change
 * @param deps  values the fetcher closes over (filters, ids)
 */
export function useResource<T>(load: () => Promise<T>, deps: readonly unknown[]): Resource<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Bumped on every fetch so a slow earlier response can't overwrite a newer one.
  const generation = useRef(0)
  const loadRef = useRef(load)
  loadRef.current = load

  const run = useCallback(() => {
    const current = ++generation.current
    setError(null)

    // Only show a skeleton if the request is actually slow. A cached or fast
    // response would otherwise flash one for a frame, which reads as jank even
    // though it is the fast path.
    const slow = setTimeout(() => {
      if (generation.current === current) setLoading(true)
    }, 120)

    loadRef
      .current()
      .then((result) => {
        clearTimeout(slow)
        if (generation.current !== current) return
        setData(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        clearTimeout(slow)
        if (generation.current !== current) return
        setError(err instanceof ApiError ? err.message : 'Something went wrong')
        setLoading(false)
      })
  }, [])

  useEffect(run, [run, ...deps])

  return { data, error, loading, reload: run, set: setData }
}
