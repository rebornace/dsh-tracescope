/**
 * Shared string-literal extraction for locator / heuristic adapters.
 */
import { normalizeText } from '../page-fingerprint.js'

/** Extract string literal contents from source (best effort, multi-language). */
export function extractStringLiterals(src: string): Set<string> {
  const out = new Set<string>()
  // Double-quoted, single-quoted, and triple-quoted (Kotlin/Swift/Python-ish).
  const re =
    /(?:"""([\s\S]*?)""")|(?:'''([\s\S]*?)''')|(?:"([^"\n\\]*(?:\\.[^"\n\\]*)*)")|(?:'([^'\n\\]*(?:\\.[^'\n\\]*)*)')/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const raw = m[1] ?? m[2] ?? m[3] ?? m[4] ?? ''
    if (!raw.trim()) continue
    if (raw.startsWith('@')) continue
    if (raw.startsWith('$') && !/\s/.test(raw)) continue
    if (raw.startsWith('R.') || raw.startsWith('#')) continue
    // Skip very long blobs (base64, minified JSON).
    if (raw.length > 200) continue
    const t = normalizeText(raw)
    if (t && t.length >= 1) out.add(t)
  }
  return out
}

/**
 * Extract user-facing text that sits between JSX/HTML tags
 * (e.g. `<h1>欢迎</h1>`), which string-literal scanners miss.
 */
export function extractMarkupInterTexts(src: string): Set<string> {
  const out = new Set<string>()
  const cleaned = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
  for (const m of cleaned.matchAll(
    /<(?:p|span|a|label|h[1-6]|button|li|td|th|strong|em|b|i|small|div|Text|Button)\b[^>]*>([^<{]+)<\//gi,
  )) {
    const raw = (m[1] ?? '').replace(/\s+/g, ' ').trim()
    if (!raw || raw.length > 120) continue
    if (raw.startsWith('{')) continue
    const t = normalizeText(raw)
    if (t) out.add(t)
  }
  return out
}

/** Union of string literals and markup/JSX inter-tag texts. */
export function extractUiTexts(src: string): Set<string> {
  const out = extractStringLiterals(src)
  for (const t of extractMarkupInterTexts(src)) out.add(t)
  return out
}

/** Count regex matches in source. */
export function countMatches(src: string, re: RegExp): number {
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g'
  const global = new RegExp(re.source, flags)
  return (src.match(global) ?? []).length
}
