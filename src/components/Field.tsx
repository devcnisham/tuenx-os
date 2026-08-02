import { useId, type ReactNode } from 'react'

const CONTROL =
  'w-full rounded-sm border border-rule bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-faint transition-colors hover:border-graphite focus:border-ink focus:outline-none disabled:opacity-50'

function Wrapper({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: ReactNode
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label-mono mb-1.5 block">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-snug text-faint">{hint}</p>}
    </div>
  )
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  ...rest
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: ReactNode
  type?: 'text' | 'email' | 'date' | 'number'
  placeholder?: string
  required?: boolean
  min?: number
  step?: number
  autoFocus?: boolean
}) {
  const id = useId()
  return (
    <Wrapper label={label} hint={hint} htmlFor={id}>
      <input
        id={id}
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={CONTROL}
      />
    </Wrapper>
  )
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <Wrapper label={label} hint={hint} htmlFor={id}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${CONTROL} resize-y`}
      />
    </Wrapper>
  )
}

export interface Option<T extends string> {
  value: T
  label: string
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  placeholder,
}: {
  label: string
  value: T | ''
  options: readonly Option<T>[]
  onChange: (value: T | '') => void
  hint?: ReactNode
  /** Present = an empty choice is allowed (used for "Unassigned"). */
  placeholder?: string
}) {
  const id = useId()
  return (
    <Wrapper label={label} hint={hint} htmlFor={id}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T | '')}
        className={CONTROL}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  )
}

/**
 * Compact select for toolbars. An active filter inverts to solid ink, so it is
 * obvious at a glance which filters are narrowing the view.
 */
export function FilterSelect<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: T | ''
  options: readonly Option<T>[]
  onChange: (value: T | '') => void
  placeholder: string
  ariaLabel: string
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as T | '')}
      // The options keep paper/ink regardless, or an active filter renders
      // black-on-black in the native dropdown.
      className={`rounded-sm border px-2 py-1 font-mono text-[11px] transition-colors focus:outline-none [&>option]:bg-surface [&>option]:text-ink ${
        value
          ? 'border-ink bg-ink text-surface'
          : 'border-rule bg-surface text-graphite hover:border-graphite'
      }`}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
