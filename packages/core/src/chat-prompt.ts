import type { AgileWorkItemRef } from './agile-workitems.js'

export type PromptLang = 'zh' | 'en'

function normalizePromptLang(raw: unknown): PromptLang {
  if (typeof raw !== 'string') return 'zh'
  const s = raw.trim().toLowerCase()
  if (s === 'en' || s.startsWith('en-') || s.startsWith('en_')) return 'en'
  return 'zh'
}

/** Build the starter prompt that TraceScope drops into the session composer. */
export function buildChatAnalysisPrompt(input: {
  jobId: string
  repoPath: string
  baseCommit: string
  headCommit: string
  relatedWorkItems?: AgileWorkItemRef[]
  accessMode?: 'git' | 'codeup'
  lang?: PromptLang | string
}): string {
  const lang = normalizePromptLang(input.lang)
  const related = input.relatedWorkItems ?? []
  const relatedBlock =
    related.length === 0
      ? []
      : [
          '',
          lang === 'en'
            ? `Related work items (${related.length}):`
            : `关联工作项 ${related.length} 个：`,
          ...related.slice(0, 8).map((item, idx) => {
            const cat = item.category ? `[${item.category}] ` : ''
            return `${idx + 1}. ${cat}${item.subject}（id: ${item.id}）`
          }),
        ]

  if (lang === 'en') {
    return [
      'Please load the skill “tracescope-impact-analysis” and follow its workflow for this impact analysis, then write findings back to the sidebar with the tool.',
      '',
      `Job ID: ${input.jobId}`,
      `Repo: ${input.repoPath}`,
      `base: ${input.baseCommit}`,
      `head: ${input.headCommit}`,
      input.accessMode === 'codeup'
        ? 'Access mode: Codeup (prefer tracescope / Codeup tools for the diff)'
        : '',
      ...relatedBlock,
      '',
      'Write-back tool: tracescope_publish_handtest (jobId must match the context above).',
    ]
      .filter((l) => l !== '')
      .join('\n')
  }

  return [
    '请先加载 skill 「tracescope-impact-analysis」，按其流程完成本次功能影响分析，再用工具写回侧栏。',
    '',
    `任务 ID：${input.jobId}`,
    `仓库：${input.repoPath}`,
    `base：${input.baseCommit}`,
    `head：${input.headCommit}`,
    input.accessMode === 'codeup'
      ? '访问模式：Codeup（优先用 tracescope / Codeup 工具取 diff）'
      : '',
    ...relatedBlock,
    '',
    '写回工具：tracescope_publish_handtest（jobId 必须与上文一致）。',
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
  lang?: PromptLang | string
}

const SEVERITY_RANK_LABEL: Record<PromptLang, Record<'high' | 'medium' | 'low', string>> = {
  zh: { high: '高', medium: '中', low: '低' },
  en: { high: 'high', medium: 'med', low: 'low' },
}

function formatPromptValue(value: unknown, lang: PromptLang): string {
  if (value === undefined || value === null) return lang === 'en' ? '(empty)' : '（空）'
  if (typeof value === 'object') {
    const unresolved = value as { unresolved?: boolean; raw?: string }
    if (unresolved.unresolved) {
      return lang === 'en'
        ? `unresolved:${unresolved.raw}`
        : `未解析:${unresolved.raw}`
    }
  }
  return String(value)
}

/**
 * Build the starter prompt for a single high-fidelity page's AI assist.
 */
export function buildVisualChatPrompt(input: VisualChatPromptInput): string {
  const lang = normalizePromptLang(input.lang)
  const sevLabel = SEVERITY_RANK_LABEL[lang]
  const lines = input.diffs.map((d, i) => {
    const sev = sevLabel[d.severity]
    const expected = formatPromptValue(d.expected, lang)
    const actual = formatPromptValue(d.actual, lang)
    return lang === 'en'
      ? `${i + 1}. [${sev}] ${d.nodeName} · ${d.property}: expected ${expected} / actual ${actual}`
      : `${i + 1}. [${sev}] ${d.nodeName} · ${d.property}：期望 ${expected} / 实际 ${actual}`
  })
  const vp = input.viewport
  const viewportLine = vp
    ? lang === 'en'
      ? `\nViewport: ${vp.width} × ${vp.height}`
      : `\n视口：${vp.width} × ${vp.height}`
    : ''

  if (lang === 'en') {
    return [
      'Please help review the UI diffs for this page (high-fidelity compare results).',
      '',
      `Design page: ${input.designName}`,
      `Code: ${input.platformLabel ?? 'Android XML'} · ${input.codeRelativePath}`,
      viewportLine ? viewportLine.trim() : '',
      '',
      `Current diffs: ${input.diffs.length}`,
      lines.length ? lines.join('\n') : '(no diff items yet)',
      '',
      'Please reply with:',
      '1. Which items are real issues vs false positives from dynamic layout / device differences.',
      '2. For real issues, priority and concrete fixes (file / property / expected value).',
      '3. If information is missing, ask for the details we should supply so we can continue in this chat.',
    ]
      .filter((l) => l !== '')
      .join('\n')
  }

  return [
    '请协助分析下面这一页的 UI 走查差异（高保真对比结果）。',
    '',
    `设计页：${input.designName}`,
    `代码：${input.platformLabel ?? 'Android XML'} · ${input.codeRelativePath}`,
    viewportLine ? viewportLine.trim() : '',
    '',
    `当前差异共 ${input.diffs.length} 条：`,
    lines.length ? lines.join('\n') : '（暂无差异条目）',
    '',
    '请按下面要求回复：',
    '1. 先判断哪些是真问题、哪些可能是动态布局/设备差异导致的误报。',
    '2. 对真问题给出优先级与具体改法（文件 / 属性 / 期望值）。',
    '3. 若信息不足，先提出需要我补充的线索，我们可在本会话继续对齐。',
  ]
    .filter((l) => l !== '')
    .join('\n')
}

export type CodeVisualManifestMode = 'android-xml' | 'source-files'

/** Drop data: / non-http URLs so prompts never embed base64 image blobs. */
export function promptSafeImageUrl(url: string | undefined | null): string | undefined {
  if (url == null) return undefined
  const trimmed = String(url).trim()
  if (!trimmed) return undefined
  if (/^data:/i.test(trimmed)) return undefined
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return undefined
}

export interface CodeVisualPromptInput {
  designName: string
  figmaUrl: string
  /** http(s) only — never a data: URL. */
  designImageUrl?: string
  /**
   * True when a raster exists in the TraceScope panel (may be a data URL that
   * must not be pasted into the prompt).
   */
  designRasterInPanel?: boolean
  designSnapshot?: string
  staticDiffSummary?: string
  /** Dynamic/sparse code regions — call out uncertainty in findings. */
  dynamicRegionsCatalog?: string
  repoPath: string
  platformLabel?: string
  codeRelativePath: string
  dependencyManifest: string
  manifestMode?: CodeVisualManifestMode
  gitSummary?: string
  jobId?: string
  lang?: PromptLang | string
}

export function buildCodeVisualPrompt(input: CodeVisualPromptInput): string {
  const lang = normalizePromptLang(input.lang)
  const mode: CodeVisualManifestMode = input.manifestMode ?? 'android-xml'
  const manifestLabel =
    lang === 'en'
      ? mode === 'android-xml'
        ? 'Dependency list (read the real source files listed below):'
        : 'Entry and related files (read the real source files listed below):'
      : mode === 'android-xml'
        ? '依赖清单（请按清单阅读真实源码）：'
        : '入口与关联文件（请按清单阅读真实源码）：'

  const safeImage = promptSafeImageUrl(input.designImageUrl)
  const designImageLine = (() => {
    if (safeImage) {
      return lang === 'en'
        ? `Design render (http, openable): ${safeImage}`
        : `设计渲染图（http，可直接打开）：${safeImage}`
    }
    if (input.designRasterInPanel) {
      return lang === 'en'
        ? 'Design render: shown in the TraceScope sidebar compare board (do not paste base64 / data URLs into the prompt); call tracescope_get_design_snapshot for node structure / copy.'
        : '设计渲染图：已在 TraceScope 侧栏对照板展示（请勿将 base64 / data URL 贴进提示词）；需要节点结构/文案时调用 tracescope_get_design_snapshot。'
    }
    return lang === 'en'
      ? 'Design render: none yet; call tracescope_get_design_snapshot for node structure / copy.'
      : '设计渲染图：暂无；需要节点结构/文案时调用 tracescope_get_design_snapshot。'
  })()

  if (lang === 'en') {
    return [
      'Please load the skill “tracescope-ui-review” and follow its workflow for this page UI review, then write findings back to the sidebar with the tool.',
      'Do not visit figma.com or call the Figma REST API.',
      'Do not embed data:image / base64 images in replies or tool arguments.',
      '',
      input.jobId ? `Job ID: ${input.jobId}` : '',
      `Design page: ${input.designName}`,
      `Repo: ${input.repoPath}`,
      `Stack: ${input.platformLabel ?? 'Android XML'}`,
      `Entry file: ${input.codeRelativePath}`,
      designImageLine,
      input.staticDiffSummary
        ? `Static diff summary (hints only):\n${input.staticDiffSummary}`
        : '',
      input.dynamicRegionsCatalog
        ? `Dynamic code regions (runtime data uncertain — mark this in findings and state the design expectation):\n${input.dynamicRegionsCatalog}`
        : '',
      input.gitSummary ? `Git context:\n${input.gitSummary}` : '',
      '',
      manifestLabel,
      input.dependencyManifest,
      '',
      'When you need the design tree / node details: tracescope_get_design_snapshot (pass the jobId above).',
      'When calling tracescope_publish_visual_findings: nodeId must be a real id from the design snapshot or static diff summary (e.g. 12:345); leave empty and describe location/expected copy if unknown — never invent ids.',
      'Write-back tool: tracescope_publish_visual_findings (jobId must match the context above); prefer the findings list (no pixel-level UI restore preview).',
    ]
      .filter((l) => l !== '')
      .join('\n')
  }

  return [
    '请先加载 skill 「tracescope-ui-review」，按其流程完成本页 UI 走查，再用工具写回侧栏。',
    '不要访问 figma.com，也不要调用 Figma REST API。',
    '不要在回复或工具参数里嵌入 data:image / base64 图片。',
    '',
    input.jobId ? `任务 ID：${input.jobId}` : '',
    `设计页：${input.designName}`,
    `仓库：${input.repoPath}`,
    `技术栈：${input.platformLabel ?? 'Android XML'}`,
    `入口文件：${input.codeRelativePath}`,
    designImageLine,
    input.staticDiffSummary
      ? `静态差异摘要（仅作线索）：\n${input.staticDiffSummary}`
      : '',
    input.dynamicRegionsCatalog
      ? `代码侧动态区域（运行时数据不确定，请在 findings 中标明并给出设计稿期望）：\n${input.dynamicRegionsCatalog}`
      : '',
    input.gitSummary ? `Git 上下文：\n${input.gitSummary}` : '',
    '',
    manifestLabel,
    input.dependencyManifest,
    '',
    '需要设计树/节点细节时：tracescope_get_design_snapshot（传上文 jobId）。',
    '写回 tracescope_publish_visual_findings 时：nodeId 必须是设计快照或静态差异摘要里的真实 id（如 12:345）；不知道则留空并写清 location/期望文案，禁止捏造 id。',
    '写回工具：tracescope_publish_visual_findings（jobId 必须与上文一致），以差异清单为主（不做像素级 UI 还原预览）。',
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
  lang?: PromptLang | string
}

/**
 * Starter prompt for file rematch.
 * Publish picks via tracescope_publish_page_rematch; chat may refine and re-publish.
 */
export function buildPageRematchPrompt(input: PageRematchPromptInput): string {
  const lang = normalizePromptLang(input.lang)
  const texts =
    input.sampleTexts.length > 0
      ? input.sampleTexts.map((t, i) => `${i + 1}. ${t}`).join('\n')
      : lang === 'en'
        ? '(Almost no readable copy; rely mainly on page name and candidate paths)'
        : '（几乎没有可读文案；主要依据页面名与候选路径）'

  const catalog =
    input.candidates.length > 0
      ? input.candidates
          .map((c, i) => {
            const reasons = c.reasons.length
              ? lang === 'en'
                ? `; ${c.reasons.join(', ')}`
                : `；${c.reasons.join('、')}`
              : ''
            return `${i + 1}. [${c.kindLabel}] ${c.relativePath} (${Math.round(c.score * 100)}%, ${c.adapterId})${reasons}`
          })
          .join('\n')
      : lang === 'en'
        ? '(No static candidates; please search the repo)'
        : '（无静态候选；请在仓库中搜索）'

  const current = input.currentSelection
    ? lang === 'en'
      ? `Current selection: ${input.currentSelection.relativePath} (${input.currentSelection.adapterId})`
      : `当前已选：${input.currentSelection.relativePath} (${input.currentSelection.adapterId})`
    : lang === 'en'
      ? 'No code file selected yet'
      : '当前未选定代码文件'

  if (lang === 'en') {
    return [
      'Please load the skill “tracescope-page-match” and follow its workflow to recommend files and write them back to the sidebar.',
      'Do not visit figma.com or call the Figma REST API.',
      '',
      input.jobId ? `Job ID: ${input.jobId}` : '',
      `Design page: ${input.designName}`,
      `node-id: ${input.designId}`,
      `Repo: ${input.repoPath}`,
      current,
      '',
      'Design copy samples:',
      texts,
      '',
      'Static candidates (hints only):',
      catalog,
      '',
      'Write-back tool: tracescope_publish_page_rematch (jobId must match the context above).',
    ]
      .filter((l) => l !== '')
      .join('\n')
  }

  return [
    '请先加载 skill 「tracescope-page-match」，按其流程推荐文件并写回侧栏。',
    '不要访问 figma.com，也不要调用 Figma REST API。',
    '',
    input.jobId ? `任务 ID：${input.jobId}` : '',
    `设计页：${input.designName}`,
    `node-id：${input.designId}`,
    `仓库：${input.repoPath}`,
    current,
    '',
    '设计文案样本：',
    texts,
    '',
    '静态候选（仅作线索）：',
    catalog,
    '',
    '写回工具：tracescope_publish_page_rematch（jobId 必须与上文一致）。',
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
    designNodeId?: string
    nodeName?: string
    property?: string
    severity?: string
    expected?: unknown
    actual?: unknown
  }>,
  options: { max?: number; lang?: PromptLang | string } = {},
): string {
  const max = options.max ?? 40
  const lang = normalizePromptLang(options.lang)
  if (!diffs.length) return lang === 'en' ? '(no diffs)' : '（无差异）'
  const sevLabel = SEVERITY_RANK_LABEL[lang]
  return diffs
    .slice(0, max)
    .map((d, i) => {
      const sevKey =
        d.severity === 'high' || d.severity === 'medium' || d.severity === 'low'
          ? d.severity
          : 'low'
      const sev = sevLabel[sevKey]
      const id = d.designNodeId ? ` id=${d.designNodeId}` : ''
      const expected = formatPromptValue(d.expected, lang)
      const actual = formatPromptValue(d.actual, lang)
      return lang === 'en'
        ? `${i + 1}. [${sev}] ${d.nodeName || '?'}${id} · ${d.property || '?'}: expected ${expected} / actual ${actual}`
        : `${i + 1}. [${sev}] ${d.nodeName || '?'}${id} · ${d.property || '?'}：期望 ${expected} / 实际 ${actual}`
    })
    .join('\n')
}
