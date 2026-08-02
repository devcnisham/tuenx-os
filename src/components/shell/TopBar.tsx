import { GlobalSearch } from '../GlobalSearch.tsx'
import { PANELS, type LayoutState, type Panel } from '../../lib/layout.ts'
import { href, type ModuleId } from '../../lib/router.ts'

const PANEL_LABEL: Record<Panel, string> = {
  left: 'Nav',
  right: 'Rail',
  bottom: 'Status',
}

const MODULE_TITLE: Record<ModuleId, string> = {
  overview: 'Overview',
  tasks: 'Tasks',
  crm: 'CRM',
  projects: 'Projects',
  invoices: 'Invoices',
  treasury: 'Treasury',
  team: 'Team',
  products: 'Products',
}

/**
 * Top bar: where you are, search, and control over the rest of the chrome.
 *
 * Always visible — it holds the toggles for the other three panels, so hiding
 * it would strand anyone who had hidden everything else.
 */
export function TopBar({
  module,
  layout,
  onToggle,
  onOpenMobileNav,
  mobileNavOpen,
}: {
  module: ModuleId
  layout: LayoutState
  onToggle: (panel: Panel) => void
  onOpenMobileNav: () => void
  mobileNavOpen: boolean
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink bg-surface">
      <div className="flex items-center gap-3 px-3 py-2">
        <a href={href('overview')} className="flex shrink-0 items-baseline gap-1.5">
          <span className="font-display text-base leading-none font-semibold tracking-tight text-ink">
            TUENX
          </span>
          <span className="rounded-xs bg-ink px-1 py-px font-mono text-[9px] font-medium text-surface">
            OS
          </span>
        </a>

        <span className="hidden text-rule select-none lg:inline">│</span>
        <span className="hidden font-mono text-[11px] text-graphite lg:inline">
          {MODULE_TITLE[module]}
        </span>

        <div className="ml-auto w-full max-w-xs">
          <GlobalSearch />
        </div>

        {/* Panel toggles — the "hide/unhide" control for the whole shell. */}
        <div
          role="group"
          aria-label="Panels"
          className="hidden shrink-0 overflow-hidden rounded-sm border border-rule lg:flex"
        >
          {PANELS.map((panel) => (
            <button
              key={panel}
              type="button"
              aria-pressed={layout[panel]}
              title={`${layout[panel] ? 'Hide' : 'Show'} ${PANEL_LABEL[panel].toLowerCase()}`}
              onClick={() => onToggle(panel)}
              className={`px-1.5 py-1 font-mono text-[10px] transition-colors ${
                layout[panel] ? 'bg-ink text-surface' : 'bg-surface text-graphite hover:text-ink'
              }`}
            >
              {PANEL_LABEL[panel]}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-expanded={mobileNavOpen}
          aria-label="Toggle navigation"
          className="shrink-0 rounded-sm border border-rule px-2 py-1 font-mono text-[11px] text-ink lg:hidden"
        >
          {mobileNavOpen ? 'Close' : 'Menu'}
        </button>
      </div>
    </header>
  )
}
