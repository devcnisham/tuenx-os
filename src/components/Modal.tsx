import { useEffect, type ReactNode } from 'react'

/**
 * Centred dialog used for every create/edit form.
 *
 * Escape and backdrop-click close it, body scroll locks while it's open, and
 * the panel scrolls if the form is taller than the viewport.
 */
export function Modal({
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/25 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-auto w-full max-w-lg rounded-[3px] border border-ink bg-paper"
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule bg-wash px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg leading-none font-semibold text-ink">{title}</h2>
            {subtitle && <div className="mt-1.5">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 rounded-[2px] p-1 font-mono text-base leading-none text-faint transition-colors hover:text-ink"
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

/** Standard footer for modal forms. Destructive action sits far left. */
export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="flex items-center justify-end gap-2 border-t border-rule bg-wash px-4 py-3">
      {children}
    </footer>
  )
}
