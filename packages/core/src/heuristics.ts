const KOTLIN_EXT = /\.(kt|kts)$/i
const JAVA_EXT = /\.java$/i
const SWIFT_EXT = /\.swift$/i
const OBJC_EXT = /\.(m|mm|h)$/i
const DART_EXT = /\.dart$/i
const JS_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i
const VUE_EXT = /\.vue$/i
const STYLE_EXT = /\.(css|scss|sass|less)$/i
const HTML_EXT = /\.(html?|htm)$/i
const ANDROID_RES = /\/res\/(layout|navigation|menu|xml)\//i
const STRINGS_XML = /\/res\/values[^/]*\/strings\.xml$/i
const LOCALIZABLE = /Localizable\.strings$/i

export type AnalyzerLanguage =
  | 'kotlin'
  | 'java'
  | 'swift'
  | 'objc'
  | 'dart'
  | 'javascript'
  | 'vue'
  | 'css'
  | 'html'
  | 'resource'
  | 'other'

export function detectLanguage(relativePath: string): AnalyzerLanguage {
  const p = relativePath.replace(/\\/g, '/')
  if (KOTLIN_EXT.test(p)) return 'kotlin'
  if (JAVA_EXT.test(p)) return 'java'
  if (SWIFT_EXT.test(p)) return 'swift'
  if (OBJC_EXT.test(p)) return 'objc'
  if (DART_EXT.test(p)) return 'dart'
  if (VUE_EXT.test(p)) return 'vue'
  if (JS_EXT.test(p)) return 'javascript'
  if (STYLE_EXT.test(p)) return 'css'
  if (HTML_EXT.test(p)) return 'html'
  if (ANDROID_RES.test(p) || STRINGS_XML.test(p) || LOCALIZABLE.test(p)) return 'resource'
  return 'other'
}

/** Heuristic product-ish name from a path when no better source exists. */
export function heuristicDisplayName(relativePath: string): string {
  const p = relativePath.replace(/\\/g, '/')
  const base = p.split('/').pop() ?? p
  const stem = base
    .replace(/\.(kt|kts|java|swift|m|mm|h|dart|ts|tsx|js|jsx|vue|xml|css|scss|sass|less|html?)$/i, '')
    .replace(/^(I|V|v)[A-Z]/, (s) => s.slice(1)) // Vue I18n-ish / index prefix not touched beyond that

  const cleaned = stem
    .replace(/(Activity|Fragment|ViewController|ViewModel|Presenter|Controller|Component|Screen|Page|View)$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .trim()

  if (/login|signin|auth/i.test(stem)) return '登录相关'
  if (/pay|payment|checkout|order/i.test(stem)) return '订单/支付相关'
  if (/home|main|tab/i.test(stem)) return '首页/主导航相关'
  if (/setting|profile|account|mine/i.test(stem)) return '设置/个人中心相关'
  if (/search/i.test(stem)) return '搜索相关'

  return cleaned || stem || p
}

export function classifyFileRisk(relativePath: string): 'high' | 'medium' | 'low' {
  const p = relativePath.replace(/\\/g, '/')
  if (/pay|payment|auth|login|token|password|security/i.test(p)) return 'high'
  if (/\.(kt|java|swift|m|mm|dart)$/i.test(p) || /ViewController|Activity|Fragment/i.test(p)) {
    return 'medium'
  }
  if (/\.(vue|tsx|jsx|ts)$/i.test(p)) return 'medium'
  if (/\.(css|scss|less|html|xml|strings)$/i.test(p) || /res\//i.test(p)) return 'low'
  return 'medium'
}
