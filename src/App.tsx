import { useEffect, useState } from 'react'
import { href, useRoute, type ModuleId } from './lib/router.ts'
import { useLayout } from './lib/layout.ts'
import { mark } from './lib/divisions.ts'
import { DIVISION_CODE, ROLE_LABEL, type Division, type Viewer } from './types.ts'
import { useSession } from './lib/session.ts'
import { api } from './lib/api.ts'
import { TagLegend } from './components/Tag.tsx'
import { Icon, type IconName } from './components/Icon.tsx'
import { TopBar } from './components/shell/TopBar.tsx'
import { RightRail } from './components/shell/RightRail.tsx'
import { StatusBar } from './components/shell/StatusBar.tsx'
import { Overview } from './modules/Overview.tsx'
import { Tasks } from './modules/Tasks.tsx'
import { Crm } from './modules/Crm.tsx'
import { Projects } from './modules/Projects.tsx'
import { Invoices } from './modules/Invoices.tsx'
import { Treasury } from './modules/Treasury.tsx'
import { Docs } from './modules/Docs.tsx'
import { Okrs } from './modules/Okrs.tsx'
import { Calendar } from './modules/Calendar.tsx'
import { Planner } from './modules/Planner.tsx'
import { Brainstorms } from './modules/Brainstorms.tsx'
import { Messages } from './modules/Messages.tsx'
import { Team } from './modules/Team.tsx'
import { Products } from './modules/Products.tsx'
import { SignIn } from './modules/SignIn.tsx'
import { ClientPortal } from './modules/ClientPortal.tsx'
import { Users } from './modules/Users.tsx'
import { PeopleOps } from './modules/PeopleOps.tsx'

/**
 * Nav, grouped by which part of the company a module serves. `owner` is the
 * division that owns it per the master plan module map, shown as that
 * division's tag treatment — so the rail teaches the encoding while it
 * navigates.
 */
const NAV: {
  group: string
  items: { id: ModuleId; label: string; owner: Division; icon: IconName }[]
}[] = [
  {
    group: 'Group',
    items: [
      { id: 'overview', label: 'Overview', owner: 'tuenx', icon: 'overview' },
      { id: 'tasks', label: 'Tasks', owner: 'tuenx', icon: 'tasks' },
      { id: 'crm', label: 'CRM', owner: 'tuenx', icon: 'crm' },
      { id: 'team', label: 'Team', owner: 'tuenx', icon: 'team' },
      { id: 'users', label: 'Users', owner: 'tuenx', icon: 'crm' },
      { id: 'ops', label: 'People & Ops', owner: 'tuenx', icon: 'inbox' },
      { id: 'treasury', label: 'Treasury', owner: 'tuenx', icon: 'treasury' },
      { id: 'docs', label: 'Docs', owner: 'tuenx', icon: 'docs' },
      { id: 'okrs', label: 'OKRs', owner: 'tuenx', icon: 'okrs' },
      { id: 'calendar', label: 'Calendar', owner: 'tuenx', icon: 'calendar' },
      { id: 'planner', label: 'Planner', owner: 'tuenx', icon: 'layoutBoard' },
      { id: 'brainstorms', label: 'Brainstorms', owner: 'tuenx', icon: 'okrs' },
      { id: 'messages', label: 'Messages', owner: 'tuenx', icon: 'message' },
    ],
  },
  {
    group: 'Agency',
    items: [
      { id: 'projects', label: 'Projects', owner: 'agency', icon: 'projects' },
      { id: 'invoices', label: 'Invoices', owner: 'agency', icon: 'invoices' },
    ],
  },
  {
    group: 'Gaphatch',
    items: [{ id: 'products', label: 'Products', owner: 'gaphatch', icon: 'products' }],
  },
]

function NavList({ active, onNavigate }: { active: ModuleId; onNavigate?: () => void }) {
  return (
    <nav className="space-y-5">
      {NAV.map(({ group, items }) => (
        <div key={group}>
          <p className="label-mono mb-1.5 px-4">{group}</p>
          <div className="space-y-0.5">
            {items.map((item) => {
              const isActive = item.id === active
              return (
                <a
                  key={item.id}
                  href={href(item.id)}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group mx-2 flex items-center gap-2.5 rounded-sm px-2.5 py-2 transition-all duration-150 ${
                    isActive
                      ? 'bg-ink text-surface shadow-card'
                      : 'text-graphite hover:bg-wash hover:text-ink'
                  }`}
                >
                  <Icon
                    name={item.icon}
                    size={16}
                    className={isActive ? '' : 'text-faint group-hover:text-graphite'}
                  />
                  <span className={`flex-1 text-sm ${isActive ? 'font-medium' : ''}`}>
                    {item.label}
                  </span>
                  <span
                    className={`shrink-0 rounded-xs px-1 py-px font-mono text-[9px] font-medium transition-opacity ${
                      isActive
                        ? 'bg-surface/20 text-surface'
                        : `${mark(item.owner).tag} opacity-60 group-hover:opacity-100`
                    }`}
                  >
                    {DIVISION_CODE[item.owner]}
                  </span>
                </a>
              )
            })}
          </div>
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
  const { viewer, loading, setViewer, signOut } = useSession()
  const [entering, setEntering] = useState(false)

  /**
   * `#/team` and `#/client` open straight into a portal without credentials.
   *
   * The founder asked to drop the login step for now. This mints a real session
   * through the dev endpoint rather than faking a viewer in the browser, so
   * every request afterwards is a normally authenticated one and the server's
   * boundaries still apply — a client landing this way still cannot read
   * anything but their own records.
   */
  useEffect(() => {
    const wanted = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]
    if (viewer || loading || entering) return
    if (wanted !== 'team' && wanted !== 'client') return

    setEntering(true)
    api
      .post<{ viewer: Viewer }>('/auth/dev-session', {
        kind: wanted === 'client' ? 'client' : 'team',
      })
      .then((result) => {
        setViewer(result.viewer)
        window.location.hash = result.viewer.kind === 'client' ? '#/client' : '#/overview'
      })
      .catch(() => {
        // Bypass switched off, or nothing seeded. Fall through to the sign-in
        // screen rather than leaving a blank page.
      })
      .finally(() => setEntering(false))
  }, [viewer, loading, entering, setViewer])

  if (entering) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas">
        <p className="label-mono">Opening…</p>
      </div>
    )
  }

  // Nothing renders until the session is known. Showing the dashboard first and
  // bouncing to sign-in a moment later means every request in between 401s.
  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas">
        <p className="label-mono">Loading…</p>
      </div>
    )
  }

  if (!viewer) return <SignIn onSignedIn={setViewer} />

  // A client gets a different shell entirely, not the dashboard with parts
  // hidden. Hiding by CSS is not a boundary, and disabled nav invites trying.
  if (viewer.kind === 'client') return <ClientPortal viewer={viewer} onSignOut={signOut} />

  return <Dashboard viewer={viewer} onSignOut={signOut} />
}

/** The owner/admin and team dashboard — every module. */
function Dashboard({ viewer, onSignOut }: { viewer: Viewer; onSignOut: () => void }) {
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

              <div className="mt-4 border-t border-rule pt-3">
                <p className="truncate text-[13px] font-medium text-ink">
                  {viewer.account?.name}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-faint">
                  {viewer.account ? ROLE_LABEL[viewer.account.role] : ''}
                </p>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="mt-2 font-mono text-[10px] text-graphite underline-offset-2 transition-colors hover:text-ink hover:underline"
                >
                  Sign out
                </button>
              </div>
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
            {route.module === 'docs' && <Docs />}
            {route.module === 'okrs' && <Okrs />}
            {route.module === 'calendar' && <Calendar />}
            {route.module === 'planner' && <Planner />}
            {route.module === 'brainstorms' && <Brainstorms />}
            {route.module === 'messages' && <Messages />}
            {route.module === 'team' && <Team />}
            {route.module === 'users' && <Users viewer={viewer} />}
            {route.module === 'ops' && <PeopleOps />}
            {route.module === 'products' && <Products productId={route.productId} />}
          </div>
        </main>

        {layout.right && <RightRail />}
      </div>

      {layout.bottom && <StatusBar />}
    </div>
  )
}
