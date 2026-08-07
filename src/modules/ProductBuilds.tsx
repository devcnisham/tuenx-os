import { useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { fullDate, pluralise } from '../lib/format.ts'
import {
  RUN_CONCLUSION_LABEL,
  type DeployRun,
  type DeploySyncResult,
  type RunConclusion,
} from '../types.ts'
import { Button, EmptyState, ErrorState, Panel, Pill, Skeleton, type PillTone } from '../components/ui.tsx'
import { Icon } from '../components/Icon.tsx'

/**
 * Build and deploy status, mirrored from GitHub Actions.
 *
 * Cached, not live — see `server/routes/deploys.ts`. The panel therefore says
 * how old the data is rather than implying it is current, because a CI panel
 * quietly showing yesterday's green tick is worse than showing nothing.
 *
 * Read-only. There is no re-run button and there should not be: this app
 * cannot re-run a workflow, and a button that half-triggers a deploy is worse
 * than no button.
 */

/** Colour is status only, and here the status is literally pass or fail. */
const CONCLUSION_TONE: Record<RunConclusion, PillTone> = {
  success: 'ready',
  failure: 'alert',
  cancelled: 'neutral',
  skipped: 'neutral',
  timed_out: 'alert',
  action_required: 'pending',
  neutral: 'neutral',
}

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

function runTone(run: DeployRun): { tone: PillTone; label: string } {
  if (run.status !== 'completed') {
    return { tone: 'pending', label: run.status === 'queued' ? 'Queued' : 'Running' }
  }
  if (run.conclusion === null) return { tone: 'neutral', label: 'No result' }
  return {
    tone: CONCLUSION_TONE[run.conclusion] ?? 'neutral',
    label: RUN_CONCLUSION_LABEL[run.conclusion] ?? run.conclusion,
  }
}

/** How long ago, in the coarsest unit that is still true. */
function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function duration(run: DeployRun): string | null {
  if (!run.completedAt) return null
  const seconds = Math.round(
    (new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000,
  )
  if (seconds < 0) return null
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export function Builds({ productId, repoUrl }: { productId: string; repoUrl: string | null }) {
  const runs = useResource<DeployRun[]>(() => api.get('/deploys', { productId }), [productId])
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<DeploySyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = runs.data ?? []
  const latest = rows[0]

  const sync = async () => {
    setSyncing(true)
    setError(null)
    setResult(null)
    try {
      setResult(await api.post<DeploySyncResult>(`/deploys/sync/${productId}`, {}))
      runs.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach GitHub')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Panel
      className="mb-6"
      title="Builds"
      subtitle={
        <span className="font-mono text-[10px] text-faint">
          {latest
            ? `Mirrored from GitHub Actions · synced ${ago(latest.syncedAt)}`
            : 'Mirrored from GitHub Actions'}
        </span>
      }
      actions={
        repoUrl ? (
          <Button size="sm" onClick={sync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync builds'}
          </Button>
        ) : null
      }
      bodyClassName="p-4"
    >
      {!repoUrl ? (
        <EmptyState
          title="No repository linked"
          hint="Add a GitHub repository on the product and its build history appears here."
        />
      ) : (
        <>
          {error && (
            <p className="mb-3 rounded-sm border border-alert/30 bg-alert/8 px-3 py-2 text-[13px] text-alert">
              {error}
            </p>
          )}

          {result && (
            <p className="mb-3 font-mono text-[10px] text-faint">
              {result.actionsConfigured
                ? `${result.repo} · ${result.created} new, ${result.updated} updated, showing the latest ${result.kept} of ${result.totalOnGitHub}`
                : `${result.repo} has no GitHub Actions workflows`}
              {!result.authenticated && ' · unauthenticated, 60 requests an hour'}
            </p>
          )}

          {runs.error ? (
            <ErrorState message={runs.error} onRetry={runs.reload} />
          ) : runs.loading ? (
            <Skeleton rows={2} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="Nothing synced yet"
              hint="Press Sync builds to pull the recent runs. It is a deliberate action, not a poll — GitHub allows 60 requests an hour without a token."
            />
          ) : (
            <>
              {/* The headline: is it green right now, on the branch that ships. */}
              {latest && <LatestRun run={latest} />}

              <ol className="mt-4 divide-y divide-rule border-t border-rule">
                {rows.slice(1).map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </ol>

              <p className="mt-3 font-mono text-[10px] leading-relaxed text-faint">
                Read-only, and one-directional. Re-running or cancelling a workflow
                happens on GitHub — {pluralise(rows.length, 'run')} kept here as a
                rolling window, not an archive.
              </p>
            </>
          )}
        </>
      )}
    </Panel>
  )
}

function LatestRun({ run }: { run: DeployRun }) {
  const tone = runTone(run)
  const took = duration(run)

  return (
    <a
      href={run.url}
      target="_blank"
      rel="noreferrer noopener"
      className="flex flex-wrap items-center gap-3 rounded-sm border border-rule bg-wash px-3 py-3 transition-colors hover:border-ink"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={tone.tone}>{tone.label}</Pill>
          <span className="text-[13px] font-medium text-ink">{run.workflowName}</span>
          <span className="rounded-xs border border-rule px-1 py-px font-mono text-[10px] text-graphite">
            {run.branch}
          </span>
        </div>
        {run.title && (
          <p className="mt-1 truncate text-[12px] leading-snug text-graphite">{run.title}</p>
        )}
        <p className="mt-1 font-mono text-[10px] text-faint">
          {/* Short SHA for reading, full one stored — a short SHA is not a key. */}
          {run.commitSha.slice(0, 7)}
          {run.actor && <> · {run.actor}</>} · {run.event} · {ago(run.startedAt)}
          {took && <> · took {took}</>}
        </p>
      </div>
      <Icon name="arrowRight" size={12} className="shrink-0 text-faint" />
    </a>
  )
}

function RunRow({ run }: { run: DeployRun }) {
  const tone = runTone(run)
  const at = new Date(run.startedAt)

  return (
    <li>
      <a
        href={run.url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex flex-wrap items-center gap-2 py-2 transition-colors hover:bg-wash"
      >
        <Pill tone={tone.tone}>{tone.label}</Pill>
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
          {run.title ?? run.workflowName}
        </span>
        <span className="shrink-0 rounded-xs border border-rule px-1 py-px font-mono text-[10px] text-graphite">
          {run.branch}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-faint">
          {run.commitSha.slice(0, 7)}
        </span>
        <span className="w-24 shrink-0 text-right font-mono text-[10px] text-faint">
          {fullDate(run.startedAt)} {TIME.format(at)}
        </span>
      </a>
    </li>
  )
}

/**
 * The one-line version for a product card — is this thing green.
 *
 * Silent when nothing has been synced. A card claiming "no builds" for a
 * product whose CI simply has not been pulled yet would be a lie of omission.
 */
export function BuildChip({ run }: { run: DeployRun | undefined }) {
  if (!run) return null
  const tone = runTone(run)

  return (
    <span className="inline-flex items-center gap-1">
      <Pill tone={tone.tone}>{tone.label}</Pill>
      <span className="font-mono text-[10px] text-faint">{run.branch}</span>
    </span>
  )
}
