import { useEffect, useState } from 'react'
import { href, useRoute, type ModuleId } from './lib/router.ts'
import { mark } from './lib/divisions.ts'
import { DIVISION_CODE, type Division } from './types.ts'
import { TagLegend } from './components/Tag.tsx'
import { GlobalSearch } from './components/GlobalSearch.tsx'
import { Overview } from './modules/Overview.tsx'
import { Tasks } from './modules/Tasks.tsx'
import { Crm } from './modules/Crm.tsx'
import { Projects } from './modules/Projects.tsx'
import { Invoices } from './modules/Invoices.tsx'
import { Treasury } from './modules/Treasury.tsx'
import { Team } from './modules/Team.tsx'
import { Products } from './modules/Products.tsx'

/**
 * Nav, grouped by which part of the company a module serves. `owner` is the
 * division that owns it per the master plan module map, shown as that
 * division's tag treatment — so the rail teaches the encoding while it
 * navigates.
 */
const NAV: { group: string; items: { id: ModuleId; label: string; owner: Division }[] }[] = [
  {
    group: 'Group',
    items: [
      { id: 'overview', label: 'Overview', owner: 'tuenx' },
      { id: 'tasks', label: 'Tasks', owner: 'tuenx' },
      { id: 'crm', label: 'CRM', owner: 'tuenx' },
      { id: 'team', label: 'Team', owner: 'tuenx' },
      { id: 'treasury', label: 'Treasury', owner: 'tuenx' },
    ],
  },
  {
    group: 'Agency',
    items: [
      { id: 'projects', label: 'Projects', owner: 'agency' },
      { id: 'invoices', label: 'Invoices', owner: 'agency' },
    ],
  },
  {
    group: 'Gaphatch',
    items: [{ id: 'products', label: 'Products', owner: 'gaphatch' }],
  },
]

function Wordmark() {
  return (
    <a href={href('overview')} className="inline-flex items-baseline gap-1.5">
      <span className="font-display text-lg leading-none font-semibold tracking-tight text-ink">
        TUENX
      </span>
      <span className="rounded-[2px] bg-ink px-1 py-px font-mono text-[10px] font-medium text-paper">
        OS
      </span>
    </a>
  )
}

function NavList({ active, onNavigate }: { active: ModuleId; onNavigate?: () => void }) {
  return (
    <nav className="space-y-4">
      {NAV.map(({ group, items }) => (
        <div key={group}>
          <p className="label-mono mb-1 px-3">{group}</p>
          {items.map((item) => {
            const isActive = item.id === active
            return (
              <a
                key={item.id}
                href={href(item.id)}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex items-center justify-between gap-2 border-l-2 py-1.5 pr-2 pl-3 transition-colors ${
                  isActive
                    ? 'border-ink bg-wash text-ink'
                    : 'border-transparent text-graphite hover:border-rule hover:text-ink'
                }`}
              >
                <span className={`font-display text-sm ${isActive ? 'font-semibold' : ''}`}>
                  {item.label}
                </span>
                <span
                  className={`shrink-0 rounded-[2px] px-1 py-px font-mono text-[9px] font-medium transition-opacity ${
                    mark(item.owner).tag
                  } ${isActive ? 'opacity-100' : 'opacity-45 group-hover:opacity-100'}`}
                >
                  {DIVISION_CODE[item.owner]}
                </span>
              </a>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

/**
 * TRD §6: the sidebar collapses to a top bar below `lg`. The drawer reuses the
 * same nav list rather than being a second implementation of it.
 */
export function App() {
  const route = useRoute()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close the drawer on navigation, so tapping a link doesn't leave it hanging.
  useEffect(() => setDrawerOpen(false), [route.module, route.productId])

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop rail */}
      <aside className="hidden w-56 shrink-0 border-r border-rule lg:flex lg:flex-col">
        <div className="space-y-3 border-b border-ink px-4 py-4">
          <Wordmark />
          <GlobalSearch />
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          <NavList active={route.module} />
        </div>

        <div className="space-y-3 border-t border-rule px-4 py-4">
          <div>
            <p className="label-mono mb-2">Tag key</p>
            <TagLegend />
          </div>
          <p className="border-t border-rule pt-3 font-mono text-[10px] leading-relaxed text-faint">
            Phases 1–4. No sign-in yet —<br />
            accounts arrive in Phase 9.
          </p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-ink bg-paper lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Wordmark />
          <button
            type="button"
            onClick={() => setDrawerOpen((open) => !open)}
            aria-expanded={drawerOpen}
            aria-label="Toggle navigation"
            className="rounded-[3px] border border-rule px-2 py-1 font-mono text-[11px] text-ink"
          >
            {drawerOpen ? 'Close' : 'Menu'}
          </button>
        </div>
        <div className="px-4 pb-3">
          <GlobalSearch />
        </div>
        {drawerOpen && (
          <div className="border-t border-rule py-2">
            <NavList active={route.module} onNavigate={() => setDrawerOpen(false)} />
            <div className="mt-3 border-t border-rule px-4 pt-3">
              <p className="label-mono mb-2">Tag key</p>
              <TagLegend />
            </div>
          </div>
        )}
      </header>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {route.module === 'overview' && <Overview />}
          {route.module === 'tasks' && <Tasks />}
          {route.module === 'crm' && <Crm />}
          {route.module === 'projects' && <Projects />}
          {route.module === 'invoices' && <Invoices />}
          {route.module === 'treasury' && <Treasury />}
          {route.module === 'team' && <Team />}
          {route.module === 'products' && <Products productId={route.productId} />}
        </div>
      </main>
    </div>
  )
}
