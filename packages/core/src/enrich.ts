import { createHash } from 'node:crypto'
import { gitDiffUnified, gitLogSubjects } from './git.js'
import type { ImpactKind, ImpactReport, RiskLevel, ScopeItem } from './types.js'

export type ModelJsonCaller = (prompt: string) => Promise<string>

export interface ModelScopeDraft {
  displayName: string
  kind?: ImpactKind
  risk?: RiskLevel
  files?: string[]
  suggestedSteps?: string[]
  evidence?: string
}

/** Soft budgets so one model call stays inside typical context / output limits. */
const MAX_DIFF_CHARS_PER_CALL = 24_000
const MAX_FILES_PER_CALL = 12
const MAX_COMMITS_IN_PROMPT = 20

const SYSTEM = [
  '你是资深移动端 / 客户端测试专家。',
  '下面给出两个 git 版本之间的提交摘要与 unified diff。请像做发布前手测评审一样对比差异。',
  '要求：',
  '1. 按用户可感知的功能 / 场景组织条目，合并同一功能的多文件改动，不要逐文件罗列。',
  '2. 可指出 diff 中隐含的回归与波及面（即便确定性规则没标出）。',
  '3. 不要编造 diff 中完全看不到证据的功能；不确定时写在 evidence 里说明依据。',
  '4. suggestedSteps 写 2～4 条可执行手测短句。',
  '5. 只输出一个 JSON 数组，不要 Markdown，不要解释。格式：',
  '[{"displayName":"登录","kind":"direct","risk":"high","files":["a.kt"],"suggestedSteps":["打开登录页","提交后确认进首页"],"evidence":"LoginActivity 校验逻辑变更"}]',
  'kind 仅用 direct（本批 diff 直接改到）或 ripple（推断波及）；risk 仅用 high|medium|low。',
].join('\n')

function riskOf(value: unknown): RiskLevel {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'medium'
}

function kindOf(value: unknown): ImpactKind {
  return value === 'ripple' ? 'ripple' : 'direct'
}

function slugId(kind: string, name: string, files: string[]): string {
  const key = `model:${kind}:${name}:${files.slice(0, 3).join('|')}`
  return createHash('sha1').update(key).digest('hex').slice(0, 20)
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '')
}

/** Extract the first JSON array from model text (tolerates accidental fences). */
export function extractJsonArray(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? trimmed).trim()
  const start = candidate.indexOf('[')
  const end = candidate.lastIndexOf(']')
  if (start < 0 || end <= start) throw new Error('模型未返回 JSON 数组')
  return JSON.parse(candidate.slice(start, end + 1))
}

export function parseModelScopeDrafts(raw: unknown): ModelScopeDraft[] {
  if (!Array.isArray(raw)) throw new Error('模型返回值不是数组')
  const drafts: ModelScopeDraft[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const obj = row as Record<string, unknown>
    const displayName = typeof obj.displayName === 'string' ? obj.displayName.trim() : ''
    if (!displayName) continue
    const files = Array.isArray(obj.files)
      ? obj.files.filter((f): f is string => typeof f === 'string' && f.trim().length > 0).map((f) => f.trim())
      : []
    const steps = Array.isArray(obj.suggestedSteps)
      ? obj.suggestedSteps
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.trim().slice(0, 200))
          .slice(0, 6)
      : []
    drafts.push({
      displayName: displayName.slice(0, 80),
      kind: kindOf(obj.kind),
      risk: riskOf(obj.risk),
      files: files.slice(0, 20),
      suggestedSteps: steps.length > 0 ? steps : [`验证「${displayName.slice(0, 40)}」相关流程`],
      evidence: typeof obj.evidence === 'string' ? obj.evidence.trim().slice(0, 300) : undefined,
    })
  }
  return drafts
}

function draftToItem(draft: ModelScopeDraft): ScopeItem {
  const files = draft.files ?? []
  const kind = draft.kind ?? 'direct'
  const displayName = draft.displayName
  return {
    id: slugId(kind, displayName, files),
    displayName,
    kind,
    risk: draft.risk ?? 'medium',
    files,
    evidence: [
      {
        code: 'model_diff',
        detail: draft.evidence || '模型根据 unified diff 归纳',
      },
    ],
    suggestedSteps: draft.suggestedSteps ?? [`验证「${displayName}」`],
    status: 'pending',
  }
}

/** Merge model drafts that share the same product name (or overlapping files). */
export function mergeScopeItems(items: ScopeItem[]): ScopeItem[] {
  const merged: ScopeItem[] = []
  for (const item of items) {
    const nameKey = normalizeName(item.displayName)
    const hit = merged.find((existing) => {
      if (normalizeName(existing.displayName) === nameKey) return true
      if (item.files.length === 0 || existing.files.length === 0) return false
      return item.files.some((f) => existing.files.includes(f))
    })
    if (!hit) {
      merged.push({ ...item, files: [...item.files], evidence: [...item.evidence], suggestedSteps: [...item.suggestedSteps] })
      continue
    }
    const files = [...new Set([...hit.files, ...item.files])]
    const steps = [...new Set([...hit.suggestedSteps, ...item.suggestedSteps])].slice(0, 8)
    const evidence = [...hit.evidence, ...item.evidence].slice(0, 6)
    const riskRank = { high: 3, medium: 2, low: 1 } as const
    const risk = riskRank[item.risk] > riskRank[hit.risk] ? item.risk : hit.risk
    const kind: ImpactKind = hit.kind === 'direct' || item.kind === 'direct' ? 'direct' : 'ripple'
    hit.displayName = hit.displayName.length <= item.displayName.length ? hit.displayName : item.displayName
    hit.kind = kind
    hit.risk = risk
    hit.files = files
    hit.evidence = evidence
    hit.suggestedSteps = steps
    hit.id = slugId(kind, hit.displayName, files)
  }
  return merged
}

function truncateDiff(diff: string, maxChars: number): { text: string; truncated: boolean } {
  if (diff.length <= maxChars) return { text: diff, truncated: false }
  return {
    text: `${diff.slice(0, maxChars)}\n\n…[diff 已截断，仅保留前 ${maxChars} 字符]`,
    truncated: true,
  }
}

async function packDiffChunks(
  repoPath: string,
  baseCommit: string,
  headCommit: string,
  files: string[],
): Promise<Array<{ files: string[]; diff: string }>> {
  const perFile: Array<{ file: string; diff: string }> = []
  for (const file of files) {
    let diff = ''
    try {
      diff = await gitDiffUnified(repoPath, baseCommit, headCommit, { paths: [file] })
    } catch {
      diff = `--- a/${file}\n+++ b/${file}\n@@ (无法读取该文件 diff)\n`
    }
    if (!diff.trim()) {
      diff = `--- a/${file}\n+++ b/${file}\n@@ (无文本 diff，可能是二进制或权限变更)\n`
    }
    const clipped = truncateDiff(diff, MAX_DIFF_CHARS_PER_CALL)
    perFile.push({ file, diff: clipped.text })
  }

  const chunks: Array<{ files: string[]; diff: string }> = []
  let currentFiles: string[] = []
  let currentDiff = ''
  for (const row of perFile) {
    const nextLen = currentDiff.length + row.diff.length + 2
    if (
      currentFiles.length > 0 &&
      (currentFiles.length >= MAX_FILES_PER_CALL || nextLen > MAX_DIFF_CHARS_PER_CALL)
    ) {
      chunks.push({ files: currentFiles, diff: currentDiff })
      currentFiles = []
      currentDiff = ''
    }
    currentFiles.push(row.file)
    currentDiff = currentDiff ? `${currentDiff}\n${row.diff}` : row.diff
  }
  if (currentFiles.length) chunks.push({ files: currentFiles, diff: currentDiff })
  return chunks
}

function buildChunkPrompt(input: {
  repoPath: string
  baseCommit: string
  headCommit: string
  commits: string[]
  chunkIndex: number
  chunkTotal: number
  files: string[]
  diff: string
  deterministicHints: string[]
}): string {
  const hintBlock =
    input.deterministicHints.length > 0
      ? [
          '',
          '静态分析提示（仅供参考，可合并 / 纠正 / 忽略）：',
          ...input.deterministicHints.map((h) => `- ${h}`),
        ].join('\n')
      : ''
  return [
    SYSTEM,
    '',
    `仓库：${input.repoPath}`,
    `对比：${input.baseCommit} → ${input.headCommit}`,
    `分片：${input.chunkIndex}/${input.chunkTotal}`,
    '',
    '提交摘要：',
    input.commits.length ? input.commits.map((c) => `- ${c}`).join('\n') : '- （无）',
    '',
    `本批变更文件（${input.files.length}）：`,
    ...input.files.map((f) => `- ${f}`),
    hintBlock,
    '',
    'Unified diff：',
    input.diff,
  ].join('\n')
}

function deterministicHints(report: ImpactReport, files: string[]): string[] {
  const fileSet = new Set(files)
  return [...report.direct, ...report.ripple]
    .filter((item) => item.files.some((f) => fileSet.has(f)))
    .slice(0, 8)
    .map((item) => `${item.displayName} [${item.kind}/${item.risk}] ← ${item.files.slice(0, 3).join(', ')}`)
}

function filesCovered(items: ScopeItem[]): Set<string> {
  const set = new Set<string>()
  for (const item of items) for (const f of item.files) set.add(f)
  return set
}

/**
 * Model-driven impact analysis from real git diffs (chunked).
 * Replaces polish-only enrichment: the model compares versions, merges scenarios,
 * and may surface risks the deterministic pass missed.
 */
export async function analyzeReportWithModel(
  report: ImpactReport,
  callModel: ModelJsonCaller,
): Promise<ImpactReport> {
  const files = report.changedFiles.length
    ? report.changedFiles
    : [...new Set([...report.direct, ...report.ripple].flatMap((i) => i.files))]
  if (files.length === 0) {
    return { ...report, modelEnriched: true }
  }

  const commits = await gitLogSubjects(
    report.repoPath,
    report.baseCommit,
    report.headCommit,
    MAX_COMMITS_IN_PROMPT,
  )
  const chunks = await packDiffChunks(
    report.repoPath,
    report.baseCommit,
    report.headCommit,
    files,
  )

  const collected: ScopeItem[] = []
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!
    const prompt = buildChunkPrompt({
      repoPath: report.repoPath,
      baseCommit: report.baseCommit,
      headCommit: report.headCommit,
      commits,
      chunkIndex: i + 1,
      chunkTotal: chunks.length,
      files: chunk.files,
      diff: chunk.diff,
      deterministicHints: deterministicHints(report, chunk.files),
    })
    const text = await callModel(prompt)
    const drafts = parseModelScopeDrafts(extractJsonArray(text))
    collected.push(...drafts.map(draftToItem))
  }

  let modelItems = mergeScopeItems(collected)

  // Keep deterministic findings whose files the model never mentioned.
  const covered = filesCovered(modelItems)
  const leftovers = [...report.direct, ...report.ripple].filter(
    (item) => item.files.length > 0 && item.files.every((f) => !covered.has(f)),
  )
  modelItems = mergeScopeItems([...modelItems, ...leftovers])

  const sortItems = (items: ScopeItem[]) =>
    [...items].sort((a, b) => {
      const rank = { high: 3, medium: 2, low: 1 }
      return rank[b.risk] - rank[a.risk] || a.displayName.localeCompare(b.displayName)
    })

  return {
    ...report,
    modelEnriched: true,
    direct: sortItems(modelItems.filter((i) => i.kind === 'direct')),
    ripple: sortItems(modelItems.filter((i) => i.kind === 'ripple')),
  }
}

/** @deprecated Use analyzeReportWithModel — kept as alias for older imports. */
export const enrichReportWithModel = analyzeReportWithModel
