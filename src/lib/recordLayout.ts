import { useCallback, useEffect, useState } from 'react'

export const RECORD_LAYOUTS = ['board', 'grid', 'list'] as const
export type RecordLayout = (typeof RECORD_LAYOUTS)[number]

export const RECORD_LAYOUT_LABEL: Record<RecordLayout, string> = {
  board: 'Board',
  grid: 'Grid',
  list: 'List',
}

const EVENT = 'tuenx-os:record-layout-change'
const key = (module: string) => `tuenx-os:layout:${module}`

function read(module: string, fallback: RecordLayout): RecordLayout {
  try {
    const stored = localStorage.getItem(key(module))
    return (RECORD_LAYOUTS as readonly string[]).includes(stored ?? '')
      ? (stored as RecordLayout)
      : fallback
  } catch {
    return fallback
  }
}

/**
 * How one module lays its records out — kanban board, card grid, or dense list.
 *
 * Stored per module rather than globally: a board is the right shape for
 * Tasks, where status is the thing you move work between, and the wrong shape
 * for Invoices, where you read in date order. Someone who prefers a list for
 * one and a board for the other should get both.
 */
export function useRecordLayout(
  module: string,
  fallback: RecordLayout = 'board',
): [RecordLayout, (layout: RecordLayout) => void] {
  const [layout, setLayout] = useState<RecordLayout>(() => read(module, fallback))

  useEffect(() => {
    const sync = () => setLayout(read(module, fallback))
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [module, fallback])

  const update = useCallback(
    (next: RecordLayout) => {
      try {
        localStorage.setItem(key(module), next)
      } catch {
        // Preference won't survive a reload. Not worth surfacing.
      }
      window.dispatchEvent(new Event(EVENT))
    },
    [module],
  )

  return [layout, update]
}
