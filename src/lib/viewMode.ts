import { useCallback, useEffect, useState } from 'react'

export const VIEW_MODES = ['center', 'side', 'full'] as const
export type ViewMode = (typeof VIEW_MODES)[number]

const STORAGE_KEY = 'tuenx-os:record-view'
const EVENT = 'tuenx-os:record-view-change'

/** Centre is the default — it's where a click on a card is expected to land. */
const DEFAULT: ViewMode = 'center'

function read(): ViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return (VIEW_MODES as readonly string[]).includes(stored ?? '')
      ? (stored as ViewMode)
      : DEFAULT
  } catch {
    // Private browsing, or storage disabled.
    return DEFAULT
  }
}

/**
 * How a record opens: centred over the page, as a panel beside the board, or
 * as a full-page takeover.
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
