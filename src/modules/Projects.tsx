import { useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { dateInputValue, dueLabel, money, moneyShort, pluralise } from '../lib/format.ts'
import {
  DIVISIONS,
  DIVISION_LABEL,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
  type Contact,
  type Division,
  type Project,
  type ProjectStatus,
} from '../types.ts'
import { PageHeader, Toolbar } from '../components/PageHeader.tsx'
import { Button, ErrorState, Panel, Pill, Skeleton } from '../components/ui.tsx'
import { FilterSelect, SelectField, TextField } from '../components/Field.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { Tag } from '../components/Tag.tsx'
import { MoveButton } from './Tasks.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))
const STATUS_OPTIONS = PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] }))

/**
 * PRD §6 Phase 3: a project wraps a client, a contract, and tasks into one
 * trackable unit.
 *
 * A project stores no division of its own — it inherits the client's, so the
 * two can never disagree. That's why the cards show the client tag rather
 * than a separate division badge.
 */
export function Projects() {
  const [division, setDivision] = useState<Division | ''>('')
  const [editing, setEditing] = useState<Project | 'new' | null>(null)

  const projects = useResource<Project[]>(() => api.get('/projects', { division }), [division])
  // Loaded independently — a failure here costs the client picker, not the board.
  const contacts = useResource<Contact[]>(() => api.get('/contacts'), [])

  const columns = useMemo(
    () =>
      PROJECT_STATUSES.map((status) => {
        const items = (projects.data ?? []).filter((p) => p.status === status)
        return { status, items, invoiced: items.reduce((sum, p) => sum + p.invoicedTotal, 0) }
      }),
    [projects.data],
  )

  const liveValue = columns
    .filter((c) => c.status === 'active' || c.status === 'planning')
    .reduce((sum, c) => sum + c.invoiced, 0)

  const moveProject = async (project: Project, status: ProjectStatus) => {
    const previous = projects.data ?? []
    projects.set(previous.map((p) => (p.id === project.id ? { ...p, status } : p)))
    try {
      await api.patch(`/projects/${project.id}`, { status })
    } catch {
      projects.set(previous)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Agency · Delivery"
        title="Projects"
        description="Client work in flight. Each project carries its client, its tasks, and its invoices."
        actions={
          <Button
            variant="primary"
            onClick={() => setEditing('new')}
            disabled={(contacts.data ?? []).length === 0}
          >
            + New project
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
        {division && (
          <Button size="sm" onClick={() => setDivision('')}>
            Clear
          </Button>
        )}
        <span className="ml-auto font-mono text-[10px] text-faint">
          {pluralise(projects.data?.length ?? 0, 'project')} ·{' '}
          <span className="text-ink">{money(liveValue)}</span> invoiced on live work
        </span>
      </Toolbar>

      {projects.error ? (
        <ErrorState message={projects.error} onRetry={projects.reload} />
      ) : projects.loading ? (
        <Skeleton rows={4} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {columns.map(({ status, items, invoiced }) => (
            <StatusColumn
              key={status}
              status={status}
              projects={items}
              invoiced={invoiced}
              onDropProject={(id) => {
                const dropped = projects.data?.find((p) => p.id === id)
                if (dropped && dropped.status !== status) moveProject(dropped, status)
              }}
              onMove={moveProject}
              onEdit={setEditing}
            />
          ))}
        </div>
      )}

      {editing && (
        <ProjectForm
          project={editing === 'new' ? null : editing}
          contacts={contacts.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            projects.reload()
          }}
        />
      )}
    </>
  )
}

function StatusColumn({
  status,
  projects,
  invoiced,
  onDropProject,
  onMove,
  onEdit,
}: {
  status: ProjectStatus
  projects: Project[]
  invoiced: number
  onDropProject: (id: string) => void
  onMove: (project: Project, status: ProjectStatus) => void
  onEdit: (project: Project) => void
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <Panel
      title={
        <span className="flex items-baseline gap-1.5">
          {PROJECT_STATUS_LABEL[status]}
          <span className="text-faint">{projects.length}</span>
        </span>
      }
      subtitle={
        <span className="font-mono text-[11px] tabular-nums text-ink">{moneyShort(invoiced)}</span>
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
          if (id) onDropProject(id)
        }}
        className="space-y-1.5"
      >
        {projects.length === 0 ? (
          <p className="py-6 text-center font-mono text-[10px] text-faint">Nothing here</p>
        ) : (
          projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onMove={onMove}
              onEdit={() => onEdit(project)}
            />
          ))
        )}
      </div>
    </Panel>
  )
}

function ProjectCard({
  project,
  onMove,
  onEdit,
}: {
  project: Project
  onMove: (project: Project, status: ProjectStatus) => void
  onEdit: () => void
}) {
  const index = PROJECT_STATUSES.indexOf(project.status)
  const due = project.dueDate ? dueLabel(project.dueDate) : null
  // Delivered work is finished — an old due date isn't a problem any more.
  const showDue = due && project.status !== 'delivered'

  return (
    <article
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', project.id)}
      className="relative overflow-hidden rounded-[3px] border border-rule bg-paper py-2 pr-2 pl-3 transition-colors hover:border-ink"
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={mark(project.contact.division).fill}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-2">
        <Tag tag={project.tag} />
        {showDue && (
          <Pill tone={due.tone === 'overdue' ? 'alert' : due.tone === 'soon' ? 'pending' : 'neutral'}>
            {due.text}
          </Pill>
        )}
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="mt-1.5 block w-full text-left text-[13px] leading-snug text-ink underline-offset-2 hover:underline"
      >
        {project.title}
      </button>

      <p className="mt-1 flex items-center gap-1 truncate font-mono text-[10px] text-faint">
        <Tag tag={project.contact.tag} />
        <span className="truncate">{project.contact.company ?? project.contact.name}</span>
      </p>

      <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-faint">
        <span>
          {project.counts.openTasks}/{project.counts.tasks} open
        </span>
        <span>·</span>
        <span className="text-ink">{moneyShort(project.invoicedTotal)}</span>

        <span className="ml-auto flex shrink-0 gap-1">
          <MoveButton
            label={`Move ${project.tag} back`}
            disabled={index === 0}
            onClick={() => onMove(project, PROJECT_STATUSES[index - 1]!)}
          >
            ←
          </MoveButton>
          <MoveButton
            label={`Move ${project.tag} forward`}
            disabled={index === PROJECT_STATUSES.length - 1}
            onClick={() => onMove(project, PROJECT_STATUSES[index + 1]!)}
          >
            →
          </MoveButton>
        </span>
      </div>
    </article>
  )
}

function ProjectForm({
  project,
  contacts,
  onClose,
  onSaved,
}: {
  project: Project | null
  contacts: Contact[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(project?.title ?? '')
  const [contactId, setContactId] = useState(project?.contactId ?? contacts[0]?.id ?? '')
  const [status, setStatus] = useState<ProjectStatus | ''>(project?.status ?? 'planning')
  const [dueDate, setDueDate] = useState(dateInputValue(project?.dueDate ?? null))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = { title, contactId, status, dueDate }
      if (project) await api.patch(`/projects/${project.id}`, body)
      else await api.post('/projects', body)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!project) return
    const warning =
      `Delete ${project.title} (${project.tag})?\n\n` +
      `Its ${pluralise(project.counts.tasks, 'task')} stay, unlinked. ` +
      `Its ${pluralise(project.counts.invoices, 'invoice')} keep the client and lose the project link.`
    if (!confirm(warning)) return

    setSaving(true)
    try {
      await api.del(`/projects/${project.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={project ? 'Edit project' : 'New project'}
      subtitle={
        project ? (
          <Tag tag={project.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            Tagged with the client's division on save, e.g. AGY-J006
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-4 py-4">
          <TextField label="Title" value={title} onChange={setTitle} required autoFocus />
          <SelectField
            label="Client"
            value={contactId}
            options={contacts.map((c) => ({
              value: c.id,
              label: `${c.company ?? c.name} · ${c.tag}`,
            }))}
            onChange={(v) => setContactId(v)}
            hint="The project inherits this client's division — it has none of its own."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Status"
              value={status}
              options={STATUS_OPTIONS}
              onChange={setStatus}
            />
            <TextField label="Due date" type="date" value={dueDate} onChange={setDueDate} />
          </div>

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {project && (
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
            {saving ? 'Saving…' : project ? 'Save changes' : 'Create project'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}
