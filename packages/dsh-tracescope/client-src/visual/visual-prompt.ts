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
    '2. 对列表、分页、WebView 等运行时动态区域，在差异项中标明不确定性，并给出设计稿期望内容（不必做可视化还原）。',
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
  cornerRadii: '四角圆角',
  borderWidth: '边框粗细',
  borderColor: '边框颜色',
  borderTopWidth: '上边框宽',
  borderRightWidth: '右边框宽',
  borderBottomWidth: '下边框宽',
  borderLeftWidth: '左边框宽',
  borderTopColor: '上边框色',
  borderRightColor: '右边框色',
  borderBottomColor: '下边框色',
  borderLeftColor: '左边框色',
  fontWeight: '字重',
  opacity: '透明度',
  elevation: '阴影/海拔',
  shadow: '外阴影',
  innerShadow: '内阴影',
  insetShadow: '内阴影参数',
  shadows: '阴影叠层',
  blur: '模糊',
  blendMode: '混合模式',
  rotation: '旋转',
  scaleX: '缩放X',
  scaleY: '缩放Y',
  skewX: '倾斜X',
  skewY: '倾斜Y',
  zIndex: '层叠顺序',
  fills: '填充叠层',
  strokeAlign: '描边对齐',
  textAlign: '对齐',
  textDecoration: '文字装饰',
  textTransform: '文字大小写',
  overflow: '溢出裁剪',
  clipPath: '裁剪路径',
  aspectRatio: '宽高比',
  maxLines: '最大行数',
  textOverflow: '文本溢出',
  minWidth: '最小宽度',
  maxWidth: '最大宽度',
  minHeight: '最小高度',
  maxHeight: '最大高度',
  textAdvanceWidth: '文本固有宽',
  textBlockHeight: '文本块高',
  flexDirection: '主轴方向',
  alignItems: '交叉轴对齐',
  justifyContent: '主轴分布',
  fontStyle: '字体样式',
  textAlignVertical: '垂直对齐',
  borderStyle: '描边样式',
  strokeDashArray: '虚线间隔',
  strokeCap: '线帽',
  strokeJoin: '线连接',
  paragraphSpacing: '段间距',
  sizingHorizontal: '横向尺寸模式',
  sizingVertical: '纵向尺寸模式',
  backdropBlur: '背景模糊',
  position: '定位',
  rowGap: '行间距',
  columnGap: '列间距',
  flexWrap: '换行',
  alignContent: '多行对齐',
  order: '排列顺序',
  gridTemplate: '网格轨道',
  alignSelf: '自身对齐',
  flexGrow: '弹性放大',
  flexShrink: '弹性缩小',
  transformOrigin: '变换原点',
  visibility: '可见性',
  display: '显示',
  whiteSpace: '空白处理',
  wordBreak: '断词',
  wordSpacing: '词间距',
  textIndent: '首行缩进',
  perspective: '透视',
  rotateX: 'X轴旋转',
  rotateY: 'Y轴旋转',
  textShadow: '文字阴影',
  direction: '书写方向',
  writingMode: '书写模式',
  filter: '滤镜',
  outline: '轮廓',
  imageFit: '图片适配',
  imagePosition: '图片锚点',
  gradient: '渐变',
  text: '文案',
  controlCount: '控件数量',
}
