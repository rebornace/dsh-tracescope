/**
 * Shared helpers for UI-review diff list actions (copy / submit defect / export).
 * Builds a synthetic ImpactReport so the existing tracker-submit API can be reused.
 */

import { getT } from '../locales/i18n.js'
import { resolveT, type TranslateFn } from './diff-i18n.js'

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

function itemNote(item: VisualDiffActionItem, t: TranslateFn): string {
  const lines: string[] = []
  if (item.location) lines.push(t('diff.field.location', { value: item.location }))
  if (item.expected) lines.push(t('diff.field.expected', { value: item.expected }))
  if (item.actual) lines.push(t('diff.field.actual', { value: item.actual }))
  if (item.codeSource) lines.push(t('diff.field.codeSource', { value: item.codeSource }))
  if (item.suggestion) lines.push(t('diff.field.suggestion', { value: item.suggestion }))
  if (item.note) lines.push(t('diff.field.note', { value: item.note }))
  lines.push(
    t('diff.field.source', {
      value: item.source === 'ai' ? t('diff.source.ai') : t('diff.source.rule'),
    }),
  )
  return lines.join('\n')
}

/** Convert visible UI diffs into failed ScopeItems for tracker submission. */
export function unifiedItemsToFailReport(
  items: VisualDiffActionItem[],
  meta: VisualDiffActionMeta,
  t?: TranslateFn,
): SyntheticImpactReport {
  const tr = resolveT(t)
  const codePath = (meta.codePath || '').trim()
  const direct: SyntheticScopeItem[] = items.map((item, index) => ({
    id: `ui-diff-${item.key || index}`,
    displayName:
      item.headline || tr('diff.itemIndexed', { index: index + 1 }),
    kind: 'direct',
    risk: item.severity,
    files: codePath ? [codePath] : [],
    evidence: codePath
      ? [{ path: codePath, reason: item.headline || tr('diff.itemFallback') }]
      : [],
    suggestedSteps: item.suggestion ? [item.suggestion] : [],
    status: 'fail',
    testerNote: itemNote(item, tr),
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
  t?: TranslateFn,
): string {
  const tr = resolveT(t)
  const name = meta.designName || tr('diff.defaultDesignName')
  const code = meta.codePath
    ? tr('diff.defectSubjectCodePair', { path: meta.codePath })
    : ''
  return tr('diff.defectSubject', { name, codePair: code, count: items.length })
}

export function formatVisualDiffCopyText(
  items: VisualDiffActionItem[],
  meta: VisualDiffActionMeta,
  t?: TranslateFn,
): string {
  const tr = resolveT(t)
  const lines = [
    tr('diff.export.feedbackTitle'),
    tr('diff.export.repo', { value: meta.repoPath || '' }),
    meta.designName ? tr('diff.export.design', { value: meta.designName }) : '',
    meta.designUrl ? tr('diff.export.link', { value: meta.designUrl }) : '',
    meta.codePath ? tr('diff.export.code', { value: meta.codePath }) : '',
    meta.platformLabel ? tr('diff.export.platform', { value: meta.platformLabel }) : '',
    '',
  ].filter(Boolean)

  items.forEach((item, i) => {
    lines.push(
      tr('diff.export.lineItem', {
        index: i + 1,
        severity: item.severity,
        headline: item.headline,
        source: item.source === 'ai' ? tr('diff.source.aiShort') : tr('diff.source.ruleShort'),
      }),
    )
    const note = itemNote(item, tr)
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
  t?: TranslateFn,
): string {
  const tr = resolveT(t)
  const lines = [
    tr('diff.export.reportTitle'),
    '',
    tr('diff.export.mdRepo', { value: meta.repoPath || '' }),
    meta.designName ? tr('diff.export.mdDesign', { value: meta.designName }) : '',
    meta.designUrl ? tr('diff.export.mdLink', { value: meta.designUrl }) : '',
    meta.codePath ? tr('diff.export.mdCode', { value: meta.codePath }) : '',
    meta.platformLabel ? tr('diff.export.mdPlatform', { value: meta.platformLabel }) : '',
    tr('diff.export.generatedAt', { value: new Date().toISOString() }),
    tr('diff.export.diffCount', { count: items.length }),
    '',
    tr('diff.export.sectionList'),
    '',
  ].filter(Boolean)

  items.forEach((item, i) => {
    lines.push(`### ${i + 1}. ${item.headline}`)
    lines.push('')
    lines.push(tr('diff.export.mdSeverity', { value: item.severity }))
    lines.push(
      tr('diff.export.mdSource', {
        value: item.source === 'ai' ? tr('diff.source.ai') : tr('diff.source.rule'),
      }),
    )
    if (item.location) lines.push(tr('diff.export.mdLocation', { value: item.location }))
    if (item.expected) lines.push(tr('diff.export.mdExpected', { value: item.expected }))
    if (item.actual) lines.push(tr('diff.export.mdActual', { value: item.actual }))
    if (item.codeSource) lines.push(tr('diff.export.mdCodeSource', { value: item.codeSource }))
    if (item.suggestion) lines.push(tr('diff.export.mdSuggestion', { value: item.suggestion }))
    if (item.note) lines.push(tr('diff.export.mdNote', { value: item.note }))
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
