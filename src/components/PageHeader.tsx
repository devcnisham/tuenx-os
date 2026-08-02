import type { ReactNode } from 'react'

/**
 * Every page opens the same way: a mono eyebrow naming the owning division,
 * a condensed title, then a rule. The rule is the alignment spine the rest of
 * the page hangs off.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-5 border-b border-ink pb-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="label-mono">{eyebrow}</p>
          <h1 className="mt-1 font-display text-3xl leading-none font-semibold tracking-tight text-ink">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-snug text-graphite">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/** Filter row under a page header. Wraps on narrow screens. */
export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-rule pb-3">{children}</div>
  )
}
