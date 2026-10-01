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

export { parseAuthFromToolArgs }

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
  const summary = [
    `直接项 ${result.report.direct.length} · 可能波及 ${result.report.ripple.length}`,
    '（规则分析；对话结论请用 tracescope_publish_handtest 回写面板）',
    '',
    '## 直接项',
    ...result.report.direct.map((i) => `- [${i.risk}] ${i.displayName}`),
    '',
    '## 可能波及',
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
  const prompt = buildChatAnalysisPrompt({
    jobId: job.id,
    repoPath: repoInput,
    baseCommit,
    headCommit,
    relatedWorkItems,
    accessMode,
  })
  return {
    jobId: job.id,
    status: job.status,
    prompt,
    resolved,
    relatedWorkItems,
    summary: [
      `已创建手测分析任务 ${job.id}`,
      `仓库 ${repoInput}`,
      `基线 ${baseCommit} → 待测 ${headCommit}`,
      '',
      '请按下方提示词分析，完成后调用 tracescope_publish_handtest 写回清单。',
      '',
      prompt,
    ].join('\n'),
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
  const summary = [
    `已发布验证清单到 TraceScope 面板（任务 ${jobId}）`,
    `并已持久化到本机，重启后同一仓库与两版本会自动恢复（再次「AI 智能分析」并 publish 才会覆盖）。`,
    `直接 ${report.direct.length} · 波及 ${report.ripple.length}`,
    '',
    '## 直接项',
    ...report.direct.map((i) => `- [${i.risk}] ${i.displayName}`),
    '',
    '## 可能波及',
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
    summary: [
      `已创建 UI 走查任务 ${result.jobId}`,
      '请按提示词对照设计与代码，需要节点结构时调用 tracescope_get_design_snapshot。',
      '完成后调用 tracescope_publish_visual_findings 写回。',
      '',
      result.prompt,
    ].join('\n'),
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
  const summary = [
    `设计快照 · ${designName}`,
    `根节点：${target.id} ${target.name || ''}`.trim(),
    `最多 ${maxNodes} 个节点（结构化文本，非 Figma API）`,
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

  const text = [
    `已把 UI 走查结论写回 TraceScope 面板（任务 ${jobId}），并持久化到本机，重开后同一页面自动恢复。`,
    `共 ${findings.length} 条：`,
    ...findings.map(
      (f) => `- [${f.severity}] ${f.title}${f.suggestion ? `：${f.suggestion}` : ''}`,
    ),
    renderPatch && renderPatch.length
      ? `（另收到 ${renderPatch.length} 组实验性 renderPatch，侧栏以差异清单为准，不再做代码还原预览。）`
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
    summary: [
      `已创建文件匹配任务 ${result.jobId}（候选 ${result.candidateCount}）`,
      '完成后调用 tracescope_publish_page_rematch 写回推荐文件。',
      '',
      result.prompt,
    ].join('\n'),
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
    summary: `已写回 ${picks.length} 个推荐并持久化；侧栏将选中 ${top.relativePath}，重启后仍可恢复`,
  }
}
