/**
 * Shared helpers for UI-review diff list actions (copy / submit defect / export).
 * Builds a synthetic ImpactReport so the existing tracker-submit API can be reused.
 */

export interface VisualDiffActionItem {
  key: string
  source: 'ai' | 'rule'
  severity: 'high' | 'medium' | 'low'
  headline: string
  location?: string
  expected?: string
  actual?: string
  codeSource?: string
  suggestion?: string
  note?: string
  designId?: string
}

export interface VisualDiffActionMeta {
  repoPath: string
  designName?: string
  designUrl?: string
  codePath?: string
  platformLabel?: string
}

interface SyntheticScopeItem {
  id: string
  displayName: string
  kind: 'direct'
  risk: 'high' | 'medium' | 'low'
  files: string[]
  evidence: Array<{ path: string; reason: string }>
  suggestedSteps: string[]
  status: 'fail'
  testerNote: string
}

interface SyntheticImpactReport {
  repoPath: string
  baseCommit: string
  headCommit: string
  generatedAt: string
  modelEnriched: boolean
  direct: SyntheticScopeItem[]
  ripple: []
  changedFiles: string[]
}

function itemNote(item: VisualDiffActionItem): string {
  const lines: string[] = []
  if (item.location) lines.push(`位置：${item.location}`)
  if (item.expected) lines.push(`设计期望：${item.expected}`)
  if (item.actual) lines.push(`实际：${item.actual}`)
  if (item.codeSource) lines.push(`代码来源：${item.codeSource}`)
  if (item.suggestion) lines.push(`建议：${item.suggestion}`)
  if (item.note) lines.push(`备注：${item.note}`)
  lines.push(`来源：${item.source === 'ai' ? 'AI 协助' : '静态规则'}`)
  return lines.join('\n')
}

/** Convert visible UI diffs into failed ScopeItems for tracker submission. */
export function unifiedItemsToFailReport(
  items: VisualDiffActionItem[],
  meta: VisualDiffActionMeta,
): SyntheticImpactReport {
  const codePath = (meta.codePath || '').trim()
  const direct: SyntheticScopeItem[] = items.map((item, index) => ({
    id: `ui-diff-${item.key || index}`,
    displayName: item.headline || `UI 差异 ${index + 1}`,
    kind: 'direct',
    risk: item.severity,
    files: codePath ? [codePath] : [],
    evidence: codePath
      ? [{ path: codePath, reason: item.headline || 'UI 差异' }]
      : [],
    suggestedSteps: item.suggestion ? [item.suggestion] : [],
    status: 'fail',
    testerNote: itemNote(item),
  }))
  return {
    repoPath: meta.repoPath,
    baseCommit: 'design',
    headCommit: 'code',
    generatedAt: new Date().toISOString(),
    modelEnriched: false,
    direct,
    ripple: [],
    changedFiles: codePath ? [codePath] : [],
  }
}

export function defaultVisualDefectSubject(
  items: VisualDiffActionItem[],
  meta: VisualDiffActionMeta,
): string {
  const name = meta.designName || '设计稿'
  const code = meta.codePath ? ` ↔ ${meta.codePath}` : ''
  return `[UI 走查] ${name}${code}（${items.length} 条差异）`
}

export function formatVisualDiffCopyText(
  items: VisualDiffActionItem[],
  meta: VisualDiffActionMeta,
): string {
  const lines = [
    '【TraceScope UI 差异反馈】',
    `仓库：${meta.repoPath || ''}`,
    meta.designName ? `设计稿：${meta.designName}` : '',
    meta.designUrl ? `链接：${meta.designUrl}` : '',
    meta.codePath ? `代码：${meta.codePath}` : '',
    meta.platformLabel ? `平台：${meta.platformLabel}` : '',
    '',
  ].filter(Boolean)

  items.forEach((item, i) => {
    lines.push(
      `${i + 1}. [${item.severity}] ${item.headline}（${item.source === 'ai' ? 'AI' : '规则'}）`,
    )
    const note = itemNote(item)
    for (const line of note.split('\n')) {
      lines.push(`   ${line}`)
    }
    lines.push('')
  })
  return lines.join('\n')
}

export function formatVisualDiffExportMarkdown(
  items: VisualDiffActionItem[],
  meta: VisualDiffActionMeta,
): string {
  const lines = [
    '# TraceScope UI 走查差异报告',
    '',
    `- 仓库：\`${meta.repoPath || ''}\``,
    meta.designName ? `- 设计稿：${meta.designName}` : '',
    meta.designUrl ? `- 链接：${meta.designUrl}` : '',
    meta.codePath ? `- 代码：\`${meta.codePath}\`` : '',
    meta.platformLabel ? `- 平台：${meta.platformLabel}` : '',
    `- 生成时间：${new Date().toISOString()}`,
    `- 差异数：${items.length}`,
    '',
    '## 差异清单',
    '',
  ].filter(Boolean)

  items.forEach((item, i) => {
    lines.push(`### ${i + 1}. ${item.headline}`)
    lines.push('')
    lines.push(`- 严重程度：${item.severity}`)
    lines.push(`- 来源：${item.source === 'ai' ? 'AI 协助' : '静态规则'}`)
    if (item.location) lines.push(`- 位置：${item.location}`)
    if (item.expected) lines.push(`- 设计期望：${item.expected}`)
    if (item.actual) lines.push(`- 实际：${item.actual}`)
    if (item.codeSource) lines.push(`- 代码来源：${item.codeSource}`)
    if (item.suggestion) lines.push(`- 建议：${item.suggestion}`)
    if (item.note) lines.push(`- 备注：${item.note}`)
    lines.push('')
  })
  return lines.join('\n')
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

export function downloadTextFile(filename: string, text: string, mime = 'text/markdown'): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
