/**
 * Agent-facing TraceScope operations shared by the DSH plugin tools and the
 * standalone MCP server. Keep business logic here so every MCP-capable agent
 * can use the same surface as DeepSeek Harness.
 */
import {
  buildChatAnalysisPrompt,
  buildReportFromPublishedItems,
  changedPathsFromDiffs,
  compareCodeup,
  designDocToFindingLocators,
  enrichVisualFindingsNodeIds,
  exportReportCsv,
  exportReportMarkdown,
  formatDesignSnapshot,
  gitDiffFiles,
  parseAgileWorkItemRefs,
  parseGitAuth,
  parsePublishedHandtestItems,
  parseVisualFindings,
  parseVisualRenderPatches,
  resolveCodeupTarget,
  resolveGitRepo,
  saveHandtestReport,
  saveVisualFindings,
  saveVisualRematch,
  visualFindingsKey,
  visualRematchKey,
  type GitAuth,
  type GitCommitInfo,
  type GitRefInfo,
  type ResolvedRepo,
} from '@rebornace/tracescope-core'
import { createJob, getJob, publishJobReport, findJobForRepo } from './jobs.js'
import {
  getVisualJob,
  publishVisualJobFindings,
  publishVisualJobRematch,
  type RematchPick,
} from './visual-jobs.js'
import { getDiffChunk } from './services/diff-chunk.js'
import { runAnalyze } from './services/run-analyze.js'
import { loadRepoHistory } from './services/repo-history.js'
import {
  readAccessMode,
  resolveCodeupAuth,
  resolveRequestGitAuth,
} from './services/request-auth.js'
import {
  buildCodeVisualAnalysis,
  buildPageRematchAnalysis,
} from './services/visual-flow.js'
import { parseAuthFromToolArgs } from './tools/tool-helpers.js'
import { parseFetchFlag } from './http/route-helpers.js'
import { ui, langFromArgs } from './i18n/ui.js'
import { resolveHostLang, type Lang } from './i18n/lang.js'
import type { Context } from './dsh-shims.js'

export { parseAuthFromToolArgs }

/** Prefer explicit args.locale, else Host locale. */
export function agentLang(args?: Record<string, unknown>, ctx?: Context): Lang {
  if (args && (args.locale !== undefined || args.lang !== undefined)) {
    return langFromArgs(args, 'zh')
  }
  return resolveHostLang(ctx)
}

function parseJsonArg(raw: unknown, label: string): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`${label} 不是合法 JSON`)
  }
}

export async function listCommits(args: {
  repoPath: string
  limit?: number
  fetch?: boolean
  auth?: GitAuth
}): Promise<{
  resolved: ResolvedRepo
  commits: GitCommitInfo[]
  refs: GitRefInfo[]
}> {
  const { resolved, commits, refs } = await loadRepoHistory(
    args.repoPath,
    args.limit ?? 40,
    args.fetch ?? true,
    args.auth,
  )
  return { resolved, commits, refs }
}

export async function analyzeImpactTool(args: Record<string, unknown>) {
  const repoPath = String(args.repoPath ?? '')
  const baseCommit = String(args.baseCommit ?? '')
  const headCommit = String(args.headCommit ?? '')
  if (!repoPath || !baseCommit || !headCommit) {
    throw new Error('需要 repoPath、baseCommit、headCommit')
  }
  const job = findJobForRepo(repoPath, baseCommit, headCommit)
  const result = await runAnalyze({
    repoPath: job?.accessMode === 'codeup' ? job.repoInput : repoPath,
    baseCommit,
    headCommit,
    rippleDepth: typeof args.rippleDepth === 'number' ? args.rippleDepth : undefined,
    modulesConfigPath:
      typeof args.modulesConfigPath === 'string' ? args.modulesConfigPath : undefined,
    exportDir: typeof args.exportDir === 'string' ? args.exportDir : undefined,
    fetchRemote: typeof args.fetchRemote === 'boolean' ? args.fetchRemote : undefined,
    auth: parseAuthFromToolArgs(args),
    accessMode: job?.accessMode,
    codeup: job?.codeup,
  })
  const lang = agentLang(args)
  const summary = [
    ui('AGENT_ANALYZE_SUMMARY', lang, {
      direct: result.report.direct.length,
      ripple: result.report.ripple.length,
    }),
    ui('AGENT_ANALYZE_RULE', lang),
    '',
    ui('AGENT_DIRECT_SECTION', lang),
    ...result.report.direct.map((i) => `- [${i.risk}] ${i.displayName}`),
    '',
    ui('AGENT_RIPPLE_SECTION', lang),
    ...result.report.ripple.map((i) => `- [${i.risk}] ${i.displayName}`),
  ].join('\n')
  return {
    summary,
    directCount: result.report.direct.length,
    rippleCount: result.report.ripple.length,
    changedFileCount: result.report.changedFiles.length,
    markdown: result.markdown,
    csv: result.csv,
    repoPath: result.report.repoPath,
    baseCommit: result.report.baseCommit,
    headCommit: result.report.headCommit,
    modelEnriched: result.report.modelEnriched,
  }
}

export async function getDiffTool(args: Record<string, unknown>) {
  const pathsRaw = typeof args.paths === 'string' ? args.paths : ''
  const paths = pathsRaw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  return await getDiffChunk({
    repoPath: String(args.repoPath ?? ''),
    baseCommit: String(args.baseCommit ?? ''),
    headCommit: String(args.headCommit ?? ''),
    paths: paths.length ? paths : undefined,
    offset: typeof args.offset === 'number' ? args.offset : undefined,
    limit: typeof args.limit === 'number' ? args.limit : undefined,
    auth: parseAuthFromToolArgs(args),
  })
}

export async function createHandtestJob(args: Record<string, unknown>) {
  const repoInput = String(args.repoPath ?? args.repo ?? '')
  const baseCommit = String(args.baseCommit ?? '')
  const headCommit = String(args.headCommit ?? '')
  if (!repoInput || !baseCommit || !headCommit) {
    throw new Error('需要 repoPath、baseCommit、headCommit')
  }
  const authRaw =
    args.auth && typeof args.auth === 'object'
      ? args.auth
      : {
          mode: typeof args.authMode === 'string' ? args.authMode : 'none',
          username: args.authUsername,
          token: args.authToken,
          privateKeyPath: args.authPrivateKeyPath,
        }
  const auth = await resolveRequestGitAuth(parseGitAuth(authRaw), repoInput)
  const fetchRemote = parseFetchFlag(
    args.fetch !== undefined ? args.fetch : args.fetchRemote,
    true,
  )
  const accessMode = readAccessMode(args)
  const codeup = accessMode === 'codeup' ? await resolveCodeupAuth(args) : undefined
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
  const relatedWorkItems = parseAgileWorkItemRefs(args.relatedWorkItems)
  const promptLang = agentLang(args)
  const prompt = buildChatAnalysisPrompt({
    jobId: job.id,
    repoPath: repoInput,
    baseCommit,
    headCommit,
    relatedWorkItems,
    accessMode,
    lang: promptLang,
  })
  return {
    jobId: job.id,
    status: job.status,
    prompt,
    resolved,
    relatedWorkItems,
    summary: (() => {
      const lang = agentLang(args)
      return [
        ui('AGENT_HANDTEST_CREATED', lang, { id: job.id }),
        ui('AGENT_REPO', lang, { repo: repoInput }),
        ui('AGENT_BASE_HEAD', lang, { base: baseCommit, head: headCommit }),
        '',
        ui('AGENT_HANDTEST_NEXT', lang),
        '',
        prompt,
      ].join('\n')
    })(),
  }
}

export async function publishHandtest(args: Record<string, unknown>) {
  const jobId = String(args.jobId ?? '')
  if (!jobId) throw new Error('缺少 jobId')
  const job = getJob(jobId)
  if (!job) throw new Error(`找不到任务 ${jobId}`)

  const parsed = parseJsonArg(args.items, 'items')
  const items = parsePublishedHandtestItems(parsed)
  let changedFiles: string[] = []
  try {
    if (job.accessMode === 'codeup' && job.codeup?.token) {
      const target = resolveCodeupTarget(job.repoInput, job.codeup)
      const compare = await compareCodeup(target, {
        endpoint: job.codeup.endpoint,
        token: job.codeup.token,
        base: job.baseCommit,
        head: job.headCommit,
      })
      changedFiles = changedPathsFromDiffs(compare.diffs)
    } else {
      changedFiles = await gitDiffFiles(job.repoPath, job.baseCommit, job.headCommit)
    }
  } catch {
    changedFiles = [...new Set(items.flatMap((i) => i.files))]
  }
  const report = buildReportFromPublishedItems({
    repoPath: job.repoPath,
    baseCommit: job.baseCommit,
    headCommit: job.headCommit,
    changedFiles,
    items,
  })
  const updated = publishJobReport(jobId, report)
  await saveHandtestReport({
    repoInput: job.repoPath,
    baseCommit: job.baseCommit,
    headCommit: job.headCommit,
    report,
    source: 'model',
  })
  const lang = agentLang(args)
  const summary = [
    ui('AGENT_HANDTEST_PUBLISHED', lang, { id: jobId }),
    ui('AGENT_HANDTEST_PERSISTED', lang),
    ui('AGENT_DIRECT_RIPPLE', lang, {
      direct: report.direct.length,
      ripple: report.ripple.length,
    }),
    '',
    ui('AGENT_DIRECT_SECTION', lang),
    ...report.direct.map((i) => `- [${i.risk}] ${i.displayName}`),
    '',
    ui('AGENT_RIPPLE_SECTION', lang),
    ...report.ripple.map((i) => `- [${i.risk}] ${i.displayName}`),
  ].join('\n')
  return {
    jobId: updated.id,
    status: updated.status,
    directCount: report.direct.length,
    rippleCount: report.ripple.length,
    summary,
    markdown: exportReportMarkdown(report),
    csv: exportReportCsv(report),
  }
}

export async function startVisualReview(args: Record<string, unknown>) {
  const result = await buildCodeVisualAnalysis(args)
  return {
    ...result,
    summary: (() => {
      const lang = agentLang(args)
      return [
        ui('AGENT_VISUAL_CREATED', lang, { id: result.jobId }),
        ui('AGENT_VISUAL_NEXT', lang),
        ui('AGENT_VISUAL_PUBLISH', lang),
        '',
        result.prompt,
      ].join('\n')
    })(),
  }
}

export async function getDesignSnapshot(args: Record<string, unknown>) {
  const jobId = String(args.jobId ?? '').trim()
  if (!jobId) throw new Error('缺少 jobId')
  const job = getVisualJob(jobId)
  if (!job) throw new Error(`找不到 UI 走查任务 ${jobId}`)
  if (!job.designDoc?.root) {
    throw new Error(`任务 ${jobId} 没有挂载设计树；请重新发起 tracescope_start_visual_review`)
  }

  const maxRaw = typeof args.maxNodes === 'number' ? args.maxNodes : Number(args.maxNodes)
  const maxNodes = Number.isFinite(maxRaw)
    ? Math.max(8, Math.min(120, Math.floor(maxRaw)))
    : 40

  type DesignNodeLike = {
    id: string
    name: string
    kind: string
    text?: string
    box: { x?: number; y?: number; width?: number; height?: number }
    style: Record<string, unknown>
    children: Array<unknown>
  }

  function findNode(root: DesignNodeLike, nodeId: string): DesignNodeLike | null {
    if (root.id === nodeId) return root
    const alt = nodeId.replace(/-/g, ':')
    if (root.id === alt) return root
    for (const child of root.children || []) {
      const hit = findNode(child as DesignNodeLike, nodeId)
      if (hit) return hit
    }
    return null
  }

  const root = job.designDoc.root as DesignNodeLike
  const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : ''
  let target = root
  if (nodeId) {
    const found = findNode(root, nodeId)
    if (!found) throw new Error(`设计树中找不到节点 ${nodeId}`)
    target = found
  }

  const snapshot = formatDesignSnapshot(target as never, { maxNodes })
  const designName = job.designName || root.name || job.designId
  const lang = agentLang(args)
  const summary = [
    ui('AGENT_SNAPSHOT_TITLE', lang, { name: designName }),
    ui('AGENT_SNAPSHOT_ROOT', lang, { id: target.id, name: target.name || '' }).trim(),
    ui('AGENT_SNAPSHOT_MAX', lang, { n: maxNodes }),
    '',
    snapshot,
  ].join('\n')

  return {
    jobId,
    designName,
    rootId: target.id,
    nodeCountHint: maxNodes,
    snapshot,
    summary,
  }
}

export async function publishVisualFindings(args: Record<string, unknown>) {
  const jobId = String(args.jobId ?? '')
  if (!jobId) throw new Error('缺少 jobId')
  const job = getVisualJob(jobId)
  if (!job) throw new Error(`找不到 UI 走查任务 ${jobId}`)

  const parsed = parseJsonArg(args.findings, 'findings')
  const findingsRaw = parseVisualFindings(parsed)
  const findings =
    job.designDoc?.root
      ? enrichVisualFindingsNodeIds(
          findingsRaw,
          designDocToFindingLocators(job.designDoc.root),
        )
      : findingsRaw

  let renderPatch: ReturnType<typeof parseVisualRenderPatches> | undefined
  if (args.renderPatch !== undefined) {
    const patchRaw = parseJsonArg(args.renderPatch, 'renderPatch')
    renderPatch = parseVisualRenderPatches(patchRaw)
  }

  const summaryText =
    typeof args.summary === 'string' && args.summary.trim()
      ? args.summary.trim().slice(0, 600)
      : undefined

  const report = {
    repoInput: job.repoInput,
    fileKey: job.fileKey,
    designId: job.designId,
    adapterId: job.adapterId,
    relativePath: job.relativePath,
    designName: job.designName,
    findings,
    renderPatch: renderPatch && renderPatch.length ? renderPatch : undefined,
    summary: summaryText,
    source: 'model' as const,
    savedAt: new Date().toISOString(),
  }

  const updated = publishVisualJobFindings(jobId, report)
  await saveVisualFindings(
    visualFindingsKey(job.repoInput, job.fileKey, job.designId, job.relativePath),
    report,
  )

  const lang = agentLang(args)
  const text = [
    ui('AGENT_VISUAL_PUBLISHED', lang, { id: jobId }),
    ui('AGENT_FINDINGS_COUNT', lang, { n: findings.length }),
    ...findings.map(
      (f) => `- [${f.severity}] ${f.title}${f.suggestion ? `：${f.suggestion}` : ''}`,
    ),
    renderPatch && renderPatch.length
      ? ui('AGENT_RENDER_PATCH_NOTE', lang, { n: renderPatch.length })
      : '',
  ]
    .filter((l) => l !== '')
    .join('\n')

  return {
    jobId: updated.id,
    status: updated.status,
    count: findings.length,
    summary: text,
  }
}

function parseRematchPicks(raw: unknown): RematchPick[] {
  const value = parseJsonArg(raw, 'picks')
  if (!Array.isArray(value)) throw new Error('picks 必须是数组')
  const picks: RematchPick[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const relativePath = String(row.relativePath ?? row.path ?? '').trim().replace(/\\/g, '/')
    if (!relativePath) continue
    const adapterId = String(row.adapterId ?? row.adapter ?? 'android-xml').trim() || 'android-xml'
    const kindLabel =
      typeof row.kindLabel === 'string' && row.kindLabel.trim()
        ? row.kindLabel.trim()
        : undefined
    let score: number | undefined
    const scoreRaw = row.score ?? row.confidence
    if (typeof scoreRaw === 'number' && Number.isFinite(scoreRaw)) {
      score = Math.max(0, Math.min(1, scoreRaw))
    } else if (typeof scoreRaw === 'string' && scoreRaw.trim()) {
      const n = Number(scoreRaw)
      if (Number.isFinite(n)) score = Math.max(0, Math.min(1, n))
    }
    const reason =
      typeof row.reason === 'string' && row.reason.trim()
        ? row.reason.trim().slice(0, 200)
        : undefined
    picks.push({ adapterId, relativePath, kindLabel, score, reason })
  }
  if (!picks.length) throw new Error('picks 为空或缺少 relativePath')
  return picks.slice(0, 8)
}

export async function startPageRematch(args: Record<string, unknown>) {
  const result = await buildPageRematchAnalysis(args)
  return {
    ...result,
    summary: (() => {
      const lang = agentLang(args)
      return [
        ui('AGENT_REMATCH_CREATED', lang, {
          id: result.jobId,
          n: result.candidateCount,
        }),
        ui('AGENT_REMATCH_NEXT', lang),
        '',
        result.prompt,
      ].join('\n')
    })(),
  }
}

export async function publishPageRematch(args: Record<string, unknown>) {
  const jobId = String(args.jobId ?? '')
  if (!jobId) throw new Error('缺少 jobId')
  const job = getVisualJob(jobId)
  if (!job) throw new Error(`找不到文件匹配任务 ${jobId}`)
  if (job.kind !== 'rematch') {
    throw new Error(`任务 ${jobId} 不是文件匹配任务（kind=${job.kind}）`)
  }

  const picks = parseRematchPicks(args.picks)
  const note =
    typeof args.note === 'string' && args.note.trim()
      ? args.note.trim().slice(0, 400)
      : undefined

  const updated = publishVisualJobRematch(jobId, { picks, note })
  const top = picks[0]!
  const report = {
    designId: job.designId,
    picks,
    note,
    source: 'model' as const,
    savedAt: new Date().toISOString(),
  }
  try {
    await saveVisualRematch(visualRematchKey(job.repoInput, job.fileKey, job.designId), report)
  } catch {
    /* disk write failure must not block the in-memory write-back */
  }
  return {
    jobId,
    status: updated.status,
    count: picks.length,
    topPath: top.relativePath,
    summary: ui('AGENT_REMATCH_PUBLISHED', agentLang(args), {
      n: picks.length,
      path: top.relativePath,
    }),
  }
}
