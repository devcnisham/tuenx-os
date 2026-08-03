import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import {
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABEL,
  DAY_START_HOUR,
  HOUR_PX,
  addDays,
  addMonths,
  daysFor,
  isSameMonth,
  isToday,
  isoDay,
  miniMonthDays,
  rangeFor,
  slotFor,
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
import { Button, ErrorState, Panel, Skeleton } from '../components/ui.tsx'
import { FilterSelect, SelectField, TextAreaField, TextField } from '../components/Field.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { Tag } from '../components/Tag.tsx'
import { Icon } from '../components/Icon.tsx'
import { MeetingPlanner, nextWorkday } from '../components/MeetingPlanner.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))
const KIND_OPTIONS = ENTRY_KINDS.map((k) => ({ value: k, label: ENTRY_KIND_LABEL[k] }))

const KINDS = ['task', 'project', 'invoice', 'release', 'contract', 'entry'] as const
type Kind = (typeof KINDS)[number]

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

      {/* Sidebar beside the grid, the way every calendar app is laid out: the
          month you are looking at, and the month you are jumping to, at once.
          It drops out below lg, where it would cost more width than it earns. */}
      <div className="flex gap-5">
        <aside className="hidden w-56 shrink-0 lg:block">
          <MiniMonth anchor={anchor} onPick={(d) => setAnchor(d)} />

          <div className="mt-5 border-t border-rule pt-4">
            <p className="label-mono mb-2">What is on here</p>
            <Legend />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {calendar.error ? (
            <ErrorState message={calendar.error} onRetry={calendar.reload} />
          ) : calendar.loading ? (
            <Skeleton rows={4} />
          ) : view === 'month' ? (
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
                    muted={!isSameMonth(d, anchor)}
                    tall={false}
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
          ) : (
            <TimeGrid
              days={days}
              byDay={byDay}
              onDropEvent={(id, day) => {
                const dropped = events.find((e) => e.id === id)
                if (dropped) moveEvent(dropped, day)
              }}
              onAdd={openNewOn}
              onEditEntry={setEditing}
            />
          )}
        </div>
      </div>

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

/* -------------------------------------------------------------------------- */
/* Mini month                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The little month in the sidebar. Its own anchor, so paging it to look at
 * November doesn't drag the main grid along until a day is actually picked.
 */
function MiniMonth({ anchor, onPick }: { anchor: Date; onPick: (day: Date) => void }) {
  const [month, setMonth] = useState(anchor)

  // Following the main view when it moves is what makes it a companion rather
  // than a second, competing control.
  const shownMonth = isSameMonth(month, anchor) ? month : anchor
  const days = miniMonthDays(shownMonth)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-sm font-semibold text-ink">
          {shownMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </span>
        <span className="flex gap-0.5">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth(addMonths(shownMonth, -1))}
            className="rounded-xs px-1 text-faint transition-colors hover:text-ink"
          >
            <Icon name="arrowLeft" size={12} />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonth(addMonths(shownMonth, 1))}
            className="rounded-xs px-1 text-faint transition-colors hover:text-ink"
          >
            <Icon name="arrowRight" size={12} />
          </button>
        </span>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="text-center font-mono text-[9px] text-faint">
            {label.slice(0, 1)}
          </span>
        ))}

        {days.map((d) => {
          const selected = isoDay(d) === isoDay(anchor)
          const today = isToday(d)
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onPick(d)}
              className={`mx-auto grid size-6 place-items-center rounded-full font-mono text-[10px] tabular-nums transition-colors ${
                selected
                  ? 'bg-ink text-surface'
                  : today
                    ? 'text-ink ring-1 ring-ink'
                    : isSameMonth(d, shownMonth)
                      ? 'text-graphite hover:bg-wash hover:text-ink'
                      : 'text-faint hover:bg-wash'
              }`}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Time grid — day and week                                                   */
/* -------------------------------------------------------------------------- */

const HOURS = Array.from({ length: 24 }, (_, h) => h)

/**
 * Hours down the side, days across, events placed where they actually fall.
 *
 * Deadlines are the awkward part: almost everything the calendar projects —
 * a task due date, an invoice, a contract ending — has no time of day, because
 * it is a deadline rather than an appointment. Dropping them into a 9am slot
 * would invent information. They sit in the all-day band across the top, which
 * is exactly the distinction that band exists to draw.
 */
function TimeGrid({
  days,
  byDay,
  onDropEvent,
  onAdd,
  onEditEntry,
}: {
  days: Date[]
  byDay: Map<string, CalendarEvent[]>
  onDropEvent: (id: string, day: string) => void
  onAdd: (day: string) => void
  onEditEntry: (entry: CalendarEntry) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)

  // Open on the working day rather than at midnight. Nobody schedules at 3am,
  // and eight empty rows is a poor first impression.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = DAY_START_HOUR * HOUR_PX
  }, [])

  const timed = (day: Date) => (byDay.get(isoDay(day)) ?? []).filter((e) => e.startTime)
  const allDay = (day: Date) => (byDay.get(isoDay(day)) ?? []).filter((e) => !e.startTime)

  return (
    <Panel bodyClassName="p-0">
      {/* Day heads */}
      <div
        className="grid border-b border-rule-soft"
        style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <span />
        {days.map((d) => (
          <div key={d.toISOString()} className="px-2 py-2 text-center">
            <p className="label-mono">{WEEKDAY_LABELS[(d.getDay() + 6) % 7]}</p>
            <p
              className={`mx-auto mt-1 grid size-7 place-items-center rounded-full font-display text-sm font-semibold tabular-nums ${
                isToday(d) ? 'bg-ink text-surface' : 'text-ink'
              }`}
            >
              {d.getDate()}
            </p>
          </div>
        ))}
      </div>

      {/* All-day band — deadlines, which is most of what this calendar holds */}
      <div
        className="grid border-b border-rule bg-wash/50"
        style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <span className="px-2 py-1.5 text-right font-mono text-[9px] text-faint">all-day</span>
        {days.map((d) => (
          <AllDayCell
            key={d.toISOString()}
            day={d}
            events={allDay(d)}
            onDropEvent={onDropEvent}
            onEditEntry={onEditEntry}
          />
        ))}
      </div>

      {/* Hour grid */}
      <div ref={scroller} className="max-h-[32rem] overflow-y-auto">
        <div
          className="relative grid"
          style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {/* Hour gutter */}
          <div className="relative">
            {HOURS.map((h) => (
              <div key={h} className="relative" style={{ height: HOUR_PX }}>
                <span className="absolute -top-1.5 right-2 font-mono text-[9px] text-faint">
                  {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
                </span>
              </div>
            ))}
          </div>

          {days.map((d) => (
            <div
              key={d.toISOString()}
              className="relative border-l border-rule-soft"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData('text/plain')
                if (id) onDropEvent(id, isoDay(d))
              }}
            >
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-label={`Add an entry at ${String(h).padStart(2, '0')}:00`}
                  onClick={() => onAdd(isoDay(d))}
                  className="block w-full border-b border-rule-soft transition-colors hover:bg-wash"
                  style={{ height: HOUR_PX }}
                />
              ))}

              {timed(d).map((event) => {
                const slot = slotFor(event.startTime, event.endTime)
                if (!slot) return null
                return (
                  <div
                    key={`${event.kind}-${event.id}`}
                    className="absolute right-1 left-1"
                    style={{ top: slot.top, height: slot.height }}
                  >
                    <EventChip event={event} onEditEntry={onEditEntry} timed />
                  </div>
                )
              })}

              {isToday(d) && <NowLine />}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}

/** The current time, as a hairline across today. */
function NowLine() {
  const now = new Date()
  const top = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX
  return (
    <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top }} aria-hidden>
      <div className="h-px bg-alert" />
      <div className="absolute -top-1 -left-1 size-2 rounded-full bg-alert" />
    </div>
  )
}

function AllDayCell({
  day,
  events,
  onDropEvent,
  onEditEntry,
}: {
  day: Date
  events: CalendarEvent[]
  onDropEvent: (id: string, day: string) => void
  onEditEntry: (entry: CalendarEntry) => void
}) {
  const [dragOver, setDragOver] = useState(false)

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
        if (id) onDropEvent(id, isoDay(day))
      }}
      className={`min-h-9 space-y-0.5 border-l border-rule-soft p-1 transition-colors ${
        dragOver ? 'bg-wash' : ''
      }`}
    >
      {events.map((event) => (
        <EventChip key={`${event.kind}-${event.id}`} event={event} onEditEntry={onEditEntry} />
      ))}
    </div>
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
  timed = false,
}: {
  event: CalendarEvent
  onEditEntry: (entry: CalendarEntry) => void
  /** In the hour grid the chip is positioned and sized by its slot. */
  timed?: boolean
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
      className={`rounded-xs border-l-2 py-0.5 pr-1 pl-1.5 text-[11px] leading-tight transition-colors ${
        timed
          ? 'h-full overflow-hidden bg-surface shadow-card hover:brightness-95'
          : 'block truncate hover:bg-wash'
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${
        overdue ? 'text-alert' : 'text-ink'
      }`}
      style={{
        borderLeftColor: `var(--color-${event.division})`,
        ...(timed && { background: `color-mix(in oklab, var(--color-${event.division}) 14%, var(--color-surface))` }),
      }}
    >
      {event.startTime && <span className="font-mono text-faint">{event.startTime} </span>}
      {event.title}
    </div>
  )
}

/** Day view is an agenda, not a grid — one day of cells is mostly empty space. */
function Legend() {
  return (
    <div className="space-y-2 font-mono text-[10px] text-faint">
      <p>Left edge is the division:</p>
      {DIVISIONS.map((d) => (
        <p key={d} className="flex items-center gap-1.5">
          <span className="h-3 w-0.5" style={mark(d).fill} aria-hidden />
          {DIVISION_LABEL[d]}
        </p>
      ))}
      <p className="text-alert">Red means past due and still open.</p>
      <p>
        Deadlines have no time of day, so they sit in the all-day band rather
        than being dropped into an hour nobody chose.
      </p>
      <p>Drag to move · click an hour to add.</p>
    </div>
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
