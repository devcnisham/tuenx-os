#!/usr/bin/env node
/**
 * Stop hook. Runs when Claude finishes a turn.
 *
 * Two jobs, deliberately different in severity:
 *
 *   block    the docs contradict the code — `npm run check:docs` fails. This is
 *            a mechanical fact, so it is worth stopping for
 *   remind   source changed but docs/HANDOFF.md did not. Sometimes correct
 *            (a rename, a comment), so it is a nudge and never a block
 *
 * Both exist because documentation drifted behind this build twice in one
 * session and nothing caught it either time.
 *
 * Never throws. A hook that breaks the session is worse than a hook that
 * misses a check, so anything unexpected exits silently.
 */
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const say = (payload) => process.stdout.write(JSON.stringify(payload))

/** Files whose change implies the handoff probably needs a line. */
const SOURCE = /^(server|src|prisma|scripts)\//

try {
  // 1. Mechanical drift. Blocking, because it is never a judgement call.
  try {
    execFileSync('node', [join(root, 'scripts/check-docs.mjs')], {
      cwd: root,
      stdio: 'pipe',
    })
  } catch (err) {
    const output = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim()
    say({
      decision: 'block',
      reason:
        '`npm run check:docs` is failing, so the documentation contradicts the code. ' +
        'Fix it before finishing — CI runs the same check and will reject the push.\n\n' +
        output,
    })
    process.exit(0)
  }

  // 2. Source touched, handoff untouched. A reminder, not a gate.
  const changed = execSync('git status --porcelain', { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter(Boolean)

  const touchedSource = changed.some((f) => SOURCE.test(f))
  const touchedHandoff = changed.some((f) => f.startsWith('docs/HANDOFF.md'))

  if (touchedSource && !touchedHandoff) {
    say({
      systemMessage:
        'Source changed but docs/HANDOFF.md did not. If this finished a piece of work, ' +
        'update the handoff in the same commit — a separate docs commit is how the two ' +
        'get out of step.',
    })
    process.exit(0)
  }
} catch {
  // Not a git repo, node missing, anything else — stay out of the way.
}

process.exit(0)
