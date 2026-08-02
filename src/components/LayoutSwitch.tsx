import {
  RECORD_LAYOUTS,
  RECORD_LAYOUT_LABEL,
  type RecordLayout,
} from '../lib/recordLayout.ts'

/**
 * Board / Grid / List switch for a module's records.
 *
 * `available` lets a module offer only the shapes that make sense for it —
 * Invoices has no board, because "status" there is a lifecycle you read in
 * date order, not columns you drag between.
 */
export function LayoutSwitch({
  value,
  onChange,
  available = RECORD_LAYOUTS,
}: {
  value: RecordLayout
  onChange: (layout: RecordLayout) => void
  available?: readonly RecordLayout[]
}) {
  return (
    <div
      role="group"
      aria-label="Record layout"
      className="flex shrink-0 overflow-hidden rounded-sm border border-rule"
    >
      {available.map((layout) => (
        <button
          key={layout}
          type="button"
          aria-pressed={value === layout}
          onClick={() => onChange(layout)}
          className={`px-2 py-1 font-mono text-[10px] transition-colors ${
            value === layout ? 'bg-ink text-surface' : 'bg-surface text-graphite hover:text-ink'
          }`}
        >
          {RECORD_LAYOUT_LABEL[layout]}
        </button>
      ))}
    </div>
  )
}
