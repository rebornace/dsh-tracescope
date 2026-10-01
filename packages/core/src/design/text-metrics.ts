/**
 * Coarse L1 text metrics (no real font shaping).
 * Shared by DesignDoc adapters and the Android layout engine.
 */

export interface TextMetricOptions {
  /** Extra px between adjacent characters (already converted from em when needed). */
  letterSpacing?: number
  /** 100–900 or CSS keyword; bold slightly widens glyphs. */
  fontWeight?: number | string
  /**
   * Prefer wrapping on Latin word boundaries when `maxWidth` constrains the block.
   * CJK / wide characters still break per glyph. Default true.
   */
  wordWrap?: boolean
}

/** True for CJK / full-width runs that advance ≈ 1em. */
export function isWideChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2329 && code <= 0x232a) ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  )
}

function weightFactor(fontWeight?: number | string): number {
  if (fontWeight === undefined || fontWeight === null) return 1
  let n: number
  if (typeof fontWeight === 'number') n = fontWeight
  else {
    const key = fontWeight.trim().toLowerCase()
    if (key === 'bold' || key === 'bolder') n = 700
    else if (key === 'light' || key === 'lighter') n = 300
    else if (key === 'normal' || key === 'regular') n = 400
    else n = Number(key)
  }
  if (!Number.isFinite(n) || n <= 0) return 1
  if (n >= 700) return 1.06
  if (n >= 600) return 1.03
  if (n <= 300) return 0.97
  return 1
}

/**
 * Approximate advance of one code point as a fraction of `fontSize`
 * (before letter-spacing / weight).
 */
export function charAdvanceUnit(ch: string): number {
  if (ch === '\n' || ch === '\r') return 0
  if (ch === '\t') return 0.32 * 4
  if (ch === ' ' || ch === '\u00a0') return 0.32
  if (isWideChar(ch)) return 1.02
  if (ch >= '0' && ch <= '9') return 0.56
  if (ch >= 'A' && ch <= 'Z') {
    if (ch === 'I' || ch === 'J' || ch === 'L') return 0.42
    if (ch === 'M' || ch === 'W') return 0.82
    return 0.66
  }
  if (ch >= 'a' && ch <= 'z') {
    if (ch === 'i' || ch === 'j' || ch === 'l' || ch === 'f' || ch === 't' || ch === 'r') {
      return 0.34
    }
    if (ch === 'm' || ch === 'w') return 0.72
    return 0.5
  }
  if (/[,.;:!?'"‘’“”`]/.test(ch)) return 0.3
  if (/[-–—_/\\|()]/.test(ch)) return 0.4
  if (/[[\]{}]/.test(ch)) return 0.4
  return 0.54
}

function charAdvancePx(ch: string, fontSize: number, weight: number): number {
  return charAdvanceUnit(ch) * fontSize * weight
}

/** Approximate advance width of a single-line string at `fontSize`. */
export function estimateTextAdvance(
  text: string,
  fontSize: number,
  options?: TextMetricOptions,
): number {
  if (!text || !(fontSize > 0)) return 0
  const weight = weightFactor(options?.fontWeight)
  const tracking =
    typeof options?.letterSpacing === 'number' && Number.isFinite(options.letterSpacing)
      ? options.letterSpacing
      : 0
  let w = 0
  let glyphs = 0
  for (const ch of text) {
    if (ch === '\n' || ch === '\r') continue
    w += charAdvancePx(ch, fontSize, weight)
    glyphs += 1
  }
  if (glyphs > 1 && tracking !== 0) w += tracking * (glyphs - 1)
  return Math.round(w * 100) / 100
}

function isLatinWordChar(ch: string): boolean {
  if (isWideChar(ch)) return false
  return /[A-Za-z0-9\u00c0-\u024f'’]/.test(ch)
}

/**
 * Approximate wrapped text block size.
 * When `maxWidth` is unset, returns single-line advance × line height.
 */
export function estimateTextBlock(
  text: string,
  fontSize: number,
  options?: TextMetricOptions & { maxWidth?: number; lineHeight?: number },
): { width: number; height: number; lines: number } {
  const lineHeight = options?.lineHeight ?? Math.round(fontSize * 1.2 * 100) / 100
  const maxWidth = options?.maxWidth
  const metricOpts: TextMetricOptions = {
    letterSpacing: options?.letterSpacing,
    fontWeight: options?.fontWeight,
  }
  const full = estimateTextAdvance(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, ' '), fontSize, metricOpts)
  if (maxWidth === undefined || !(maxWidth > 0) || full <= maxWidth) {
    const explicitLines = Math.max(1, text.split(/\r\n|\r|\n/).length)
    if (explicitLines > 1 && (maxWidth === undefined || !(maxWidth > 0))) {
      const parts = text.split(/\r\n|\r|\n/)
      const width = Math.max(...parts.map((p) => estimateTextAdvance(p, fontSize, metricOpts)), 0)
      return {
        width: Math.round(width * 100) / 100,
        height: Math.round(lineHeight * parts.length * 100) / 100,
        lines: parts.length,
      }
    }
    return { width: full, height: lineHeight, lines: 1 }
  }

  const wordWrap = options?.wordWrap !== false
  const weight = weightFactor(options?.fontWeight)
  const tracking =
    typeof options?.letterSpacing === 'number' && Number.isFinite(options.letterSpacing)
      ? options.letterSpacing
      : 0

  const lines: string[] = []
  for (const paragraph of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    if (!paragraph) {
      lines.push('')
      continue
    }
    let current = ''
    let currentW = 0
    let i = 0
    const chars = [...paragraph]
    while (i < chars.length) {
      const ch = chars[i]!
      // Latin word: try to keep the whole word on one line when it fits.
      if (wordWrap && isLatinWordChar(ch)) {
        let j = i
        let word = ''
        while (j < chars.length && isLatinWordChar(chars[j]!)) {
          word += chars[j]!
          j += 1
        }
        const wordW = estimateTextAdvance(word, fontSize, metricOpts)
        const need = current.length ? currentW + tracking + wordW : wordW
        if (need > maxWidth && current) {
          lines.push(current)
          current = word
          currentW = wordW
        } else if (wordW > maxWidth && !current) {
          // Oversized word: fall back to per-glyph wrap.
          for (const c of word) {
            const adv = charAdvancePx(c, fontSize, weight)
            const next = current.length ? currentW + tracking + adv : adv
            if (next > maxWidth && current) {
              lines.push(current)
              current = c
              currentW = adv
            } else {
              current += c
              currentW = next
            }
          }
        } else {
          current += word
          currentW = need
        }
        i = j
        continue
      }

      const adv = charAdvancePx(ch, fontSize, weight)
      if (ch === ' ' || ch === '\t') {
        const next = current.length ? currentW + tracking + adv : adv
        if (next > maxWidth && current) {
          lines.push(current)
          current = ''
          currentW = 0
        } else {
          current += ch
          currentW = next
        }
        i += 1
        continue
      }

      const next = current.length ? currentW + tracking + adv : adv
      if (next > maxWidth && current) {
        lines.push(current)
        current = ch
        currentW = adv
      } else {
        current += ch
        currentW = next
      }
      i += 1
    }
    if (current) lines.push(current)
  }

  if (!lines.length) lines.push('')
  const width = Math.max(...lines.map((l) => estimateTextAdvance(l, fontSize, metricOpts)), 0)
  return {
    width: Math.round(width * 100) / 100,
    height: Math.round(lineHeight * lines.length * 100) / 100,
    lines: lines.length,
  }
}
