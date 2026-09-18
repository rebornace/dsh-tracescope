import { createHash } from 'node:crypto'
import { access, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  adaptRemoteUrlForAuth,
  type GitAuth,
} from './auth.js'
import { gitExec, gitFetchAll, isGitWorkTree } from './git.js'

export type ResolvedRepo = {
  /** Original user input (path or remote URL). */
  input: string
  /** Absolute local work-tree path used for analysis. */
  repoPath: string
  source: 'local' | 'remote'
  /** Normalized remote URL when `source === 'remote'`. */
  remoteUrl?: string
  /** Whether a fetch/clone ran during this resolve. */
  synced: boolean
  /** Auth mode used (never includes secrets). */
  authMode: 'none' | 'https' | 'ssh'
}

export interface ResolveGitRepoOptions {
  /** Fetch remotes after resolve. Default: true for remote URLs, false for local paths. */
  fetch?: boolean
  /** Override cache root for remote clones (default `~/.tracescope/repos`). */
  cacheRoot?: string
  /** Credentials for private remotes. */
  auth?: GitAuth
}

/** True when input looks like a git remote (http/ssh/git host shorthand). */
export function isGitRemoteUrl(input: string): boolean {
  const s = input.trim()
  if (!s) return false
  if (/^https?:\/\//i.test(s)) return true
  if (/^git@[^:\s]+:/.test(s)) return true
  if (/^ssh:\/\//i.test(s)) return true
  if (/^git:\/\//i.test(s)) return true
  if (/^(github\.com|gitlab\.com|gitee\.com|coding\.net)\//i.test(s)) return true
  return false
}

/** Normalize shorthand host paths to https URLs. */
export function normalizeRemoteUrl(input: string): string {
  const s = input.trim().replace(/\/+$/, '')
  if (/^(github\.com|gitlab\.com|gitee\.com|coding\.net)\//i.test(s)) {
    return `https://${s}`
  }
  return s
}

function cachePathForRemote(remoteUrl: string, cacheRoot: string): string {
  const hash = createHash('sha256').update(remoteUrl).digest('hex').slice(0, 16)
  const slug = remoteUrl
    .replace(/^https?:\/\//i, '')
    .replace(/^git@/, '')
    .replace(/\.git$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return path.join(cacheRoot, `${slug || 'repo'}-${hash}`)
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

function authModeOf(auth: GitAuth | undefined): ResolvedRepo['authMode'] {
  if (!auth || auth.mode === 'none') return 'none'
  return auth.mode
}

/**
 * Resolve a local path or remote git URL to a usable work-tree.
 * Remote URLs are cloned under `~/.tracescope/repos` and re-used on later runs.
 */
export async function resolveGitRepo(
  input: string,
  options: ResolveGitRepoOptions = {},
): Promise<ResolvedRepo> {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('仓库路径或远端地址不能为空')
  const auth = options.auth
  const mode = authModeOf(auth)

  if (isGitRemoteUrl(trimmed)) {
    const remoteUrl = adaptRemoteUrlForAuth(normalizeRemoteUrl(trimmed), auth)
    if (auth?.mode === 'ssh' && /^https?:\/\//i.test(remoteUrl)) {
      throw new Error('SSH 认证请使用 git@host:org/repo.git 形式的地址，或改用 HTTPS Token')
    }
    const cacheRoot = options.cacheRoot ?? path.join(homedir(), '.tracescope', 'repos')
    await mkdir(cacheRoot, { recursive: true })
    const repoPath = cachePathForRemote(remoteUrl, cacheRoot)
    let synced = false

    if (!(await pathExists(repoPath))) {
      await gitExec(['clone', '--recurse-submodules', remoteUrl, repoPath], {
        cwd: cacheRoot,
        maxBuffer: 64 * 1024 * 1024,
        auth,
      })
      synced = true
    } else if (!(await isGitWorkTree(repoPath))) {
      throw new Error(`缓存目录不是有效 git 仓库：${repoPath}`)
    } else if (options.fetch !== false) {
      await gitFetchAll(repoPath, auth)
      synced = true
    }

    return {
      input: trimmed,
      repoPath,
      source: 'remote',
      remoteUrl,
      synced,
      authMode: mode,
    }
  }

  const repoPath = path.resolve(trimmed)
  if (!(await isGitWorkTree(repoPath))) {
    throw new Error(`本地路径不是 git 仓库：${repoPath}`)
  }

  let synced = false
  if (options.fetch === true) {
    await gitFetchAll(repoPath, auth)
    synced = true
  }

  return {
    input: trimmed,
    repoPath,
    source: 'local',
    synced,
    authMode: mode,
  }
}
