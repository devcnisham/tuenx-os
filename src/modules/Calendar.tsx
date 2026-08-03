import { useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import {
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABEL,
  addDays,
  addMonths,
  daysFor,
  isSameMonth,
  isToday,
  isoDay,
  rangeFor,
  titleFor,
  WEEKDAY_LABELS,
  type CalendarView,
} from '../lib/calendar.ts'
import {
  DIVISIONS,
  DIVISION_LABEL,
  ENTRY_KINDS,
  ENTRY_KIND_LABEL,
  REMINDER_OPTIONS,
  type CalendarEntry,
  type Division,
  type EntryKind,
} from '../types.ts'
import { PageHeader, Toolbar } from '../components/PageHeader.tsx'
import { Button, EmptyState, ErrorState, Panel, Pill, Skeleton } from '../components/ui.tsx'
import { FilterSelect, SelectField, TextAreaField, TextField } from '../components/Field.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { Tag } from '../components/Tag.tsx'
import { Icon } from '../components/Icon.tsx'
import { MeetingPlanner, nextWorkday } from '../components/MeetingPlanner.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))
const KIND_OPTIONS = ENTRY_KINDS.map((k) => ({ value: k, label: ENTRY_KIND_LABEL[k] }))

const KINDS = ['task', 'project', 'invoice', 'release', 'contract', 'entry'] as const
type Kind = (typeof KINDS)[number]

const KIND_LABEL: Record<Kind, string> = {
  task: 'Task',
  project: 'Project',
  invoice: 'Invoice',
  release: 'Release',
  contract: 'Contract ends',
  entry: 'Entry',
}

interface CalendarEvent {
  id: string
  entryId?: string
  tag: string
  date: string
  title: string
  detail: string | null
  kind: Kind
  division: Division
  open: boolean
  route: string
  startTime?: string | null
  endTime?: string | null
}

/**
 * Everything with a date — day, week, or month.
 *
 * Two kinds of thing share the grid. Derived deadlines are projected out of
 * tasks, projects, invoices, releases, and contracts; entries are things
 * someone put here directly. Both can be dragged to another day, and the drop
 * writes to whichever record actually owns the date — a task's dueDate, an
 * entry's date. That is why the chip carries its own kind: without it the drop
 * would not know which endpoint to call.
 *
 * A contract end date is not draggable. Moving it would silently rewrite a
 * contract term, which is not something a calendar should do.
 */
export function Calendar() {
  const [view, setView] = useState<CalendarView>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [division, setDivision] = useState<Division | ''>('')
  const [editing, setEditing] = useState<CalendarEntry | 'new' | null>(null)
  const [newOnDay, setNewOnDay] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)

  const { from, to } = rangeFor(view, anchor)
  const fromIso = isoDay(from)
  const toIso = isoDay(to)

  const calendar = useResource<{ events: CalendarEvent[] }>(
    () => api.get('/calendar', { from: fromIso, to: toIso }),
    [fromIso, toIso],
  )

  const events = useMemo(
    () => (calendar.data?.events ?? []).filter((e) => !division || e.division === division),
    [calendar.data, division],
  )

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const list = map.get(event.date)
      if (list) list.push(event)
      else map.set(event.date, [event])
    }
    return map
  }, [events])

  /**
   * Moves whatever owns the date. Optimistic, and reverts on failure.
   *
   * Contracts are refused rather than silently ignored, so a drag that does
   * nothing has an explanation.
   */
  const moveEvent = async (event: CalendarEvent, day: string) => {
    if (event.date === day) return
    if (event.kind === 'contract') {
      alert('Contract end dates are part of the contract — edit them on the client record.')
      return
    }

    const previous = calendar.data
    if (previous) {
      calendar.set({
        events: previous.events.map((e) => (e.id === event.id ? { ...e, date: day } : e)),
      })
    }

    const patch: Record<Kind, () => Promise<unknown>> = {
      task: () => api.patch(`/tasks/${event.id}`, { dueDate: day }),
      project: () => api.patch(`/projects/${event.id}`, { dueDate: day }),
      invoice: () => api.patch(`/invoices/${event.id}`, { dueDate: day }),
      release: () => api.patch(`/releases/${event.id}`, { date: day }),
      entry: () => api.patch(`/calendar/entries/${event.entryId}`, { date: day }),
      contract: () => Promise.resolve(),
    }

    try {
      await patch[event.kind]()
      calendar.reload()
    } catch {
      if (previous) calendar.set(previous)
    }
  }

  const step = (direction: 1 | -1) =>
    setAnchor((current) =>
      view === 'month'
        ? addMonths(current, direction)
        : addDays(current, direction * (view === 'week' ? 7 : 1)),
    )

  const days = daysFor(view, anchor)

  const openNewOn = (day: string) => {
    setNewOnDay(day)
    setEditing('new')
  }

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Schedule"
        title="Calendar"
        description="Every deadline the group is carrying, plus meetings and reminders. Drag anything to another day."
        actions={
          <>
            <Button icon="calendar" onClick={() => setPlanning(true)}>
              Plan a meeting
            </Button>
            <Button variant="primary" icon="plus" onClick={() => openNewOn(isoDay(new Date()))}>
              New entry
            </Button>
          </>
        }
      />

      <Toolbar>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="subtle" onClick={() => step(-1)} aria-label="Previous">
            <Icon name="arrowLeft" size={14} />
          </Button>
          <Button size="sm" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Button size="sm" variant="subtle" onClick={() => step(1)} aria-label="Next">
            <Icon name="arrowRight" size={14} />
          </Button>
        </div>

        <span className="font-display text-base font-semibold text-ink">
          {titleFor(view, anchor)}
        </span>

        <FilterSelect
          ariaLabel="Filter by division"
          placeholder="All divisions"
          value={division}
          options={DIVISION_OPTIONS}
          onChange={setDivision}
        />

        <div
          role="group"
          aria-label="Calendar view"
          className="ml-auto flex shrink-0 overflow-hidden rounded-sm border border-rule"
        >
          {CALENDAR_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`px-2.5 py-1 font-mono text-[10px] transition-colors ${
                view === v ? 'bg-ink text-surface' : 'bg-surface text-graphite hover:text-ink'
              }`}
            >
              {CALENDAR_VIEW_LABEL[v]}
            </button>
          ))}
        </div>
      </Toolbar>

      {calendar.error ? (
        <ErrorState message={calendar.error} onRetry={calendar.reload} />
      ) : calendar.loading ? (
        <Skeleton rows={4} />
      ) : view === 'day' ? (
        <DayView
          day={days[0]!}
          events={byDay.get(isoDay(days[0]!)) ?? []}
          onEdit={setEditing}
          onAdd={() => openNewOn(isoDay(days[0]!))}
        />
      ) : (
        <Panel bodyClassName="p-0">
          <div className="grid grid-cols-7 border-b border-rule-soft">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="px-3 py-2 text-center">
                <span className="label-mono">{label}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((d) => (
              <DayCell
                key={d.toISOString()}
                day={d}
                events={byDay.get(isoDay(d)) ?? []}
                muted={view === 'month' && !isSameMonth(d, anchor)}
                tall={view === 'week'}
                onDropEvent={(id, day) => {
                  const dropped = events.find((e) => e.id === id)
                  if (dropped) moveEvent(dropped, day)
                }}
                onAdd={openNewOn}
                onEditEntry={setEditing}
              />
            ))}
          </div>
        </Panel>
      )}

      <Legend />

      {planning && (
        <MeetingPlanner
          defaultDay={nextWorkday()}
          onClose={() => setPlanning(false)}
          onCreated={() => {
            setPlanning(false)
            calendar.reload()
          }}
        />
      )}

      {editing && (
        <EntryForm
          entry={editing === 'new' ? null : editing}
          defaultDay={newOnDay ?? isoDay(new Date())}
          onClose={() => {
            setEditing(null)
            setNewOnDay(null)
          }}
          onSaved={() => {
            setEditing(null)
            setNewOnDay(null)
            calendar.reload()
          }}
        />
      )}
    </>
  )
}

function DayCell({
  day,
  events,
  muted,
  tall,
  onDropEvent,
  onAdd,
  onEditEntry,
}: {
  day: Date
  events: CalendarEvent[]
  muted: boolean
  tall: boolean
  onDropEvent: (id: string, day: string) => void
  onAdd: (day: string) => void
  onEditEntry: (entry: CalendarEntry) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const iso = isoDay(day)

  const shown = events.slice(0, tall ? 8 : 3)
  const hidden = events.length - shown.length

  return (
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
        if (id) onDropEvent(id, iso)
      }}
      // Double-click on empty space is the fastest way to add on a given day,
      // and it is what every calendar has trained people to try.
      onDoubleClick={() => onAdd(iso)}
      className={`group/cell relative min-h-24 border-r border-b border-rule-soft p-1.5 transition-colors last:border-r-0 ${
        tall ? 'min-h-64' : ''
      } ${muted ? 'bg-wash/60' : ''} ${dragOver ? 'bg-wash' : ''}`}
    >
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onAdd(iso)}
          aria-label={`Add on ${iso}`}
          className="rounded-xs p-0.5 text-faint opacity-0 transition-opacity group-hover/cell:opacity-100 hover:text-ink"
        >
          <Icon name="plus" size={12} />
        </button>
        <span
          className={`grid size-6 place-items-center rounded-full font-mono text-[11px] tabular-nums ${
            isToday(day)
              ? 'bg-ink font-semibold text-surface'
              : muted
                ? 'text-faint'
                : 'text-graphite'
          }`}
        >
          {day.getDate()}
        </span>
      </div>

      <div className="space-y-1">
        {shown.map((event) => (
          <EventChip
            key={`${event.kind}-${event.id}`}
            event={event}
            onEditEntry={onEditEntry}
          />
        ))}
        {hidden > 0 && <p className="px-1 font-mono text-[10px] text-faint">+{hidden} more</p>}
      </div>
    </div>
  )
}

function EventChip({
  event,
  onEditEntry,
}: {
  event: CalendarEvent
  onEditEntry: (entry: CalendarEntry) => void
}) {
  const overdue = event.open && event.date < isoDay(new Date())
  // Contract terms are not the calendar's to move.
  const draggable = event.kind !== 'contract'

  const open = async () => {
    if (event.kind === 'entry' && event.entryId) {
      // The chip only carries what the grid needs, so fetch the whole entry
      // before opening the form on it.
      const entries = await api.get<CalendarEntry[]>('/calendar/entries')
      const full = entries.find((e) => e.id === event.entryId)
      if (full) onEditEntry(full)
      return
    }
    window.location.hash = event.route.replace(/^#/, '')
  }

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', event.id)}
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          void open()
        }
      }}
      title={`${event.tag} · ${event.title}${draggable ? ' — drag to move' : ''}`}
      className={`block truncate rounded-xs border-l-2 py-0.5 pr-1 pl-1.5 text-[11px] leading-tight transition-colors hover:bg-wash ${
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } ${overdue ? 'text-alert' : 'text-ink'}`}
      style={{ borderLeftColor: `var(--color-${event.division})` }}
    >
      {event.startTime && <span className="font-mono text-faint">{event.startTime} </span>}
      {event.title}
    </div>
  )
}

/** Day view is an agenda, not a grid — one day of cells is mostly empty space. */
function DayView({
  day,
  events,
  onEdit,
  onAdd,
}: {
  day: Date
  events: CalendarEvent[]
  onEdit: (entry: CalendarEntry) => void
  onAdd: () => void
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title="Nothing due"
        hint={`No deadlines land on ${day.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`}
        action={{ label: 'Add an entry', onClick: onAdd }}
      />
    )
  }

  return (
    <Panel bodyClassName="p-0">
      <ul className="divide-y divide-rule-soft">
        {events.map((event) => {
          const overdue = event.open && event.date < isoDay(new Date())
          return (
            <li key={`${event.kind}-${event.id}`}>
              <button
                type="button"
                onClick={async () => {
                  if (event.kind === 'entry' && event.entryId) {
                    const entries = await api.get<CalendarEntry[]>('/calendar/entries')
                    const full = entries.find((e) => e.id === event.entryId)
                    if (full) onEdit(full)
                    return
                  }
                  window.location.hash = event.route.replace(/^#/, '')
                }}
                className="relative flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-3 pr-4 pl-5 text-left transition-colors hover:bg-wash"
              >
                <span
                  className="absolute inset-y-0 left-0 w-[3px]"
                  style={mark(event.division).fill}
                  aria-hidden
                />
                {event.startTime && (
                  <span className="w-20 shrink-0 font-mono text-[11px] tabular-nums text-graphite">
                    {event.startTime}
                    {event.endTime ? `–${event.endTime}` : ''}
                  </span>
                )}
                <Tag tag={event.tag} />
                <span className="min-w-0 flex-1 basis-56 truncate text-sm text-ink">
                  {event.title}
                </span>
                {event.detail && (
                  <span className="font-mono text-[10px] text-faint">{event.detail}</span>
                )}
                <Pill tone={overdue ? 'alert' : 'neutral'}>
                  {overdue ? 'Overdue' : KIND_LABEL[event.kind]}
                </Pill>
              </button>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function Legend() {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] text-faint">
      <span>Left edge is the division:</span>
      {DIVISIONS.map((d) => (
        <span key={d} className="flex items-center gap-1.5">
          <span className="h-3 w-0.5" style={mark(d).fill} aria-hidden />
          {DIVISION_LABEL[d]}
        </span>
      ))}
      <span className="text-alert">Red means past due and still open.</span>
      <span>Drag to move · double-click a day to add.</span>
    </p>
  )
}

function EntryForm({
  entry,
  defaultDay,
  onClose,
  onSaved,
}: {
  entry: CalendarEntry | null
  defaultDay: string
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(entry?.title ?? '')
  const [kind, setKind] = useState<EntryKind | ''>(entry?.kind ?? 'meeting')
  const [division, setDivision] = useState<Division | ''>(entry?.division ?? 'tuenx')
  const [date, setDate] = useState(entry ? entry.date.slice(0, 10) : defaultDay)
  const [endDate, setEndDate] = useState(entry?.endDate ? entry.endDate.slice(0, 10) : '')
  const [allDay, setAllDay] = useState(entry?.allDay ?? false)
  const [startTime, setStartTime] = useState(entry?.startTime ?? '10:00')
  const [endTime, setEndTime] = useState(entry?.endTime ?? '11:00')
  const [attendees, setAttendees] = useState(entry?.attendees ?? '')
  const [remind, setRemind] = useState(
    entry?.remindMinutesBefore === null || entry?.remindMinutesBefore === undefined
      ? ''
      : String(entry.remindMinutesBefore),
  )
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title,
        kind,
        division,
        date,
        endDate,
        allDay,
        startTime,
        endTime,
        attendees,
        remindMinutesBefore: remind,
        notes,
      }
      if (entry) await api.patch(`/calendar/entries/${entry.id}`, payload)
      else await api.post('/calendar/entries', payload)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!entry || !confirm(`Delete ${entry.title}? This cannot be undone.`)) return
    setSaving(true)
    try {
      await api.del(`/calendar/entries/${entry.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={entry ? 'Edit entry' : 'New entry'}
      subtitle={
        entry ? (
          <Tag tag={entry.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            A tag is issued on save, e.g. TNX-E008
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-5 py-5">
          <TextField
            label="What"
            value={title}
            onChange={setTitle}
            required
            autoFocus
            placeholder="Weekly group sync"
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

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Date" type="date" value={date} onChange={setDate} required />
            <TextField
              label="Ends"
              type="date"
              value={endDate}
              onChange={setEndDate}
              hint="Leave blank for a single day."
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="size-4 accent-[var(--color-ink)]"
            />
            <span className="text-sm text-ink">All day</span>
          </label>

          {!allDay && (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Starts" value={startTime} onChange={setStartTime} placeholder="10:00" />
              <TextField label="Ends" value={endTime} onChange={setEndTime} placeholder="11:00" />
            </div>
          )}

          <TextField
            label="Who"
            value={attendees}
            onChange={setAttendees}
            placeholder="Names, free text"
          />

          <SelectField
            label="Reminder"
            value={remind}
            options={REMINDER_OPTIONS.filter((o) => o.value !== '').map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            placeholder="No reminder"
            onChange={(v) => setRemind(v)}
          />

          <TextAreaField label="Notes" value={notes} onChange={setNotes} rows={3} />

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {entry && (
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
            {saving ? 'Saving…' : entry ? 'Save changes' : 'Add entry'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}
