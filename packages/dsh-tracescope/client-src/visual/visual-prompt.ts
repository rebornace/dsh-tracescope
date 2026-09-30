/**
 * Client-side builder for the "ask AI about this page" prompt.
 *
 * The board already holds the page's deterministic diffs, so we format the
 * starter prompt here rather than depending on a field returned by the
 * hifi-compare route. This keeps the feature working even when the rendered
 * board came from an earlier compare that lacked that field.
 */
import type { DiffBox } from './HifiScreen.js'

export interface VisualPromptMeta {
  designName: string
  codeRelativePath: string
  platformLabel?: string
  viewport?: { width: number; height: number }
}

const SEVERITY_LABEL: Record<DiffBox['severity'], string> = {
  high: '高',
  medium: '中',
  low: '低',
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '（缺失）'
  if (typeof value === 'object') {
    const u = value as { unresolved?: boolean; raw?: string }
    if (u.unresolved) return `待确认：${u.raw ?? ''}`
  }
  return String(value)
}

export function buildVisualPrompt(meta: VisualPromptMeta, diffs: DiffBox[]): string {
  const lines = diffs.map((d, i) => {
    const label = PROP_LABEL[d.property] ?? d.property
    return (
      `${i + 1}. [${SEVERITY_LABEL[d.severity]}] ${d.nodeName} · ${label}：` +
      `设计稿 ${formatValue(d.expected)} / 当前渲染 ${formatValue(d.actual)}` +
      (d.needsReview ? '（静态无法确定，需确认）' : '')
    )
  })
  const vp = meta.viewport
  const viewportLine = vp ? `画板尺寸：${vp.width} × ${vp.height}` : ''
  return [
    '我正在做这个页面的 UI 走查：以设计稿为唯一准绳，对照代码实现在布局、尺寸、颜色、字体、间距上的差异。请协助我把实现改到贴近设计稿。',
    '',
    `设计稿页面：${meta.designName}`,
    `代码实现（${meta.platformLabel ?? 'Android XML'}）：${meta.codeRelativePath}`,
    viewportLine,
    '',
    `当前静态对比与设计稿仍有 ${diffs.length} 处不一致（供定位实现偏差，重点是据此改代码，而非仅解读差异）：`,
    lines.length ? lines.join('\n') : '（确定性对比未发现明显差异）',
    '',
    '请按正常对话方式协助我完成走查修复：',
    '1. 以设计稿为唯一准绳，针对上述不一致逐项给出如何改代码贴近设计稿的具体做法（尺寸 / 位置 / 间距 / 颜色 / 字号等）。',
    '2. 对列表、分页、WebView 等运行时动态区域，静态分析无法确定其真实内容，请结合设计稿推断应呈现的内容与摆放。',
    '3. 区分哪些是可直接修正的实现问题，哪些受运行时数据或字体回退影响、需要我确认；有疑问随时问我，我们连续完善。',
  ]
    .filter((l) => l !== '')
    .join('\n')
}

// Property Chinese labels, shared wording with the board list.
const PROP_LABEL: Record<string, string> = {
  width: '宽度',
  height: '高度',
  marginTop: '上间距',
  marginBottom: '下间距',
  marginLeft: '左间距',
  marginRight: '右间距',
  paddingTop: '上内边距',
  paddingBottom: '下内边距',
  paddingLeft: '左内边距',
  paddingRight: '右内边距',
  backgroundColor: '背景色',
  color: '文字颜色',
  fontSize: '字号',
  cornerRadius: '圆角',
  borderWidth: '边框粗细',
  borderColor: '边框颜色',
  fontWeight: '字重',
  opacity: '透明度',
  text: '文案',
  controlCount: '控件数量',
}
