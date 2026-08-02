import { useEffect, useState } from 'react'

/**
 * Hash routing, hand-rolled.
 *
 * No router dependency for five routes. Hash rather than history API so the
 * static build works when opened from any path, and so a drilled-into product
 * or a filtered board is a URL someone can paste into Slack.
 */
export type ModuleId = 'overview' | 'tasks' | 'crm' | 'team' | 'products'

export interface Route {
  module: ModuleId
  /** Product id when drilled into one, e.g. #/products/abc123. */
  productId: string | null
}

const MODULES: ModuleId[] = ['overview', 'tasks', 'crm', 'team', 'products']

function parse(hash: string): Route {
  const [first, second] = hash.replace(/^#\/?/, '').split('/').filter(Boolean)

  const module = MODULES.find((m) => m === first) ?? 'overview'
  return {
    module,
    productId: module === 'products' && second ? second : null,
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
