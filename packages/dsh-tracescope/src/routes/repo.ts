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
  isGitRemoteUrl,
  parseGitAuth,
  resolveGitRepo,
} from '@rebornace/tracescope-core'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stat } from 'node:fs/promises'

const pkgJson = JSON.parse(
  // Bundled entry lives in dist/; package.json is one level up.
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'),
) as { name?: string; version?: string }

export function registerRepoRoutes(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/health',
    method: 'GET',
    run: async () => ({
      ok: true,
      name: 'tracescope',
      packageName: pkgJson.name || '@rebornace/dsh-tracescope',
      version: pkgJson.version || null,
      chatDrivenModel: true,
    }),
  })

  // Lightweight path probe: does the local folder exist / is it a directory?
  // No Git involved. Used on open to detect stale remembered paths so the UI
  // can prompt the user to re-browse instead of failing later.
  registerRoute(ctx, {
    path: '/tracescope/v1/path-check',
    method: 'GET',
    run: async (body) => {
      const target = String(body.path ?? '').trim()
      if (!target) return { exists: false, isDirectory: false, remote: false }
      if (isGitRemoteUrl(target)) {
        return { exists: true, isDirectory: false, remote: true, path: target }
      }
      try {
        const st = await stat(target)
        return { exists: true, isDirectory: st.isDirectory(), remote: false, path: target }
      } catch {
        return { exists: false, isDirectory: false, remote: false, path: target }
      }
    },
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
