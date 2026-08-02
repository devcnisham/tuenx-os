import { useEffect, useState } from 'react'

/**
 * Hash routing, hand-rolled.
 *
 * No router dependency for five routes. Hash rather than history API so the
 * static build works when opened from any path, and so a drilled-into product
 * or a filtered board is a URL someone can paste into Slack.
 */
export type ModuleId =
  | 'overview'
  | 'tasks'
  | 'crm'
  | 'projects'
  | 'invoices'
  | 'treasury'
  | 'docs'
  | 'okrs'
  | 'calendar'
  | 'planner'
  | 'brainstorms'
  | 'team'
  | 'products'

export interface Route {
  module: ModuleId
  /** Product id when drilled into one, e.g. #/products/abc123. */
  productId: string | null
  /**
   * Free-text carried in the hash, so a filtered view is a shareable URL —
   * e.g. #/invoices?q=AGY-I004.
   */
  query: string
}

const MODULES: ModuleId[] = [
  'overview',
  'tasks',
  'crm',
  'projects',
  'invoices',
  'treasury',
  'docs',
  'okrs',
  'calendar',
  'planner',
  'brainstorms',
  'team',
  'products',
]

function parse(hash: string): Route {
  const [path, search] = hash.replace(/^#\/?/, '').split('?')
  const [first, second] = (path ?? '').split('/').filter(Boolean)

  const module = MODULES.find((m) => m === first) ?? 'overview'
  return {
    module,
    productId: module === 'products' && second ? second : null,
    query: new URLSearchParams(search ?? '').get('q') ?? '',
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

export const href = (module: ModuleId, productId?: string) =>
  productId ? `#/${module}/${productId}` : `#/${module}`

export const navigate = (module: ModuleId, productId?: string) => {
  window.location.hash = href(module, productId)
}

/** Jumps to a module with a search term prefilled, from a global search hit. */
export const navigateToHit = (route: string) => {
  window.location.hash = route.replace(/^#/, '')
}
