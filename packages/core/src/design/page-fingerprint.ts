/**
 * Deterministic page matching.
 *
 * Builds a fingerprint from a design screen and scores every code page
 * discovered by the registered adapters, so the correct implementation page
 * is located automatically — a project may ship several implementations of
 * the same screen (Android XML, Compose, iOS xib, SwiftUI).
 *
 * No model and no running app are involved.
 */
import type { DesignDoc, DesignNode } from './types.js'
import type { CodePage, PageFingerprint } from './adapters/adapter-types.js'
import { detectSubPages, subPageAsDoc } from './subpages.js'

/**
 * Higher = more specialized stack adapter. Used only for near-tie ranking so
 * uni-app / Taro / miniprogram win over generic web-vue / web-react.
 */
export function adapterSpecificity(adapterId: string): number {
  switch (adapterId) {
    case 'android-xml':
    case 'ios-xib':
      return 100
    case 'maui-xaml':
    case 'miniprogram-wxml':
    case 'miniprogram-axml':
    case 'miniprogram-ttml':
    case 'miniprogram-swan':
      return 90
    case 'uni-app':
    case 'taro':
    case 'flutter':
    case 'react-native':
    case 'harmony-arkui':
      return 80
    case 'android-compose':
    case 'ios-swiftui':
    case 'android-view-java':
    case 'android-view-kotlin':
    case 'ios-uikit-objc':
    case 'ios-uikit-swift':
      return 70
    case 'web-angular':
    case 'web-svelte':
      return 40
    case 'web-vue':
    case 'web-react':
      return 30
    case 'web-html':
      return 20
    default:
      return 10
  }
}

/** Lowercase and collapse all whitespace; used for text equality. */
export function normalizeText(value?: string): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim()
}

/** Lowercase, split on non-alphanumerics and camelCase; used for name token overlap. */
export function tokenizeName(value?: string): string[] {
  const raw = (value ?? '').trim()
  if (!raw) return []
  // Split camelCase / PascalCase before lowercasing so LoginScreen → login + screen.
  const spaced = raw
    .replace(/([a-z\u4e00-\u9fa5])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  return spaced
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .filter(Boolean)
}

/** Tokens from a relative path (folders + basename without extension). */
export function pathTokens(relativePath: string): string[] {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
  const out = new Set<string>()
  for (const part of parts) {
    const base = part.replace(/\.[^.]+$/i, '')
    for (const t of tokenizeName(base)) out.add(t)
  }
  return [...out]
}

/**
 * Soft text hit: exact first; then containment for sufficiently long strings
 * so short labels like「登录」do not falsely match「退出登录」.
 */
function textsSoftHit(designText: string, codeTexts: Set<string>): 'exact' | 'soft' | false {
  if (!designText) return false
  if (codeTexts.has(designText)) return 'exact'
  const minLen = /[\u4e00-\u9fa5]/.test(designText) ? 3 : 5
  if (designText.length < minLen) return false
  for (const lit of codeTexts) {
    if (!lit || lit.length < minLen) continue
    const shorter = designText.length <= lit.length ? designText : lit
    const longer = designText.length <= lit.length ? lit : designText
    // Avoid loose parent/child matches (e.g. 登录 ⊂ 退出登录).
    if (longer.length > shorter.length * 2) continue
    if (longer.includes(shorter)) return 'soft'
  }
  return false
}

function collectTexts(node: DesignNode, out: Set<string>): void {
  // Prefer explicit text content regardless of kind — some sources (e.g. Lanhu)
  // may attach readable copy to non-`text` nodes when type detection is fuzzy.
  if (node.text) {
    const t = normalizeText(node.text)
    if (t) out.add(t)
  } else if (node.kind === 'text' && node.name) {
    const t = normalizeText(node.name)
    if (t) out.add(t)
  }
  for (const child of node.children) collectTexts(child, out)
}

function countControls(node: DesignNode): number {
  let n = 0
  for (const child of node.children) {
    if (child.kind !== 'group') n += 1
    n += countControls(child)
  }
  return n
}

/** Fingerprint of a design screen (the expected side). */
export function designFingerprint(doc: DesignDoc): PageFingerprint {
  const texts = new Set<string>()
  collectTexts(doc.root, texts)
  // Lanhu design titles (首页 / 登录) often match path tokens better than English
  // file names when annotation text extraction is sparse.
  if (doc.source === 'lanhu') {
    const name = normalizeText(doc.root.name)
    if (name && name.length <= 40) texts.add(name)
  }
  return {
    texts: [...texts],
    nameTokens: tokenizeName(doc.root.name),
    controlCount: countControls(doc.root),
  }
}

export interface PageMatch {
  page: CodePage
  /** 0..1 confidence. */
  score: number
  /** Human-readable reasons that drove the score. */
  reasons: string[]
}

export interface MatchOptions {
  /** Minimum score for a candidate to be returned. */
  minScore?: number
}

/**
 * Score a code page against the design fingerprint.
 *
 * Signals (weighted):
 *  - text overlap (exact + soft containment for longer strings)
 *  - name token overlap between screen and file names
 *  - path token overlap (folders / basename vs design name)
 *  - control-count similarity
 */
export function scorePage(target: PageFingerprint, page: CodePage): PageMatch {
  const reasons: string[] = []
  const candidate = new Set(page.fingerprint.texts)

  let exactHit = 0
  let softHit = 0
  for (const t of target.texts) {
    const hit = textsSoftHit(t, candidate)
    if (hit === 'exact') exactHit += 1
    else if (hit === 'soft') softHit += 1
  }
  const weightedHits = exactHit + softHit * 0.55
  const textRecall = target.texts.length ? weightedHits / target.texts.length : 0
  const textPrecision = candidate.size ? weightedHits / candidate.size : 0
  const textScore = target.texts.length ? textRecall * 0.8 + textPrecision * 0.2 : 0
  if (exactHit) reasons.push(`文案命中 ${exactHit}/${target.texts.length}`)
  if (softHit) reasons.push(`文案近似 ${softHit}`)

  const targetNames = new Set(target.nameTokens)
  let nameHits = 0
  for (const tok of page.fingerprint.nameTokens) {
    if (targetNames.has(tok)) nameHits += 1
  }
  const nameScore = targetNames.size ? nameHits / targetNames.size : 0
  if (nameHits) reasons.push(`名称相关 ${nameHits} 项`)

  const pathToks = pathTokens(page.relativePath)
  let pathHits = 0
  for (const tok of pathToks) {
    if (targetNames.has(tok)) pathHits += 1
  }
  const pathScore = targetNames.size ? Math.min(1, pathHits / targetNames.size) : 0
  if (pathHits) reasons.push(`路径相关 ${pathHits} 项`)

  const tc = target.controlCount || 1
  const cc = page.fingerprint.controlCount
  const controlScore = cc ? 1 - Math.min(1, Math.abs(tc - cc) / Math.max(tc, cc)) : 0

  const score =
    textScore * 0.55 + nameScore * 0.15 + pathScore * 0.2 + controlScore * 0.1

  if (!reasons.length && controlScore > 0.5) reasons.push('结构规模接近')

  return { page, score: Math.round(score * 1000) / 1000, reasons }
}

export interface MatchTarget {
  fingerprint: PageFingerprint
  /** Label of the screen part this target represents. */
  label: string
  kind: 'screen' | 'repeated-item' | 'card-variant'
}

/** Build scoring targets: the whole screen plus any extracted item subtrees. */
export function buildMatchTargets(design: DesignDoc): MatchTarget[] {
  const targets: MatchTarget[] = [
    {
      fingerprint: designFingerprint(design),
      label: design.root.name,
      kind: 'screen',
    },
  ]
  for (const subPage of detectSubPages(design)) {
    const subDoc = subPageAsDoc(design, subPage)
    targets.push({
      fingerprint: designFingerprint(subDoc),
      label: subPage.label,
      kind: subPage.reason,
    })
  }
  return targets
}

/**
 * Rank all code pages against a design screen, best first.
 *
 * For list / board screens each page is scored against the whole screen and
 * against the extracted item subtrees; the best part wins, so item layouts
 * rank correctly. Pages below the threshold are dropped.
 */
export function matchPages(
  design: DesignDoc,
  pages: CodePage[],
  options: MatchOptions = {},
): PageMatch[] {
  const minScore = options.minScore ?? 0.15
  const targets = buildMatchTargets(design)

  const scored = pages.map((page) => {
    let best = { match: null as PageMatch | null, target: targets[0]! }
    for (const target of targets) {
      const m = scorePage(target.fingerprint, page)
      if (!best.match || m.score > best.match.score) best = { match: m, target }
    }
    const match = best.match!
    // Annotate non-screen matches so the UI can explain the ranking.
    if (best.target.kind !== 'screen') {
      const note =
        best.target.kind === 'repeated-item'
          ? `列表项「${best.target.label}」`
          : `卡片变体「${best.target.label}」`
      match.reasons = [note, ...match.reasons]
    }
    return match
  })

  const ranked = scored.sort((a, b) => {
    const scoreDiff = b.score - a.score
    if (Math.abs(scoreDiff) > 0.04) return scoreDiff
    // Near-ties: prefer specialized stacks (uni/taro/mp) over generic web,
    // then precise XML/Xib-style adapters over heuristic-only ones.
    const specDiff =
      adapterSpecificity(b.page.adapterId) - adapterSpecificity(a.page.adapterId)
    if (specDiff !== 0) return specDiff
    if (a.page.precise !== b.page.precise) return a.page.precise ? -1 : 1
    return scoreDiff
  })
  const passing = ranked.filter((m) => m.score >= minScore)
  if (passing.length) return passing

  // An explicitly provided threshold is honored exactly (even when empty);
  // the best-guess fallback below only applies to the default ranking.
  if (options.minScore !== undefined) return []

  // With the default threshold nothing passed. Avoid a dead end on a codebase
  // that clearly has pages when — and only when — the top result still carries
  // a weak but real signal (a text/name hit produces ~0.12+; pure control-count
  // coincidence alone maxes around 0.1). Surface the best guesses flagged as
  // low confidence so the user can confirm. Truly unrelated pages (score below
  // the fallback floor) still produce no matches.
  const FALLBACK_MIN_SCORE = 0.12
  const FALLBACK_LIMIT = 8
  const guesses = ranked.filter((m) => m.score >= FALLBACK_MIN_SCORE).slice(0, FALLBACK_LIMIT)
  for (const guess of guesses) {
    guess.reasons = ['低置信度，请核对', ...guess.reasons]
  }
  return guesses
}
