/**
 * Bundles the API into a single serverless function.
 *
 * Vercel compiles the function's entry file and nothing behind it: the first
 * deploy died on `Cannot find module '/var/task/server/index'`, because the
 * import was emitted verbatim and no `server/*.js` was ever produced. Dropping
 * the `.ts` extensions changed the error, not the cause.
 *
 * So the whole server becomes one file that Node can run with no resolution
 * left to do. Prisma stays external — it ships a native query engine that
 * cannot be inlined, and Vercel's tracer follows the import to include it.
 */
import { build } from 'esbuild'

await build({
  entryPoints: ['server/vercel-entry.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['@prisma/client', '.prisma/client'],
  // ESM output plus `require` from a bundled CJS dependency is the standard
  // Node 22 footgun; this hands those callers a working `require`.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module'",
      'const require = __createRequire(import.meta.url)',
    ].join('\n'),
  },
  logLevel: 'info',
})
