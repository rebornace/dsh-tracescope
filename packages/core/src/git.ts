import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { buildGitAuthEnv, redactSecrets, type GitAuth } from './auth.js'

const execFileAsync = promisify(execFile)

export interface GitExecOptions {
  cwd?: string
  maxBuffer?: number
  auth?: GitAuth
}

/** Run a git subprocess with non-interactive env (and optional auth). */
export async function gitExec(
  args: string[],
  options: GitExecOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  const { env, configArgs } = buildGitAuthEnv(options.auth)
  // Always allow our managed cache dirs (avoids Windows "dubious ownership" false negatives).
  const argv = ['-c', 'safe.directory=*', ...configArgs, ...args]
  try {
    const result = await execFileAsync('git', argv, {
      cwd: options.cwd,
      maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
      env,
    })
    return {
      stdout: String(result.stdout ?? ''),
      stderr: String(result.stderr ?? ''),
    }
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string }
    const detail = redactSecrets(String(err.stderr || err.message || error).trim())
    const authHint =
      /Authentication failed|could not read Username|Permission denied|ERROR: Repository not found|fatal: could not read|403|401|Access denied|Invalid token|认证失败/i.test(
        detail,
      )
        ? '（若是私有仓，请在面板「仓库配置」填写 Codeup/Git HTTPS Token 或 SSH 私钥后重试）'
        : /dubious ownership/i.test(detail)
          ? '（Git 安全目录拦截：插件已尝试自动放行；若仍失败请重启 DSH 后再试）'
          : ''
    throw new Error((detail || `git ${args.join(' ')} failed`) + authHint)
  }
}

export type GitWorkTreeInspection = {
  ok: boolean
  /** Raw git / filesystem detail when ok=false (already secret-redacted when from git). */
  detail?: string
}

/** Inspect whether path is a usable git work tree; keep failure reason for UI. */
export async function inspectGitWorkTree(repoPath: string): Promise<GitWorkTreeInspection> {
  try {
    const { stdout, stderr } = await gitExec(['rev-parse', '--is-inside-work-tree'], {
      cwd: repoPath,
    })
    if (stdout.trim() === 'true') return { ok: true }
    const detail = redactSecrets((stderr || stdout || 'rev-parse 未返回 true').trim())
    return { ok: false, detail }
  } catch (error: unknown) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function isGitWorkTree(repoPath: string): Promise<boolean> {
  return (await inspectGitWorkTree(repoPath)).ok
}

/** Fetch all remotes so remote-tracking refs become available. */
export async function gitFetchAll(repoPath: string, auth?: GitAuth): Promise<void> {
  await gitExec(['fetch', '--all', '--prune', '--tags'], {
    cwd: repoPath,
    maxBuffer: 64 * 1024 * 1024,
    auth,
  })
}

export async function gitDiffFiles(
  repoPath: string,
  baseCommit: string,
  headCommit: string,
): Promise<string[]> {
  const { stdout } = await gitExec(
    ['diff', '--name-only', '--diff-filter=ACMR', `${baseCommit}...${headCommit}`],
    { cwd: repoPath, maxBuffer: 20 * 1024 * 1024 },
  )
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * Unified diff between two commits. Optional `paths` scopes the diff (chunking).
 * Returns empty string when there is no textual diff for the selection.
 */
export async function gitDiffUnified(
  repoPath: string,
  baseCommit: string,
  headCommit: string,
  options: { paths?: string[]; maxBuffer?: number } = {},
): Promise<string> {
  const args = ['diff', '--unified=3', '--find-renames', `${baseCommit}...${headCommit}`]
  if (options.paths?.length) {
    args.push('--', ...options.paths)
  }
  const { stdout } = await gitExec(args, {
    cwd: repoPath,
    maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
  })
  return stdout
}

/** Short commit subjects on the exclusive range base..head (for model context). */
export async function gitLogSubjects(
  repoPath: string,
  baseCommit: string,
  headCommit: string,
  limit = 30,
): Promise<string[]> {
  const { stdout } = await gitExec(
    ['log', `--max-count=${limit}`, '--pretty=format:%h %s', `${baseCommit}..${headCommit}`],
    { cwd: repoPath, maxBuffer: 2 * 1024 * 1024 },
  )
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export async function gitShowFile(
  repoPath: string,
  commit: string,
  relativePath: string,
): Promise<string | null> {
  try {
    const { stdout } = await gitExec(['show', `${commit}:${relativePath}`], {
      cwd: repoPath,
      maxBuffer: 10 * 1024 * 1024,
    })
    return stdout
  } catch {
    return null
  }
}

export async function gitRevParse(repoPath: string, ref: string): Promise<string> {
  const { stdout } = await gitExec(['rev-parse', ref], { cwd: repoPath })
  return stdout.trim()
}

export interface GitCommitInfo {
  sha: string
  short: string
  subject: string
  date: string
}

/**
 * List recent commits. When `allRefs` is true (default), includes remote-tracking
 * history via `git log --all` so fetched remote branches appear after sync.
 */
export async function listRecentCommits(
  repoPath: string,
  options: { limit?: number; allRefs?: boolean } = {},
): Promise<GitCommitInfo[]> {
  const limit = options.limit ?? 40
  const args = ['log', `-n${limit}`, '--pretty=format:%H%x09%h%x09%s%x09%ci']
  if (options.allRefs !== false) args.splice(1, 0, '--all')
  const { stdout } = await gitExec(args, {
    cwd: repoPath,
    maxBuffer: 5 * 1024 * 1024,
  })
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha = '', short = '', subject = '', date = ''] = line.split('\t')
      return { sha, short, subject, date }
    })
}

export interface GitRefInfo {
  name: string
  sha: string
  short: string
  kind: 'local' | 'remote' | 'tag'
}

/** List local branches, remote-tracking branches, and tags for UI pickers. */
export async function listGitRefs(repoPath: string): Promise<GitRefInfo[]> {
  const { stdout } = await gitExec(
    [
      'for-each-ref',
      '--format=%(objectname)%09%(objectname:short)%09%(refname:short)%09%(refname)',
      'refs/heads',
      'refs/remotes',
      'refs/tags',
    ],
    { cwd: repoPath, maxBuffer: 5 * 1024 * 1024 },
  )
  const refs: GitRefInfo[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [sha = '', short = '', name = '', full = ''] = trimmed.split('\t')
    if (!sha || !name) continue
    if (/\/HEAD$/i.test(name)) continue
    let kind: GitRefInfo['kind'] = 'local'
    if (full.startsWith('refs/remotes/')) kind = 'remote'
    else if (full.startsWith('refs/tags/')) kind = 'tag'
    refs.push({ name, sha, short, kind })
  }
  return refs
}
