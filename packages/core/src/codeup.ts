import { createHash } from 'node:crypto'
import { classifyFileRisk, heuristicDisplayName } from './heuristics.js'
import { loadModulesConfig, matchModuleRule } from './modules-config.js'
import { ensureUniqueScopeItemIds } from './scope-ids.js'
import type { Evidence, ImpactReport, RiskLevel, ScopeItem, TracescopeModulesConfig } from './types.js'
import { normalizeYunxiaoEndpoint } from './yunxiao.js'

export interface CodeupTarget {
  organizationId: string
  /** Numeric id or path-with-namespace (`org/group/repo`). */
  repositoryId: string
}

export interface CodeupRequestOptions {
  endpoint?: string
  token: string
  fetchImpl?: typeof fetch
}

export interface CodeupCommitInfo {
  sha: string
  short: string
  subject: string
  date: string
}

export interface CodeupRefInfo {
  name: string
  sha: string
  short: string
  kind: 'remote'
}

export interface CodeupDiffFile {
  oldPath: string
  newPath: string
  diff: string
  deletedFile: boolean
  newFile: boolean
  renamedFile: boolean
  isBinary: boolean
}

export interface CodeupCompare {
  commits: CodeupCommitInfo[]
  diffs: CodeupDiffFile[]
}

/**
 * Parse a Codeup remote into organization id + repository path.
 * Accepts `https://codeup.aliyun.com/<org>/<group>/<repo>.git`.
 */
export function parseCodeupRemote(input: string): CodeupTarget | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (!/codeup\.aliyun\.com/i.test(trimmed)) return null
  let pathPart = ''
  const https = trimmed.match(/^https?:\/\/[^/]+\/(.+)$/i)
  if (https) pathPart = https[1] ?? ''
  const ssh = trimmed.match(/^git@[^:]+:(.+)$/)
  if (!pathPart && ssh) pathPart = ssh[1] ?? ''
  pathPart = pathPart.replace(/\.git$/i, '').replace(/\/+$/, '')
  const segments = pathPart.split('/').filter(Boolean)
  if (segments.length < 2) return null
  const organizationId = segments[0] ?? ''
  if (!/^[a-f0-9]{16,}$/i.test(organizationId)) return null
  return { organizationId, repositoryId: segments.join('/') }
}

export function resolveCodeupTarget(
  remote: string,
  override?: { organizationId?: string; repositoryId?: string },
): CodeupTarget {
  const parsed = parseCodeupRemote(remote)
  const organizationId = override?.organizationId?.trim() || parsed?.organizationId || ''
  const repositoryId = override?.repositoryId?.trim() || parsed?.repositoryId || ''
  if (!organizationId || !repositoryId) {
    throw new Error(
      '云效接口需要 Codeup 仓库地址（https://codeup.aliyun.com/<组织ID>/组/仓库.git），并使用有代码读权限的个人访问令牌',
    )
  }
  return { organizationId, repositoryId }
}

function repoPath(target: CodeupTarget): string {
  return `/oapi/v1/codeup/organizations/${encodeURIComponent(target.organizationId)}/repositories/${encodeURIComponent(target.repositoryId)}`
}

async function codeupGet(
  options: CodeupRequestOptions,
  path: string,
): Promise<unknown> {
  const token = options.token.trim()
  if (!token) throw new Error('云效接口需要个人访问令牌（缺陷配置中的云效 Token，或仓库 HTTPS Token）')
  const base = normalizeYunxiaoEndpoint(options.endpoint)
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const fetchImpl = options.fetchImpl ?? fetch
  const res = await fetchImpl(url, {
    headers: {
      accept: 'application/json',
      'x-yunxiao-token': token,
    },
  })
  const text = await res.text()
  let raw: unknown = text
  try {
    raw = text ? JSON.parse(text) : null
  } catch {
    raw = text
  }
  if (!res.ok) {
    const preview = typeof raw === 'string' ? raw : JSON.stringify(raw)
    throw new Error(`云效代码接口失败（HTTP ${res.status}）：${preview.slice(0, 400)}`)
  }
  return raw
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

function asList(raw: unknown, keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw
  const obj = asRecord(raw)
  if (!obj) return []
  for (const key of keys) {
    const value = obj[key]
    if (Array.isArray(value)) return value
  }
  return []
}

function commitFrom(raw: unknown): CodeupCommitInfo | null {
  const obj = asRecord(raw)
  if (!obj) return null
  const sha = typeof obj.id === 'string' ? obj.id : typeof obj.sha === 'string' ? obj.sha : ''
  if (!sha) return null
  const short = typeof obj.shortId === 'string' && obj.shortId ? obj.shortId : sha.slice(0, 8)
  const subject =
    (typeof obj.title === 'string' && obj.title) ||
    (typeof obj.message === 'string' && obj.message.split('\n')[0]) ||
    ''
  const date =
    (typeof obj.committedDate === 'string' && obj.committedDate) ||
    (typeof obj.authoredDate === 'string' && obj.authoredDate) ||
    ''
  return { sha, short, subject, date }
}

function stringField(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export async function getCodeupRepository(
  target: CodeupTarget,
  options: CodeupRequestOptions,
): Promise<{ defaultBranch: string }> {
  const raw = await codeupGet(options, repoPath(target))
  const obj = asRecord(raw) ?? {}
  const nested = asRecord(obj.repository) ?? asRecord(obj.result) ?? obj
  const defaultBranch =
    stringField(nested, ['defaultBranch', 'default_branch']) ||
    stringField(obj, ['defaultBranch', 'default_branch']) ||
    'master'
  return { defaultBranch }
}

export async function listCodeupCommits(
  target: CodeupTarget,
  options: CodeupRequestOptions & { refName: string; perPage?: number },
): Promise<CodeupCommitInfo[]> {
  const perPage = options.perPage ?? 80
  const query = new URLSearchParams({
    refName: options.refName,
    page: '1',
    perPage: String(perPage),
  })
  const raw = await codeupGet(options, `${repoPath(target)}/commits?${query.toString()}`)
  return asList(raw, ['result', 'commits'])
    .map(commitFrom)
    .filter((row): row is CodeupCommitInfo => row !== null)
}

export async function listCodeupBranches(
  target: CodeupTarget,
  options: CodeupRequestOptions,
): Promise<CodeupRefInfo[]> {
  try {
    const raw = await codeupGet(options, `${repoPath(target)}/branches?page=1&perPage=100`)
    const refs: CodeupRefInfo[] = []
    for (const row of asList(raw, ['result', 'branches'])) {
      const obj = asRecord(row)
      if (!obj) continue
      const name = stringField(obj, ['name'])
      if (!name) continue
      const commit = asRecord(obj.commit)
      const sha =
        (commit && stringField(commit, ['id', 'sha'])) || stringField(obj, ['commitId'])
      refs.push({
        name,
        sha,
        short: sha ? sha.slice(0, 8) : '',
        kind: 'remote',
      })
    }
    return refs
  } catch {
    return []
  }
}

function diffFrom(raw: unknown): CodeupDiffFile | null {
  const obj = asRecord(raw)
  if (!obj) return null
  const oldPath = stringField(obj, ['oldPath', 'old_path'])
  const newPath = stringField(obj, ['newPath', 'new_path']) || oldPath
  if (!oldPath && !newPath) return null
  return {
    oldPath: oldPath || newPath,
    newPath: newPath || oldPath,
    diff: typeof obj.diff === 'string' ? obj.diff : '',
    deletedFile: obj.deletedFile === true,
    newFile: obj.newFile === true,
    renamedFile: obj.renamedFile === true,
    isBinary: obj.isBinary === true,
  }
}

/** Paths touched by a compare payload. Deleted files keep `oldPath`. */
export function changedPathsFromDiffs(diffs: CodeupDiffFile[]): string[] {
  const paths: string[] = []
  for (const diff of diffs) {
    if (diff.deletedFile) {
      if (diff.oldPath) paths.push(diff.oldPath)
      continue
    }
    const file = diff.newPath || diff.oldPath
    if (file) paths.push(file)
  }
  return paths
}

/**
 * Compare two commits. `straight=false` uses merge-base, matching `git diff base...head`.
 */
export async function compareCodeup(
  target: CodeupTarget,
  options: CodeupRequestOptions & { base: string; head: string },
): Promise<CodeupCompare> {
  const query = new URLSearchParams({
    from: options.base,
    to: options.head,
    straight: 'false',
  })
  const raw = await codeupGet(options, `${repoPath(target)}/compares?${query.toString()}`)
  const obj = asRecord(raw) ?? {}
  const commits = asList(obj.commits ?? raw, ['commits'])
    .map(commitFrom)
    .filter((row): row is CodeupCommitInfo => row !== null)
  const diffs = asList(obj.diffs ?? raw, ['diffs'])
    .map(diffFrom)
    .filter((row): row is CodeupDiffFile => row !== null)
  return { commits, diffs }
}

function riskRank(level: RiskLevel): number {
  switch (level) {
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
      return 1
    default: {
      const _exhaustive: never = level
      return _exhaustive
    }
  }
}

function slugId(name: string, files: string[]): string {
  const key = `direct:${name}:${files.slice(0, 3).join('|')}`
  return createHash('sha1').update(key).digest('hex').slice(0, 20)
}

/**
 * Direct-change checklist from a Codeup compare. No local git and no static ripple
 * (the model can still infer ripple from the diff text).
 */
export async function analyzeCodeupImpact(options: {
  remote: string
  baseCommit: string
  headCommit: string
  endpoint?: string
  token: string
  organizationId?: string
  repositoryId?: string
  modulesConfigPath?: string
  modulesConfig?: TracescopeModulesConfig
  fetchImpl?: typeof fetch
}): Promise<ImpactReport> {
  const target = resolveCodeupTarget(options.remote, {
    organizationId: options.organizationId,
    repositoryId: options.repositoryId,
  })
  const compare = await compareCodeup(target, {
    endpoint: options.endpoint,
    token: options.token,
    base: options.baseCommit,
    head: options.headCommit,
    fetchImpl: options.fetchImpl,
  })
  const changedFiles = changedPathsFromDiffs(compare.diffs)
  const modulesConfig =
    options.modulesConfig ?? (await loadModulesConfig(options.modulesConfigPath))
  const groups = new Map<string, { displayName: string; risk: RiskLevel; files: Set<string>; evidence: Evidence[] }>()

  for (const file of changedFiles) {
    const rule = matchModuleRule(file, modulesConfig.modules)
    const displayName = rule?.name || heuristicDisplayName(file)
    const key = rule?.match ? `mod:${rule.match}` : `name:${displayName}`
    const risk = rule?.risk ?? classifyFileRisk(file)
    const evidence: Evidence[] = [
      { code: 'codeup_compare', detail: `云效对比 ${options.baseCommit.slice(0, 7)}…${options.headCommit.slice(0, 7)} 直接变更` },
    ]
    if (rule?.name) evidence.push({ code: 'modules_yml', detail: `映射表命中：${rule.name}` })
    else evidence.push({ code: 'path_heuristic', detail: `路径启发式：${file}` })
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { displayName, risk, files: new Set([file]), evidence })
      continue
    }
    existing.files.add(file)
    if (riskRank(risk) > riskRank(existing.risk)) existing.risk = risk
  }

  const direct: ScopeItem[] = [...groups.values()]
    .map((group) => {
      const files = [...group.files].sort()
      return {
        id: slugId(group.displayName, files),
        displayName: group.displayName,
        kind: 'direct' as const,
        risk: group.risk,
        files,
        evidence: group.evidence,
        suggestedSteps: [
          `打开「${group.displayName}」相关入口，确认页面可进入`,
          '覆盖该处本次改动的主路径（增/删/查）各走一遍',
        ],
        status: 'pending' as const,
      }
    })
    .sort((a, b) => riskRank(b.risk) - riskRank(a.risk) || a.displayName.localeCompare(b.displayName))

  const report: ImpactReport = {
    repoPath: options.remote.trim(),
    baseCommit: options.baseCommit,
    headCommit: options.headCommit,
    generatedAt: new Date().toISOString(),
    modelEnriched: false,
    direct,
    ripple: [],
    changedFiles,
  }
  return ensureUniqueScopeItemIds(report)
}

export function pageCodeupDiffs(
  diffs: CodeupDiffFile[],
  options: { paths?: string[]; offset?: number; limit?: number; maxChars?: number },
): { files: string[]; totalFiles: number; offset: number; limit: number; nextOffset: number; truncated: boolean; diff: string } {
  const selected = options.paths?.length
    ? diffs.filter((row) => {
        const file = row.deletedFile ? row.oldPath : row.newPath || row.oldPath
        return options.paths!.includes(file)
      })
    : diffs
  const allFiles = changedPathsFromDiffs(selected)
  const offset = Math.max(0, options.offset ?? 0)
  const limit = Math.min(20, Math.max(1, options.limit ?? 8))
  const slice = allFiles.slice(offset, offset + limit)
  const maxChars = options.maxChars ?? 24_000
  const parts: string[] = []
  let truncated = false
  for (const file of slice) {
    const row = selected.find((item) => {
      const path = item.deletedFile ? item.oldPath : item.newPath || item.oldPath
      return path === file
    })
    let text = row?.diff?.trim() ?? ''
    if (!text) {
      text = `--- a/${file}\n+++ b/${file}\n@@ (无文本 diff，可能是二进制或权限变更)\n`
    }
    if (parts.join('\n').length + text.length > maxChars) {
      truncated = true
      break
    }
    parts.push(text)
  }
  return {
    files: slice,
    totalFiles: allFiles.length,
    offset,
    limit,
    nextOffset: offset + slice.length < allFiles.length ? offset + slice.length : -1,
    truncated,
    diff: parts.join('\n\n'),
  }
}
