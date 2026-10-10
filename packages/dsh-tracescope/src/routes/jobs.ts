/**
 * Jobs routes: start a chat-analysis job (`/jobs`) and poll a job (`/job`).
 * Create uses the shared agent-api helper so MCP and the sidebar stay in sync.
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute } from '../http/route-helpers.js'
import { createHandtestJob } from '../agent-api.js'
import { I18nError } from '../i18n/messages.js'
import { getJob } from '../jobs.js'

export function registerJobsRoutes(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/jobs',
    method: 'POST',
    run: async (body, { lang }) => {
      const result = await createHandtestJob({ ...body, locale: body.locale ?? body.lang ?? lang })
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
    run: async (body, { lang }) => {
      const id = String(body.id ?? body.jobId ?? '')
      if (!id) throw new I18nError('ERR_MISSING_ID', lang)
      const job = getJob(id)
      if (!job) throw new I18nError('ERR_JOB_NOT_FOUND', lang, { id })
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
