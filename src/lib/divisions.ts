import type { CSSProperties } from 'react'
import type { Division } from '../types.ts'

/**
 * Division encoding — hue on the bars and markers, hue plus a typographic
 * treatment on the tags.
 *
 *   Tuenx     amber   · filled block      — the parent, a seal
 *   Agency    orange  · outlined frame    — a stamped border
 *   Gaphatch  teal    · underscored       — an underlined code
 *
 * Bars and markers are a flat fill in the division hue. Textures (hatch, dot)
 * were tried and removed: at 6px they read as visual noise rather than as an
 * encoding, and the hue already does that job.
 *
 * The tag treatments stay, so a tag is still identifiable when the colour is
 * gone — greyscale print, a bad projector, a colour-blind reader.
 *
 * Status colour is red and green only. Amber belongs to Tuenx.
 */
export interface DivisionMark {
  /** Classes for the ID tag chip — tint, coloured text, and treatment. */
  tag: string
  /** Accent text colour, for figures that belong to one division. */
  text: string
  /** Fill for the marker strip on a card and the bars in the ledger. */
  fill: CSSProperties
  /** One-word description of the treatment, used in the legend. */
  treatment: string
}

export const DIVISION_MARK: Record<Division, DivisionMark> = {
  tuenx: {
    tag: 'bg-tuenx/15 text-tuenx-ink ring-1 ring-inset ring-tuenx/40 font-semibold',
    text: 'text-tuenx-ink',
    fill: { background: 'var(--color-tuenx)' },
    treatment: 'Filled',
  },
  agency: {
    tag: 'border border-agency-ink/50 bg-agency/10 text-agency-ink',
    text: 'text-agency-ink',
    fill: { background: 'var(--color-agency)' },
    treatment: 'Outlined',
  },
  gaphatch: {
    tag: 'border-b-2 border-gaphatch-ink bg-gaphatch/10 text-gaphatch-ink tracking-[0.18em]',
    text: 'text-gaphatch-ink',
    fill: { background: 'var(--color-gaphatch)' },
    treatment: 'Underscored',
  },
}

export const mark = (division: Division) => DIVISION_MARK[division]

/**
 * Reads the division back out of a record tag (`AGY-T003` → `agency`).
 *
 * Products and everything under them are Gaphatch-only and carry no division
 * column, so their tag is the only place the division is recorded.
 */
export function divisionFromTag(tag: string): Division {
  switch (tag.slice(0, 3)) {
    case 'AGY':
      return 'agency'
    case 'GPH':
      return 'gaphatch'
    default:
      return 'tuenx'
  }
}
