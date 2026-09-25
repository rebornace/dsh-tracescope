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

/** Lowercase and collapse all whitespace; used for text equality. */
export function normalizeText(value?: string): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim()
}

/** Lowercase, split on non-alphanumerics; used for name token overlap. */
export function tokenizeName(value?: string): string[] {
  return (value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .filter(Boolean)
}

function collectTexts(node: DesignNode, out: Set<string>): void {
  if (node.kind === 'text' && node.text) {
    const t = normalizeText(node.text)
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
 *  - text overlap: how many design texts appear in the code page (strongest)
 *  - name token overlap between screen and file names
 *  - control-count similarity
 */
export function scorePage(target: PageFingerprint, page: CodePage): PageMatch {
  const reasons: string[] = []
  const candidate = new Set(page.fingerprint.texts)

  let hit = 0
  for (const t of target.texts) {
    if (candidate.has(t)) hit += 1
  }
  // Jaccard-ish recall: fraction of design texts found in the page.
  const textRecall = target.texts.length ? hit / target.texts.length : 0
  // Precision guards against a huge page matching a small screen too easily.
  const textPrecision = candidate.size ? hit / candidate.size : 0
  const textScore = target.texts.length
    ? textRecall * 0.8 + textPrecision * 0.2
    : 0
  if (hit) reasons.push(`文案命中 ${hit}/${target.texts.length}`)

  const targetNames = new Set(target.nameTokens)
  let nameHits = 0
  for (const tok of page.fingerprint.nameTokens) {
    if (targetNames.has(tok)) nameHits += 1
  }
  const nameScore = targetNames.size
    ? nameHits / targetNames.size
    : 0
  if (nameHits) reasons.push(`名称相关 ${nameHits} 项`)

  const tc = target.controlCount || 1
  const cc = page.fingerprint.controlCount
  const controlScore = cc
    ? 1 - Math.min(1, Math.abs(tc - cc) / Math.max(tc, cc))
    : 0

  const score =
    textScore * 0.7 + nameScore * 0.2 + controlScore * 0.1

  if (!reasons.length && controlScore > 0.5) reasons.push('结构规模接近')

  return { page, score: Math.round(score * 1000) / 1000, reasons }
}

/**
 * Rank all code pages against a design screen, best first. Pages below the
 * threshold are dropped.
 */
export function matchPages(
  design: DesignDoc,
  pages: CodePage[],
  options: MatchOptions = {},
): PageMatch[] {
  const minScore = options.minScore ?? 0.15
  const target = designFingerprint(design)
  return pages
    .map((page) => scorePage(target, page))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score)
}
