import { useCallback, useEffect, useState } from 'react'

/** The three chrome panels a person can hide. The top bar always stays. */
export const PANELS = ['left', 'right', 'bottom'] as const
export type Panel = (typeof PANELS)[number]

export type LayoutState = Record<Panel, boolean>

const STORAGE_KEY = 'tuenx-os:layout'
const EVENT = 'tuenx-os:layout-change'

/**
 * Left nav and the status bar are on by default; the right rail is not.
 * Someone opening this for the first time should see their work, not three
 * frames around it.
 */
const DEFAULT: LayoutState = { left: true, right: false, bottom: true }

function read(): LayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT
    const parsed = JSON.parse(raw) as Partial<LayoutState>
    return {
      left: typeof parsed.left === 'boolean' ? parsed.left : DEFAULT.left,
      right: typeof parsed.right === 'boolean' ? parsed.right : DEFAULT.right,
      bottom: typeof parsed.bottom === 'boolean' ? parsed.bottom : DEFAULT.bottom,
    }
  } catch {
    // Corrupt JSON or storage disabled — fall back rather than crash the shell.
    return DEFAULT
  }
}

/**
 * Which chrome panels are showing.
 *
 * Persisted, and shared across every mounted copy via a custom event — the
 * `storage` event only fires in *other* tabs, so it cannot keep the toggle in
 * the top bar in step with the panel it controls.
 */
export function useLayout(): [LayoutState, (panel: Panel) => void] {
  const [layout, setLayout] = useState<LayoutState>(read)

  useEffect(() => {
    const sync = () => setLayout(read())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const toggle = useCallback((panel: Panel) => {
    const next = { ...read(), [panel]: !read()[panel] }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // The preference just won't survive a reload.
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return [layout, toggle]
}
