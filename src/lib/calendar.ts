export const CALENDAR_VIEWS = ['day', 'week', 'month'] as const
export type CalendarView = (typeof CALENDAR_VIEWS)[number]

export const CALENDAR_VIEW_LABEL: Record<CalendarView, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
}

/** `yyyy-mm-dd` in local time. `toISOString` would shift the day west of UTC. */
export function isoDay(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export const fromIsoDay = (iso: string) => new Date(`${iso}T00:00:00`)

export const addDays = (d: Date, n: number) => {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  return next
}

export const addMonths = (d: Date, n: number) => {
  const next = new Date(d)
  next.setDate(1)
  next.setMonth(next.getMonth() + n)
  return next
}

/** Monday-first, which is how a work week is read. */
export function startOfWeek(d: Date): Date {
  const next = new Date(d)
  const weekday = (next.getDay() + 6) % 7
  next.setDate(next.getDate() - weekday)
  next.setHours(0, 0, 0, 0)
  return next
}

export function startOfMonth(d: Date): Date {
  const next = new Date(d)
  next.setDate(1)
  next.setHours(0, 0, 0, 0)
  return next
}

/**
 * The span a view needs to fetch.
 *
 * A month grid shows leading and trailing days from the neighbouring months,
 * so the range is the whole grid rather than the calendar month — otherwise
 * those cells render empty and look broken.
 */
export function rangeFor(view: CalendarView, anchor: Date): { from: Date; to: Date } {
  if (view === 'day') return { from: anchor, to: anchor }
  if (view === 'week') {
    const from = startOfWeek(anchor)
    return { from, to: addDays(from, 6) }
  }
  const from = startOfWeek(startOfMonth(anchor))
  return { from, to: addDays(from, 41) }
}

/** Every day in the grid for a view, in order. */
export function daysFor(view: CalendarView, anchor: Date): Date[] {
  const { from } = rangeFor(view, anchor)
  const count = view === 'day' ? 1 : view === 'week' ? 7 : 42
  return Array.from({ length: count }, (_, i) => addDays(from, i))
}

export const isToday = (d: Date) => isoDay(d) === isoDay(new Date())

export const isSameMonth = (d: Date, anchor: Date) =>
  d.getMonth() === anchor.getMonth() && d.getFullYear() === anchor.getFullYear()

const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
const dayLong = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const dayShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

export function titleFor(view: CalendarView, anchor: Date): string {
  if (view === 'day') return dayLong.format(anchor)
  if (view === 'week') {
    const from = startOfWeek(anchor)
    return `${dayShort.format(from)} – ${dayShort.format(addDays(from, 6))}`
  }
  return monthYear.format(anchor)
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
