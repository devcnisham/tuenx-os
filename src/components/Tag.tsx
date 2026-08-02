import { mark, divisionFromTag } from '../lib/divisions.ts'

/**
 * The division-coded record ID — `AGY-T003`, `GPH-C012`.
 *
 * The signature element of Tuenx OS, and the one place division is encoded.
 * Its typographic treatment *is* the division: Tuenx reads as a filled block,
 * Agency as an outlined frame, Gaphatch as a letter-spaced underscore. No hue
 * involved, so it survives greyscale printing and colour-blind readers, and
 * leaves red/green/amber free to mean only status.
 */
export function Tag({ tag, size = 'sm' }: { tag: string; size?: 'sm' | 'md' }) {
  const m = mark(divisionFromTag(tag))

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-[2px] font-mono font-medium ${m.tag} ${
        size === 'md' ? 'px-1.5 py-[3px] text-[11px]' : 'px-1 py-px text-[10px]'
      }`}
    >
      {tag}
    </span>
  )
}

/** The legend that teaches the three treatments. Lives in the nav rail. */
export function TagLegend() {
  return (
    <dl className="space-y-1.5">
      {(
        [
          ['tuenx', 'TNX', 'Tuenx'],
          ['agency', 'AGY', 'Agency'],
          ['gaphatch', 'GPH', 'Gaphatch'],
        ] as const
      ).map(([division, code, label]) => (
        <div key={division} className="flex items-center gap-2">
          <dt
            className={`inline-flex shrink-0 items-center rounded-[2px] px-1 py-px font-mono text-[10px] font-medium ${
              mark(division).tag
            }`}
          >
            {code}
          </dt>
          <dd className="font-mono text-[10px] text-faint">{label}</dd>
        </div>
      ))}
    </dl>
  )
}
