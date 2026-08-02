const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const compact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const money = (value: number) => currency.format(value)

/** Compact form for dashboard tiles, where the exact dollar isn't the point. */
export const moneyShort = (value: number) =>
  Math.abs(value) >= 10_000 ? compact.format(value) : currency.format(value)

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** Drops the year for dates inside the current year — less noise in lists. */
export function shortDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.getFullYear() === new Date().getFullYear()
    ? dayMonth.format(d)
    : dayMonthYear.format(d)
}

export const fullDate = (iso: string) => dayMonthYear.format(new Date(iso))

/** For prefilling `<input type="date">`, which only accepts yyyy-mm-dd. */
export const dateInputValue = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

export const todayInputValue = () => new Date().toISOString().slice(0, 10)

/** Whole days from today. Negative = overdue. */
export function daysUntil(iso: string): number {
  const due = new Date(iso)
  due.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

/** "3d overdue" / "Today" / "in 5d" — for due-date chips. */
export function dueLabel(iso: string): { text: string; tone: 'overdue' | 'soon' | 'later' } {
  const days = daysUntil(iso)
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: 'overdue' }
  if (days === 0) return { text: 'Due today', tone: 'overdue' }
  if (days <= 3) return { text: `in ${days}d`, tone: 'soon' }
  return { text: shortDate(iso), tone: 'later' }
}

export const pluralise = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`
