/**
 * Runs `prisma migrate deploy`, unless there is no database to run it against.
 *
 * Vercel builds the project before anyone has had a chance to add
 * `DATABASE_URL`, and a build that dies on the first deploy leaves no URL to
 * open and no obvious explanation. So a missing or placeholder URL is a loud
 * warning and a successful build: the site comes up, and the API says what is
 * wrong until the variable is set.
 *
 * A real URL that fails to migrate is still a failure. That one is a broken
 * database, not an unconfigured one, and shipping over it would leave a
 * half-migrated schema serving requests.
 */
import { execSync } from 'node:child_process'

const url = process.env.DATABASE_URL

if (!url || !url.startsWith('postgres')) {
  console.warn(
    '\n[build] DATABASE_URL is not set to a postgres:// URL — skipping migrations.\n' +
      '[build] The site will build and the API will fail until it is set in\n' +
      '[build] Project Settings → Environment Variables. See docs/DEPLOYING.md.\n',
  )
  process.exit(0)
}

execSync('prisma migrate deploy', { stdio: 'inherit' })
