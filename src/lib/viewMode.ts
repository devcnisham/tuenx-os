import { useCallback, useEffect, useState } from 'react'

export type ViewMode = 'side' | 'full'

const STORAGE_KEY = 'tuenx-os:record-view'
const EVENT = 'tuenx-os:record-view-change'

function read(): ViewMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'full' ? 'full' : 'side'
  } catch {
    // Private browsing, or storage disabled. Side is the better default anyway.
    return 'side'
  }
}

/**
 * How a record opens: a slide-over panel beside the board, or a full-page
 * takeover.
 *
 * The choice is a preference rather than per-record state, so it persists
 * across sessions and applies everywhere at once. A custom event keeps every
 * mounted copy of the hook in step — `storage` only fires in *other* tabs, so
 * it cannot do this on its own.
 */
export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(read)

  useEffect(() => {
    const sync = () => setMode(read())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const update = useCallback((next: ViewMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // The preference just won't survive a reload. Not worth surfacing.
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return [mode, update]
}
