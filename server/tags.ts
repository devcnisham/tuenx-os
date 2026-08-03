import type { Prisma } from '@prisma/client'
import { DIVISION_CODE, type Division, type TagType } from '../src/types'

/**
 * Allocates the next division-coded ID tag — `AGY-T003`, `GPH-C012`.
 *
 * Format is `<DIVISION><->< TYPE><SEQ>`, sequence zero-padded to 3 digits and
 * counted per division per type. `AGY-T001` and `GPH-T001` are both valid and
 * refer to different records.
 *
 * Must be called inside a transaction. The upsert increments and returns the
 * counter in one statement, so two concurrent creates can never be handed the
 * same tag — this is what closes the client-generated-ID collision risk that
 * TRD §4 accepted as a known gap.
 */
export async function allocateTag(
  tx: Prisma.TransactionClient,
  division: Division,
  type: TagType,
): Promise<string> {
  const code = DIVISION_CODE[division]

  const counter = await tx.tagCounter.upsert({
    where: { division_type: { division: code, type } },
    // First tag for this pair: issue 1, leave 2 as next.
    create: { division: code, type, next: 2 },
    update: { next: { increment: 1 } },
    select: { next: true },
  })

  // `next` is the value *after* this allocation, so the number we just issued
  // is one below it. Holds for both the create and the update branch.
  const seq = counter.next - 1

  return `${code}-${type}${String(seq).padStart(3, '0')}`
}

/**
 * Products are Gaphatch-only (master plan module map), so their tags — and the
 * tags of everything hanging off them — are always GPH-*.
 */
export const GAPHATCH: Division = 'gaphatch'
