/**
 * Standalone panel i18n (no Host locale service).
 * Language: ?lang= / localStorage / navigator / Accept-Language via <html lang>.
 */
const DICT = {
  zh: {
    'doc.title': 'TraceScope 验证助手',
    'header.title': '验证助手',
    'header.sub': '选仓库、选两个版本，一键生成需要验证的功能清单。不用敲命令。',
    'status.connecting': '连接中…',
    'status.ready': '面板已就绪',
    'status.error': '服务异常',
    'status.offline': '无法连接本地服务',
    's1.title': '1. 选择要对比的版本',
    's1.repo': '项目文件夹路径（git 仓库）',
    's1.load': '加载版本列表',
    's1.repoHint': '向同事要「项目在电脑上的文件夹路径」，粘贴到这里即可。',
    's1.base': '稳定版本（对照用）',
    's1.head': '待测版本（这次要验的）',
    's1.loadFirst': '先加载版本列表',
    's1.advanced': '高级选项（一般不用改）',
    's1.modules': '模块映射文件（可选）',
    's1.export': '导出目录（可选）',
    's1.ripple': '波及层级',
    's1.analyze': '生成验证清单',
    's2.title': '2. 验证清单',
    's2.md': '下载 Markdown',
    's2.csv': '下载 CSV',
    's2.save': '保存到导出目录',
    's2.direct': '直接项',
    's2.ripple': '可能波及',
    's2.hint': '点选「通过 / 失败 / 跳过」记录验证结果。证据可展开查看，给开发看也不怕。',
    's3.title': '3. UI 走查：设计稿 ↔ 代码',
    's3.meta':
      '从 Figma 拉取设计标注，和 Android XML / iOS xib 里的实现做规则对比，自动列出尺寸、间距、颜色、字号等差异。无需把 App 跑起来，也不依赖 AI。',
    's3.figmaUrl': 'Figma 画板链接',
    's3.codePath': '代码布局文件路径',
    's3.codeHint': '代码文件支持 Android 布局 XML（自动发现 dimens/colors）与 iOS .xib/.storyboard。',
    's3.compare': '开始 UI 对比',
    'ph.repo': '例如 C:\\work\\my-app',
    'ph.modules': 'tracescope.modules.yml 路径',
    'ph.export': '例如 C:\\tmp\\tracescope-out',
    'ph.code': '例如 ...\\res\\layout\\activity_detail.xml',
    'err.noCommits': '没有读到提交',
    'err.needRepo': '请先填写项目文件夹路径',
    'err.loadFailed': '加载失败',
    'err.needVersions': '请完整选择项目路径和两个版本',
    'err.analyzeFailed': '分析失败',
    'err.needExport': '请先在高级选项里填写导出目录',
    'err.saveFailed': '保存失败',
    'err.emptyClass': '这一类暂时没有条目。',
    'err.needVisual': '请填写 Figma 链接、Token 和代码文件路径',
    'err.visualFailed': 'UI 对比失败',
    'item.risk': '风险',
    'item.direct': '直接项',
    'item.ripple': '可能波及',
    'item.pass': '通过',
    'item.fail': '失败',
    'item.skip': '跳过',
    'item.reset': '重置',
    'item.evidence': '查看证据（文件 / 原因）',
    'meta.compare': '对照 {base} → 待测 {head} · 变更文件 {files} · 生成于 {at}',
    'saved': '已保存：\n{files}',
    'prop.width': '宽度',
    'prop.height': '高度',
    'prop.marginTop': '上外边距',
    'prop.marginRight': '右外边距',
    'prop.marginBottom': '下外边距',
    'prop.marginLeft': '左外边距',
    'prop.paddingTop': '上内边距',
    'prop.paddingRight': '右内边距',
    'prop.paddingBottom': '下内边距',
    'prop.paddingLeft': '左内边距',
    'prop.backgroundColor': '背景色',
    'prop.borderWidth': '边框宽',
    'prop.borderColor': '边框色',
    'prop.cornerRadius': '圆角',
    'prop.opacity': '不透明度',
    'prop.fontFamily': '字体',
    'prop.fontSize': '字号',
    'prop.fontWeight': '字重',
    'prop.lineHeight': '行高',
    'prop.letterSpacing': '字间距',
    'prop.color': '文字色',
    'visual.unresolved': '无法静态解析',
    'visual.pending': '待确认：{raw}',
    'visual.missing': '缺失',
    'visual.review': '需确认',
    'visual.diffCount': '{n} 项差异',
    'visual.designOnly': '仅设计稿',
    'visual.codeOnly': '仅代码',
    'visual.unmatched': '未匹配元素（{n}）',
    'visual.noDiff': '没有发现差异。',
    'visual.meta':
      '{kind} · 对比节点对 {pairs} · 差异 {diffs}（高 {high} / 中 {medium} / 低 {low}）· 未匹配 {unmatched} · 资源 dimen {dimens} / color {colors}',
  },
  en: {
    'doc.title': 'TraceScope Verification Assistant',
    'header.title': 'Verification Assistant',
    'header.sub': 'Pick a repo and two versions to generate a verification checklist — no CLI needed.',
    'status.connecting': 'Connecting…',
    'status.ready': 'Panel ready',
    'status.error': 'Service error',
    'status.offline': 'Cannot reach local service',
    's1.title': '1. Choose versions to compare',
    's1.repo': 'Project folder path (git repo)',
    's1.load': 'Load versions',
    's1.repoHint': 'Ask a teammate for the project folder path on disk and paste it here.',
    's1.base': 'Stable version (baseline)',
    's1.head': 'Version under test',
    's1.loadFirst': 'Load versions first',
    's1.advanced': 'Advanced (usually leave as-is)',
    's1.modules': 'Module map file (optional)',
    's1.export': 'Export directory (optional)',
    's1.ripple': 'Ripple depth',
    's1.analyze': 'Generate checklist',
    's2.title': '2. Verification checklist',
    's2.md': 'Download Markdown',
    's2.csv': 'Download CSV',
    's2.save': 'Save to export directory',
    's2.direct': 'Direct',
    's2.ripple': 'Possible ripple',
    's2.hint': 'Mark Pass / Fail / Skip to record results. Expand evidence when sharing with developers.',
    's3.title': '3. UI review: design ↔ code',
    's3.meta':
      'Pull Figma specs and rule-compare against Android XML / iOS xib — sizes, spacing, colors, type. No running app, no AI required.',
    's3.figmaUrl': 'Figma frame URL',
    's3.codePath': 'Code layout file path',
    's3.codeHint': 'Supports Android layout XML (auto dimens/colors) and iOS .xib/.storyboard.',
    's3.compare': 'Start UI compare',
    'ph.repo': 'e.g. C:\\work\\my-app',
    'ph.modules': 'path to tracescope.modules.yml',
    'ph.export': 'e.g. C:\\tmp\\tracescope-out',
    'ph.code': 'e.g. ...\\res\\layout\\activity_detail.xml',
    'err.noCommits': 'No commits found',
    'err.needRepo': 'Enter the project folder path first',
    'err.loadFailed': 'Load failed',
    'err.needVersions': 'Select project path and both versions',
    'err.analyzeFailed': 'Analysis failed',
    'err.needExport': 'Set an export directory in Advanced options first',
    'err.saveFailed': 'Save failed',
    'err.emptyClass': 'No items in this category yet.',
    'err.needVisual': 'Fill in Figma URL, token, and code file path',
    'err.visualFailed': 'UI compare failed',
    'item.risk': 'Risk',
    'item.direct': 'Direct',
    'item.ripple': 'Possible ripple',
    'item.pass': 'Pass',
    'item.fail': 'Fail',
    'item.skip': 'Skip',
    'item.reset': 'Reset',
    'item.evidence': 'View evidence (files / reasons)',
    'meta.compare': 'Baseline {base} → under test {head} · {files} changed files · generated {at}',
    'saved': 'Saved:\n{files}',
    'prop.width': 'Width',
    'prop.height': 'Height',
    'prop.marginTop': 'Margin top',
    'prop.marginRight': 'Margin right',
    'prop.marginBottom': 'Margin bottom',
    'prop.marginLeft': 'Margin left',
    'prop.paddingTop': 'Padding top',
    'prop.paddingRight': 'Padding right',
    'prop.paddingBottom': 'Padding bottom',
    'prop.paddingLeft': 'Padding left',
    'prop.backgroundColor': 'Background',
    'prop.borderWidth': 'Border width',
    'prop.borderColor': 'Border color',
    'prop.cornerRadius': 'Radius',
    'prop.opacity': 'Opacity',
    'prop.fontFamily': 'Font',
    'prop.fontSize': 'Font size',
    'prop.fontWeight': 'Font weight',
    'prop.lineHeight': 'Line height',
    'prop.letterSpacing': 'Letter spacing',
    'prop.color': 'Text color',
    'visual.unresolved': 'Cannot resolve statically',
    'visual.pending': 'Needs review: {raw}',
    'visual.missing': 'Missing',
    'visual.review': 'Needs review',
    'visual.diffCount': '{n} diffs',
    'visual.designOnly': 'Design only',
    'visual.codeOnly': 'Code only',
    'visual.unmatched': 'Unmatched ({n})',
    'visual.noDiff': 'No differences found.',
    'visual.meta':
      '{kind} · {pairs} node pairs · {diffs} diffs (high {high} / med {medium} / low {low}) · unmatched {unmatched} · resources dimen {dimens} / color {colors}',
  },
}

function detectLang() {
  try {
    const q = new URLSearchParams(location.search).get('lang')
    if (q) {
      const s = q.toLowerCase()
      if (s === 'en' || s.startsWith('en')) return 'en'
      if (s === 'zh' || s.startsWith('zh')) return 'zh'
    }
  } catch (_e) {}
  try {
    const stored = localStorage.getItem('tracescope.panel.lang')
    if (stored === 'en' || stored === 'zh') return stored
  } catch (_e2) {}
  try {
    const nav = String(navigator.language || 'zh').toLowerCase()
    if (nav === 'en' || nav.startsWith('en-')) return 'en'
  } catch (_e3) {}
  return 'zh'
}

let active = detectLang()

export function getLang() {
  return active
}

export function setLang(lang) {
  active = lang === 'en' ? 'en' : 'zh'
  try {
    localStorage.setItem('tracescope.panel.lang', active)
  } catch (_e) {}
  try {
    document.documentElement.lang = active === 'en' ? 'en' : 'zh-CN'
  } catch (_e2) {}
}

export function t(key, params) {
  const table = DICT[active] || DICT.zh
  let s = table[key] ?? DICT.zh[key] ?? key
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (_, k) =>
      params[k] === undefined || params[k] === null ? `{${k}}` : String(params[k]),
    )
  }
  return s
}

/** Apply data-i18n / data-i18n-placeholder / data-i18n-title on the document. */
export function applyDomI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n')
    if (key) el.textContent = t(key)
  })
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html')
    if (key) el.innerHTML = t(key)
  })
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder')
    if (key) el.setAttribute('placeholder', t(key))
  })
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title')
    if (key) el.setAttribute('title', t(key))
  })
  try {
    document.title = t('doc.title')
  } catch (_e) {}
}
