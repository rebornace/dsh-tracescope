/**
 * Repository routes: `/resolve` (inspect a repo) and `/commits` (commit/ref
 * history via local git or Codeup).
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute, parseFetchFlag } from '../http/route-helpers.js'
import {
  type CodeupBodyAuth,
  readAccessMode,
  resolveCodeupAuth,
  resolveRequestGitAuth,
} from '../services/request-auth.js'
import { loadCodeupHistory, loadRepoHistory } from '../services/repo-history.js'
import {
  parseGitAuth,
  resolveGitRepo,
} from '@rebornace/tracescope-core'

export function registerRepoRoutes(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/health',
    method: 'GET',
    run: async () => ({
      ok: true,
      name: 'tracescope',
      chatDrivenModel: true,
    }),
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/resolve',
    method: 'POST',
    run: async (body) => {
      const repoPath = String(body.repoPath ?? body.repo ?? '')
      if (!repoPath) throw new Error('缺少 repoPath（本地路径或远端地址）')
      const fetchRemote = parseFetchFlag(body.fetch, true)
      const auth = parseGitAuth(body.auth)
      const resolved = await resolveGitRepo(repoPath, { fetch: fetchRemote, auth })
      return { resolved }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/commits',
    method: 'POST',
    run: async (body) => {
      const repoPath = String(body.repoPath ?? body.repo ?? '')
      const limit = Number(body.limit ?? 40)
      if (!repoPath) throw new Error('缺少 repoPath（本地路径或远端地址）')
      const fetchRemote = parseFetchFlag(body.fetch, true)
      const auth = await resolveRequestGitAuth(parseGitAuth(body.auth), repoPath)
      const refName = typeof body.refName === 'string' ? body.refName.trim() : ''
      if (readAccessMode(body) === 'codeup') {
        return await loadCodeupHistory(
          repoPath,
          Number.isFinite(limit) ? limit : 40,
          await resolveCodeupAuth(body) as CodeupBodyAuth,
          refName || undefined,
        )
      }
      return await loadRepoHistory(
        repoPath,
        Number.isFinite(limit) ? limit : 40,
        fetchRemote,
        auth,
        refName || undefined,
      )
    },
  })
}
