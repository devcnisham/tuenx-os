import { useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { addDays, isoDay } from '../lib/calendar.ts'
import { mark } from '../lib/divisions.ts'
import { pluralise } from '../lib/format.ts'
import {
  DIVISIONS,
  DIVISION_LABEL,
  REMINDER_OPTIONS,
  type CalendarEntry,
  type Division,
  type TeamMember,
} from '../types.ts'
import { Button, Pill } from './ui.tsx'
import { SelectField, TextAreaField, TextField } from './Field.tsx'
import { RecordView, RecordFooter } from './RecordView.tsx'
import { Icon } from './Icon.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))

/** Half-hour slots across a working day. Enough to pick from, short enough to scan. */
const SLOTS = Array.from({ length: 22 }, (_, i) => {
  const minutes = 8 * 60 + i * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})

const addMinutes = (time: string, minutes: number) => {
  const [h, m] = time.split(':').map(Number)
  const total = (h ?? 0) * 60 + (m ?? 0) + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

interface DayEvent {
  id: string
  tag: string
  date: string
  title: string
  detail: string | null
  kind: string
  division: Division
  startTime?: string | null
  endTime?: string | null
}

/**
 * Plan a meeting: pick who, pick when, see what else is already on that day.
 *
 * The clash check is honest about its limits. Attendees are free text — there
 * are no per-person calendars until people have accounts — so this shows
 * everything already scheduled that day and flags entries whose *names* overlap
 * with the people invited. It cannot promise someone is free; it can stop you
 * booking over the thing you already knew about, which is most of the value.
 *
 * Optionally creates an agenda doc and links it to the meeting, so the notes
 * have somewhere to live before the meeting rather than after it.
 */
export function MeetingPlanner({
  defaultDay,
  onClose,
  onCreated,
}: {
  defaultDay: string
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [division, setDivision] = useState<Division | ''>('tuenx')
  const [date, setDate] = useState(defaultDay)
  const [startTime, setStartTime] = useState('10:00')
  const [minutes, setMinutes] = useState('30')
  const [attendeeIds, setAttendeeIds] = useState<string[]>([])
  const [remind, setRemind] = useState('15')
  const [agenda, setAgenda] = useState('')
  const [withDoc, setWithDoc] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const team = useResource<TeamMember[]>(() => api.get('/team'), [])
  const day = useResource<{ events: DayEvent[] }>(
    () => api.get('/calendar', { from: date, to: date }),
    [date],
  )

  const attendees = useMemo(
    () => (team.data ?? []).filter((m) => attendeeIds.includes(m.id)),
    [team.data, attendeeIds],
  )

  const endTime = addMinutes(startTime, Number(minutes) || 30)

  /**
   * Anything on that day whose attendee list names someone invited, or that
   * overlaps the chosen window. Named "possible" because it is exactly that.
   */
  const clashes = useMemo(() => {
    const names = attendees.map((a) => a.name.toLowerCase())
    return (day.data?.events ?? []).filter((event) => {
      if (!event.startTime) return false
      const overlaps = event.startTime < endTime && (event.endTime ?? event.startTime) > startTime
      const sharesPerson =
        names.length > 0 &&
        names.some((n) => (event.detail ?? '').toLowerCase().includes(n.split(' ')[0] ?? ''))
      return overlaps || sharesPerson
    })
  }, [day.data, attendees, startTime, endTime])

  const otherThatDay = (day.data?.events ?? []).filter((e) => !e.startTime)

  const toggle = (id: string) =>
    setAttendeeIds((current) =>
      current.includes(id) ? current.filter((m) => m !== id) : [...current, id],
    )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const entry = await api.post<CalendarEntry>('/calendar/entries', {
        title,
        kind: 'meeting',
        division,
        date,
        allDay: false,
        startTime,
        endTime,
        attendees: attendees.map((a) => a.name).join(', '),
        remindMinutesBefore: remind,
        notes: agenda,
      })

      // An agenda written before the meeting is worth more than notes written
      // after it, so the doc is created up front and linked.
      if (withDoc) {
        const doc = await api.post<{ id: string }>('/docs', {
          title: `${title} — agenda`,
          division,
          category: 'Reference',
          body: agenda || 'Agenda\n\n1. \n2. \n3. \n\nDecisions\n\nActions',
        })
        await api
          .post('/links', {
            fromType: 'entry',
            fromId: entry.id,
            toType: 'doc',
            toId: doc.id,
            note: 'agenda',
          })
          .catch(() => {
            // The meeting and the doc both exist; only the link failed. Not
            // worth failing the whole flow over.
          })
      }

      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title="Plan a meeting"
      subtitle={
        <span className="font-mono text-[10px] text-faint">
          Pick who and when — anything already on that day shows below
        </span>
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
            placeholder="Scholr go/no-go"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Division"
              value={division}
              options={DIVISION_OPTIONS}
              onChange={setDivision}
            />
            <TextField label="Date" type="date" value={date} onChange={setDate} required />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label="Starts"
              value={startTime}
              options={SLOTS.map((s) => ({ value: s, label: s }))}
              onChange={(v) => setStartTime(v || '10:00')}
            />
            <SelectField
              label="Length"
              value={minutes}
              options={[
                { value: '15', label: '15 min' },
                { value: '30', label: '30 min' },
                { value: '45', label: '45 min' },
                { value: '60', label: '1 hour' },
                { value: '90', label: '90 min' },
                { value: '120', label: '2 hours' },
              ]}
              onChange={(v) => setMinutes(v || '30')}
            />
            <div>
              <p className="label-mono mb-1.5">Ends</p>
              <p className="rounded-sm border border-rule bg-wash px-2.5 py-1.5 font-mono text-sm text-ink">
                {endTime}
              </p>
            </div>
          </div>

          <div>
            <p className="label-mono mb-2">
              Who {attendeeIds.length > 0 && `· ${pluralise(attendeeIds.length, 'person', 'people')}`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(team.data ?? []).map((member) => {
                const on = attendeeIds.includes(member.id)
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggle(member.id)}
                    aria-pressed={on}
                    className={`flex items-center gap-1.5 rounded-xs border px-2 py-1 font-mono text-[10px] transition-colors ${
                      on
                        ? 'border-ink bg-ink text-surface'
                        : 'border-rule bg-surface text-graphite hover:border-faint'
                    }`}
                  >
                    <span
                      className="size-1.5 rounded-full"
                      style={on ? { background: 'currentColor' } : mark(member.division).fill}
                      aria-hidden
                    />
                    {member.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* What is already on that day. The honest version of a free/busy check. */}
          <section className="rounded-sm border border-rule bg-wash px-3 py-3">
            <p className="label-mono mb-2 flex items-center gap-1.5">
              <Icon name="calendar" size={12} />
              Already on {date}
            </p>

            {day.loading ? (
              <p className="font-mono text-[10px] text-faint">Checking…</p>
            ) : (day.data?.events ?? []).length === 0 ? (
              <p className="font-mono text-[10px] text-faint">
                Nothing scheduled. The day is clear.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {(day.data?.events ?? []).map((event) => {
                  const clashing = clashes.some((c) => c.id === event.id)
                  return (
                    <li
                      key={`${event.kind}-${event.id}`}
                      className="flex items-center gap-2 text-[11px]"
                    >
                      <span
                        className="h-3 w-0.5 shrink-0"
                        style={mark(event.division).fill}
                        aria-hidden
                      />
                      <span className="w-24 shrink-0 font-mono text-[10px] text-graphite">
                        {event.startTime ? `${event.startTime}–${event.endTime ?? ''}` : 'all day'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink">{event.title}</span>
                      {clashing && <Pill tone="alert">Possible clash</Pill>}
                    </li>
                  )
                })}
              </ul>
            )}

            {clashes.length > 0 && (
              <p className="mt-2.5 border-t border-rule pt-2 font-mono text-[10px] leading-relaxed text-alert">
                {pluralise(clashes.length, 'possible clash', 'possible clashes')}. Attendees are
                free text until people have accounts, so this is a warning rather than a
                guarantee — it cannot see anyone's real calendar.
              </p>
            )}

            {otherThatDay.length > 0 && clashes.length === 0 && (
              <p className="mt-2.5 border-t border-rule pt-2 font-mono text-[10px] text-faint">
                {pluralise(otherThatDay.length, 'all-day item')} that day, no timed clash.
              </p>
            )}
          </section>

          <SelectField
            label="Reminder"
            value={remind}
            placeholder="No reminder"
            options={REMINDER_OPTIONS.filter((o) => o.value !== '').map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            onChange={(v) => setRemind(v)}
          />

          <TextAreaField
            label="Agenda"
            value={agenda}
            onChange={setAgenda}
            rows={4}
            placeholder="What this meeting has to decide. A meeting without one is a status update."
          />

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={withDoc}
              onChange={(e) => setWithDoc(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--color-ink)]"
            />
            <span className="text-sm leading-snug text-ink">
              Create an agenda doc and link it
              <span className="mt-0.5 block font-mono text-[10px] text-faint">
                Gives the notes somewhere to live before the meeting, not after
              </span>
            </span>
          </label>

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Scheduling…' : 'Schedule'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}

/** Next weekday, used as the default when planning from a toolbar button. */
export const nextWorkday = () => {
  let d = addDays(new Date(), 1)
  while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1)
  return isoDay(d)
}
