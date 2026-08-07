#!/usr/bin/env node
/**
 * Fails when the documentation contradicts the code, or when the three tables
 * that have to agree with each other don't.
 *
 * This exists because docs drifted behind the build twice in one session, and
 * both times nothing caught it — the master plan still listed shipped modules
 * as "not built", and a search kind without a link mapping shipped a 400 into
 * the picker. Neither is visible from any single file, which is exactly the
 * kind of mistake a person cannot be relied on to notice and a script can.
 *
 * It only checks what is mechanically checkable. Whether HANDOFF's prose is
 * *true* is still a judgement call; whether it says "30 routers" when there are
 * 31 is not.
 *
 * Run with `npm run check:docs`. Runs in CI on every push.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const failures = []
const fail = (check, detail) => failures.push({ check, detail })

/* -------------------------------------------------------------------------- */
/* 1. Counts quoted in prose match the filesystem                             */
/* -------------------------------------------------------------------------- */

const routerFiles = readdirSync(join(root, 'server/routes')).filter((f) => f.endsWith('.ts'))
const migrations = readdirSync(join(root, 'prisma/migrations')).filter((f) => !f.includes('.'))

for (const doc of ['CLAUDE.md', 'README.md']) {
  const text = read(doc)
  const claimed = text.match(/routes\/\s+(\d+) routers/)
  if (!claimed) {
    fail(doc, 'no "N routers" line found — did the code map change shape?')
  } else if (Number(claimed[1]) !== routerFiles.length) {
    fail(doc, `says ${claimed[1]} routers, there are ${routerFiles.length}`)
  }
}

const handoff = read('docs/HANDOFF.md')
const migrationClaim = handoff.match(/\*\*(\d+)\s*\n?migrations\*\*|\*\*(\d+) migrations\*\*/)
if (migrationClaim) {
  const n = Number(migrationClaim[1] ?? migrationClaim[2])
  if (n !== migrations.length) {
    fail('docs/HANDOFF.md', `says ${n} migrations, there are ${migrations.length}`)
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Every router is actually mounted                                        */
/* -------------------------------------------------------------------------- */

const index = read('server/index.ts')
for (const file of routerFiles) {
  const name = file.replace('.ts', '')
  if (!index.includes(`./routes/${name}`)) {
    fail('server/index.ts', `server/routes/${file} exists but is never imported`)
  }
}

/* -------------------------------------------------------------------------- */
/* 3. Every module id has a title and a screen                                */
/* -------------------------------------------------------------------------- */

const router = read('src/lib/router.ts')
const moduleIds = [...router.matchAll(/^\s*\|\s*'([a-z]+)'$/gm)].map((m) => m[1])
const topBar = read('src/components/shell/TopBar.tsx')
const app = read('src/App.tsx')

for (const id of moduleIds) {
  if (!new RegExp(`^\\s+${id}: '`, 'm').test(topBar)) {
    fail('TopBar.tsx', `module '${id}' has no MODULE_TITLE entry`)
  }
  if (!app.includes(`route.module === '${id}'`)) {
    fail('App.tsx', `module '${id}' is routable but nothing renders it`)
  }
}

/* -------------------------------------------------------------------------- */
/* 4. Links: resolvers, search kinds, and the picker map agree                */
/*                                                                            */
/* This is the one that shipped a live bug. A search kind with no             */
/* KIND_TO_LINK entry sends `toType: undefined` and 400s; a resolver with no  */
/* search kind can be displayed but never created.                            */
/* -------------------------------------------------------------------------- */

const links = read('server/routes/links.ts')
const resolvers = [...links.matchAll(/^  ([a-zA-Z]+): \{\n    label:/gm)].map((m) => m[1])

const search = read('server/routes/search.ts')
const searchKinds = [...search.matchAll(/kind: '([a-zA-Z]+)' as const/g)].map((m) => m[1])

const linkedRecords = read('src/components/LinkedRecords.tsx')
const kindToLink = Object.fromEntries(
  [...linkedRecords.matchAll(/^  ([a-zA-Z]+): '([a-zA-Z]+)',$/gm)].map((m) => [m[1], m[2]]),
)

for (const kind of new Set(searchKinds)) {
  if (!(kind in kindToLink)) {
    fail(
      'LinkedRecords.tsx',
      `search returns kind '${kind}' with no KIND_TO_LINK entry — the picker will hide it. ` +
        `Map it, or drop it from search.`,
    )
  }
}

for (const [kind, type] of Object.entries(kindToLink)) {
  if (!resolvers.includes(type)) {
    fail('LinkedRecords.tsx', `KIND_TO_LINK maps '${kind}' to '${type}', which is not a resolver`)
  }
}

const reachable = new Set(Object.values(kindToLink))
for (const type of resolvers) {
  if (!reachable.has(type)) {
    fail(
      'server/routes/links.ts',
      `resolver '${type}' is not reachable from any search kind — it can be shown but never linked`,
    )
  }
}

/* -------------------------------------------------------------------------- */
/* 5. Scope policy covers every mounted router that writes                    */
/*                                                                            */
/* A resource missing from SCOPE_POLICY is denied to everyone but an admin.   */
/* That is the intended failure mode, but it should be a decision, not a       */
/* surprise — so an omission has to be declared here.                          */
/* -------------------------------------------------------------------------- */

const scope = read('server/scope.ts')
const policyKeys = [...scope.matchAll(/^  '?([a-zA-Z/-]+)'?: \{ model:/gm)].map((m) => m[1])

/** Mounted paths that legitimately have no policy, with the reason. */
const SCOPE_EXEMPT = {
  auth: 'own gates; sign-in must work before a role exists',
  portal: 'requireClient, a separate boundary',
  people: 'requireAdmin at the mount',
  audit: 'requireAdmin at the mount, and read-only',
  overview: 'read-only',
  kpi: 'read-only',
  search: 'read-only',
  calendar: 'writes go through calendar/entries, which is in the policy',
  workspaces: 'read-only',
  work: 'writes go through work/epics, work/sprints, work/time',
  planner: 'writes go through planner/items and planner/ideas',
  messages: 'writes go through messages/channels and messages/messages',
  ops: 'writes go through ops/* sub-resources',
  okrs: 'in the policy under okrs and okrs/key-results',
  treasury: 'writes go through treasury/entries',
  checklists: 'writes go through checklists/* sub-resources',
}

const mounted = [...index.matchAll(/app\.use\('\/api\/([a-z-]+)'/g)].map((m) => m[1])
for (const path of new Set(mounted)) {
  const covered = policyKeys.some((k) => k === path || k.startsWith(`${path}/`))
  if (!covered && !(path in SCOPE_EXEMPT)) {
    fail(
      'server/scope.ts',
      `/api/${path} is mounted but absent from SCOPE_POLICY. Non-admins will get 403 on every ` +
        `write. Add a policy, or list it in SCOPE_EXEMPT in this script with the reason.`,
    )
  }
}

/* -------------------------------------------------------------------------- */

if (failures.length === 0) {
  console.log(
    `docs check passed — ${routerFiles.length} routers, ${migrations.length} migrations, ` +
      `${moduleIds.length} modules, ${resolvers.length} linkable types`,
  )
  process.exit(0)
}

console.error(`\n${failures.length} problem${failures.length === 1 ? '' : 's'}:\n`)
for (const f of failures) console.error(`  ${f.check}\n    ${f.detail}\n`)
console.error('These are mechanical checks. If one is wrong, fix the check — do not delete it.\n')
process.exit(1)
