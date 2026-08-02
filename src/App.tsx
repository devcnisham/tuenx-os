import { useEffect, useState } from 'react'
import { href, useRoute, type ModuleId } from './lib/router.ts'
import { useLayout } from './lib/layout.ts'
import { mark } from './lib/divisions.ts'
import { DIVISION_CODE, type Division } from './types.ts'
import { TagLegend } from './components/Tag.tsx'
import { TopBar } from './components/shell/TopBar.tsx'
import { RightRail } from './components/shell/RightRail.tsx'
import { StatusBar } from './components/shell/StatusBar.tsx'
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
 * Four-panel shell: top bar (always), left nav, right attention rail, bottom
 * status bar. The last three hide and unhide from the top bar, and the choice
 * persists.
 *
 * Below `lg` the left nav collapses into a drawer and the right rail drops out
 * entirely — on a phone it would cost more room than the digest is worth
 * (TRD §6).
 */
export function App() {
  const route = useRoute()
  const [layout, toggle] = useLayout()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close the drawer on navigation, so tapping a link doesn't leave it hanging.
  useEffect(() => setDrawerOpen(false), [route.module, route.productId])

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        module={route.module}
        layout={layout}
        onToggle={toggle}
        onOpenMobileNav={() => setDrawerOpen((open) => !open)}
        mobileNavOpen={drawerOpen}
      />

      {drawerOpen && (
        <div className="border-b border-rule py-2 lg:hidden">
          <NavList active={route.module} onNavigate={() => setDrawerOpen(false)} />
          <div className="mt-3 border-t border-rule px-4 pt-3">
            <p className="label-mono mb-2">Tag key</p>
            <TagLegend />
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {layout.left && (
          <aside className="hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-rule lg:flex">
            <div className="flex-1 py-3">
              <NavList active={route.module} />
            </div>
            <div className="border-t border-rule px-4 py-4">
              <p className="label-mono mb-2">Tag key</p>
              <TagLegend />
              <p className="mt-3 border-t border-rule pt-3 font-mono text-[10px] leading-relaxed text-faint">
                Phases 1–4. No sign-in yet —<br />
                accounts arrive in Phase 9.
              </p>
            </div>
          </aside>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
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

        {layout.right && <RightRail />}
      </div>

      {layout.bottom && <StatusBar />}
    </div>
  )
}
