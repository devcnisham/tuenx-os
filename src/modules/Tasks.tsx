import { useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { dateInputValue, dueLabel, pluralise } from '../lib/format.ts'
import {
  DIVISIONS,
  DIVISION_LABEL,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type Division,
  type Project,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TeamMember,
} from '../types.ts'
import { useRecordLayout } from '../lib/recordLayout.ts'
import { PageHeader, Toolbar } from '../components/PageHeader.tsx'
import { LayoutSwitch } from '../components/LayoutSwitch.tsx'
import { Button, ErrorState, Panel, Pill, Skeleton, type PillTone } from '../components/ui.tsx'
import { FilterSelect, SelectField, TextField } from '../components/Field.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { Tag } from '../components/Tag.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))
const PRIORITY_OPTIONS = TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABEL[p] }))
const STATUS_OPTIONS = TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))

/** Colour only ever means status — priority is a status, division is not. */
const PRIORITY_TONE: Record<TaskPriority, PillTone> = {
  high: 'alert',
  medium: 'pending',
  low: 'neutral',
}

/**
 * PRD §6 Phase 1: kanban by status, filterable by division, priority,
 * assignee, and due date.
 *
 * Filters go to the API as query params rather than being applied in the
 * browser, so the board stays correct once the task list outgrows one page —
 * and a filtered board is a URL someone can paste into Slack.
 *
 * Dense by design: this is a working board, so rows are tight and more fits
 * on screen.
 */
export function Tasks() {
  const [division, setDivision] = useState<Division | ''>('')
  const [priority, setPriority] = useState<TaskPriority | ''>('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueBefore, setDueBefore] = useState('')
  const [projectId, setProjectId] = useState('')
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [layout, setLayout] = useRecordLayout('tasks', 'board')

  const tasks = useResource<Task[]>(
    () => api.get('/tasks', { division, priority, assigneeId, dueBefore, projectId }),
    [division, priority, assigneeId, dueBefore, projectId],
  )

  // Loaded independently of the board — a failure here leaves the filters
  // without names but doesn't break the tasks themselves (TRD §6).
  const team = useResource<TeamMember[]>(() => api.get('/team'), [])
  const projects = useResource<Project[]>(() => api.get('/projects'), [])

  const assigneeOptions = useMemo(
    () => [
      { value: 'unassigned', label: 'Unassigned' },
      ...(team.data ?? []).map((m) => ({ value: m.id, label: m.name })),
    ],
    [team.data],
  )

  const columns = useMemo(
    () =>
      TASK_STATUSES.map((status) => ({
        status,
        items: (tasks.data ?? []).filter((t) => t.status === status),
      })),
    [tasks.data],
  )

  const filtersActive = Boolean(division || priority || assigneeId || dueBefore || projectId)

  /** Optimistic: the card moves immediately, and reverts if the API says no. */
  const moveTask = async (task: Task, status: TaskStatus) => {
    const previous = tasks.data ?? []
    tasks.set(previous.map((t) => (t.id === task.id ? { ...t, status } : t)))
    try {
      await api.patch(`/tasks/${task.id}`, { status })
    } catch {
      tasks.set(previous)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Cross-division"
        title="Tasks"
        description="Every open thread across Tuenx, Agency, and Gaphatch. Drag a card between columns, or use the arrows on touch."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            + New task
          </Button>
        }
      />

      <Toolbar>
        <FilterSelect
          ariaLabel="Filter by division"
          placeholder="All divisions"
          value={division}
          options={DIVISION_OPTIONS}
          onChange={setDivision}
        />
        <FilterSelect
          ariaLabel="Filter by priority"
          placeholder="Any priority"
          value={priority}
          options={PRIORITY_OPTIONS}
          onChange={setPriority}
        />
        <FilterSelect
          ariaLabel="Filter by assignee"
          placeholder="Anyone"
          value={assigneeId}
          options={assigneeOptions}
          onChange={(v) => setAssigneeId(v)}
        />
        <FilterSelect
          ariaLabel="Filter by project"
          placeholder="Any project"
          value={projectId}
          options={(projects.data ?? []).map((p) => ({
            value: p.id,
            label: `${p.title} · ${p.tag}`,
          }))}
          onChange={(v) => setProjectId(v)}
        />
        <label
          className={`flex items-center gap-2 rounded-sm border px-2 py-1 transition-colors ${
            dueBefore ? 'border-ink' : 'border-rule'
          }`}
        >
          <span className="label-mono">Due before</span>
          <input
            type="date"
            value={dueBefore}
            onChange={(e) => setDueBefore(e.target.value)}
            className="bg-transparent font-mono text-[11px] text-ink focus:outline-none"
          />
        </label>

        {filtersActive && (
          <Button
            size="sm"
            onClick={() => {
              setDivision('')
              setPriority('')
              setAssigneeId('')
              setDueBefore('')
              setProjectId('')
            }}
          >
            Clear
          </Button>
        )}

        <span className="ml-auto font-mono text-[10px] text-faint">
          {pluralise(tasks.data?.length ?? 0, 'task')}
        </span>
        <LayoutSwitch value={layout} onChange={setLayout} />
      </Toolbar>

      {tasks.error ? (
        <ErrorState message={tasks.error} onRetry={tasks.reload} />
      ) : tasks.loading ? (
        <Skeleton rows={5} />
      ) : layout === 'board' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {columns.map(({ status, items }) => (
            <Column
              key={status}
              status={status}
              tasks={items}
              onDropTask={(taskId) => {
                const dropped = tasks.data?.find((t) => t.id === taskId)
                if (dropped && dropped.status !== status) moveTask(dropped, status)
              }}
              onMove={moveTask}
              onEdit={setEditing}
            />
          ))}
        </div>
      ) : layout === 'grid' ? (
        // Grid drops the status columns, so each card states its own status.
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(tasks.data ?? []).map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              showStatus
              onMove={moveTask}
              onEdit={() => setEditing(task)}
            />
          ))}
        </div>
      ) : (
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-rule">
            {(tasks.data ?? []).map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onMove={moveTask}
                onEdit={() => setEditing(task)}
              />
            ))}
          </ul>
        </Panel>
      )}

      {editing && (
        <TaskForm
          task={editing === 'new' ? null : editing}
          team={team.data ?? []}
          projects={projects.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            tasks.reload()
          }}
        />
      )}
    </>
  )
}

function Column({
  status,
  tasks,
  onDropTask,
  onMove,
  onEdit,
}: {
  status: TaskStatus
  tasks: Task[]
  onDropTask: (taskId: string) => void
  onMove: (task: Task, status: TaskStatus) => void
  onEdit: (task: Task) => void
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <Panel
      title={
        <span className="flex items-baseline gap-1.5">
          {TASK_STATUS_LABEL[status]}
          <span className="text-faint">{tasks.length}</span>
        </span>
      }
      className={`transition-colors ${dragOver ? 'border-ink' : ''}`}
      bodyClassName="p-2 min-h-24"
    >
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const id = e.dataTransfer.getData('text/plain')
          // The parent resolves the id and ignores a card dropped on its own column.
          if (id) onDropTask(id)
        }}
        className="space-y-1.5"
      >
        {tasks.length === 0 ? (
          <p className="py-6 text-center font-mono text-[10px] text-faint">Nothing here</p>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} onMove={onMove} onEdit={() => onEdit(task)} />
          ))
        )}
      </div>
    </Panel>
  )
}

function TaskCard({
  task,
  showStatus = false,
  onMove,
  onEdit,
}: {
  task: Task
  /** Grid view has no status columns, so the card has to say it itself. */
  showStatus?: boolean
  onMove: (task: Task, status: TaskStatus) => void
  onEdit: () => void
}) {
  const index = TASK_STATUSES.indexOf(task.status)
  const due = task.dueDate ? dueLabel(task.dueDate) : null

  return (
    <article
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
      className="group relative overflow-hidden rounded-sm border border-rule bg-surface py-2 pr-2 pl-3 transition-colors hover:border-ink"
    >
      {/* Division marker — the same colour encoding as the tag. */}
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={mark(task.division).fill}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-2">
        <Tag tag={task.tag} />
        <span className="flex items-center gap-1">
          {showStatus && <Pill>{TASK_STATUS_LABEL[task.status]}</Pill>}
          <Pill tone={PRIORITY_TONE[task.priority]}>{TASK_PRIORITY_LABEL[task.priority]}</Pill>
        </span>
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="mt-1.5 block w-full text-left text-[13px] leading-snug text-ink underline-offset-2 hover:underline"
      >
        {task.title}
      </button>

      {task.project && (
        <p className="mt-1 flex items-center gap-1 truncate font-mono text-[10px] text-faint">
          <Tag tag={task.project.tag} />
          <span className="truncate">{task.project.title}</span>
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[10px] text-faint">
        <span className={task.assignee ? '' : 'italic'}>
          {task.assignee?.name ?? 'Unassigned'}
        </span>
        {due && (
          <>
            <span>·</span>
            <span
              className={
                due.tone === 'overdue'
                  ? 'text-alert'
                  : due.tone === 'soon'
                    ? 'text-pending'
                    : 'text-graphite'
              }
            >
              {due.text}
            </span>
          </>
        )}

        {/* Touch-friendly fallback for drag-and-drop. */}
        <span className="ml-auto flex gap-1">
          <MoveButton
            label={`Move ${task.tag} back`}
            disabled={index === 0}
            onClick={() => onMove(task, TASK_STATUSES[index - 1]!)}
          >
            ←
          </MoveButton>
          <MoveButton
            label={`Move ${task.tag} forward`}
            disabled={index === TASK_STATUSES.length - 1}
            onClick={() => onMove(task, TASK_STATUSES[index + 1]!)}
          >
            →
          </MoveButton>
        </span>
      </div>
    </article>
  )
}

/** Dense one-line form of a task, for list layout. */
function TaskRow({
  task,
  onMove,
  onEdit,
}: {
  task: Task
  onMove: (task: Task, status: TaskStatus) => void
  onEdit: () => void
}) {
  const index = TASK_STATUSES.indexOf(task.status)
  const due = task.dueDate ? dueLabel(task.dueDate) : null

  return (
    <li className="relative flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pr-3 pl-4">
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={mark(task.division).fill}
        aria-hidden
      />

      <Tag tag={task.tag} />

      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 basis-64 truncate text-left text-[13px] text-ink underline-offset-2 hover:underline"
      >
        {task.title}
      </button>

      <span className="w-28 shrink-0 truncate font-mono text-[10px] text-faint">
        {task.assignee?.name ?? 'Unassigned'}
      </span>

      <span
        className={`w-20 shrink-0 font-mono text-[10px] ${
          due?.tone === 'overdue'
            ? 'text-alert'
            : due?.tone === 'soon'
              ? 'text-ink'
              : 'text-faint'
        }`}
      >
        {due?.text ?? '—'}
      </span>

      <Pill tone={PRIORITY_TONE[task.priority]}>{TASK_PRIORITY_LABEL[task.priority]}</Pill>
      <Pill>{TASK_STATUS_LABEL[task.status]}</Pill>

      <span className="flex shrink-0 gap-1 font-mono text-[10px]">
        <MoveButton
          label={`Move ${task.tag} back`}
          disabled={index === 0}
          onClick={() => onMove(task, TASK_STATUSES[index - 1]!)}
        >
          ←
        </MoveButton>
        <MoveButton
          label={`Move ${task.tag} forward`}
          disabled={index === TASK_STATUSES.length - 1}
          onClick={() => onMove(task, TASK_STATUSES[index + 1]!)}
        >
          →
        </MoveButton>
      </span>
    </li>
  )
}

export function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-xs border border-rule px-1.5 leading-4 text-graphite transition-colors enabled:hover:border-ink enabled:hover:text-ink disabled:opacity-25"
    >
      {children}
    </button>
  )
}

function TaskForm({
  task,
  team,
  projects,
  onClose,
  onSaved,
}: {
  task: Task | null
  team: TeamMember[]
  projects: Project[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [division, setDivision] = useState<Division | ''>(task?.division ?? 'tuenx')
  const [status, setStatus] = useState<TaskStatus | ''>(task?.status ?? 'todo')
  const [priority, setPriority] = useState<TaskPriority | ''>(task?.priority ?? 'medium')
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? '')
  const [projectId, setProjectId] = useState(task?.projectId ?? '')
  const [dueDate, setDueDate] = useState(dateInputValue(task?.dueDate ?? null))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = { title, division, status, priority, assigneeId, projectId, dueDate }
      if (task) await api.patch(`/tasks/${task.id}`, body)
      else await api.post('/tasks', body)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!task || !confirm(`Delete ${task.tag}? This cannot be undone.`)) return
    setSaving(true)
    try {
      await api.del(`/tasks/${task.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={task ? 'Edit task' : 'New task'}
      subtitle={
        task ? <Tag tag={task.tag} /> : <span className="font-mono text-[10px] text-faint">A tag is issued on save, e.g. AGY-T007</span>
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
              label="Priority"
              value={priority}
              options={PRIORITY_OPTIONS}
              onChange={setPriority}
            />
            <SelectField
              label="Status"
              value={status}
              options={STATUS_OPTIONS}
              onChange={setStatus}
            />
            <SelectField
              label="Assignee"
              value={assigneeId}
              placeholder="Unassigned"
              options={team.map((m) => ({ value: m.id, label: `${m.name} · ${m.tag}` }))}
              onChange={(v) => setAssigneeId(v)}
            />
          </div>

          <SelectField
            label="Project"
            value={projectId}
            placeholder="Not part of a project"
            options={projects.map((p) => ({
              value: p.id,
              label: `${p.title} · ${p.tag}`,
            }))}
            onChange={(v) => setProjectId(v)}
            hint="Agency client work. Tuenx and Gaphatch tasks usually stand alone."
          />

          <TextField label="Due date" type="date" value={dueDate} onChange={setDueDate} />

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {task && (
            <Button
              type="button"
              variant="danger"
              onClick={remove}
              disabled={saving}
              className="mr-auto"
            >
              Delete
            </Button>
          )}
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : task ? 'Save changes' : 'Create task'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}
