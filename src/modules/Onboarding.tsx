import { useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { daysUntil, fullDate, pluralise, todayInputValue } from '../lib/format.ts'
import {
  CHECKLIST_KINDS,
  CHECKLIST_KIND_LABEL,
  DIVISIONS,
  DIVISION_LABEL,
  type ChecklistKind,
  type ChecklistRun,
  type ChecklistTemplate,
  type Division,
  type TeamMember,
} from '../types.ts'
import { Toolbar } from '../components/PageHeader.tsx'
import { Button, EmptyState, ErrorState, Panel, Pill, Skeleton } from '../components/ui.tsx'
import { FilterSelect, SelectField, TextAreaField, TextField } from '../components/Field.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { Tag } from '../components/Tag.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))
const KIND_OPTIONS = CHECKLIST_KINDS.map((k) => ({ value: k, label: CHECKLIST_KIND_LABEL[k] }))

/**
 * Onboarding and offboarding — the last Phase 6 item with no home.
 *
 * Two lists, because they are two different things. A **template** is a
 * reusable definition and is never ticked. A **run** is one person going
 * through it, and is the only thing that has state.
 *
 * A run copies its steps at creation. Editing a template afterwards changes
 * what the *next* person gets, never what this one was actually asked to do.
 */
export function Onboarding() {
  const [view, setView] = useState<'runs' | 'templates'>('runs')

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        {(
          [
            ['runs', 'In progress'],
            ['templates', 'Templates'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`rounded-sm border px-2.5 py-1 font-mono text-[11px] transition-colors ${
              view === id
                ? 'border-ink bg-ink text-surface'
                : 'border-rule text-graphite hover:border-graphite'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'runs' ? <Runs /> : <Templates />}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Runs                                                                       */
/* -------------------------------------------------------------------------- */

function Runs() {
  const [kind, setKind] = useState<ChecklistKind | ''>('')
  const [status, setStatus] = useState('')
  const [starting, setStarting] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const runs = useResource<ChecklistRun[]>(
    () => api.get('/checklists/runs', { kind, status }),
    [kind, status],
  )
  const templates = useResource<ChecklistTemplate[]>(() => api.get('/checklists/templates'), [])
  const team = useResource<TeamMember[]>(() => api.get('/team'), [])

  const rows = runs.data ?? []

  return (
    <>
      <Toolbar>
        <FilterSelect
          ariaLabel="Filter by kind"
          placeholder="Both kinds"
          value={kind}
          options={KIND_OPTIONS}
          onChange={setKind}
        />
        <FilterSelect
          ariaLabel="Filter by status"
          placeholder="All"
          value={status}
          options={[
            { value: 'open', label: 'In progress' },
            { value: 'done', label: 'Complete' },
          ]}
          onChange={(v) => setStatus(v)}
        />
        <Button variant="primary" size="sm" onClick={() => setStarting(true)}>
          + Start a checklist
        </Button>
        <span className="ml-auto font-mono text-[10px] text-faint">
          {pluralise(rows.length, 'run')}
        </span>
      </Toolbar>

      {runs.error ? (
        <ErrorState message={runs.error} onRetry={runs.reload} />
      ) : runs.loading ? (
        <Skeleton rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing in progress"
          hint="Start a checklist when someone joins or leaves. Steps land on the calendar and overdue ones show on the KPI board."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              team={team.data ?? []}
              expanded={open === run.id}
              onToggle={() => setOpen(open === run.id ? null : run.id)}
              onChanged={runs.reload}
            />
          ))}
        </div>
      )}

      {starting && (
        <StartForm
          templates={templates.data ?? []}
          team={team.data ?? []}
          onClose={() => setStarting(false)}
          onSaved={() => {
            setStarting(false)
            runs.reload()
          }}
        />
      )}
    </>
  )
}

function RunCard({
  run,
  team,
  expanded,
  onToggle,
  onChanged,
}: {
  run: ChecklistRun
  team: TeamMember[]
  expanded: boolean
  onToggle: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState('')

  const pct = run.progress.total === 0 ? 0 : (run.progress.done / run.progress.total) * 100

  const toggle = async (itemId: string, done: boolean) => {
    setBusy(itemId)
    try {
      await api.patch(`/checklists/items/${itemId}`, { done })
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  const assign = async (itemId: string, ownerId: string) => {
    await api.patch(`/checklists/items/${itemId}`, { ownerId })
    onChanged()
  }

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (adding.trim() === '') return
    await api.post(`/checklists/runs/${run.id}/items`, { title: adding.trim() })
    setAdding('')
    onChanged()
  }

  return (
    <Panel bodyClassName="p-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-wash"
      >
        <span className="h-9 w-[3px] shrink-0 rounded-xs" style={mark(run.division).fill} aria-hidden />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-medium text-ink">{run.personName}</span>
            <Tag tag={run.tag} />
            <Pill tone={run.kind === 'offboarding' ? 'neutral' : 'ready'}>
              {CHECKLIST_KIND_LABEL[run.kind]}
            </Pill>
            {run.completedAt ? (
              <Pill tone="ready">Complete</Pill>
            ) : run.progress.overdue > 0 ? (
              <Pill tone="alert">{run.progress.overdue} overdue</Pill>
            ) : null}
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-faint">
            {run.kind === 'onboarding' ? 'Starts' : 'Leaves'} {fullDate(run.startDate)} ·{' '}
            {run.progress.done}/{run.progress.total} done
          </p>
        </div>

        <div className="hidden w-32 shrink-0 sm:block">
          <div className="h-1.5 bg-wash">
            <div
              className={`h-full transition-[width] duration-500 ${
                run.completedAt ? 'bg-ready' : 'bg-ink'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <span className="shrink-0 font-mono text-[10px] text-faint">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="border-t border-rule">
          <ul className="divide-y divide-rule">
            {run.items.map((item) => {
              const late = !item.doneAt && item.dueDate && daysUntil(item.dueDate) < 0
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={item.doneAt !== null}
                    disabled={busy === item.id}
                    onChange={(e) => toggle(item.id, e.target.checked)}
                    aria-label={item.title}
                    className="accent-ink"
                  />

                  <span
                    className={`min-w-0 flex-1 text-[13px] ${
                      item.doneAt ? 'text-faint line-through' : 'text-ink'
                    }`}
                  >
                    {item.title}
                  </span>

                  {item.dueDate && (
                    <span
                      className={`shrink-0 font-mono text-[10px] ${late ? 'text-alert' : 'text-faint'}`}
                    >
                      {fullDate(item.dueDate)}
                    </span>
                  )}

                  <select
                    aria-label={`Owner for ${item.title}`}
                    value={item.ownerId ?? ''}
                    onChange={(e) => assign(item.id, e.target.value)}
                    className="shrink-0 rounded-xs border border-rule bg-surface px-1.5 py-0.5 font-mono text-[10px] text-graphite"
                  >
                    <option value="">Nobody</option>
                    {team.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </li>
              )
            })}
          </ul>

          {/* Checklists are never quite complete — adding a line mid-run is
              normal, not an edge case. */}
          <form onSubmit={addItem} className="flex gap-2 border-t border-rule px-4 py-2.5">
            <input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              placeholder="Add a step…"
              className="min-w-0 flex-1 rounded-sm border border-rule bg-surface px-2 py-1 text-[13px] text-ink placeholder:text-faint focus:border-ink focus:outline-none"
            />
            <Button type="submit" size="sm" disabled={adding.trim() === ''}>
              Add
            </Button>
          </form>
        </div>
      )}
    </Panel>
  )
}

function StartForm({
  templates,
  team,
  onClose,
  onSaved,
}: {
  templates: ChecklistTemplate[]
  team: TeamMember[]
  onClose: () => void
  onSaved: () => void
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [memberId, setMemberId] = useState('')
  const [personName, setPersonName] = useState('')
  const [division, setDivision] = useState<Division | ''>('tuenx')
  const [kind, setKind] = useState<ChecklistKind | ''>('onboarding')
  const [startDate, setStartDate] = useState(todayInputValue())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const template = templates.find((t) => t.id === templateId)

  // Picking a template is the common case, and it already knows its kind and
  // division — so choosing one fills both rather than asking twice.
  const chooseTemplate = (id: string) => {
    setTemplateId(id)
    const found = templates.find((t) => t.id === id)
    if (found) {
      setKind(found.kind)
      setDivision(found.division)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.post('/checklists/runs', {
        templateId,
        memberId,
        personName,
        division,
        kind,
        startDate,
        notes,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start it')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title="Start a checklist"
      subtitle={
        <span className="font-mono text-[10px] text-faint">
          Steps are copied from the template now — editing it later will not change this run
        </span>
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <SelectField
            label="Template"
            value={templateId}
            placeholder="No template — start empty"
            options={templates.map((t) => ({
              value: t.id,
              label: `${t.name} · ${pluralise(t.steps.length, 'step')}`,
            }))}
            onChange={(v) => chooseTemplate(v)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Who it is for"
              value={memberId}
              placeholder="Not on the team yet"
              options={team.map((m) => ({ value: m.id, label: `${m.name} · ${m.tag}` }))}
              onChange={(v) => setMemberId(v)}
              hint="Onboarding usually starts before they have a record."
            />
            <TextField
              label="Name"
              value={personName}
              onChange={setPersonName}
              placeholder="Rafa Okonkwo"
              hint={memberId ? 'Ignored — the member’s name is used.' : 'Needed when they are not on the team yet.'}
            />
            <SelectField label="Kind" value={kind} options={KIND_OPTIONS} onChange={setKind} />
            <SelectField
              label="Division"
              value={division}
              options={DIVISION_OPTIONS}
              onChange={setDivision}
            />
          </div>

          <TextField
            label={kind === 'offboarding' ? 'Last day' : 'Start date'}
            type="date"
            value={startDate}
            onChange={setStartDate}
            required
            hint="Every step's date is worked out from this — including the ones before it."
          />

          <TextAreaField label="Notes" value={notes} onChange={setNotes} rows={2} />

          {template && (
            <div className="rounded-sm border border-rule bg-wash p-3">
              <p className="label-mono mb-2">
                {pluralise(template.steps.length, 'step')} will be copied
              </p>
              <ol className="space-y-1">
                {template.steps.map((step) => (
                  <li key={step.id} className="flex items-baseline gap-2 font-mono text-[10px]">
                    <span className="w-10 shrink-0 text-right text-faint">
                      {step.dueOffsetDays > 0 ? `+${step.dueOffsetDays}d` : `${step.dueOffsetDays}d`}
                    </span>
                    <span className="text-ink">{step.title}</span>
                    {step.ownerHint && <span className="text-faint">· {step.ownerHint}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Starting…' : 'Start'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                  */
/* -------------------------------------------------------------------------- */

function Templates() {
  const [editing, setEditing] = useState<ChecklistTemplate | 'new' | null>(null)
  const templates = useResource<ChecklistTemplate[]>(() => api.get('/checklists/templates'), [])

  const grouped = useMemo(() => {
    const rows = templates.data ?? []
    return CHECKLIST_KINDS.map((kind) => ({
      kind,
      rows: rows.filter((t) => t.kind === kind),
    })).filter((g) => g.rows.length > 0)
  }, [templates.data])

  return (
    <>
      <Toolbar>
        <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
          + New template
        </Button>
        <span className="ml-auto font-mono text-[10px] text-faint">
          {pluralise(templates.data?.length ?? 0, 'template')}
        </span>
      </Toolbar>

      {templates.error ? (
        <ErrorState message={templates.error} onRetry={templates.reload} />
      ) : templates.loading ? (
        <Skeleton rows={2} />
      ) : grouped.length === 0 ? (
        <EmptyState
          title="No templates"
          hint="Write the steps once and every future hire gets the same list."
        />
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <Panel
              key={group.kind}
              title={CHECKLIST_KIND_LABEL[group.kind]}
              bodyClassName="divide-y divide-rule p-0"
            >
              {group.rows.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEditing(t)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-wash"
                >
                  <span
                    className="h-8 w-[3px] shrink-0 rounded-xs"
                    style={mark(t.division).fill}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-medium text-ink">{t.name}</span>
                      <Tag tag={t.tag} />
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] text-faint">
                      {pluralise(t.steps.length, 'step')} · used by{' '}
                      {pluralise(t.runCount, 'run')}
                    </p>
                  </div>
                </button>
              ))}
            </Panel>
          ))}
        </div>
      )}

      {editing && (
        <TemplateForm
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            templates.reload()
          }}
        />
      )}
    </>
  )
}

interface DraftStep {
  title: string
  ownerHint: string
  dueOffsetDays: string
}

function TemplateForm({
  template,
  onClose,
  onSaved,
}: {
  template: ChecklistTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [kind, setKind] = useState<ChecklistKind | ''>(template?.kind ?? 'onboarding')
  const [division, setDivision] = useState<Division | ''>(template?.division ?? 'tuenx')
  const [steps, setSteps] = useState<DraftStep[]>(
    template?.steps.map((s) => ({
      title: s.title,
      ownerHint: s.ownerHint ?? '',
      dueOffsetDays: String(s.dueOffsetDays),
    })) ?? [{ title: '', ownerHint: '', dueOffsetDays: '0' }],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setStep = (index: number, patch: Partial<DraftStep>) =>
    setSteps((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  const move = (index: number, by: number) =>
    setSteps((current) => {
      const next = [...current]
      const target = index + by
      if (target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = {
        name,
        kind,
        division,
        steps: steps
          .filter((s) => s.title.trim() !== '')
          .map((s) => ({
            title: s.title,
            ownerHint: s.ownerHint,
            dueOffsetDays: s.dueOffsetDays === '' ? 0 : Number(s.dueOffsetDays),
          })),
      }
      if (template) await api.patch(`/checklists/templates/${template.id}`, body)
      else await api.post('/checklists/templates', body)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!template) return
    const warning =
      template.runCount > 0
        ? `Delete ${template.tag}? The ${pluralise(template.runCount, 'run')} already using it keep their own copies of the steps and are unaffected.`
        : `Delete ${template.tag}? This cannot be undone.`
    if (!confirm(warning)) return
    setSaving(true)
    try {
      await api.del(`/checklists/templates/${template.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={template ? 'Edit template' : 'New template'}
      subtitle={
        template ? (
          <Tag tag={template.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            A tag is issued on save, e.g. TNX-CT004
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <TextField
            label="Name"
            value={name}
            onChange={setName}
            required
            autoFocus
            placeholder="Engineer onboarding"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Kind" value={kind} options={KIND_OPTIONS} onChange={setKind} />
            <SelectField
              label="Division"
              value={division}
              options={DIVISION_OPTIONS}
              onChange={setDivision}
            />
          </div>

          <div>
            <p className="label-mono mb-2">Steps</p>
            <p className="mb-2.5 text-[11px] leading-snug text-faint">
              Day offsets are relative to the start date. Negative is before day one — which
              is where most of onboarding actually happens.
            </p>

            <ol className="space-y-2">
              {steps.map((step, index) => (
                <li key={index} className="flex flex-wrap items-center gap-1.5">
                  <input
                    value={step.dueOffsetDays}
                    onChange={(e) => setStep(index, { dueOffsetDays: e.target.value })}
                    type="number"
                    aria-label={`Day offset for step ${index + 1}`}
                    className="w-14 shrink-0 rounded-sm border border-rule bg-surface px-1.5 py-1 text-center font-mono text-[11px] text-ink focus:border-ink focus:outline-none"
                  />
                  <input
                    value={step.title}
                    onChange={(e) => setStep(index, { title: e.target.value })}
                    placeholder="What has to happen"
                    aria-label={`Title for step ${index + 1}`}
                    className="min-w-0 flex-1 rounded-sm border border-rule bg-surface px-2 py-1 text-[13px] text-ink placeholder:text-faint focus:border-ink focus:outline-none"
                  />
                  <input
                    value={step.ownerHint}
                    onChange={(e) => setStep(index, { ownerHint: e.target.value })}
                    placeholder="Who"
                    aria-label={`Owner hint for step ${index + 1}`}
                    className="w-20 shrink-0 rounded-sm border border-rule bg-surface px-1.5 py-1 font-mono text-[10px] text-ink placeholder:text-faint focus:border-ink focus:outline-none"
                  />
                  <span className="flex shrink-0 gap-1">
                    <StepButton label={`Move step ${index + 1} up`} onClick={() => move(index, -1)} disabled={index === 0}>
                      ↑
                    </StepButton>
                    <StepButton
                      label={`Move step ${index + 1} down`}
                      onClick={() => move(index, 1)}
                      disabled={index === steps.length - 1}
                    >
                      ↓
                    </StepButton>
                    <StepButton
                      label={`Remove step ${index + 1}`}
                      onClick={() => setSteps((c) => c.filter((_, i) => i !== index))}
                      disabled={steps.length === 1}
                    >
                      ×
                    </StepButton>
                  </span>
                </li>
              ))}
            </ol>

            <Button
              type="button"
              size="sm"
              className="mt-2"
              onClick={() =>
                setSteps((c) => [...c, { title: '', ownerHint: '', dueOffsetDays: '0' }])
              }
            >
              + Add step
            </Button>
          </div>

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {template && (
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
            {saving ? 'Saving…' : template ? 'Save changes' : 'Create template'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-xs border border-rule px-1.5 font-mono text-[11px] leading-5 text-graphite transition-colors enabled:hover:border-ink enabled:hover:text-ink disabled:opacity-25"
    >
      {children}
    </button>
  )
}
