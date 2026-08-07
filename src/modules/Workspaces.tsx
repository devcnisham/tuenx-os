import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { fullDate, daysUntil, pluralise } from '../lib/format.ts'
import {
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  TEAM_LABEL,
  type Team,
  type Workspace,
  type WorkspaceIndex,
} from '../types.ts'
import { Button, EmptyState, ErrorState, Panel, Pill, Skeleton, Stat } from '../components/ui.tsx'
import { Tag } from '../components/Tag.tsx'

/**
 * Team workspaces — one page answering "what is my team on the hook for".
 *
 * A team is orthogonal to a division: an Agency designer and a Gaphatch
 * designer are the same craft in different arms. So nothing here filters by
 * division, and a workspace routinely spans two — the division marks on the
 * member rows are the only place it shows.
 *
 * Read-only. Everything on this page belongs to a module that already owns it;
 * editing happens there, and duplicating the affordances would mean two places
 * to keep in step.
 */
export function Workspaces({
  team,
  onPickTeam,
}: {
  team: Team | null
  onPickTeam: (team: Team | null) => void
}) {
  const index = useResource<WorkspaceIndex>(() => api.get('/workspaces'), [])

  if (index.error) return <ErrorState message={index.error} onRetry={index.reload} />
  if (index.loading || !index.data) return <Skeleton rows={4} />

  const teams = index.data.teams

  if (teams.length === 0) {
    return (
      <EmptyState
        title="Nobody is on a team yet"
        hint="Set a team on people in the directory and their workspace appears here."
      />
    )
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-1.5 border-b border-rule pb-3">
        {teams.map((t) => {
          const active = t.team === team
          return (
            <button
              key={t.team}
              type="button"
              onClick={() => onPickTeam(active ? null : t.team)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                active
                  ? 'border-ink bg-ink text-surface'
                  : 'border-rule text-graphite hover:border-graphite hover:text-ink'
              }`}
            >
              {TEAM_LABEL[t.team]}
              <span className={active ? 'text-surface/70' : 'text-faint'}>{t.headcount}</span>
              {t.overdueTasks > 0 && (
                <span className={active ? 'text-surface' : 'text-alert'}>·{t.overdueTasks}</span>
              )}
            </button>
          )
        })}

        {index.data.unassigned > 0 && (
          // Surfaced rather than hidden: `team` is nullable, and anyone without
          // one appears on no workspace at all.
          <span className="ml-auto font-mono text-[10px] text-faint">
            {pluralise(index.data.unassigned, 'person', 'people')} on no team
          </span>
        )}
      </div>

      {team === null ? (
        <EmptyState
          title="Pick a team"
          hint="Each workspace gathers that team's open work, what it rolls up into, and who is away."
        />
      ) : (
        <TeamWorkspace team={team} />
      )}
    </>
  )
}

function TeamWorkspace({ team }: { team: Team }) {
  const workspace = useResource<Workspace>(() => api.get(`/workspaces/${team}`), [team])

  if (workspace.error) return <ErrorState message={workspace.error} onRetry={workspace.reload} />
  if (workspace.loading || !workspace.data) return <Skeleton rows={5} />

  const w = workspace.data

  if (w.totals.headcount === 0) {
    return <EmptyState title={`Nobody on ${TEAM_LABEL[team]}`} hint="Assign someone in the directory." />
  }

  const done = w.byStatus.find((s) => s.status === 'done')?.count ?? 0
  const total = w.byStatus.reduce((n, s) => n + s.count, 0)

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <Stat label="On the team" value={w.totals.headcount} hint={TEAM_LABEL[team]} />
        <Stat label="Open" value={w.totals.openTasks} hint="assigned and not done" />
        <Stat
          label="Overdue"
          value={w.totals.overdueTasks}
          tone={w.totals.overdueTasks > 0 ? 'text-alert' : 'text-faint'}
          hint={w.totals.overdueTasks > 0 ? 'past the date' : 'nothing late'}
        />
        <Stat
          label="Hours logged"
          value={w.totals.hoursLogged}
          hint={`last ${w.hoursWindowDays} days`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <Panel title="Who is on it" bodyClassName="p-0">
            <ul className="divide-y divide-rule">
              {w.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className="h-8 w-[3px] shrink-0 rounded-xs"
                    style={mark(m.division).fill}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-medium text-ink">{m.name}</span>
                      <Tag tag={m.tag} />
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] text-faint">{m.role}</p>
                  </div>
                  <span className="shrink-0 text-right font-mono text-[10px] text-faint">
                    <span className="text-ink">{m.openTasks}</span> open
                    {m.overdueTasks > 0 && <span className="text-alert"> · {m.overdueTasks} late</span>}
                    <br />
                    {m.hoursLogged}h
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Work"
            subtitle={
              <span className="font-mono text-[10px] text-faint">
                {total === 0 ? 'nothing assigned' : `${done} of ${total} done`}
              </span>
            }
            bodyClassName="p-4"
          >
            {total === 0 ? (
              <EmptyState title="Nothing assigned" hint="Tasks assigned to anyone on this team land here." />
            ) : (
              <div className="space-y-2.5">
                {TASK_STATUSES.map((status) => {
                  const count = w.byStatus.find((s) => s.status === status)?.count ?? 0
                  return (
                    <div key={status}>
                      <div className="leader">
                        <span className="label-mono order-0">{TASK_STATUS_LABEL[status]}</span>
                        <span className="order-2 font-mono text-[11px] tabular-nums text-ink">
                          {count}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 bg-wash">
                        <div
                          className={`h-full transition-[width] duration-500 ${
                            status === 'done' ? 'bg-ready' : 'bg-ink'
                          }`}
                          style={{ width: `${total === 0 ? 0 : (count / total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>

          <Away away={w.away} />
        </div>

        <div className="space-y-6">
          <NeedsAttention tasks={w.needsAttention} />
          <RollsUpInto workspace={w} />
        </div>
      </div>
    </>
  )
}

/** Where the team's open work actually sits. Busiest first. */
function RollsUpInto({ workspace }: { workspace: Workspace }) {
  const empty =
    workspace.sprints.length === 0 &&
    workspace.epics.length === 0 &&
    workspace.projects.length === 0

  return (
    <Panel
      title="Rolls up into"
      subtitle={
        <span className="font-mono text-[10px] text-faint">Open work only, busiest first</span>
      }
      bodyClassName="p-4"
    >
      {empty ? (
        <EmptyState
          title="Nothing grouped"
          hint="Sprints, epics, and projects appear once the team's open tasks belong to one."
        />
      ) : (
        <div className="space-y-4">
          <Group
            label="Sprints"
            rows={workspace.sprints.map((s) => ({
              id: s.id,
              tag: s.tag,
              title: s.name,
              detail: `ends ${fullDate(s.endDate)}`,
              openTasks: s.openTasks,
              route: '#/work',
            }))}
          />
          <Group
            label="Epics"
            rows={workspace.epics.map((e) => ({
              id: e.id,
              tag: e.tag,
              title: e.title,
              detail: e.status,
              openTasks: e.openTasks,
              route: '#/work',
            }))}
          />
          <Group
            label="Projects"
            rows={workspace.projects.map((p) => ({
              id: p.id,
              tag: p.tag,
              title: p.title,
              detail: `${p.contact.company ?? p.contact.name}${p.onHold ? ' · on hold' : ''}`,
              openTasks: p.openTasks,
              route: '#/projects',
            }))}
          />
        </div>
      )}
    </Panel>
  )
}

function Group({
  label,
  rows,
}: {
  label: string
  rows: { id: string; tag: string; title: string; detail: string; openTasks: number; route: string }[]
}) {
  if (rows.length === 0) return null

  return (
    <div>
      <p className="label-mono mb-1.5">{label}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.id}>
            <a
              href={r.route}
              className="flex items-center gap-2 rounded-xs px-1 py-1 transition-colors hover:bg-wash"
            >
              <Tag tag={r.tag} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{r.title}</span>
              <span className="shrink-0 font-mono text-[10px] text-faint">{r.detail}</span>
              <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink">
                {r.openTasks}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Current and upcoming leave. A team view that can't answer this sends people to a spreadsheet. */
function Away({ away }: { away: Workspace['away'] }) {
  return (
    <Panel title="Away" bodyClassName="p-4">
      {away.length === 0 ? (
        <EmptyState title="Nobody booked off" hint="Approved and pending leave shows here." />
      ) : (
        <ul className="divide-y divide-rule">
          {away.map((a) => {
            const starts = daysUntil(a.startDate)
            const out = starts <= 0
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 first:pt-0 last:pb-0">
                <span className="text-[13px] text-ink">{a.member.name}</span>
                <Tag tag={a.tag} />
                <Pill tone={out ? 'pending' : 'neutral'}>{out ? 'Out now' : `in ${starts}d`}</Pill>
                <span className="ml-auto font-mono text-[10px] text-faint">
                  {fullDate(a.startDate)} → {fullDate(a.endDate)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

function NeedsAttention({ tasks }: { tasks: Workspace['needsAttention'] }) {
  return (
    <Panel
      title="Needs attention"
      subtitle={
        <span className="font-mono text-[10px] text-faint">High priority, or past the date</span>
      }
      bodyClassName="p-0"
    >
      {tasks.length === 0 ? (
        <div className="p-4">
          <EmptyState title="Nothing urgent" hint="No high-priority or overdue work on this team." />
        </div>
      ) : (
        <ul className="divide-y divide-rule">
          {tasks.map((t) => {
            const late = t.dueDate && daysUntil(t.dueDate) < 0
            return (
              <li key={t.id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag tag={t.tag} />
                  {t.priority === 'high' && <Pill tone="alert">High</Pill>}
                  {late && <Pill tone="alert">{Math.abs(daysUntil(t.dueDate!))}d late</Pill>}
                </div>
                <p className="mt-1 text-[13px] leading-snug text-ink">{t.title}</p>
                <p className="mt-0.5 font-mono text-[10px] text-faint">
                  {t.assignee?.name ?? 'Unassigned'}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

/** Exported so the Team module can offer the toggle without importing internals. */
export function WorkspaceToggle({
  view,
  onChange,
}: {
  view: 'directory' | 'workspaces'
  onChange: (view: 'directory' | 'workspaces') => void
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {(
        [
          ['directory', 'Directory'],
          ['workspaces', 'Workspaces'],
        ] as const
      ).map(([id, label]) => (
        <Button
          key={id}
          size="sm"
          variant={view === id ? 'primary' : 'ghost'}
          onClick={() => onChange(id)}
        >
          {label}
        </Button>
      ))}
    </div>
  )
}
