import { api } from '../../lib/api.ts'
import { useResource } from '../../lib/useResource.ts'
import { moneyShort, pluralise } from '../../lib/format.ts'
import { href } from '../../lib/router.ts'
import type { Overview } from '../../types.ts'

/**
 * Bottom bar: the group's vital signs, on every screen.
 *
 * Four numbers a founder would otherwise open four modules to get, plus the
 * API connection state — which is the one thing that explains an empty screen,
 * and is invisible everywhere else.
 */
export function StatusBar() {
  const overview = useResource<Overview>(() => api.get('/overview'), [])

  const connected = !overview.error
  const t = overview.data?.totals

  return (
    <footer className="sticky bottom-0 z-30 flex items-center gap-4 overflow-x-auto border-t border-rule bg-wash px-4 py-1.5 font-mono text-[10px] whitespace-nowrap text-graphite">
      <span className="flex shrink-0 items-center gap-1.5">
        <span
          className={`size-1.5 rounded-full ${connected ? 'bg-ready' : 'bg-alert'}`}
          aria-hidden
        />
        {connected ? 'Connected' : 'API unreachable'}
      </span>

      {t && (
        <>
          <Divider />
          <Reading label="Open" value={pluralise(t.openTasks, 'task')} to={href('tasks')} />
          <Divider />
          <Reading label="Pipeline" value={moneyShort(t.pipelineValue)} to={href('crm')} />
          <Divider />
          <Reading
            label="Overdue"
            value={String(t.overdueInvoices)}
            tone={t.overdueInvoices > 0 ? 'text-alert' : undefined}
            to={href('invoices')}
          />
          <Divider />
          <Reading label="Treasury" value={moneyShort(t.treasuryBalance)} to={href('treasury')} />
        </>
      )}

      <span className="ml-auto hidden shrink-0 items-center gap-1 text-faint sm:flex">
        <kbd className="rounded-xs border border-rule px-1">/</kbd>
        to search
      </span>
    </footer>
  )
}

const Divider = () => (
  <span className="shrink-0 text-rule select-none" aria-hidden>
    │
  </span>
)

/**
 * Each reading links to the module it came from — a number you can see but
 * can't get behind is a poster, not a status bar.
 */
function Reading({
  label,
  value,
  tone,
  to,
}: {
  label: string
  value: string
  tone?: string
  to: string
}) {
  return (
    <a
      href={to}
      className="shrink-0 rounded-xs px-1 py-0.5 transition-colors hover:bg-surface"
      title={`Open ${label.toLowerCase()}`}
    >
      <span className="text-faint">{label} </span>
      <span className={tone ?? 'text-ink'}>{value}</span>
    </a>
  )
}
