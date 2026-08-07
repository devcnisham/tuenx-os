import { badRequest } from './http'

/**
 * Pulling issues out of GitHub and into a product's queue.
 *
 * Read-only and one-directional: GitHub is the source of truth for anything it
 * knows about, and nothing here writes back. A two-way sync needs conflict
 * rules nobody has asked for, and getting it wrong means quietly reopening
 * issues someone closed.
 *
 * `GITHUB_TOKEN` is optional. Without it, public repositories work at 60
 * requests an hour, which is plenty for a manual sync button; with it, 5,000
 * and private repositories become readable.
 */

export interface GithubIssue {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  html_url: string
  labels: { name: string }[]
  /** Present when the "issue" is actually a pull request. */
  pull_request?: unknown
}

/**
 * Owner and repo out of a URL.
 *
 * Only github.com, and only the two shapes GitHub itself hands out. This is
 * the security boundary of the feature, not a convenience: `repoUrl` is a
 * field anyone with an account can edit, and fetching an arbitrary URL from
 * the server would make it a request-forgery tool pointed at whatever the
 * server can reach.
 */
export function parseRepo(repoUrl: string): { owner: string; repo: string } {
  let url: URL
  try {
    url = new URL(repoUrl)
  } catch {
    throw badRequest('The repository link is not a URL')
  }

  if (url.protocol !== 'https:' || (url.hostname !== 'github.com' && url.hostname !== 'www.github.com')) {
    throw badRequest('Only https://github.com repositories can be synced')
  }

  const [owner, repo] = url.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/')
  if (!owner || !repo) throw badRequest('That link does not name a repository')

  return { owner, repo }
}

/** How a GitHub label maps onto the kinds this app has. */
export function kindFor(labels: { name: string }[]): 'bug' | 'issue' | 'feature' {
  const names = labels.map((l) => l.name.toLowerCase())
  if (names.some((n) => n.includes('bug') || n.includes('defect'))) return 'bug'
  if (names.some((n) => n.includes('feature') || n.includes('enhancement'))) return 'feature'
  return 'issue'
}

/** GitHub labels a priority far less often than it labels a kind. */
export function priorityFor(labels: { name: string }[]): 'low' | 'medium' | 'high' {
  const names = labels.map((l) => l.name.toLowerCase())
  if (names.some((n) => n.includes('critical') || n.includes('urgent') || n.includes('p0') || n.includes('high')))
    return 'high'
  if (names.some((n) => n.includes('low') || n.includes('p3') || n.includes('minor'))) return 'low'
  return 'medium'
}

/** One GitHub Actions run, as the API returns it. */
export interface GithubWorkflowRun {
  id: number
  name: string | null
  display_title: string | null
  head_branch: string | null
  head_sha: string
  event: string
  /** queued | in_progress | completed */
  status: string
  /** Null while the run is still going. */
  conclusion: string | null
  html_url: string
  run_started_at: string | null
  created_at: string
  updated_at: string
  actor: { login: string } | null
}

/**
 * Shared request headers, and the shared reading of GitHub's failure codes.
 *
 * A 404 on a repository that plainly exists almost always means "private, and
 * you have no token", so the message says so rather than insisting the
 * repository is missing.
 */
function githubHeaders() {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'tuenx-os',
  }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  return headers
}

function assertOk(res: Response) {
  if (res.status === 404) {
    throw badRequest(
      process.env.GITHUB_TOKEN
        ? 'That repository does not exist, or the token cannot see it'
        : 'That repository does not exist, or is private — set GITHUB_TOKEN to read a private one',
    )
  }
  if (res.status === 403 || res.status === 429) {
    throw badRequest('GitHub rate limit reached. Set GITHUB_TOKEN, or try again later.')
  }
  if (!res.ok) throw badRequest(`GitHub said ${res.status}`)
}

/**
 * The most recent Actions runs on a repository.
 *
 * One page, newest first. Build history is a rolling window — nobody scrolls
 * to the four-hundredth run — so paging through it would spend rate limit on
 * data nothing displays.
 *
 * A repository with Actions switched off returns an empty list rather than an
 * error: having no CI is a normal state for a product still in planning, and
 * making that an error would mean the sync button lies about being broken.
 */
export async function fetchWorkflowRuns(owner: string, repo: string, limit = 30) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo,
  )}/actions/runs?per_page=${Math.min(limit, 100)}`

  const res = await fetch(url, { headers: githubHeaders() })
  assertOk(res)

  const body = (await res.json()) as { total_count: number; workflow_runs?: GithubWorkflowRun[] }
  return { runs: body.workflow_runs ?? [], totalCount: body.total_count ?? 0 }
}

/**
 * Every issue on a repository, newest first, pull requests excluded.
 *
 * GitHub returns PRs from the issues endpoint — they are issues internally —
 * and a pull request is not a bug report. Capped at two pages: a manual sync
 * button that walks a thousand-issue backlog is a rate limit waiting to
 * happen, and the cap is reported rather than hidden.
 */
export async function fetchIssues(owner: string, repo: string) {
  const headers = githubHeaders()

  const issues: GithubIssue[] = []
  let truncated = false

  for (let page = 1; page <= 2; page++) {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo,
    )}/issues?state=all&per_page=100&page=${page}`

    const res = await fetch(url, { headers })
    assertOk(res)

    const batch = (await res.json()) as GithubIssue[]
    issues.push(...batch.filter((i) => !i.pull_request))

    if (batch.length < 100) break
    if (page === 2) truncated = true
  }

  return { issues, truncated }
}
