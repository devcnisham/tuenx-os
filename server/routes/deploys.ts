import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { badRequest, notFound, route } from '../http'
import { fetchWorkflowRuns, parseRepo } from '../github'

export const deploysRouter = Router()

/** How many runs are kept per product. A rolling window, not an archive. */
const KEEP_PER_PRODUCT = 30

/**
 * Build and deploy status, mirrored from GitHub Actions onto the product it
 * belongs to.
 *
 * Cached rather than fetched live, for the same reason the issue sync is:
 * unauthenticated GitHub allows 60 requests an hour, so calling it on page
 * load would break the page for everyone the moment two people opened a
 * product at once. Syncing is a deliberate act, and the page says how stale it
 * is rather than pretending to be live.
 *
 * One-directional. Nothing here can re-run, cancel, or approve a workflow —
 * that is GitHub's job, and a button in this app that half-triggers a deploy
 * is worse than no button at all.
 */

deploysRouter.get(
  '/',
  route(async (req, res) => {
    const { productId, branch } = req.query

    const where: Prisma.DeployRunWhereInput = {}
    if (typeof productId === 'string' && productId !== '') where.productId = productId
    if (typeof branch === 'string' && branch !== '') where.branch = branch

    res.json(
      await prisma.deployRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: 60,
      }),
    )
  }),
)

/**
 * The latest run per product, for the product cards and the KPI board.
 *
 * One grouped query and one fetch rather than a findFirst per product: the
 * list page renders every product at once, and N+1 there is how a page that
 * felt instant starts taking a second.
 */
deploysRouter.get(
  '/summary',
  route(async (_req, res) => {
    const latest = await prisma.deployRun.groupBy({
      by: ['productId'],
      _max: { startedAt: true },
    })

    const runs = await prisma.deployRun.findMany({
      where: {
        OR: latest
          .filter((row) => row._max.startedAt !== null)
          .map((row) => ({ productId: row.productId, startedAt: row._max.startedAt! })),
      },
    })

    res.json(
      Object.fromEntries(runs.map((run) => [run.productId, run])),
    )
  }),
)

/**
 * Pulls the recent Actions runs for a product's repository.
 *
 * Upserts on `(productId, externalId)`, so a run that was in progress last
 * sync gets its conclusion filled in rather than duplicated. Older rows beyond
 * the window are dropped — build history past the last thirty runs is on
 * GitHub, and keeping it here would grow forever to no one's benefit.
 */
deploysRouter.post(
  '/sync/:productId',
  route(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.productId } })
    if (!product) throw notFound('Product not found')
    if (!product.repoUrl) {
      throw badRequest('This product has no repository link — add one on the product first')
    }

    const { owner, repo } = parseRepo(product.repoUrl)
    const { runs, totalCount } = await fetchWorkflowRuns(owner, repo, KEEP_PER_PRODUCT)

    let created = 0
    let updated = 0

    for (const run of runs) {
      const externalId = String(run.id)
      const fields = {
        workflowName: run.name ?? 'Workflow',
        event: run.event,
        branch: run.head_branch ?? 'unknown',
        commitSha: run.head_sha,
        title: run.display_title ?? null,
        actor: run.actor?.login ?? null,
        status: run.status,
        conclusion: run.conclusion,
        url: run.html_url,
        startedAt: new Date(run.run_started_at ?? run.created_at),
        // `updated_at` is when the run last changed; for a finished run that is
        // when it finished. GitHub exposes no separate completion timestamp on
        // this endpoint.
        completedAt: run.status === 'completed' ? new Date(run.updated_at) : null,
        syncedAt: new Date(),
      }

      const existing = await prisma.deployRun.findUnique({
        where: { productId_externalId: { productId: product.id, externalId } },
        select: { id: true },
      })

      if (existing) {
        await prisma.deployRun.update({ where: { id: existing.id }, data: fields })
        updated += 1
      } else {
        await prisma.deployRun.create({
          data: { productId: product.id, externalId, ...fields },
        })
        created += 1
      }
    }

    // Trim to the window, oldest first.
    const keep = await prisma.deployRun.findMany({
      where: { productId: product.id },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
      take: KEEP_PER_PRODUCT,
    })
    await prisma.deployRun.deleteMany({
      where: { productId: product.id, id: { notIn: keep.map((r) => r.id) } },
    })

    res.json({
      repo: `${owner}/${repo}`,
      created,
      updated,
      kept: keep.length,
      // Reported rather than hidden: "30 runs" reading as "all of them" is
      // exactly the wrong thing to believe about a build history.
      totalOnGitHub: totalCount,
      authenticated: Boolean(process.env.GITHUB_TOKEN),
      // An empty result from a repository with Actions switched off is a
      // normal state, not a failure — say so instead of showing nothing.
      actionsConfigured: runs.length > 0 || totalCount > 0,
    })
  }),
)
