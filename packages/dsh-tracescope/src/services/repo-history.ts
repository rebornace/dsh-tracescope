/**
 * Load commit + ref history for a repository, via either local git or the
 * Codeup API. Used by the `/commits` route.
 */
import {
  gitFetchRef,
  listGitRefs,
  listRecentCommits,
  resolveGitRepo,
  getCodeupRepository,
  listCodeupBranches,
  listCodeupCommits,
  resolveCodeupTarget,
  type GitAuth,
} from '@rebornace/tracescope-core'
import { type CodeupBodyAuth } from './request-auth.js'

/** Local-git history loader. */
export async function loadRepoHistory(
  repoInput: string,
  limit: number,
  fetchRemote: boolean,
  auth: GitAuth | undefined,
  refName?: string,
): Promise<{
  resolved: import('@rebornace/tracescope-core').ResolvedRepo
  commits: Awaited<ReturnType<typeof listRecentCommits>>
  refs: Awaited<ReturnType<typeof listGitRefs>>
  commitRef: string | undefined
}> {
  const resolved = await resolveGitRepo(repoInput, { fetch: fetchRemote, auth })
  const ref = typeof refName === 'string' ? refName.trim() : ''
  if (ref && !/^[0-9a-f]{7,40}$/i.test(ref)) {
    try {
      await gitFetchRef(resolved.repoPath, ref, auth)
    } catch {
      /* Branch may already exist locally; listRecentCommits surfaces real errors. */
    }
  }
  const [commits, refs] = await Promise.all([
    listRecentCommits(resolved.repoPath, {
      limit,
      allRefs: !ref,
      ref: ref || undefined,
    }),
    listGitRefs(resolved.repoPath),
  ])
  return { resolved, commits, refs, commitRef: ref || undefined }
}

/** Codeup-API history loader (no local git required). */
export async function loadCodeupHistory(
  remote: string,
  limit: number,
  auth: CodeupBodyAuth,
  refName?: string,
) {
  const target = resolveCodeupTarget(remote, auth)
  const req = { endpoint: auth.endpoint, token: auth.token }
  const repo = await getCodeupRepository(target, req)
  const commitRef = (typeof refName === 'string' && refName.trim()) || repo.defaultBranch
  const [commits, branches] = await Promise.all([
    listCodeupCommits(target, { ...req, refName: commitRef, perPage: limit }),
    listCodeupBranches(target, req),
  ])
  const head = commits[0]
  const refs =
    branches.length > 0
      ? branches
      : [
          {
            name: repo.defaultBranch,
            sha: head?.sha ?? '',
            short: head?.short ?? '',
            kind: 'remote' as const,
          },
        ]
  return {
    resolved: {
      input: remote,
      repoPath: remote,
      source: 'codeup' as const,
      remoteUrl: remote,
      synced: false,
      authMode: 'https' as const,
    },
    commits,
    refs,
    defaultBranch: repo.defaultBranch,
    commitRef,
  }
}
