import { useCallback, useEffect, useState } from 'react'

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

export const THEME_LABEL: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
}

const STORAGE_KEY = 'tuenx-os:theme'
const EVENT = 'tuenx-os:theme-change'

function read(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return (THEMES as readonly string[]).includes(stored ?? '') ? (stored as Theme) : 'system'
  } catch {
    return 'system'
  }
}

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

/** What `system` currently resolves to. */
export const resolveTheme = (theme: Theme): 'light' | 'dark' =>
  theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme

/**
 * Writes the resolved theme onto the root element, where the CSS picks it up.
 *
 * `color-scheme` is set too, so native form controls, scrollbars, and the
 * browser's own chrome follow — otherwise a dark page renders white dropdowns.
 */
function apply(theme: Theme) {
  const resolved = resolveTheme(theme)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
}

/**
 * Theme preference: light, dark, or follow the operating system.
 *
 * `system` is the default and a real option rather than a fallback — someone
 * whose machine switches at sunset should not have to switch this too.
 */
export function useTheme(): [Theme, 'light' | 'dark', (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(read)

  useEffect(() => {
    const sync = () => setTheme(read())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  // Re-apply when the OS flips, but only while following it.
  useEffect(() => {
    apply(theme)
    if (theme !== 'system') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  const update = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Preference won't survive a reload. Not worth surfacing.
    }
    apply(next)
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return [theme, resolveTheme(theme), update]
}

/**
 * Applies the stored theme before React mounts.
 *
 * Without this the page paints light for a frame and then flips, which is the
 * flash every dark-mode implementation is judged by.
 */
export function applyStoredTheme() {
  apply(read())
}
