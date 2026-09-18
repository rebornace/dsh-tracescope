const KOTLIN_EXT = /\.(kt|kts)$/i
const OBJC_EXT = /\.(m|mm|h)$/i
const ANDROID_RES = /\/res\/(layout|navigation|menu|xml)\//i
const STRINGS_XML = /\/res\/values[^/]*\/strings\.xml$/i
const LOCALIZABLE = /Localizable\.strings$/i

export type AnalyzerLanguage = 'kotlin' | 'objc' | 'resource' | 'other'

export function detectLanguage(relativePath: string): AnalyzerLanguage {
  const p = relativePath.replace(/\\/g, '/')
  if (KOTLIN_EXT.test(p)) return 'kotlin'
  if (OBJC_EXT.test(p)) return 'objc'
  if (ANDROID_RES.test(p) || STRINGS_XML.test(p) || LOCALIZABLE.test(p)) return 'resource'
  return 'other'
}

/** Heuristic product-ish name from a path when no better source exists. */
export function heuristicDisplayName(relativePath: string): string {
  const p = relativePath.replace(/\\/g, '/')
  const base = p.split('/').pop() ?? p
  const stem = base.replace(/\.(kt|kts|m|mm|h|xml|swift)$/i, '')

  const cleaned = stem
    .replace(/(Activity|Fragment|ViewController|ViewModel|Presenter|Controller|Screen|Page)$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
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
  if (/\.(kt|m|mm)$/i.test(p) || /ViewController|Activity|Fragment/i.test(p)) return 'medium'
  if (/\.(xml|strings)$/i.test(p) || /res\//i.test(p)) return 'low'
  return 'medium'
}
