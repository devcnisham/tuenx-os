import type { CSSProperties } from 'react'
import type { Division } from '../types.ts'

/**
 * Division encoding — typographic and tonal, never hue.
 *
 * Colour in this interface means status and nothing else, so the three
 * divisions are told apart by how their ID tag is *set*:
 *
 *   Tuenx     filled ink block, paper knockout   — the holding company, a seal
 *   Agency    outlined frame, ink rule           — a stamped border
 *   Gaphatch  no box, letter-spaced underscore   — an underlined code
 *
 * The same three ideas carry to the card markers as fill / hatch / dot, so a
 * card's division is readable at a glance from across the desk, and stays
 * readable in greyscale or to a colour-blind reader.
 */
export interface DivisionMark {
  /** Classes for the ID tag chip. */
  tag: string
  /** Fill for the marker strip on a card and the bars in the ledger. */
  fill: CSSProperties
  /** One-word description of the treatment, used in the legend. */
  treatment: string
}

const INK = 'var(--color-ink)'

export const DIVISION_MARK: Record<Division, DivisionMark> = {
  tuenx: {
    tag: 'bg-ink text-paper',
    fill: { background: INK },
    treatment: 'Filled',
  },
  agency: {
    tag: 'border border-ink text-ink',
    // Fine hatch. Kept at 1px-on-2px so it reads as a texture at any height —
    // a coarser stripe turns into "two rules" on a 6px bar.
    fill: {
      backgroundImage: `repeating-linear-gradient(0deg, ${INK} 0 1px, transparent 1px 2px)`,
    },
    treatment: 'Outlined',
  },
  gaphatch: {
    tag: 'border-b border-ink text-ink tracking-[0.2em]',
    fill: {
      backgroundImage: `radial-gradient(circle, ${INK} 1px, transparent 1px)`,
      backgroundSize: '4px 4px',
    },
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
