import { createHash } from 'node:crypto'
import type { ImpactKind, ImpactReport, RiskLevel, ScopeItem } from './types.js'
import { ensureUniqueScopeItemIds } from './scope-ids.js'

export interface PublishedHandtestItem {
  displayName: string
  kind?: ImpactKind
  risk?: RiskLevel
  files?: string[]
  suggestedSteps?: string[]
  evidence?: string
}

function riskOf(value: unknown): RiskLevel {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'medium'
}

function kindOf(value: unknown): ImpactKind {
  return value === 'ripple' ? 'ripple' : 'direct'
}

function slugId(kind: string, name: string, files: string[]): string {
  const key = `chat:${kind}:${name}:${files.slice(0, 3).join('|')}`
  return createHash('sha1').update(key).digest('hex').slice(0, 20)
}

/** Parse agent-published hand-test items into ScopeItem[]. */
export function parsePublishedHandtestItems(raw: unknown): ScopeItem[] {
  if (!Array.isArray(raw)) throw new Error('items 必须是数组')
  const items: ScopeItem[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const obj = row as Record<string, unknown>
    const displayName = typeof obj.displayName === 'string' ? obj.displayName.trim() : ''
    if (!displayName) continue
    const files = Array.isArray(obj.files)
      ? obj.files
          .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
          .map((f) => f.trim())
          .slice(0, 40)
      : []
    const steps = Array.isArray(obj.suggestedSteps)
      ? obj.suggestedSteps
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.trim().slice(0, 200))
          .slice(0, 8)
      : [`验证「${displayName.slice(0, 40)}」相关流程`]
    const kind = kindOf(obj.kind)
    const evidenceDetail =
      typeof obj.evidence === 'string' && obj.evidence.trim()
        ? obj.evidence.trim().slice(0, 400)
        : '会话模型根据 diff / 对话归纳'
    items.push({
      id: slugId(kind, displayName, files),
      displayName: displayName.slice(0, 80),
      kind,
      risk: riskOf(obj.risk),
      files,
      evidence: [{ code: 'chat_publish', detail: evidenceDetail }],
      suggestedSteps: steps,
      status: 'pending',
    })
  }
  if (items.length === 0) throw new Error('items 为空或缺少有效 displayName')
  return items
}

/** Build an ImpactReport from a chat job + published items. */
export function buildReportFromPublishedItems(input: {
  repoPath: string
  baseCommit: string
  headCommit: string
  changedFiles?: string[]
  items: ScopeItem[]
}): ImpactReport {
  const sortItems = (list: ScopeItem[]) =>
    [...list].sort((a, b) => {
      const rank = { high: 3, medium: 2, low: 1 }
      return rank[b.risk] - rank[a.risk] || a.displayName.localeCompare(b.displayName)
    })
  const direct = sortItems(input.items.filter((i) => i.kind === 'direct'))
  const ripple = sortItems(input.items.filter((i) => i.kind === 'ripple'))
  const changedFiles =
    input.changedFiles ??
    [...new Set(input.items.flatMap((i) => i.files))]
  return ensureUniqueScopeItemIds({
    repoPath: input.repoPath,
    baseCommit: input.baseCommit,
    headCommit: input.headCommit,
    generatedAt: new Date().toISOString(),
    modelEnriched: true,
    changedFiles,
    direct,
    ripple,
  })
}
