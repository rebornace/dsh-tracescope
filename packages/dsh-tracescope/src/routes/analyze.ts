/**
 * Analyze route: `/analyze` runs the impact analysis and persists the report.
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute } from '../http/route-helpers.js'
import { parseFetchFlag } from '../http/route-helpers.js'
import {
  parseAgileWorkItemRefs,
  parseGitAuth,
} from '@rebornace/tracescope-core'
import {
  readAccessMode,
  resolveCodeupAuth,
  resolveRequestGitAuth,
} from '../services/request-auth.js'
import { runAnalyze } from '../services/run-analyze.js'

export function registerAnalyzeRoutes(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/analyze',
    method: 'POST',
    run: async (body) => {
      const repoPath = String(body.repoPath ?? body.repo ?? '')
      const baseCommit = String(body.baseCommit ?? '')
      const headCommit = String(body.headCommit ?? '')
      if (!repoPath || !baseCommit || !headCommit) {
        throw new Error('需要 repoPath、baseCommit、headCommit')
      }
      const accessMode = readAccessMode(body)
      return await runAnalyze({
        repoPath,
        repoInput: repoPath,
        baseCommit,
        headCommit,
        rippleDepth: typeof body.rippleDepth === 'number' ? body.rippleDepth : undefined,
        modulesConfigPath:
          typeof body.modulesConfigPath === 'string' ? body.modulesConfigPath : undefined,
        exportDir: typeof body.exportDir === 'string' ? body.exportDir : undefined,
        fetchRemote:
          body.fetchRemote !== undefined || body.fetch !== undefined
            ? parseFetchFlag(body.fetchRemote ?? body.fetch, false)
            : undefined,
        auth: await resolveRequestGitAuth(parseGitAuth(body.auth), repoPath),
        accessMode,
        codeup: accessMode === 'codeup' ? await resolveCodeupAuth(body) : undefined,
        persist: true,
        relatedWorkItems: parseAgileWorkItemRefs(body.relatedWorkItems),
      })
    },
  })
}
