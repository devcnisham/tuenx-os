import type { ButtonHTMLAttributes, ReactNode } from 'react'

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A bordered slab. Hairline rule, near-zero radius, no shadow — this is a
 * printed instrument, not a floating card.
 */
export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = '',
  bodyClassName = 'p-4',
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`rounded-[3px] border border-rule bg-paper ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-rule bg-wash px-3 py-2">
          <div className="min-w-0">
            {title && <h2 className="label-mono truncate">{title}</h2>}
            {subtitle && <div className="mt-0.5 truncate">{subtitle}</div>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

const BUTTON_VARIANTS = {
  // Primary is solid ink. Colour stays reserved for status.
  primary: 'bg-ink text-paper hover:bg-graphite disabled:bg-faint',
  ghost: 'border border-rule bg-paper text-ink hover:border-ink disabled:opacity-40',
  danger: 'border border-rule bg-paper text-alert hover:border-alert disabled:opacity-40',
} as const

export function Button({
  variant = 'ghost',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[3px] font-mono text-[11px] font-medium tracking-wide transition-colors disabled:cursor-not-allowed ${
        size === 'sm' ? 'px-2 py-1' : 'px-2.5 py-1.5'
      } ${BUTTON_VARIANTS[variant]} ${className}`}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

/** TRD §6: a module that fails shows this, and the rest of the app keeps working. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-[3px] border border-alert/40 bg-alert/5 p-4">
      <p className="label-mono text-alert">Failed to load</p>
      <p className="mt-1.5 text-sm text-ink">{message}</p>
      {onRetry && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-[3px] border border-dashed border-rule px-4 py-10 text-center">
      <p className="label-mono">{title}</p>
      {hint && <p className="mx-auto mt-2 max-w-sm text-sm text-graphite">{hint}</p>}
    </div>
  )
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-11 animate-pulse rounded-[3px] bg-wash" />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Data bits                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A labelled figure. Condensed and tight — figures are the thing you read
 * first on this page, so they get the display face rather than the body face.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'text-ink',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: string
}) {
  return (
    <div>
      <p className="label-mono">{label}</p>
      <p className={`mt-1.5 font-display text-3xl leading-none font-semibold tabular-nums ${tone}`}>
        {value}
      </p>
      {hint && <p className="mt-1.5 font-mono text-[10px] text-faint">{hint}</p>}
    </div>
  )
}

/**
 * Status pill. `neutral` is the default; the three colours are the only hue in
 * the system and each means exactly one thing.
 */
const PILL_TONES = {
  neutral: 'border-rule bg-wash text-graphite',
  alert: 'border-alert/40 bg-alert/8 text-alert',
  ready: 'border-ready/40 bg-ready/8 text-ready',
  pending: 'border-pending/40 bg-pending/10 text-pending',
} as const

export type PillTone = keyof typeof PILL_TONES

export function Pill({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  tone?: PillTone
  className?: string
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-[2px] border px-1 py-px font-mono text-[10px] font-medium whitespace-nowrap ${PILL_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/** Label ....... value, as on a spec sheet. Used where a row is a reading. */
export function LeaderRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="leader py-1">
      <span className="label-mono order-0">{label}</span>
      <span className="order-2 font-mono text-xs tabular-nums text-ink">{value}</span>
    </div>
  )
}
