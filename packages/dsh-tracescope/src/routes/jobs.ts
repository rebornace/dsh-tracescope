/**
 * Jobs routes: start a chat-analysis job (`/jobs`) and poll a job (`/job`).
 * Create uses the shared agent-api helper so MCP and the sidebar stay in sync.
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute } from '../http/route-helpers.js'
import { createHandtestJob } from '../agent-api.js'
import { getJob } from '../jobs.js'

export function registerJobsRoutes(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/jobs',
    method: 'POST',
    run: async (body) => {
      const result = await createHandtestJob(body)
      return {
        jobId: result.jobId,
        status: result.status,
        prompt: result.prompt,
        resolved: result.resolved,
        relatedWorkItems: result.relatedWorkItems,
      }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/job',
    method: 'GET',
    run: async (body) => {
      const id = String(body.id ?? body.jobId ?? '')
      if (!id) throw new Error('缺少 id')
      const job = getJob(id)
      if (!job) throw new Error(`找不到任务 ${id}`)
      return {
        jobId: job.id,
        status: job.status,
        error: job.error,
        report: job.report,
        updatedAt: job.updatedAt,
        repoPath: job.repoInput,
        baseCommit: job.baseCommit,
        headCommit: job.headCommit,
      }
    },
  })
}
