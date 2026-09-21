import { createHash } from 'node:crypto'
import { access, mkdir, readdir, rm, stat } from 'node:fs/promises'
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

async function listCacheEntries(repoPath: string): Promise<string[]> {
  try {
    return await readdir(repoPath)
  } catch {
    return []
  }
}

async function describeBrokenCache(repoPath: string, gitDetail?: string): Promise<string> {
  const shown = displayPath(repoPath)
  const parts: string[] = [`缓存目录校验失败：${shown}`]
  let gitKind = '无'
  try {
    const st = await stat(path.join(repoPath, '.git'))
    gitKind = st.isDirectory() ? '目录' : st.isFile() ? '文件(gitfile)' : '特殊节点'
  } catch {
    gitKind = '无'
  }
  parts.push(`.git：${gitKind}。`)
  if (gitKind === '无') {
    parts.push('原因：目录里没有 .git（克隆未完成或被杀毒软件清空）。')
  } else if (gitDetail) {
    parts.push(`原因：${gitDetail}`)
  } else {
    parts.push('原因：存在 .git，但无法确认工作区。')
  }
  const entries = await listCacheEntries(repoPath)
  if (entries.length) {
    parts.push(
      `目录内 ${entries.length} 项：${entries.slice(0, 12).join(', ')}${entries.length > 12 ? '…' : ''}。`,
    )
  } else {
    parts.push('目录为空或不可读。')
  }
  parts.push(
    '处理：1) 面板配置 Codeup HTTPS Token；2) 关掉可能占用该目录的杀毒/资源管理器预览后重试同步；3) 仍失败请删除上述缓存目录后再点「保存并加载版本」。',
  )
  return parts.join(' ')
}

async function wipeCache(repoPath: string): Promise<void> {
  if (!(await pathExists(repoPath))) return
  await rm(repoPath, { recursive: true, force: true })
  // Windows: briefly retry if AV holds a handle.
  if (await pathExists(repoPath)) {
    await new Promise((r) => setTimeout(r, 400))
    await rm(repoPath, { recursive: true, force: true })
  }
}

/**
 * Clone remote into cache. Plain clone first — Codeup private submodules often break
 * --recurse-submodules and can leave a half-written folder.
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
  await wipeCache(repoPath)
  try {
    await gitExec(['clone', '--single-branch', remoteUrl, repoPath], common)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    await wipeCache(repoPath)
    throw new Error(`克隆失败：${msg}`)
  }
}

/**
 * After clone/fetch, Windows Defender / disk flush can make rev-parse flaky for a long time
 * on large packs (testers reported ~40s+ scanner windows). Prefer waiting over wipe+reclone.
 */
const GIT_SETTLE_BUDGET_MS = 55_000
const GIT_SETTLE_FETCH_BUDGET_MS = 45_000
const GIT_SETTLE_INITIAL_DELAY_MS = 400
const GIT_SETTLE_MAX_DELAY_MS = 8_000
const GIT_SETTLE_BACKOFF = 1.7

async function waitForGitWorkTree(
  repoPath: string,
  budgetMs = GIT_SETTLE_BUDGET_MS,
): Promise<{ ok: boolean; detail?: string; repoPath: string }> {
  const started = Date.now()
  let pathToCheck = repoPath
  let lastDetail = ''
  let delayMs = GIT_SETTLE_INITIAL_DELAY_MS

  for (;;) {
    pathToCheck = await resolveUsableRepoPath(pathToCheck)
    const check = await inspectGitWorkTree(pathToCheck)
    if (check.ok) return { ok: true, repoPath: pathToCheck }
    lastDetail = check.detail || lastDetail

    const elapsed = Date.now() - started
    const remaining = budgetMs - elapsed
    if (remaining <= 0) break

    const sleepMs = Math.min(delayMs, remaining, GIT_SETTLE_MAX_DELAY_MS)
    await new Promise((r) => setTimeout(r, sleepMs))
    delayMs = Math.min(GIT_SETTLE_MAX_DELAY_MS, Math.round(delayMs * GIT_SETTLE_BACKOFF))
  }

  return {
    ok: false,
    detail:
      lastDetail ||
      `已等待约 ${Math.round(budgetMs / 1000)} 秒仍无法确认 git 工作区（可能被杀毒软件长时间占用）`,
    repoPath: pathToCheck,
  }
}

/** If git landed one level deeper, promote that work-tree path. */
async function resolveUsableRepoPath(repoPath: string): Promise<string> {
  const direct = await inspectGitWorkTree(repoPath)
  if (direct.ok) return repoPath

  const entries = await listCacheEntries(repoPath)
  const candidates: string[] = []
  for (const name of entries) {
    if (name === '.git' || name === '.' || name === '..') continue
    const child = path.join(repoPath, name)
    try {
      const st = await stat(child)
      if (st.isDirectory()) candidates.push(child)
    } catch {
      /* ignore */
    }
  }
  if (candidates.length === 1) {
    const nested = await inspectGitWorkTree(candidates[0]!)
    if (nested.ok) return candidates[0]!
  }
  return repoPath
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
    let repoPath = cachePathForRemote(remoteUrl, cacheRoot)
    let synced = false

    const ensureFreshClone = async () => {
      await cloneRemoteCache(remoteUrl, repoPath, cacheRoot, auth)
      synced = true
      const waited = await waitForGitWorkTree(repoPath, GIT_SETTLE_BUDGET_MS)
      repoPath = waited.repoPath
      return waited
    }

    if (!(await pathExists(repoPath))) {
      const cloned = await ensureFreshClone()
      if (!cloned.ok) {
        throw new Error(await describeBrokenCache(repoPath, cloned.detail))
      }
    } else {
      // Wait out AV/disk lag BEFORE wiping — avoid re-clone storms on large repos.
      const existing = await waitForGitWorkTree(repoPath, GIT_SETTLE_BUDGET_MS)
      repoPath = existing.repoPath
      if (!existing.ok) {
        const recloned = await ensureFreshClone()
        if (!recloned.ok) {
          throw new Error(await describeBrokenCache(repoPath, recloned.detail))
        }
      } else if (options.fetch !== false) {
        await gitFetchAll(repoPath, auth)
        synced = true
        const afterFetch = await waitForGitWorkTree(repoPath, GIT_SETTLE_FETCH_BUDGET_MS)
        repoPath = afterFetch.repoPath
        if (!afterFetch.ok) {
          throw new Error(await describeBrokenCache(repoPath, afterFetch.detail))
        }
      }
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
