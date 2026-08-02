import { useEffect, type ReactNode } from 'react'
import { useViewMode, type ViewMode } from '../lib/viewMode.ts'

/**
 * How a record opens, in three shapes:
 *
 *   center  centred over the page — the default, and where a click on a card
 *           is expected to land
 *   side    a panel from the right, board still visible behind it — for quick
 *           edits where the surrounding context is the point
 *   full    a page takeover with room to breathe — for reading and long forms
 *
 * The mode is a persisted preference (see useViewMode), toggled from the
 * header here, so a person picks once rather than per record.
 */
export function RecordView({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const [mode, setMode] = useViewMode()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  const header = (
    <header className="flex items-start justify-between gap-3 border-b border-rule bg-wash px-4 py-3">
      <div className="min-w-0">
        <h2 className="font-display text-lg leading-none font-semibold text-ink">{title}</h2>
        {subtitle && <div className="mt-1.5">{subtitle}</div>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ViewToggle mode={mode} onChange={setMode} />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-[2px] px-1 font-mono text-base leading-none text-faint transition-colors hover:text-ink"
        >
          ×
        </button>
      </div>
    </header>
  )

  if (mode === 'full') {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-paper">
        <div className="mx-auto min-h-dvh max-w-3xl border-x border-rule">
          {header}
          {children}
        </div>
      </div>
    )
  }

  // Only the backdrop dismisses — a drag that ends outside the panel shouldn't
  // throw away a half-filled form.
  const dismissOnBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  if (mode === 'side') {
    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-ink/20" onMouseDown={dismissOnBackdrop}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="flex h-dvh w-full max-w-md flex-col overflow-y-auto border-l border-ink bg-paper"
        >
          {header}
          {children}
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/25 p-4 sm:items-center"
      onMouseDown={dismissOnBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-auto flex w-full max-w-xl flex-col rounded-[3px] border border-ink bg-paper"
      >
        {header}
        {children}
      </div>
    </div>
  )
}

function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
}) {
  return (
    <div
      role="group"
      aria-label="Record view"
      className="flex overflow-hidden rounded-[3px] border border-rule"
    >
      {(
        [
          ['center', 'Centre', 'Open records centred over the page'],
          ['side', 'Side', 'Open records in a panel beside the board'],
          ['full', 'Full', 'Open records as a full page'],
        ] as const
      ).map(([value, label, hint]) => (
        <button
          key={value}
          type="button"
          title={hint}
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={`px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
            mode === value ? 'bg-ink text-paper' : 'bg-paper text-graphite hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** Footer for record forms. Destructive action sits far left. */
export function RecordFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="mt-auto flex items-center justify-end gap-2 border-t border-rule bg-wash px-4 py-3">
      {children}
    </footer>
  )
}
