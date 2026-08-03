import { useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { dateInputValue, dueLabel, pluralise, shortDate, todayInputValue } from '../lib/format.ts'
import {
  DIVISIONS,
  DIVISION_LABEL,
  EPIC_STATUSES,
  EPIC_STATUS_LABEL,
  SPRINT_STATUSES,
  SPRINT_STATUS_LABEL,
  type Division,
  type Epic,
  type EpicStatus,
  type Sprint,
  type SprintStatus,
  type Task,
  type TeamMember,
} from '../types.ts'
import { PageHeader, Toolbar } from '../components/PageHeader.tsx'
import { Button, EmptyState, ErrorState, Panel, Pill, Skeleton, Stat } from '../components/ui.tsx'
import { FilterSelect, SelectField, TextAreaField, TextField } from '../components/Field.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { LinkedRecords } from '../components/LinkedRecords.tsx'
import { Tag } from '../components/Tag.tsx'

/**
 * The structure around tasks: epics, sprints, and where the hours went.
 *
 * All of it is optional. A team that doesn't run sprints leaves every task's
 * sprint empty and nothing on the board changes — the server was built that
 * way and the UI keeps the promise. Structure that forces itself on people who
 * don't want it is how a task tool becomes the thing everyone avoids.
 *
 * Separate from Tasks because the board answers "what am I doing now" and this
 * answers "how much is left, and who is carrying it". Mixing the two makes the
 * board heavier for the person who only wanted the first answer.
 */

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))

const TABS = [
  { id: 'epics', label: 'Epics' },
  { id: 'sprints', label: 'Sprints' },
  { id: 'workload', label: 'Workload' },
] as const

type TabId = (typeof TABS)[number]['id']

export function Work() {
  const [tab, setTab] = useState<TabId>('epics')

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Cross-division"
        title="Sprints & Epics"
        description="The shape of the work above the task: what a body of work adds up to, what is in flight this fortnight, and who is carrying how much of it."
      />

      <div
        role="tablist"
        aria-label="Work sections"
        className="mb-5 flex flex-wrap gap-1 border-b border-rule pb-3"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-sm px-3 py-1.5 font-mono text-[11px] font-medium tracking-wide transition-colors ${
              tab === t.id
                ? 'bg-ink text-surface shadow-card'
                : 'text-graphite hover:bg-wash hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'epics' && <Epics />}
      {tab === 'sprints' && <Sprints />}
      {tab === 'workload' && <Workload />}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Progress bar                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Done against total, in the division's colour.
 *
 * Colour here is division, not status — the bar says whose work it is, and the
 * proportion says how it is going. Red/green would claim a judgement the number
 * doesn't support: a half-finished epic is not "bad".
 */
function Progress({
  done,
  total,
  division,
}: {
  done: number
  total: number
  division: Division
}) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[10px] text-faint">
        <span>
          {done}/{total} done
        </span>
        <span className="tabular-nums text-ink">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-wash">
        <div className="h-full rounded-full transition-all" style={{ ...mark(division).fill, width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Estimated against logged. Silent when neither has been filled in. */
function Hours({ estimate, logged }: { estimate: number; logged: number }) {
  if (estimate === 0 && logged === 0) return null
  const over = estimate > 0 && logged > estimate

  return (
    <p className="font-mono text-[10px] text-faint">
      <span className={over ? 'text-alert' : 'text-ink'}>{logged}h</span> logged
      {estimate > 0 && <> of {estimate}h estimated</>}
    </p>
  )
}

/* -------------------------------------------------------------------------- */
/* Epics                                                                      */
/* -------------------------------------------------------------------------- */

function Epics() {
  const [division, setDivision] = useState<Division | ''>('')
  const [status, setStatus] = useState<EpicStatus | ''>('')
  const [editing, setEditing] = useState<Epic | 'new' | null>(null)

  const epics = useResource<Epic[]>(
    () => api.get('/work/epics', { division, status }),
    [division, status],
  )

  return (
    <>
      <Toolbar>
        <FilterSelect
          ariaLabel="Filter by division"
          placeholder="All divisions"
          value={division}
          options={DIVISION_OPTIONS}
          onChange={setDivision}
        />
        <FilterSelect
          ariaLabel="Filter by status"
          placeholder="Any status"
          value={status}
          options={EPIC_STATUSES.map((s) => ({ value: s, label: EPIC_STATUS_LABEL[s] }))}
          onChange={setStatus}
        />
        {(division || status) && (
          <Button
            size="sm"
            onClick={() => {
              setDivision('')
              setStatus('')
            }}
          >
            Clear
          </Button>
        )}
        <span className="ml-auto font-mono text-[10px] text-faint">
          {pluralise(epics.data?.length ?? 0, 'epic')}
        </span>
        <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
          + New epic
        </Button>
      </Toolbar>

      {epics.error ? (
        <ErrorState message={epics.error} onRetry={epics.reload} />
      ) : epics.loading ? (
        <Skeleton rows={3} />
      ) : (epics.data ?? []).length === 0 ? (
        <EmptyState
          title="No epics"
          hint="An epic is a body of work too big for one task and too specific for a project — a rebrand, a migration, a launch. Tasks join one by picking it on the task itself."
          icon="layoutBoard"
          action={{ label: 'Add an epic', onClick: () => setEditing('new') }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(epics.data ?? []).map((epic) => (
            <Panel key={epic.id} bodyClassName="p-4">
              <div className="flex items-start justify-between gap-2">
                <Tag tag={epic.tag} />
                <Pill tone={epic.status === 'done' ? 'ready' : epic.status === 'dropped' ? 'neutral' : 'pending'}>
                  {EPIC_STATUS_LABEL[epic.status]}
                </Pill>
              </div>

              <button
                type="button"
                onClick={() => setEditing(epic)}
                className="mt-2 block w-full text-left font-display text-base leading-snug font-semibold text-ink underline-offset-2 hover:underline"
              >
                {epic.title}
              </button>

              <div className="mt-3">
                <Progress done={epic.counts.done} total={epic.counts.tasks} division={epic.division} />
              </div>

              <div className="mt-2">
                <Hours estimate={epic.estimateHours} logged={epic.loggedHours} />
              </div>

              <a
                href={`#/tasks?epic=${epic.id}`}
                className="mt-3 inline-block font-mono text-[10px] text-graphite underline-offset-2 hover:text-ink hover:underline"
              >
                Open its tasks →
              </a>
            </Panel>
          ))}
        </div>
      )}

      {editing && (
        <EpicForm
          epic={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            epics.reload()
          }}
        />
      )}
    </>
  )
}

function EpicForm({
  epic,
  onClose,
  onSaved,
}: {
  epic: Epic | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(epic?.title ?? '')
  const [division, setDivision] = useState<Division | ''>(epic?.division ?? 'tuenx')
  const [status, setStatus] = useState<EpicStatus | ''>(epic?.status ?? 'open')
  const [notes, setNotes] = useState(epic?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = { title, division, status, notes }
      if (epic) await api.patch(`/work/epics/${epic.id}`, body)
      else await api.post('/work/epics', body)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!epic) return
    const warning =
      `Delete ${epic.title} (${epic.tag})?\n\n` +
      `Its ${pluralise(epic.counts.tasks, 'task')} stay — they lose the epic, not their place on the board.`
    if (!confirm(warning)) return

    setSaving(true)
    try {
      await api.del(`/work/epics/${epic.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={epic ? 'Edit epic' : 'New epic'}
      subtitle={
        epic ? (
          <Tag tag={epic.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">Tagged on save, e.g. GPH-Y002</span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-4 py-4">
          <TextField label="Title" value={title} onChange={setTitle} required autoFocus />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Division"
              value={division}
              options={DIVISION_OPTIONS}
              onChange={setDivision}
            />
            <SelectField
              label="Status"
              value={status}
              options={EPIC_STATUSES.map((s) => ({ value: s, label: EPIC_STATUS_LABEL[s] }))}
              onChange={setStatus}
            />
          </div>
          <TextAreaField label="Notes" value={notes} onChange={setNotes} rows={4} />

          {epic && <LinkedRecords type="epic" id={epic.id} />}

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {epic && (
            <Button type="button" variant="danger" onClick={remove} disabled={saving} className="mr-auto">
              Delete
            </Button>
          )}
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : epic ? 'Save changes' : 'Create epic'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}

/* -------------------------------------------------------------------------- */
/* Sprints                                                                    */
/* -------------------------------------------------------------------------- */

function Sprints() {
  const [division, setDivision] = useState<Division | ''>('')
  const [status, setStatus] = useState<SprintStatus | ''>('')
  const [editing, setEditing] = useState<Sprint | 'new' | null>(null)

  const sprints = useResource<Sprint[]>(
    () => api.get('/work/sprints', { division, status }),
    [division, status],
  )

  return (
    <>
      <Toolbar>
        <FilterSelect
          ariaLabel="Filter by division"
          placeholder="All divisions"
          value={division}
          options={DIVISION_OPTIONS}
          onChange={setDivision}
        />
        <FilterSelect
          ariaLabel="Filter by status"
          placeholder="Any status"
          value={status}
          options={SPRINT_STATUSES.map((s) => ({ value: s, label: SPRINT_STATUS_LABEL[s] }))}
          onChange={setStatus}
        />
        {(division || status) && (
          <Button
            size="sm"
            onClick={() => {
              setDivision('')
              setStatus('')
            }}
          >
            Clear
          </Button>
        )}
        <span className="ml-auto font-mono text-[10px] text-faint">
          {pluralise(sprints.data?.length ?? 0, 'sprint')}
        </span>
        <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
          + New sprint
        </Button>
      </Toolbar>

      {sprints.error ? (
        <ErrorState message={sprints.error} onRetry={sprints.reload} />
      ) : sprints.loading ? (
        <Skeleton rows={3} />
      ) : (sprints.data ?? []).length === 0 ? (
        <EmptyState
          title="No sprints"
          hint="A sprint is dates, not a number of weeks — teams skip weeks, and a computed end date would lie about when the work actually ran."
          icon="calendar"
          action={{ label: 'Plan a sprint', onClick: () => setEditing('new') }}
        />
      ) : (
        <div className="space-y-3">
          {(sprints.data ?? []).map((sprint) => {
            const ends = sprint.status === 'active' ? dueLabel(sprint.endDate) : null
            return (
              <Panel key={sprint.id} bodyClassName="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className="mt-1 h-10 w-[3px] shrink-0 rounded-full"
                    style={mark(sprint.division).fill}
                    aria-hidden
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag tag={sprint.tag} />
                      <button
                        type="button"
                        onClick={() => setEditing(sprint)}
                        className="text-left font-display text-base leading-none font-semibold text-ink underline-offset-2 hover:underline"
                      >
                        {sprint.name}
                      </button>
                      <Pill
                        tone={
                          sprint.status === 'active'
                            ? 'ready'
                            : sprint.status === 'closed'
                              ? 'neutral'
                              : 'pending'
                        }
                      >
                        {SPRINT_STATUS_LABEL[sprint.status]}
                      </Pill>
                      {ends && <Pill tone={ends.tone === 'overdue' ? 'alert' : 'pending'}>{ends.text}</Pill>}
                    </div>

                    <p className="mt-1 font-mono text-[10px] text-faint">
                      {shortDate(sprint.startDate)} – {shortDate(sprint.endDate)}
                      {sprint.goal && <span className="text-graphite"> · {sprint.goal}</span>}
                    </p>

                    <div className="mt-2">
                      <Hours estimate={sprint.estimateHours} logged={sprint.loggedHours} />
                    </div>
                  </div>

                  <div className="w-full sm:w-56">
                    <Progress
                      done={sprint.counts.done}
                      total={sprint.counts.tasks}
                      division={sprint.division}
                    />
                    <a
                      href={`#/tasks?sprint=${sprint.id}`}
                      className="mt-2 inline-block font-mono text-[10px] text-graphite underline-offset-2 hover:text-ink hover:underline"
                    >
                      Open its tasks →
                    </a>
                  </div>
                </div>
              </Panel>
            )
          })}
        </div>
      )}

      {editing && (
        <SprintForm
          sprint={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            sprints.reload()
          }}
        />
      )}
    </>
  )
}

function SprintForm({
  sprint,
  onClose,
  onSaved,
}: {
  sprint: Sprint | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(sprint?.name ?? '')
  const [division, setDivision] = useState<Division | ''>(sprint?.division ?? 'gaphatch')
  const [status, setStatus] = useState<SprintStatus | ''>(sprint?.status ?? 'planned')
  const [goal, setGoal] = useState(sprint?.goal ?? '')
  const [startDate, setStartDate] = useState(
    dateInputValue(sprint?.startDate ?? null) || todayInputValue(),
  )
  const [endDate, setEndDate] = useState(dateInputValue(sprint?.endDate ?? null) || todayInputValue())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = { name, division, status, goal, startDate, endDate }
      if (sprint) await api.patch(`/work/sprints/${sprint.id}`, body)
      else await api.post('/work/sprints', body)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!sprint) return
    const warning =
      `Delete ${sprint.name} (${sprint.tag})?\n\n` +
      `Its ${pluralise(sprint.counts.tasks, 'task')} stay — they lose the sprint, not their place on the board.`
    if (!confirm(warning)) return

    setSaving(true)
    try {
      await api.del(`/work/sprints/${sprint.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={sprint ? 'Edit sprint' : 'New sprint'}
      subtitle={
        sprint ? (
          <Tag tag={sprint.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">Tagged on save, e.g. GPH-W003</span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-4 py-4">
          <TextField label="Name" value={name} onChange={setName} required autoFocus />
          <TextField
            label="Goal"
            value={goal}
            onChange={setGoal}
            placeholder="One sentence — what this sprint is for"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Division"
              value={division}
              options={DIVISION_OPTIONS}
              onChange={setDivision}
            />
            <SelectField
              label="Status"
              value={status}
              options={SPRINT_STATUSES.map((s) => ({ value: s, label: SPRINT_STATUS_LABEL[s] }))}
              onChange={setStatus}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Starts" type="date" value={startDate} onChange={setStartDate} required />
            <TextField label="Ends" type="date" value={endDate} onChange={setEndDate} required />
          </div>

          {sprint && <LinkedRecords type="sprint" id={sprint.id} />}

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {sprint && (
            <Button type="button" variant="danger" onClick={remove} disabled={saving} className="mr-auto">
              Delete
            </Button>
          )}
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : sprint ? 'Save changes' : 'Create sprint'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}

/* -------------------------------------------------------------------------- */
/* Workload                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Who is carrying what, derived rather than stored.
 *
 * Subtasks are included — `?includeSubtasks=true` — because a subtask is real
 * work assigned to a real person, and a workload view that hides half the
 * assignments is worse than none.
 */
function Workload() {
  const tasks = useResource<Task[]>(() => api.get('/tasks', { includeSubtasks: 'true' }), [])
  const team = useResource<TeamMember[]>(() => api.get('/team'), [])

  const rows = useMemo(() => {
    const open = (tasks.data ?? []).filter((t) => t.status !== 'done')

    const byMember = new Map<
      string,
      { name: string; division: Division; tag: string; open: number; estimate: number; logged: number }
    >()

    for (const member of team.data ?? []) {
      byMember.set(member.id, {
        name: member.name,
        division: member.division,
        tag: member.tag,
        open: 0,
        estimate: 0,
        logged: 0,
      })
    }

    let unassigned = 0
    for (const task of open) {
      if (!task.assigneeId) {
        unassigned += 1
        continue
      }
      const row = byMember.get(task.assigneeId)
      if (!row) continue
      row.open += 1
      row.estimate += task.estimateHours ?? 0
      row.logged += task.loggedHours
    }

    return {
      members: [...byMember.values()].sort((a, b) => b.estimate - a.estimate || b.open - a.open),
      unassigned,
      totalOpen: open.length,
    }
  }, [tasks.data, team.data])

  const busiest = rows.members[0]?.estimate ?? 0

  if (tasks.error) return <ErrorState message={tasks.error} onRetry={tasks.reload} />
  if (tasks.loading) return <Skeleton rows={4} />

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Panel>
          <Stat label="Open tasks" value={rows.totalOpen} hint="Subtasks included — they are work too" />
        </Panel>
        <Panel>
          <Stat
            label="Estimated"
            value={`${rows.members.reduce((sum, m) => sum + m.estimate, 0)}h`}
            hint="Across everything still open"
          />
        </Panel>
        <Panel>
          <Stat
            label="Unassigned"
            value={rows.unassigned}
            tone={rows.unassigned > 0 ? 'text-alert' : 'text-ink'}
            hint="Nobody is carrying these yet"
          />
        </Panel>
      </div>

      <Panel title="By person" bodyClassName="p-0">
        <ul className="divide-y divide-rule-soft">
          {rows.members.map((row) => (
            <li key={row.tag} className="flex items-center gap-3 px-4 py-3">
              <span
                className="h-8 w-[3px] shrink-0 rounded-full"
                style={mark(row.division).fill}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13px] text-ink">
                  <Tag tag={row.tag} />
                  <span className="truncate">{row.name}</span>
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-faint">
                  {pluralise(row.open, 'open task')}
                  {row.logged > 0 && ` · ${row.logged}h logged`}
                </p>
              </div>

              {/* Bars are relative to the busiest person, not to a capacity
                  number — nobody has told this app what a full week is, and
                  inventing one would make the bar a lie. */}
              <div className="w-32 shrink-0 sm:w-48">
                <div className="h-1.5 overflow-hidden rounded-full bg-wash">
                  <div
                    className="h-full rounded-full"
                    style={{
                      ...mark(row.division).fill,
                      width: busiest === 0 ? '0%' : `${Math.round((row.estimate / busiest) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-ink">
                {row.estimate}h
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  )
}
