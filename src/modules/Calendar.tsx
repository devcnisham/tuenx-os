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
import { DIVISIONS, DIVISION_LABEL, type Division } from '../types.ts'
import { PageHeader, Toolbar } from '../components/PageHeader.tsx'
import { Button, EmptyState, ErrorState, Panel, Pill, Skeleton } from '../components/ui.tsx'
import { FilterSelect } from '../components/Field.tsx'
import { Tag } from '../components/Tag.tsx'
import { Icon } from '../components/Icon.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))

const KINDS = ['task', 'project', 'invoice', 'release', 'contract'] as const
type Kind = (typeof KINDS)[number]

const KIND_LABEL: Record<Kind, string> = {
  task: 'Tasks',
  project: 'Projects',
  invoice: 'Invoices',
  release: 'Releases',
  contract: 'Contract ends',
}

interface CalendarEvent {
  id: string
  tag: string
  date: string
  title: string
  detail: string | null
  kind: Kind
  division: Division
  open: boolean
  route: string
}

/**
 * Everything with a date, in one place — day, week, or month.
 *
 * Read-only, and a projection rather than its own table: a due date already
 * lives on the task, and copying it here would create two versions of the same
 * fact. Clicking an event goes to the module that owns it.
 *
 * Deadlines, not appointments. No times, no durations — Tuenx OS is not trying
 * to be a meeting calendar.
 */
export function Calendar() {
  const [view, setView] = useState<CalendarView>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [division, setDivision] = useState<Division | ''>('')

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

  const step = (direction: 1 | -1) =>
    setAnchor((current) =>
      view === 'month'
        ? addMonths(current, direction)
        : addDays(current, direction * (view === 'week' ? 7 : 1)),
    )

  const days = daysFor(view, anchor)

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Schedule"
        title="Calendar"
        description="Every deadline the group is carrying — task due dates, project dates, invoice terms, releases, and contract ends."
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
        <DayView day={days[0]!} events={byDay.get(isoDay(days[0]!)) ?? []} />
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
              />
            ))}
          </div>
        </Panel>
      )}

      <Legend />
    </>
  )
}

function DayCell({
  day,
  events,
  muted,
  tall,
}: {
  day: Date
  events: CalendarEvent[]
  muted: boolean
  tall: boolean
}) {
  // Three fits without the cell growing; the rest collapse into a count.
  const shown = events.slice(0, tall ? 8 : 3)
  const hidden = events.length - shown.length

  return (
    <div
      className={`min-h-24 border-r border-b border-rule-soft p-1.5 last:border-r-0 ${
        tall ? 'min-h-64' : ''
      } ${muted ? 'bg-wash/60' : ''}`}
    >
      <div className="mb-1 flex justify-end">
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
          <EventChip key={`${event.kind}-${event.id}`} event={event} />
        ))}
        {hidden > 0 && (
          <p className="px-1 font-mono text-[10px] text-faint">+{hidden} more</p>
        )}
      </div>
    </div>
  )
}

function EventChip({ event }: { event: CalendarEvent }) {
  const overdue = event.open && event.date < isoDay(new Date())

  return (
    <a
      href={event.route}
      title={`${event.tag} · ${event.title}`}
      className={`block truncate rounded-xs border-l-2 py-0.5 pr-1 pl-1.5 text-[11px] leading-tight transition-colors hover:bg-wash ${
        overdue ? 'text-alert' : 'text-ink'
      }`}
      style={{ borderLeftColor: `var(--color-${event.division})` }}
    >
      {event.title}
    </a>
  )
}

/** Day view is an agenda, not a grid — one day of cells would be mostly empty. */
function DayView({ day, events }: { day: Date; events: CalendarEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title="Nothing due"
        hint={`No deadlines land on ${day.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`}
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
              <a
                href={event.route}
                className="relative flex flex-wrap items-center gap-x-4 gap-y-1 py-3 pr-4 pl-5 transition-colors hover:bg-wash"
              >
                <span
                  className="absolute inset-y-0 left-0 w-[3px]"
                  style={mark(event.division).fill}
                  aria-hidden
                />
                <Tag tag={event.tag} />
                <span className="min-w-0 flex-1 basis-64 truncate text-sm text-ink">
                  {event.title}
                </span>
                {event.detail && (
                  <span className="font-mono text-[10px] text-faint">{event.detail}</span>
                )}
                <Pill tone={overdue ? 'alert' : 'neutral'}>
                  {overdue ? 'Overdue' : KIND_LABEL[event.kind]}
                </Pill>
              </a>
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
      <span className="text-alert">Red text means it is past due and still open.</span>
    </p>
  )
}
