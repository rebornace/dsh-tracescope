import { createHash } from 'node:crypto'
import { access, mkdir, readdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  adaptRemoteUrlForAuth,
  type GitAuth,
} from './auth.js'
import { gitExec, gitFetchAll, inspectGitWorkTree } from './git.js'

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

/** Display path with forward slashes so chat/IM clients do not eat Windows backslashes. */
function displayPath(p: string): string {
  return path.resolve(p).replace(/\\/g, '/')
}

async function describeBrokenCache(repoPath: string, gitDetail?: string): Promise<string> {
  const shown = displayPath(repoPath)
  const parts: string[] = [`缓存目录校验失败：${shown}`]
  let hasGit = false
  try {
    await access(path.join(repoPath, '.git'))
    hasGit = true
  } catch {
    hasGit = false
  }
  if (!hasGit) {
    parts.push('原因：目录里没有 .git（克隆未完成或被杀毒软件清空）。')
  } else if (gitDetail) {
    parts.push(`原因：${gitDetail}`)
  } else {
    parts.push('原因：存在 .git，但 git rev-parse 未确认工作区。')
  }
  try {
    const entries = await readdir(repoPath)
    parts.push(`目录内文件数：${entries.length}。`)
  } catch {
    parts.push('目录不可读（权限/占用）。')
  }
  parts.push(
    '处理：1) 确认面板已配置 HTTPS Token；2) 关闭占用后点「保存并加载版本」会自动清理重试；3) 仍失败可手动删除上述缓存目录。',
  )
  return parts.join(' ')
}

/**
 * Clone remote into cache. Prefer plain clone first (Codeup private submodules often
 * break --recurse-submodules mid-way); optionally warn if recurse was skipped after retry.
 */
async function cloneRemoteCache(
  remoteUrl: string,
  repoPath: string,
  cacheRoot: string,
  auth: GitAuth | undefined,
): Promise<void> {
  const common = {
    cwd: cacheRoot,
    maxBuffer: 64 * 1024 * 1024,
    auth,
  } as const
  try {
    await gitExec(['clone', '--recurse-submodules', remoteUrl, repoPath], common)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    // Partial clone may leave a folder — wipe before retry without submodules.
    if (await pathExists(repoPath)) {
      await rm(repoPath, { recursive: true, force: true })
    }
    try {
      await gitExec(['clone', remoteUrl, repoPath], common)
    } catch (retryError: unknown) {
      const retryMsg = retryError instanceof Error ? retryError.message : String(retryError)
      throw new Error(
        `克隆失败：${retryMsg}` +
          (/submodule/i.test(msg)
            ? '（含子模块拉取失败；已尝试不拉子模块仍失败，请检查 Token 对主仓与子模块的权限）'
            : ''),
      )
    }
  }
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
      await cloneRemoteCache(remoteUrl, repoPath, cacheRoot, auth)
      synced = true
    } else {
      const existing = await inspectGitWorkTree(repoPath)
      if (!existing.ok) {
        // Stale/partial cache from a previous failed clone — wipe and clone again.
        await rm(repoPath, { recursive: true, force: true })
        await cloneRemoteCache(remoteUrl, repoPath, cacheRoot, auth)
        synced = true
      } else if (options.fetch !== false) {
        await gitFetchAll(repoPath, auth)
        synced = true
      }
    }

    const check = await inspectGitWorkTree(repoPath)
    if (!check.ok) {
      throw new Error(await describeBrokenCache(repoPath, check.detail))
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
  const localCheck = await inspectGitWorkTree(repoPath)
  if (!localCheck.ok) {
    throw new Error(
      `本地路径不是 git 仓库：${displayPath(repoPath)}` +
        (localCheck.detail ? `（${localCheck.detail}）` : ''),
    )
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
