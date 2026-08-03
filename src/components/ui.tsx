import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon.tsx'

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A white card lifted off the canvas. Depth comes from elevation rather than
 * from a border, which is what makes a screen of these read as a set of
 * objects instead of a table.
 */
export function Panel({
  title,
  subtitle,
  actions,
  icon,
  children,
  className = '',
  bodyClassName = 'p-5',
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  icon?: IconName
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`rounded-md bg-surface shadow-card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-rule-soft px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2">
            {icon && <Icon name={icon} size={15} className="text-faint" />}
            <div className="min-w-0">
              {title && <h2 className="label-mono truncate">{title}</h2>}
              {subtitle && <div className="mt-1 truncate">{subtitle}</div>}
            </div>
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
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle'
  size?: 'sm' | 'md'
  icon?: IconName
}

const BUTTON_VARIANTS = {
  primary:
    'bg-ink text-surface shadow-card hover:bg-graphite active:translate-y-px disabled:bg-faint disabled:shadow-none',
  ghost:
    'border border-rule bg-surface text-ink shadow-card hover:border-faint active:translate-y-px disabled:opacity-40 disabled:shadow-none',
  subtle: 'text-graphite hover:bg-wash hover:text-ink disabled:opacity-40',
  danger:
    'border border-rule bg-surface text-alert shadow-card hover:border-alert/50 hover:bg-alert/5 active:translate-y-px disabled:opacity-40',
} as const

export function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-sm font-mono font-medium tracking-wide transition-all duration-150 disabled:cursor-not-allowed ${
        size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-xs'
      } ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 13 : 15} />}
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

/** TRD §6: a module that fails shows this, and the rest of the app keeps working. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-md border border-alert/25 bg-alert/5 p-6">
      <div className="flex items-center gap-2 text-alert">
        <Icon name="alert" size={16} />
        <p className="label-mono text-alert">Failed to load</p>
      </div>
      <p className="mt-2 text-sm text-ink">{message}</p>
      {onRetry && (
        <Button variant="ghost" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

/**
 * An empty screen is an invitation to act, not a shrug — so this takes an
 * action rather than only explaining the emptiness.
 */
export function EmptyState({
  title,
  hint,
  icon = 'inbox',
  action,
}: {
  title: string
  hint?: string
  icon?: IconName
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-rule px-6 py-14 text-center">
      <span className="mb-4 grid size-11 place-items-center rounded-full bg-wash text-faint">
        <Icon name={icon} size={20} />
      </span>
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-graphite">{hint}</p>}
      {action && (
        <Button variant="primary" size="sm" icon="plus" className="mt-5" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-md bg-surface shadow-card" />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Data bits                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A labelled figure. Figures get the display face and real size — they are
 * what a person reads first on a dashboard.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'text-ink',
  icon,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: string
  icon?: IconName
}) {
  return (
    <div>
      <p className="label-mono flex items-center gap-1.5">
        {icon && <Icon name={icon} size={12} />}
        {label}
      </p>
      <p className={`mt-2 font-display text-[2rem] leading-none font-semibold tabular-nums ${tone}`}>
        {value}
      </p>
      {hint && <p className="mt-2 font-mono text-[11px] text-faint">{hint}</p>}
    </div>
  )
}

const PILL_TONES = {
  neutral: 'border-rule bg-wash text-graphite',
  alert: 'border-alert/30 bg-alert/8 text-alert',
  ready: 'border-ready/30 bg-ready/8 text-ready',
  // Amber belongs to Tuenx, so "pending" is ink rather than a division hue.
  pending: 'border-ink/25 bg-ink/5 text-ink',
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
      className={`inline-flex shrink-0 items-center rounded-xs border px-1.5 py-0.5 font-mono text-[10px] font-medium whitespace-nowrap ${PILL_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/** Label ....... value, as on a spec sheet. */
export function LeaderRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="leader py-1">
      <span className="label-mono order-0">{label}</span>
      <span className="order-2 font-mono text-xs tabular-nums text-ink">{value}</span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Card activation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Makes a whole card open its record, not just the title.
 *
 * A card that only responds on eight words of text is a target people miss —
 * they click the tag, the assignee, the whitespace, and nothing happens. Spread
 * this on the card container.
 *
 * Controls *inside* the card must stop propagation, or nudging a card along the
 * board opens the form as well. `MoveButton` does this for every board.
 */
export function openable(onOpen: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: (e: React.KeyboardEvent) => {
      // Enter and Space, because that is what a button does and this is
      // pretending to be one.
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpen()
      }
    },
  }
}
