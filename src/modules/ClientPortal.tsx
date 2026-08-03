import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { fullDate, money, moneyShort, shortDate } from '../lib/format.ts'
import {
  CONTRACT_TYPE_LABEL,
  INVOICE_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  type ContractType,
  type InvoiceStatus,
  type ProjectStatus,
  type Viewer,
} from '../types.ts'
import {
  Button,
  EmptyState,
  ErrorState,
  Panel,
  Pill,
  Skeleton,
  Stat,
  type PillTone,
} from '../components/ui.tsx'
import { Tag } from '../components/Tag.tsx'

/** Exactly what the portal endpoint returns — deliberately narrower than the internal types. */
interface PortalData {
  contact: {
    id: string
    tag: string
    name: string
    company: string | null
    contractType: ContractType | null
    contractValue: number | null
    startDate: string | null
    endDate: string | null
  }
  projects: {
    id: string
    tag: string
    title: string
    status: ProjectStatus
    dueDate: string | null
  }[]
  invoices: {
    id: string
    tag: string
    amount: number
    status: InvoiceStatus
    issueDate: string
    dueDate: string
    project: { tag: string; title: string } | null
  }[]
  totals: { outstanding: number; paid: number; openProjects: number }
}

const INVOICE_TONE: Record<InvoiceStatus, PillTone> = {
  draft: 'neutral',
  sent: 'pending',
  paid: 'ready',
  overdue: 'alert',
}

/**
 * What a client sees. Read-only, and only their own records.
 *
 * A separate shell from the dashboard rather than the same one with things
 * hidden — nav that is present but disabled is an invitation to try, and
 * hiding by CSS is not a security boundary. The server decides what this can
 * see; this only decides how to lay it out.
 */
export function ClientPortal({ viewer, onSignOut }: { viewer: Viewer; onSignOut: () => void }) {
  const portal = useResource<PortalData>(() => api.get('/portal'), [])

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <span className="inline-flex items-baseline gap-1.5">
              <span className="font-display text-base leading-none font-semibold tracking-tight text-ink">
                TUENX
              </span>
              <span className="rounded-xs bg-ink px-1 py-px font-mono text-[9px] font-medium text-surface">
                OS
              </span>
            </span>
            <p className="mt-1 truncate font-mono text-[11px] text-faint">
              {viewer.client?.company ?? viewer.client?.name} · client portal
            </p>
          </div>
          <Button size="sm" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        {portal.error ? (
          <ErrorState message={portal.error} onRetry={portal.reload} />
        ) : portal.loading || !portal.data ? (
          <Skeleton rows={4} />
        ) : (
          <>
            <div className="mb-8">
              <p className="label-mono">Your account</p>
              <h1 className="mt-1.5 font-display text-3xl leading-none font-semibold tracking-tight text-ink">
                {portal.data.contact.company ?? portal.data.contact.name}
              </h1>
              <p className="mt-2 font-mono text-[11px] text-faint">
                Reference {portal.data.contact.tag}
              </p>
            </div>

            <div className="mb-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
              <Stat
                label="Outstanding"
                value={moneyShort(portal.data.totals.outstanding)}
                tone={portal.data.totals.outstanding > 0 ? 'text-ink' : 'text-faint'}
                hint="not yet paid"
              />
              <Stat label="Paid" value={moneyShort(portal.data.totals.paid)} hint="to date" />
              <Stat
                label="Live work"
                value={portal.data.totals.openProjects}
                hint="projects in flight"
              />
            </div>

            {portal.data.contact.contractType && (
              <Panel title="Your contract" className="mb-6" bodyClassName="p-5">
                <div className="grid gap-5 sm:grid-cols-3">
                  <div>
                    <p className="label-mono">Type</p>
                    <p className="mt-1.5 text-sm text-ink">
                      {CONTRACT_TYPE_LABEL[portal.data.contact.contractType]}
                    </p>
                  </div>
                  {portal.data.contact.contractValue !== null && (
                    <div>
                      <p className="label-mono">
                        {portal.data.contact.contractType === 'retainer' ? 'Per cycle' : 'Value'}
                      </p>
                      <p className="mt-1.5 font-mono text-sm tabular-nums text-ink">
                        {money(portal.data.contact.contractValue)}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="label-mono">Term</p>
                    <p className="mt-1.5 font-mono text-[12px] text-ink">
                      {portal.data.contact.startDate
                        ? fullDate(portal.data.contact.startDate)
                        : '—'}
                      {' → '}
                      {portal.data.contact.endDate ? fullDate(portal.data.contact.endDate) : '—'}
                    </p>
                  </div>
                </div>
              </Panel>
            )}

            <Panel title="Projects" className="mb-6" bodyClassName="p-0">
              {portal.data.projects.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon="projects"
                    title="Nothing in flight"
                    hint="Work will show here once a project is set up."
                  />
                </div>
              ) : (
                <ul className="divide-y divide-rule-soft">
                  {portal.data.projects.map((project) => (
                    <li
                      key={project.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4"
                    >
                      <Tag tag={project.tag} />
                      <span className="min-w-0 flex-1 basis-56 text-sm text-ink">
                        {project.title}
                      </span>
                      {project.dueDate && (
                        <span className="font-mono text-[10px] text-faint">
                          due {shortDate(project.dueDate)}
                        </span>
                      )}
                      <Pill tone={project.status === 'delivered' ? 'ready' : 'neutral'}>
                        {PROJECT_STATUS_LABEL[project.status]}
                      </Pill>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title="Invoices"
              subtitle={
                <span className="font-mono text-[10px] text-faint">
                  Drafts are not shown — nothing here has been billed by mistake
                </span>
              }
              bodyClassName="p-0"
            >
              {portal.data.invoices.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon="invoices"
                    title="No invoices yet"
                    hint="Anything billed will appear here."
                  />
                </div>
              ) : (
                <ul className="divide-y divide-rule-soft">
                  {portal.data.invoices.map((invoice) => (
                    <li
                      key={invoice.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4"
                    >
                      <Tag tag={invoice.tag} />
                      <span className="min-w-0 flex-1 basis-48">
                        <span className="block font-display text-lg leading-none font-semibold tabular-nums text-ink">
                          {money(invoice.amount)}
                        </span>
                        <span className="mt-1 block font-mono text-[10px] text-faint">
                          {invoice.project?.title ?? 'No project'}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] text-faint">
                        issued {shortDate(invoice.issueDate)} · due {shortDate(invoice.dueDate)}
                      </span>
                      <Pill tone={INVOICE_TONE[invoice.status]}>
                        {INVOICE_STATUS_LABEL[invoice.status]}
                      </Pill>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <p className="mt-6 text-center font-mono text-[10px] text-faint">
              Something look wrong? Reply to your usual contact.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
