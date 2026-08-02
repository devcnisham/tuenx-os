import { useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { pluralise } from '../lib/format.ts'
import {
  DIVISIONS,
  DIVISION_LABEL,
  IDEA_STATUSES,
  IDEA_STATUS_LABEL,
  PLAN_EFFORTS,
  PLAN_EFFORT_LABEL,
  type Division,
  type Idea,
  type IdeaStatus,
  type PlanEffort,
} from '../types.ts'
import { PageHeader, Toolbar } from '../components/PageHeader.tsx'
import {
  Button,
  EmptyState,
  ErrorState,
  Panel,
  Pill,
  Skeleton,
  type PillTone,
} from '../components/ui.tsx'
import { FilterSelect, SelectField, TextAreaField, TextField } from '../components/Field.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { Tag } from '../components/Tag.tsx'
import { Icon } from '../components/Icon.tsx'
import { upcomingPeriods } from './Planner.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))
const EFFORT_OPTIONS = PLAN_EFFORTS.map((e) => ({ value: e, label: PLAN_EFFORT_LABEL[e] }))

const STATUS_TONE: Record<IdeaStatus, PillTone> = {
  raw: 'neutral',
  shortlisted: 'pending',
  parked: 'neutral',
  promoted: 'ready',
}

/**
 * Brainstorms: raw ideas, before anyone has committed to anything.
 *
 * Kept separate from the Planner on purpose. Mixing "someone mentioned this
 * once" with "we are doing this in Q3" is what makes planning boards
 * untrustworthy — people stop writing ideas down because writing one down
 * starts to look like a commitment. An idea leaves here only by being
 * promoted, which creates a plan item and records where it came from.
 */
export function Brainstorms() {
  const [division, setDivision] = useState<Division | ''>('')
  const [editing, setEditing] = useState<Idea | 'new' | null>(null)
  const [promoting, setPromoting] = useState<Idea | null>(null)

  const ideas = useResource<Idea[]>(() => api.get('/planner/ideas', { division }), [division])

  const columns = useMemo(
    () =>
      IDEA_STATUSES.map((status) => ({
        status,
        items: (ideas.data ?? []).filter((i) => i.status === status),
      })),
    [ideas.data],
  )

  const move = async (idea: Idea, status: IdeaStatus) => {
    const previous = ideas.data ?? []
    ideas.set(previous.map((i) => (i.id === idea.id ? { ...i, status } : i)))
    try {
      await api.patch(`/planner/ideas/${idea.id}`, { status })
    } catch {
      ideas.set(previous)
    }
  }

  const vote = async (idea: Idea, delta: number) => {
    const next = Math.max(0, idea.votes + delta)
    const previous = ideas.data ?? []
    ideas.set(previous.map((i) => (i.id === idea.id ? { ...i, votes: next } : i)))
    try {
      await api.patch(`/planner/ideas/${idea.id}`, { votes: next })
    } catch {
      ideas.set(previous)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Thinking"
        title="Brainstorms"
        description="Somewhere to put an idea before it is a plan. Nothing here is a commitment until it is promoted."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            New idea
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
          {pluralise(ideas.data?.length ?? 0, 'idea')}
        </span>
      </Toolbar>

      {ideas.error ? (
        <ErrorState message={ideas.error} onRetry={ideas.reload} />
      ) : ideas.loading ? (
        <Skeleton rows={3} />
      ) : (ideas.data ?? []).length === 0 ? (
        <EmptyState
          icon="message"
          title="No ideas yet"
          hint="Write down the half-formed one. That is what this is for — it costs nothing and commits you to nothing."
          action={{ label: 'New idea', onClick: () => setEditing('new') }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {columns.map(({ status, items }) => (
            <Panel
              key={status}
              title={
                <span className="flex items-baseline gap-1.5">
                  {IDEA_STATUS_LABEL[status]}
                  <span className="text-faint">{items.length}</span>
                </span>
              }
              bodyClassName="p-2 min-h-32"
            >
              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="py-8 text-center font-mono text-[10px] text-faint">Empty</p>
                ) : (
                  items.map((idea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      onEdit={() => setEditing(idea)}
                      onMove={move}
                      onVote={vote}
                      onPromote={() => setPromoting(idea)}
                    />
                  ))
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}

      {editing && (
        <IdeaForm
          idea={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            ideas.reload()
          }}
        />
      )}

      {promoting && (
        <PromoteForm
          idea={promoting}
          onClose={() => setPromoting(null)}
          onSaved={() => {
            setPromoting(null)
            ideas.reload()
          }}
        />
      )}
    </>
  )
}

function IdeaCard({
  idea,
  onEdit,
  onMove,
  onVote,
  onPromote,
}: {
  idea: Idea
  onEdit: () => void
  onMove: (idea: Idea, status: IdeaStatus) => void
  onVote: (idea: Idea, delta: number) => void
  onPromote: () => void
}) {
  return (
    <article className="card-interactive relative overflow-hidden rounded-sm py-2.5 pr-2 pl-3.5">
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={mark(idea.division).fill}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-2">
        <Tag tag={idea.tag} />
        <Pill tone={STATUS_TONE[idea.status]}>{IDEA_STATUS_LABEL[idea.status]}</Pill>
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="mt-2 block w-full text-left text-[13px] leading-snug text-ink underline-offset-2 hover:underline"
      >
        {idea.title}
      </button>

      {idea.body && (
        <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-graphite">{idea.body}</p>
      )}

      {idea.planItem && (
        <p className="mt-2 flex items-center gap-1 font-mono text-[10px] text-faint">
          <Icon name="arrowRight" size={11} />
          Planned into {idea.planItem.period}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-1">
        {/* No per-person accounts until Phase 9, so this is an interest signal
            rather than a real vote count. */}
        <button
          type="button"
          onClick={() => onVote(idea, 1)}
          aria-label={`Add interest to ${idea.tag}`}
          className="flex items-center gap-1 rounded-xs border border-rule px-1.5 py-0.5 font-mono text-[10px] text-graphite transition-colors hover:border-ink hover:text-ink"
        >
          ▲ {idea.votes}
        </button>
        {idea.votes > 0 && (
          <button
            type="button"
            onClick={() => onVote(idea, -1)}
            aria-label={`Remove interest from ${idea.tag}`}
            className="rounded-xs border border-rule px-1.5 py-0.5 font-mono text-[10px] text-graphite transition-colors hover:border-ink hover:text-ink"
          >
            ▼
          </button>
        )}

        <span className="ml-auto flex gap-1">
          {idea.status !== 'promoted' && idea.status !== 'shortlisted' && (
            <Button size="sm" variant="subtle" onClick={() => onMove(idea, 'shortlisted')}>
              Shortlist
            </Button>
          )}
          {!idea.planItem && (
            <Button size="sm" onClick={onPromote}>
              Promote
            </Button>
          )}
        </span>
      </div>
    </article>
  )
}

function IdeaForm({
  idea,
  onClose,
  onSaved,
}: {
  idea: Idea | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(idea?.title ?? '')
  const [body, setBody] = useState(idea?.body ?? '')
  const [division, setDivision] = useState<Division | ''>(idea?.division ?? 'tuenx')
  const [status, setStatus] = useState<IdeaStatus | ''>(idea?.status ?? 'raw')
  const [author, setAuthor] = useState(idea?.author ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = { title, body, division, status, author }
      if (idea) await api.patch(`/planner/ideas/${idea.id}`, payload)
      else await api.post('/planner/ideas', payload)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!idea || !confirm(`Delete ${idea.tag}? This cannot be undone.`)) return
    setSaving(true)
    try {
      await api.del(`/planner/ideas/${idea.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={idea ? 'Edit idea' : 'New idea'}
      subtitle={
        idea ? (
          <Tag tag={idea.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            Half-formed is fine. A tag is issued on save, e.g. GPH-B004
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-5 py-5">
          <TextField
            label="Idea"
            value={title}
            onChange={setTitle}
            required
            autoFocus
            placeholder="What if we…"
          />
          <TextAreaField
            label="More"
            value={body}
            onChange={setBody}
            rows={6}
            placeholder="Why it might be worth doing. No need to make the case yet."
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
              options={IDEA_STATUSES.map((s) => ({ value: s, label: IDEA_STATUS_LABEL[s] }))}
              onChange={setStatus}
            />
          </div>

          <TextField label="Who raised it" value={author} onChange={setAuthor} />

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {idea && (
            <Button
              type="button"
              variant="danger"
              icon="trash"
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
            {saving ? 'Saving…' : idea ? 'Save changes' : 'Add idea'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}

/** Turns an idea into a plan item. The idea is kept, not consumed. */
function PromoteForm({
  idea,
  onClose,
  onSaved,
}: {
  idea: Idea
  onClose: () => void
  onSaved: () => void
}) {
  const periods = upcomingPeriods()
  const [period, setPeriod] = useState(periods[0]!)
  const [effort, setEffort] = useState<PlanEffort | ''>('m')
  const [owner, setOwner] = useState(idea.author ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.post(`/planner/ideas/${idea.id}/promote`, { period, effort, owner })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not promote')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title="Promote to the planner"
      subtitle={
        <span className="flex items-center gap-2">
          <Tag tag={idea.tag} />
          <span className="font-mono text-[10px] text-faint">{idea.title}</span>
        </span>
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-5 py-5">
          <p className="text-sm leading-relaxed text-graphite">
            This creates a plan item in the chosen period and marks the idea promoted. The idea
            stays here — where a plan came from is worth knowing later.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Period"
              value={period}
              options={periods.map((p) => ({ value: p, label: p }))}
              onChange={(v) => setPeriod(v || periods[0]!)}
            />
            <SelectField
              label="Size"
              value={effort}
              options={EFFORT_OPTIONS}
              onChange={setEffort}
              hint="Rough, not hours."
            />
          </div>

          <TextField label="Owner" value={owner} onChange={setOwner} />

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Promoting…' : 'Promote'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}
