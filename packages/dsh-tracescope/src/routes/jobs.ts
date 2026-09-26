/**
 * Jobs routes: start a chat-analysis job (`/jobs`) and poll a job (`/job`).
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute, parseFetchFlag } from '../http/route-helpers.js'
import {
  buildChatAnalysisPrompt,
  parseAgileWorkItemRefs,
  parseGitAuth,
  resolveGitRepo,
} from '@rebornace/tracescope-core'
import {
  readAccessMode,
  resolveCodeupAuth,
  resolveRequestGitAuth,
} from '../services/request-auth.js'
import { createJob, getJob } from '../jobs.js'

export function registerJobsRoutes(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/jobs',
    method: 'POST',
    run: async (body) => {
      const repoInput = String(body.repoPath ?? body.repo ?? '')
      const baseCommit = String(body.baseCommit ?? '')
      const headCommit = String(body.headCommit ?? '')
      if (!repoInput || !baseCommit || !headCommit) {
        throw new Error('需要 repoPath、baseCommit、headCommit')
      }
      const auth = await resolveRequestGitAuth(parseGitAuth(body.auth), repoInput)
      const fetchRemote = parseFetchFlag(body.fetch, true)
      const accessMode = readAccessMode(body)
      const codeup = accessMode === 'codeup' ? await resolveCodeupAuth(body) : undefined
      const resolved =
        accessMode === 'codeup'
          ? {
              input: repoInput,
              repoPath: repoInput,
              source: 'codeup' as const,
              remoteUrl: repoInput,
              synced: false,
              authMode: 'https' as const,
            }
          : await resolveGitRepo(repoInput, { fetch: fetchRemote, auth })
      const job = createJob({
        repoInput,
        repoPath: resolved.repoPath,
        baseCommit,
        headCommit,
        auth,
        accessMode,
        codeup,
      })
      const relatedWorkItems = parseAgileWorkItemRefs(body.relatedWorkItems)
      const prompt = buildChatAnalysisPrompt({
        jobId: job.id,
        repoPath: repoInput,
        baseCommit,
        headCommit,
        relatedWorkItems,
        accessMode,
      })
      return {
        jobId: job.id,
        status: job.status,
        prompt,
        resolved,
        relatedWorkItems,
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
