import { api } from '../../lib/api.ts'
import { useResource } from '../../lib/useResource.ts'
import { dueLabel, money, shortDate } from '../../lib/format.ts'
import { href } from '../../lib/router.ts'
import type { Invoice, Overview, Project } from '../../types.ts'
import { Tag } from '../Tag.tsx'
import { Pill } from '../ui.tsx'

/**
 * Right rail: what is on fire, regardless of which module you are looking at.
 *
 * Deliberately a digest of things with a *deadline* — high-priority open work,
 * overdue money, projects past their date. A feed of everything that changed
 * would be noise; this is the short list of things that will get worse if
 * ignored.
 *
 * Each source loads independently, so one failure leaves the rest of the rail
 * useful (TRD §6).
 */
export function RightRail() {
  const overview = useResource<Overview>(() => api.get('/overview'), [])
  const invoices = useResource<Invoice[]>(() => api.get('/invoices', { status: 'overdue' }), [])
  const projects = useResource<Project[]>(() => api.get('/projects'), [])

  const latePro = (projects.data ?? []).filter(
    (p) =>
      p.dueDate &&
      p.status !== 'delivered' &&
      new Date(p.dueDate).getTime() < Date.now(),
  )

  const urgent = (overview.data?.needsAttention ?? []).slice(0, 5)
  const quiet =
    urgent.length === 0 && (invoices.data ?? []).length === 0 && latePro.length === 0

  return (
    <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-rule bg-wash/40 xl:block">
      <div className="border-b border-ink px-4 py-3">
        <p className="label-mono">Attention</p>
        <p className="mt-1 font-mono text-[10px] text-faint">Anything with a deadline</p>
      </div>

      {quiet && (
        <p className="px-4 py-6 text-center font-mono text-[10px] text-faint">
          Nothing overdue and nothing urgent. Rare — enjoy it.
        </p>
      )}

      {(invoices.data ?? []).length > 0 && (
        <Section title="Overdue money" action={{ label: 'Invoices', route: href('invoices') }}>
          {invoices.data!.slice(0, 4).map((invoice) => (
            <Row
              key={invoice.id}
              tag={invoice.tag}
              title={money(invoice.amount)}
              detail={invoice.contact.company ?? invoice.contact.name}
              route={href('invoices')}
              pill={{ tone: 'alert', text: `due ${shortDate(invoice.dueDate)}` }}
            />
          ))}
        </Section>
      )}

      {latePro.length > 0 && (
        <Section title="Late projects" action={{ label: 'Projects', route: href('projects') }}>
          {latePro.slice(0, 4).map((project) => (
            <Row
              key={project.id}
              tag={project.tag}
              title={project.title}
              detail={project.contact.company ?? project.contact.name}
              route={href('projects')}
              pill={{ tone: 'alert', text: dueLabel(project.dueDate!).text }}
            />
          ))}
        </Section>
      )}

      {urgent.length > 0 && (
        <Section title="High priority" action={{ label: 'Tasks', route: href('tasks') }}>
          {urgent.map((task) => {
            const due = task.dueDate ? dueLabel(task.dueDate) : null
            return (
              <Row
                key={task.id}
                tag={task.tag}
                title={task.title}
                detail={task.assignee?.name ?? 'Unassigned'}
                route={href('tasks')}
                pill={
                  due
                    ? {
                        tone: due.tone === 'overdue' ? 'alert' : 'pending',
                        text: due.text,
                      }
                    : undefined
                }
              />
            )
          })}
        </Section>
      )}
    </aside>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action: { label: string; route: string }
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-rule">
      <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-1.5">
        <p className="label-mono">{title}</p>
        <a
          href={action.route}
          className="font-mono text-[10px] text-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
        >
          {action.label} →
        </a>
      </header>
      <div className="divide-y divide-rule/70">{children}</div>
    </section>
  )
}

function Row({
  tag,
  title,
  detail,
  route,
  pill,
}: {
  tag: string
  title: string
  detail: string
  /** Every row goes somewhere — a digest you can't act from is just a poster. */
  route: string
  pill?: { tone: 'alert' | 'pending'; text: string }
}) {
  return (
    <a href={route} className="block px-4 py-2 transition-colors hover:bg-surface">
      <div className="flex items-center gap-1.5">
        <Tag tag={tag} />
        {pill && <Pill tone={pill.tone}>{pill.text}</Pill>}
      </div>
      <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-ink">{title}</p>
      <p className="mt-0.5 truncate font-mono text-[10px] text-faint">{detail}</p>
    </a>
  )
}
