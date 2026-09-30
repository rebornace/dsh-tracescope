import type { AgileWorkItemRef } from './agile-workitems.js'

/** Build the Chinese starter prompt that TraceScope drops into the session composer. */
export function buildChatAnalysisPrompt(input: {
  jobId: string
  repoPath: string
  baseCommit: string
  headCommit: string
  relatedWorkItems?: AgileWorkItemRef[]
  accessMode?: 'git' | 'codeup'
}): string {
  const related = input.relatedWorkItems ?? []
  const relatedBlock =
    related.length === 0
      ? []
      : [
          '',
          `\u5173\u8054\u5DE5\u4F5C\u9879 ${related.length} \u4E2A\uFF1A`,
          ...related.slice(0, 8).map((item, idx) => {
            const cat = item.category ? `[${item.category}] ` : ''
            return `${idx + 1}. ${cat}${item.subject}\uff08id: ${item.id}\uff09`
          }),
        ]

  return [
    '\u8BF7\u5148\u52A0\u8F7D skill \u300Ctracescope-impact-analysis\u300D\uFF0C\u6309\u5176\u6D41\u7A0B\u5B8C\u6210\u672C\u6B21\u529F\u80FD\u5F71\u54CD\u5206\u6790\uFF0C\u518D\u7528\u5DE5\u5177\u5199\u56DE\u4FA7\u680F\u3002',
    '',
    `\u4EFB\u52A1 ID\uFF1A${input.jobId}`,
    `\u4ED3\u5E93\uFF1A${input.repoPath}`,
    `base\uFF1A${input.baseCommit}`,
    `head\uFF1A${input.headCommit}`,
    input.accessMode === 'codeup'
      ? '\u8BBF\u95EE\u6A21\u5F0F\uFF1ACodeup\uFF08\u4F18\u5148\u7528 tracescope / Codeup \u5DE5\u5177\u53D6 diff\uFF09'
      : '',
    ...relatedBlock,
    '',
    '\u5199\u56DE\u5DE5\u5177\uFF1Atracescope_publish_handtest\uFF08jobId \u5FC5\u987B\u4E0E\u4E0A\u6587\u4E00\u81F4\uFF09\u3002',
  ]
    .filter((l) => l !== '')
    .join('\n')
}

/** One high-fidelity visual difference, as rendered in the compare board. */
export interface VisualChatDiff {
  nodeName: string
  property: string
  severity: 'high' | 'medium' | 'low'
  expected?: unknown
  actual?: unknown
}

export interface VisualChatPromptInput {
  designName: string
  codeRelativePath: string
  platformLabel?: string
  viewport?: { width: number; height: number }
  diffs: VisualChatDiff[]
}

const SEVERITY_RANK_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: '\u9AD8',
  medium: '\u4E2D',
  low: '\u4F4E',
}

function formatPromptValue(value: unknown): string {
  if (value === undefined || value === null) return '\uFF08\u7A7A\uFF09'
  if (typeof value === 'object') {
    const unresolved = value as { unresolved?: boolean; raw?: string }
    if (unresolved.unresolved) return `\u672A\u89E3\u6790:${unresolved.raw}`
  }
  return String(value)
}

/**
 * Build the starter prompt for a single high-fidelity page's AI assist.
 */
export function buildVisualChatPrompt(input: VisualChatPromptInput): string {
  const lines = input.diffs.map((d, i) => {
    const sev = SEVERITY_RANK_LABEL[d.severity]
    return `${i + 1}. [${sev}] ${d.nodeName} \u00b7 ${d.property}\uff1a\u671F\u671B ${formatPromptValue(
      d.expected,
    )} / \u5B9E\u9645 ${formatPromptValue(d.actual)}`
  })
  const vp = input.viewport
  const viewportLine = vp ? `\n\u89C6\u53E3\uFF1A${vp.width} \u00d7 ${vp.height}` : ''
  return [
    '\u8BF7\u534F\u52A9\u5206\u6790\u4E0B\u9762\u8FD9\u4E00\u9875\u7684 UI \u8D70\u67E5\u5DEE\u5F02\uff08\u9AD8\u4FDD\u771F\u5BF9\u6BD4\u7ED3\u679C\uff09\u3002',
    '',
    `\u8BBE\u8BA1\u9875\uFF1A${input.designName}`,
    `\u4EE3\u7801\uFF1A${input.platformLabel ?? 'Android XML'} \u00b7 ${input.codeRelativePath}`,
    viewportLine ? viewportLine.trim() : '',
    '',
    `\u5F53\u524D\u5DEE\u5F02\u5171 ${input.diffs.length} \u6761\uFF1A`,
    lines.length ? lines.join('\n') : '\uFF08\u6682\u65E0\u5DEE\u5F02\u6761\u76EE\uFF09',
    '',
    '\u8BF7\u6309\u4E0B\u9762\u8981\u6C42\u56DE\u590D\uFF1A',
    '1. \u5148\u5224\u65AD\u54EA\u4E9B\u662F\u771F\u95EE\u9898\u3001\u54EA\u4E9B\u53EF\u80FD\u662F\u52A8\u6001\u5E03\u5C40/\u8BBE\u5907\u5DEE\u5F02\u5BFC\u81F4\u7684\u8BEF\u62A5\u3002',
    '2. \u5BF9\u771F\u95EE\u9898\u7ED9\u51FA\u4F18\u5148\u7EA7\u4E0E\u5177\u4F53\u6539\u6CD5\uff08\u6587\u4EF6 / \u5C5E\u6027 / \u671F\u671B\u503C\uff09\u3002',
    '3. \u82E5\u4FE1\u606F\u4E0D\u8DB3\uFF0C\u5148\u63D0\u51FA\u9700\u8981\u6211\u8865\u5145\u7684\u7EBF\u7D22\uFF0C\u6211\u4EEC\u53EF\u5728\u672C\u4F1A\u8BDD\u7EE7\u7EED\u5BF9\u9F50\u3002',
  ]
    .filter((l) => l !== '')
    .join('\n')
}

export type CodeVisualManifestMode = 'android-xml' | 'source-files'

export interface CodeVisualPromptInput {
  designName: string
  figmaUrl: string
  designImageUrl?: string
  designSnapshot?: string
  staticDiffSummary?: string
  repoPath: string
  platformLabel?: string
  codeRelativePath: string
  dependencyManifest: string
  manifestMode?: CodeVisualManifestMode
  gitSummary?: string
  jobId?: string
}

export function buildCodeVisualPrompt(input: CodeVisualPromptInput): string {
  const mode: CodeVisualManifestMode = input.manifestMode ?? 'android-xml'
  const manifestLabel =
    mode === 'android-xml'
      ? '\u4F9D\u8D56\u6E05\u5355\uff08\u8BF7\u6309\u6E05\u5355\u9605\u8BFB\u771F\u5B9E\u6E90\u7801\uff09\uFF1A'
      : '\u5165\u53E3\u4E0E\u5173\u8054\u6587\u4EF6\uff08\u8BF7\u6309\u6E05\u5355\u9605\u8BFB\u771F\u5B9E\u6E90\u7801\uff09\uFF1A'

  return [
    '\u8BF7\u5148\u52A0\u8F7D skill \u300Ctracescope-ui-review\u300D\uFF0C\u6309\u5176\u6D41\u7A0B\u5B8C\u6210\u672C\u9875 UI \u8D70\u67E5\uFF0C\u518D\u7528\u5DE5\u5177\u5199\u56DE\u4FA7\u680F\u3002',
    '\u4E0D\u8981\u8BBF\u95EE figma.com\uFF0C\u4E5F\u4E0D\u8981\u8C03\u7528 Figma REST API\u3002',
    '',
    input.jobId ? `\u4EFB\u52A1 ID\uFF1A${input.jobId}` : '',
    `\u8BBE\u8BA1\u9875\uFF1A${input.designName}`,
    `\u4ED3\u5E93\uFF1A${input.repoPath}`,
    `\u6280\u672F\u6808\uFF1A${input.platformLabel ?? 'Android XML'}`,
    `\u5165\u53E3\u6587\u4EF6\uFF1A${input.codeRelativePath}`,
    input.designImageUrl
      ? `\u8BBE\u8BA1\u6E32\u67D3\u56FE\uff08\u591A\u6A21\u6001\u53EF\u76F4\u63A5\u67E5\u770B\uff09\uFF1A${input.designImageUrl}`
      : '\u8BBE\u8BA1\u6E32\u67D3\u56FE\uFF1A\u6682\u65E0\uFF1B\u9700\u8981\u8282\u70B9\u7ED3\u6784/\u6587\u6848\u65F6\u8C03\u7528 tracescope_get_design_snapshot\u3002',
    input.staticDiffSummary
      ? `\u9759\u6001\u5DEE\u5F02\u6458\u8981\uff08\u4EC5\u4F5C\u7EBF\u7D22\uff09\uFF1A\n${input.staticDiffSummary}`
      : '',
    input.gitSummary ? `Git \u4E0A\u4E0B\u6587\uFF1A\n${input.gitSummary}` : '',
    '',
    manifestLabel,
    input.dependencyManifest,
    '',
    '\u9700\u8981\u8BBE\u8BA1\u6811/\u8282\u70B9\u7EC6\u8282\u65F6\uFF1Atracescope_get_design_snapshot\uff08\u4F20\u4E0A\u6587 jobId\uff09\u3002',
    '\u5199\u56DE\u5DE5\u5177\uFF1Atracescope_publish_visual_findings\uFF08jobId \u5FC5\u987B\u4E0E\u4E0A\u6587\u4E00\u81F4\uFF09\u3002',
  ]
    .filter((l) => l !== '')
    .join('\n')
}


export interface PageRematchCandidate {
  adapterId: string
  kindLabel: string
  relativePath: string
  score: number
  reasons: string[]
  codeTexts?: string[]
}

export interface PageRematchPromptInput {
  designName: string
  designId: string
  figmaUrl: string
  repoPath: string
  sampleTexts: string[]
  candidates: PageRematchCandidate[]
  currentSelection?: { adapterId: string; relativePath: string }
  jobId?: string
}

/**
 * Starter prompt for file rematch.
 * Publish picks via tracescope_publish_page_rematch; chat may refine and re-publish.
 */
export function buildPageRematchPrompt(input: PageRematchPromptInput): string {
  const texts =
    input.sampleTexts.length > 0
      ? input.sampleTexts.map((t, i) => `${i + 1}. ${t}`).join('\n')
      : '\uFF08\u51E0\u4E4E\u6CA1\u6709\u53EF\u8BFB\u6587\u6848\uFF1B\u4E3B\u8981\u4F9D\u636E\u9875\u9762\u540D\u4E0E\u5019\u9009\u8DEF\u5F84\uFF09'

  const catalog =
    input.candidates.length > 0
      ? input.candidates
          .map((c, i) => {
            const reasons = c.reasons.length ? `\uFF1B${c.reasons.join('\u3001')}` : ''
            return `${i + 1}. [${c.kindLabel}] ${c.relativePath} (${Math.round(c.score * 100)}%, ${c.adapterId})${reasons}`
          })
          .join('\n')
      : '\uFF08\u65E0\u9759\u6001\u5019\u9009\uFF1B\u8BF7\u5728\u4ED3\u5E93\u4E2D\u641C\u7D22\uFF09'

  const current = input.currentSelection
    ? `\u5F53\u524D\u5DF2\u9009\uFF1A${input.currentSelection.relativePath} (${input.currentSelection.adapterId})`
    : '\u5F53\u524D\u672A\u9009\u5B9A\u4EE3\u7801\u6587\u4EF6'

  return [
    '\u8BF7\u5148\u52A0\u8F7D skill \u300Ctracescope-page-match\u300D\uFF0C\u6309\u5176\u6D41\u7A0B\u63A8\u8350\u6587\u4EF6\u5E76\u5199\u56DE\u4FA7\u680F\u3002',
    '\u4E0D\u8981\u8BBF\u95EE figma.com\uFF0C\u4E5F\u4E0D\u8981\u8C03\u7528 Figma REST API\u3002',
    '',
    input.jobId ? `\u4EFB\u52A1 ID\uFF1A${input.jobId}` : '',
    `\u8BBE\u8BA1\u9875\uFF1A${input.designName}`,
    `node-id\uFF1A${input.designId}`,
    `\u4ED3\u5E93\uFF1A${input.repoPath}`,
    current,
    '',
    '\u8BBE\u8BA1\u6587\u6848\u6837\u672C\uFF1A',
    texts,
    '',
    '\u9759\u6001\u5019\u9009\uff08\u4EC5\u4F5C\u7EBF\u7D22\uff09\uFF1A',
    catalog,
    '',
    '\u5199\u56DE\u5DE5\u5177\uFF1Atracescope_publish_page_rematch\uFF08jobId \u5FC5\u987B\u4E0E\u4E0A\u6587\u4E00\u81F4\uFF09\u3002',
  ]
    .filter((l) => l !== '')
    .join('\n')
}

export function formatDesignSnapshot(
  root: {
    id: string
    name: string
    kind: string
    text?: string
    box: { x?: number; y?: number; width?: number; height?: number }
    style: Record<string, unknown>
    children: Array<unknown>
  },
  options: { maxNodes?: number } = {},
): string {
  const maxNodes = options.maxNodes ?? 80
  const lines: string[] = []
  let count = 0

  const walk = (
    node: {
      id: string
      name: string
      kind: string
      text?: string
      box: { x?: number; y?: number; width?: number; height?: number }
      style: Record<string, unknown>
      children: Array<unknown>
    },
    depth: number,
  ) => {
    if (count >= maxNodes) return
    count += 1
    const indent = '  '.repeat(Math.min(depth, 6))
    const box = node.box || {}
    const size =
      typeof box.width === 'number' || typeof box.height === 'number'
        ? ` ${Math.round(Number(box.width) || 0)}x${Math.round(Number(box.height) || 0)}`
        : ''
    const text = node.text ? ` "${String(node.text).slice(0, 40)}"` : ''
    const styleBits: string[] = []
    const s = node.style || {}
    if (s.fontSize != null) styleBits.push(`fs=${s.fontSize}`)
    if (s.fontWeight != null) styleBits.push(`fw=${s.fontWeight}`)
    if (s.color != null) styleBits.push(`color=${s.color}`)
    if (s.backgroundColor != null) styleBits.push(`bg=${s.backgroundColor}`)
    if (s.cornerRadius != null) styleBits.push(`r=${s.cornerRadius}`)
    const style = styleBits.length ? ` {${styleBits.join(', ')}}` : ''
    lines.push(
      `${indent}- [${node.id}] ${node.kind} ${node.name || ''}${text}${size}${style}`.trimEnd(),
    )
    for (const child of node.children || []) {
      walk(child as typeof node, depth + 1)
    }
  }

  walk(root, 0)
  if (count >= maxNodes) {
    lines.push(`...(truncated to first ${maxNodes} nodes)`)
  }
  return lines.join('\n')
}

export function formatStaticDiffSummary(
  diffs: Array<{
    nodeName?: string
    property?: string
    severity?: string
    expected?: unknown
    actual?: unknown
  }>,
  options: { max?: number } = {},
): string {
  const max = options.max ?? 40
  if (!diffs.length) return '\uFF08\u65E0\u5DEE\u5F02\uFF09'
  return diffs
    .slice(0, max)
    .map((d, i) => {
      const sev =
        d.severity === 'high' ? '\u9AD8' : d.severity === 'medium' ? '\u4E2D' : '\u4F4E'
      return `${i + 1}. [${sev}] ${d.nodeName || '?'} \u00b7 ${d.property || '?'}\uff1a\u671F\u671B ${formatPromptValue(d.expected)} / \u5B9E\u9645 ${formatPromptValue(d.actual)}`
    })
    .join('\n')
}
