/**
 * Shared CSS / HTML helpers for web adapters.
 */
import type {
  DesignFill,
  DesignGradient,
  DesignShadow,
  DesignStyle,
  HexColor,
} from '../types.js'

/** Parse a CSS colour token into #rrggbb / #rrggbbaa when possible. */
export function parseCssColor(raw: string | undefined): HexColor | undefined {
  if (!raw) return undefined
  const v = raw.trim().toLowerCase()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) {
    if (v.length === 4) {
      return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
    }
    return v
  }

  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  const withAlpha = (body: string, a: number): HexColor => {
    if (a < 1) {
      const aa = Math.round(a * 255)
        .toString(16)
        .padStart(2, '0')
      return `${body}${aa}`
    }
    return body
  }

  // rgb(17, 34, 51) / rgba(17, 34, 51, 0.5)
  const rgbComma = v.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/,
  )
  if (rgbComma) {
    const body = `#${toHex(Number(rgbComma[1]))}${toHex(Number(rgbComma[2]))}${toHex(Number(rgbComma[3]))}`
    const a = rgbComma[4] !== undefined ? Number(rgbComma[4]) : 1
    return withAlpha(body, a)
  }

  // Modern rgb(17 34 51) / rgb(17 34 51 / 50%)
  const rgbSpace = v.match(
    /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/,
  )
  if (rgbSpace) {
    const body = `#${toHex(Number(rgbSpace[1]))}${toHex(Number(rgbSpace[2]))}${toHex(Number(rgbSpace[3]))}`
    let a = 1
    if (rgbSpace[4] !== undefined) {
      a = rgbSpace[4].endsWith('%') ? Number(rgbSpace[4].slice(0, -1)) / 100 : Number(rgbSpace[4])
    }
    return withAlpha(body, a)
  }

  // hsl(210, 50%, 40%) / hsla(...)
  const hslComma = v.match(
    /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/,
  )
  if (hslComma) {
    const hex = hslToHex(Number(hslComma[1]), Number(hslComma[2]) / 100, Number(hslComma[3]) / 100)
    const a = hslComma[4] !== undefined ? Number(hslComma[4]) : 1
    return withAlpha(hex, a)
  }

  // Modern hsl(210 50% 40% / 0.8)
  const hslSpace = v.match(
    /^hsla?\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*([\d.]+%?))?\s*\)$/,
  )
  if (hslSpace) {
    const hex = hslToHex(Number(hslSpace[1]), Number(hslSpace[2]) / 100, Number(hslSpace[3]) / 100)
    let a = 1
    if (hslSpace[4] !== undefined) {
      a = hslSpace[4].endsWith('%') ? Number(hslSpace[4].slice(0, -1)) / 100 : Number(hslSpace[4])
    }
    return withAlpha(hex, a)
  }

  // oklch(0.6 0.12 250) / oklch(60% 0.12 250 / 0.9)
  const oklch = v.match(
    /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/,
  )
  if (oklch) {
    const Lraw = oklch[1]!
    const L = Lraw.endsWith('%') ? Number(Lraw.slice(0, -1)) / 100 : Number(Lraw)
    const C = Number(oklch[2])
    const H = Number(oklch[3])
    const hex = oklchToHex(L, C, H)
    let a = 1
    if (oklch[4] !== undefined) {
      a = oklch[4].endsWith('%') ? Number(oklch[4].slice(0, -1)) / 100 : Number(oklch[4])
    }
    return withAlpha(hex, a)
  }

  // color-mix(in srgb, #112233 40%, #ffffff)
  const mix = v.match(
    /^color-mix\(\s*in\s+(?:srgb|srgb-linear|display-p3)\s*,\s*(.+)\s*\)$/,
  )
  if (mix) {
    const blended = parseColorMixArgs(mix[1]!)
    if (blended) return blended
  }

  // light-dark(#111, #eee) — L1 defaults to the light (first) branch
  const lightDark = v.match(/^light-dark\(\s*(.+)\s*\)$/)
  if (lightDark) {
    const sides = splitCssTopLevelArgs(lightDark[1]!)
    if (sides.length >= 1) {
      const light = parseCssColor(sides[0]!.trim())
      if (light) return light
    }
  }

  return undefined
}

const CSS_NAMED_COLORS: Record<string, HexColor> = {
  white: '#ffffff',
  black: '#000000',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  transparent: '#00000000',
}

/** Split function args on commas that are not inside nested (...). */
function splitCssTopLevelArgs(args: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of args) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

function parseColorMixArgs(args: string): HexColor | undefined {
  // Split on top-level comma: "color1 [p1%], color2 [p2%]"
  const parts = splitCssTopLevelArgs(args)
  if (parts.length < 2) return undefined

  const parseSide = (side: string): { color: HexColor; pct?: number } | undefined => {
    const pctMatch = side.match(/^(.*?)\s+([\d.]+)%\s*$/)
    const colorRaw = (pctMatch ? pctMatch[1]! : side).trim()
    const pct = pctMatch ? Number(pctMatch[2]) : undefined
    const named = CSS_NAMED_COLORS[colorRaw.toLowerCase()]
    const color = named ?? parseCssColor(colorRaw)
    if (!color || color.length < 7) return undefined
    return { color, pct }
  }

  const a = parseSide(parts[0]!)
  const b = parseSide(parts[1]!)
  if (!a || !b) return undefined

  let wa: number
  let wb: number
  if (a.pct !== undefined && b.pct === undefined) {
    wa = a.pct
    wb = 100 - wa
  } else if (b.pct !== undefined && a.pct === undefined) {
    wb = b.pct
    wa = 100 - wb
  } else if (a.pct !== undefined && b.pct !== undefined) {
    wa = a.pct
    wb = b.pct
  } else {
    wa = 50
    wb = 50
  }
  const sum = wa + wb
  if (sum <= 0) return undefined
  wa /= sum
  wb /= sum

  const parseRgb = (hex: string) => {
    const h = hex.replace('#', '')
    const full =
      h.length === 3 ? `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : h.slice(0, 6)
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
    }
  }
  const ca = parseRgb(a.color)
  const cb = parseRgb(b.color)
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(ca.r * wa + cb.r * wb)}${toHex(ca.g * wa + cb.g * wb)}${toHex(ca.b * wa + cb.b * wb)}`
}

/** First colour token from a background shorthand (keeps nested function args intact). */
function firstCssColorToken(val: string): string {
  const t = val.trim()
  if (/^(?:rgba?|hsla?|oklch|color-mix|light-dark)\s*\(/i.test(t)) {
    let depth = 0
    for (let i = 0; i < t.length; i++) {
      const ch = t[i]!
      if (ch === '(') depth += 1
      else if (ch === ')') {
        depth -= 1
        if (depth === 0) return t.slice(0, i + 1)
      }
    }
    return t
  }
  return t.split(/\s+/)[0] ?? t
}

/** Convert OKLCH (L 0–1, C, H°) to #rrggbb (clipped sRGB). */
export function oklchToHex(L: number, C: number, H: number): HexColor {
  const hr = (H * Math.PI) / 180
  const a = C * Math.cos(hr)
  const b = C * Math.sin(hr)
  // OKLab → LMS
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  const toSrgb = (c: number) => {
    const abs = Math.abs(c)
    const encoded =
      abs > 0.0031308 ? Math.sign(c) * (1.055 * abs ** (1 / 2.4) - 0.055) : 12.92 * c
    return Math.max(0, Math.min(255, Math.round(encoded * 255)))
  }
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hex(toSrgb(r))}${hex(toSrgb(g))}${hex(toSrgb(bl))}`
}

function hslToHex(h: number, s: number, l: number): HexColor {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (hue < 60) {
    r = c
    g = x
  } else if (hue < 120) {
    r = x
    g = c
  } else if (hue < 180) {
    g = c
    b = x
  } else if (hue < 240) {
    g = x
    b = c
  } else if (hue < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round((n + m) * 255)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Split CSS function args on top-level commas. */
function splitCssFunctionArgs(args: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of args) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

/** Parse a CSS length (px/rem/em/vw/vh/clamp/min/max/number) into logical px (rem≈16, vw≈3.6). */
export function parseCssLength(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const v = raw.trim().toLowerCase()
  if (v === '0') return 0

  const clampM = v.match(/^clamp\(\s*(.+)\s*\)$/i)
  if (clampM) {
    const parts = splitCssFunctionArgs(clampM[1]!)
    if (parts.length === 3) {
      const minV = parseCssLength(parts[0])
      const pref = parseCssLength(parts[1])
      const maxV = parseCssLength(parts[2])
      if (minV !== undefined && pref !== undefined && maxV !== undefined) {
        return Math.min(maxV, Math.max(minV, pref))
      }
    }
    return undefined
  }

  const minM = v.match(/^min\(\s*(.+)\s*\)$/i)
  if (minM) {
    const parts = splitCssFunctionArgs(minM[1]!)
    const nums = parts.map(parseCssLength).filter((n): n is number => n !== undefined)
    if (nums.length) return Math.min(...nums)
    return undefined
  }

  const maxM = v.match(/^max\(\s*(.+)\s*\)$/i)
  if (maxM) {
    const parts = splitCssFunctionArgs(maxM[1]!)
    const nums = parts.map(parseCssLength).filter((n): n is number => n !== undefined)
    if (nums.length) return Math.max(...nums)
    return undefined
  }

  const m = v.match(/^(-?[\d.]+)(px|rem|em|vw|vh|rpx|upx|cqw|cqh|cqi|cqb|cqmin|cqmax|%)$/)
  if (!m) {
    const bare = v.match(/^(-?[\d.]+)$/)
    if (!bare) return undefined
    const n = Number(bare[1])
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined
  }
  const n = Number(m[1])
  if (!Number.isFinite(n)) return undefined
  const unit = m[2] ?? 'px'
  if (unit === 'px') return Math.round(n * 100) / 100
  if (unit === 'rem' || unit === 'em') return Math.round(n * 16 * 100) / 100
  // Assume 360×640 logical viewport / container for L1 compare.
  if (unit === 'vw' || unit === 'cqw' || unit === 'cqi') return Math.round(n * 3.6 * 100) / 100
  if (unit === 'vh' || unit === 'cqh' || unit === 'cqb') return Math.round(n * 6.4 * 100) / 100
  if (unit === 'cqmin') return Math.round(n * Math.min(3.6, 6.4) * 100) / 100
  if (unit === 'cqmax') return Math.round(n * Math.max(3.6, 6.4) * 100) / 100
  // WeChat / uni-app: 750rpx = screen width; assume 375 CSS px → 1rpx = 0.5px.
  if (unit === 'rpx' || unit === 'upx') return Math.round(n * 0.5 * 100) / 100
  if (unit === '%') return undefined
  return undefined
}

/** Parse CSS `aspect-ratio: 16 / 9` / `1.5` into width/height ratio. */
export function parseCssAspectRatio(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const v = raw.trim().toLowerCase()
  if (!v || v === 'auto') return undefined
  const frac = v.match(/^([\d.]+)\s*\/\s*([\d.]+)$/)
  if (frac) {
    const a = Number(frac[1])
    const b = Number(frac[2])
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b
    return undefined
  }
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Parse CSS `box-shadow` into outer / inset shadow descriptors + full stack.
 * Picks the largest-blur shadow in each category as the primary.
 */
export function parseCssBoxShadowEffects(raw: string | undefined): {
  elevation?: number
  innerShadow?: number
  shadow?: DesignShadow
  insetShadow?: DesignShadow
  shadows?: DesignShadow[]
} {
  if (!raw?.trim() || /^none$/i.test(raw.trim())) return {}
  let bestOuter: DesignShadow | undefined
  let bestInner: DesignShadow | undefined
  const stack: DesignShadow[] = []
  // Split on top-level commas only (rgba(...) args contain commas).
  const parts: string[] = []
  {
    let depth = 0
    let cur = ''
    for (const ch of raw) {
      if (ch === '(') depth += 1
      if (ch === ')') depth -= 1
      if (ch === ',' && depth === 0) {
        parts.push(cur)
        cur = ''
        continue
      }
      cur += ch
    }
    if (cur.trim()) parts.push(cur)
  }
  for (const part of parts) {
    const inset = /inset/i.test(part)
    const colorMatch =
      part.match(/(?:rgba?|hsla?|oklch)\([^)]*\)/i)?.[0] ??
      part.match(/#[0-9a-f]{3,8}/i)?.[0]
    const color = colorMatch ? parseCssColor(colorMatch) : undefined
    // Strip color functions so lengths remain.
    const cleaned = part
      .replace(/rgba?\([^)]*\)/gi, ' ')
      .replace(/hsla?\([^)]*\)/gi, ' ')
      .replace(/oklch\([^)]*\)/gi, ' ')
      .replace(/#[0-9a-f]{3,8}/gi, ' ')
      .replace(/\binset\b/gi, ' ')
    const lengths = [...cleaned.matchAll(/(-?[\d.]+)(px|rem|em)?/gi)]
      .map((m) => {
        const n = Number(m[1])
        const unit = (m[2] ?? 'px').toLowerCase()
        if (!Number.isFinite(n)) return undefined
        if (unit === 'rem' || unit === 'em') return n * 16
        return n
      })
      .filter((n): n is number => n !== undefined)
    // box-shadow: offset-x offset-y blur-radius spread-radius
    if (lengths.length < 2) continue
    const offsetX = lengths[0]!
    const offsetY = lengths[1]!
    const blur = lengths.length >= 3 ? Math.abs(lengths[2]!) : 0
    const spread = lengths.length >= 4 ? lengths[3]! : undefined
    const candidate: DesignShadow = {
      offsetX: Math.round(offsetX * 100) / 100,
      offsetY: Math.round(offsetY * 100) / 100,
      blur: Math.round(blur * 100) / 100,
      ...(spread !== undefined ? { spread: Math.round(spread * 100) / 100 } : {}),
      ...(color ? { color } : {}),
      ...(inset ? { inset: true } : {}),
    }
    stack.push(candidate)
    if (inset) {
      if (!bestInner || candidate.blur >= bestInner.blur) bestInner = candidate
    } else if (!bestOuter || candidate.blur >= bestOuter.blur) {
      bestOuter = candidate
    }
  }
  return {
    elevation: bestOuter ? bestOuter.blur : undefined,
    innerShadow: bestInner ? bestInner.blur : undefined,
    shadow: bestOuter,
    insetShadow: bestInner,
    shadows: stack.length ? stack : undefined,
  }
}

/**
 * Approximate CSS `box-shadow` as a single elevation (blur radius).
 * Takes the largest blur among comma-separated outer shadows; ignores `inset`.
 */
export function parseCssBoxShadowElevation(raw: string | undefined): number | undefined {
  return parseCssBoxShadowEffects(raw).elevation
}

/** Parse `blur(Npx)` from CSS `filter` / `backdrop-filter`. */
export function parseCssFilterBlur(raw: string | undefined): number | undefined {
  if (!raw?.trim() || /^none$/i.test(raw.trim())) return undefined
  const m = raw.match(/blur\(\s*(-?[\d.]+)(px|rem|em)?\s*\)/i)
  if (!m) return undefined
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return undefined
  const unit = (m[2] ?? 'px').toLowerCase()
  const px = unit === 'rem' || unit === 'em' ? n * 16 : n
  return Math.round(px * 100) / 100
}

/**
 * Parse `transform: translate(X, Y)` / `translateX` / `translateY` into logical offsets.
 */
export function parseCssTranslate(raw: string | undefined): { x?: number; y?: number } {
  if (!raw?.trim() || /^none$/i.test(raw.trim())) return {}
  let x: number | undefined
  let y: number | undefined
  const xy = raw.match(/translate\(\s*([^,)]+)\s*(?:,\s*([^)]+))?\s*\)/i)
  if (xy) {
    x = parseCssLength(xy[1]!.trim())
    y = xy[2] !== undefined ? parseCssLength(xy[2].trim()) : 0
  }
  const tx = raw.match(/translateX\(\s*([^)]+)\s*\)/i)
  if (tx) x = parseCssLength(tx[1]!.trim()) ?? x
  const ty = raw.match(/translateY\(\s*([^)]+)\s*\)/i)
  if (ty) y = parseCssLength(ty[1]!.trim()) ?? y
  // translate3d(x, y, z)
  const t3 = raw.match(/translate3d\(\s*([^,]+)\s*,\s*([^,]+)\s*,/i)
  if (t3) {
    x = parseCssLength(t3[1]!.trim()) ?? x
    y = parseCssLength(t3[2]!.trim()) ?? y
  }
  return { x, y }
}

/** Parse CSS angle token (`15deg`, `0.5turn`, `1rad`, bare number ≈ deg). */
function parseCssAngleDegrees(raw: string | undefined): number | undefined {
  if (!raw?.trim()) return undefined
  const t = raw.trim().toLowerCase()
  const deg = t.match(/^(-?[\d.]+)\s*deg$/)
  if (deg) return Number(deg[1])
  const turn = t.match(/^(-?[\d.]+)\s*turn$/)
  if (turn) return Number(turn[1]) * 360
  const rad = t.match(/^(-?[\d.]+)\s*rad$/)
  if (rad) return (Number(rad[1]) * 180) / Math.PI
  const bare = t.match(/^(-?[\d.]+)$/)
  if (bare) return Number(bare[1])
  return undefined
}

/**
 * Parse `rotate()` / `rotateZ()` from a transform list, or a standalone `rotate` value.
 * Returns clockwise degrees; near-zero → undefined.
 */
export function parseCssRotate(raw: string | undefined): number | undefined {
  if (!raw?.trim() || /^none$/i.test(raw.trim())) return undefined
  let deg: number | undefined
  const rz =
    raw.match(/rotateZ\(\s*([^)]+)\s*\)/i) ?? raw.match(/rotate\(\s*([^)]+)\s*\)/i)
  if (rz) deg = parseCssAngleDegrees(rz[1]!.trim())
  else deg = parseCssAngleDegrees(raw)
  if (deg === undefined || !Number.isFinite(deg) || Math.abs(deg) <= 0.5) return undefined
  return Math.round(deg * 100) / 100
}

/**
 * Parse `scale()` / `scaleX()` / `scaleY()` from a transform list.
 * Identity factors are omitted.
 */
export function parseCssScale(raw: string | undefined): { scaleX?: number; scaleY?: number } {
  if (!raw?.trim() || /^none$/i.test(raw.trim())) return {}
  let scaleX: number | undefined
  let scaleY: number | undefined
  const both = raw.match(/scale\(\s*([^,)]+)\s*(?:,\s*([^)]+))?\s*\)/i)
  if (both) {
    const sx = Number(both[1]!.trim())
    const sy = both[2] !== undefined ? Number(both[2].trim()) : sx
    if (Number.isFinite(sx)) scaleX = sx
    if (Number.isFinite(sy)) scaleY = sy
  }
  const sxOnly = raw.match(/scaleX\(\s*([^)]+)\s*\)/i)
  if (sxOnly) {
    const n = Number(sxOnly[1]!.trim())
    if (Number.isFinite(n)) scaleX = n
  }
  const syOnly = raw.match(/scaleY\(\s*([^)]+)\s*\)/i)
  if (syOnly) {
    const n = Number(syOnly[1]!.trim())
    if (Number.isFinite(n)) scaleY = n
  }
  // Standalone `scale: 1.2` / `scale: 1.2 0.8` (CSS scale property).
  if (scaleX === undefined && scaleY === undefined && !/\(/.test(raw)) {
    const parts = raw.trim().split(/\s+/).map(Number)
    if (parts.length >= 1 && Number.isFinite(parts[0]!)) scaleX = parts[0]
    if (parts.length >= 2 && Number.isFinite(parts[1]!)) scaleY = parts[1]
    else if (scaleX !== undefined) scaleY = scaleX
  }
  const out: { scaleX?: number; scaleY?: number } = {}
  if (scaleX !== undefined && Math.abs(scaleX - 1) > 0.02) {
    out.scaleX = Math.round(scaleX * 1000) / 1000
  }
  if (scaleY !== undefined && Math.abs(scaleY - 1) > 0.02) {
    out.scaleY = Math.round(scaleY * 1000) / 1000
  }
  return out
}

/**
 * Parse `skew()` / `skewX()` / `skewY()` from a transform list.
 * Near-zero angles are omitted.
 */
export function parseCssSkew(raw: string | undefined): { skewX?: number; skewY?: number } {
  if (!raw?.trim() || /^none$/i.test(raw.trim())) return {}
  let skewX: number | undefined
  let skewY: number | undefined
  const both = raw.match(/skew\(\s*([^,)]+)\s*(?:,\s*([^)]+))?\s*\)/i)
  if (both) {
    skewX = parseCssAngleDegrees(both[1]!.trim())
    skewY = both[2] !== undefined ? parseCssAngleDegrees(both[2].trim()) : 0
  }
  const sx = raw.match(/skewX\(\s*([^)]+)\s*\)/i)
  if (sx) skewX = parseCssAngleDegrees(sx[1]!.trim()) ?? skewX
  const sy = raw.match(/skewY\(\s*([^)]+)\s*\)/i)
  if (sy) skewY = parseCssAngleDegrees(sy[1]!.trim()) ?? skewY
  const out: { skewX?: number; skewY?: number } = {}
  if (skewX !== undefined && Math.abs(skewX) > 0.5) {
    out.skewX = Math.round(skewX * 100) / 100
  }
  if (skewY !== undefined && Math.abs(skewY) > 0.5) {
    out.skewY = Math.round(skewY * 100) / 100
  }
  return out
}

/** Normalize CSS text-decoration-line. */
export function parseCssTextDecoration(
  raw: string | undefined,
): DesignStyle['textDecoration'] | undefined {
  if (!raw?.trim()) return undefined
  const v = raw.toLowerCase()
  const hasU = /\bunderline\b/.test(v)
  const hasS = /\bline-through\b/.test(v)
  if (hasU && hasS) return 'underline line-through'
  if (hasU) return 'underline'
  if (hasS) return 'line-through'
  if (/\bnone\b/.test(v)) return 'none'
  return undefined
}

/** Normalize CSS text-transform. */
export function parseCssTextTransform(
  raw: string | undefined,
): DesignStyle['textTransform'] | undefined {
  if (!raw?.trim()) return undefined
  const v = raw.toLowerCase().trim()
  if (v === 'uppercase' || v === 'lowercase' || v === 'capitalize' || v === 'none') return v
  return undefined
}

/** Normalize CSS overflow (uses first token of shorthand). */
export function parseCssOverflow(raw: string | undefined): DesignStyle['overflow'] | undefined {
  if (!raw?.trim()) return undefined
  const first = raw.trim().toLowerCase().split(/\s+/)[0] ?? ''
  if (first === 'hidden' || first === 'clip') return 'hidden'
  if (first === 'scroll' || first === 'auto') return 'scroll'
  if (first === 'visible') return 'visible'
  return undefined
}

/** Normalize CSS text-overflow. */
export function parseCssTextOverflow(
  raw: string | undefined,
): DesignStyle['textOverflow'] | undefined {
  if (!raw?.trim()) return undefined
  const v = raw.trim().toLowerCase()
  if (v === 'ellipsis') return 'ellipsis'
  if (v === 'clip') return 'clip'
  return undefined
}

/**
 * Normalize CSS `clip-path` into an L1 fingerprint.
 * Keeps shape kind; polygons keep vertex count + rounded % points when present.
 */
export function parseCssClipPath(raw: string | undefined): string | undefined {
  if (!raw?.trim() || /^none$/i.test(raw.trim())) return undefined
  const v = raw.trim().toLowerCase()
  if (v.startsWith('circle')) return 'circle'
  if (v.startsWith('ellipse')) return 'ellipse'
  if (v.startsWith('inset')) return 'inset'
  if (v.startsWith('path')) return 'path'
  if (v.startsWith('url')) return 'url'
  if (v.startsWith('polygon')) {
    let depth = 0
    let commas = 0
    const open = v.indexOf('(')
    const close = v.lastIndexOf(')')
    const body = open >= 0 ? v.slice(open + 1, close >= 0 ? close : undefined) : v
    for (const ch of body) {
      if (ch === '(') depth += 1
      else if (ch === ')') depth = Math.max(0, depth - 1)
      else if (ch === ',' && depth === 0) commas += 1
    }
    const count = commas + 1
    const pts: string[] = []
    const re = /(-?[\d.]+)%\s+(-?[\d.]+)%/g
    let m: RegExpExecArray | null
    while ((m = re.exec(body)) && pts.length < 8) {
      const x = Math.round(Number(m[1]) * 10) / 10
      const y = Math.round(Number(m[2]) * 10) / 10
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push(`${x},${y}`)
    }
    return pts.length ? `polygon:${count}:${pts.join(';')}` : `polygon:${count}`
  }
  if (/^margin-box$|^border-box$|^padding-box$|^content-box$|^fill-box$|^stroke-box$|^view-box$/.test(v)) {
    return v
  }
  return 'custom'
}

/** Non-blur CSS filter fingerprint: sorted `fn:value` pairs. */
export function parseCssFilterFingerprint(raw: string | undefined): string | undefined {
  if (!raw?.trim() || /^none$/i.test(raw.trim())) return undefined
  const parts: string[] = []
  const re =
    /(brightness|contrast|saturate|grayscale|sepia|invert|hue-rotate|opacity)\(\s*([^)]+)\s*\)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const fn = m[1]!.toLowerCase()
    let val = m[2]!.trim().toLowerCase()
    if (fn === 'hue-rotate') {
      const deg = parseCssAngleDegrees(val)
      if (deg === undefined || Math.abs(deg) < 0.5) continue
      val = `${Math.round(deg * 10) / 10}deg`
    } else {
      const pct = val.match(/^([\d.]+)%$/)
      const num = pct ? Number(pct[1]) / 100 : Number.parseFloat(val)
      if (!Number.isFinite(num)) continue
      if (
        (fn === 'brightness' || fn === 'contrast' || fn === 'saturate' || fn === 'opacity') &&
        Math.abs(num - 1) < 0.01
      ) {
        continue
      }
      if ((fn === 'grayscale' || fn === 'sepia' || fn === 'invert') && Math.abs(num) < 0.01) {
        continue
      }
      val = String(Math.round(num * 1000) / 1000)
    }
    parts.push(`${fn}:${val}`)
  }
  if (!parts.length) return undefined
  return parts.sort().join('|')
}

/** Parse CSS `text-shadow` into the primary (largest blur) DesignShadow. */
export function parseCssTextShadow(raw: string | undefined): DesignShadow | undefined {
  if (!raw?.trim() || /^none$/i.test(raw.trim())) return undefined
  const layers = splitTopLevelCssList(raw)
  let best: DesignShadow | undefined
  for (const layer of layers) {
    const colorMatch =
      layer.match(/(#[0-9a-f]{3,8})\b/i) ??
      layer.match(/((?:rgba?|hsla?)\([^)]+\))/i)
    const color = colorMatch ? parseCssColor(colorMatch[1]) : undefined
    const nums = [...layer.matchAll(/(-?[\d.]+)(px|rem|em)?/gi)].map((hit) => {
      const n = Number(hit[1])
      const unit = (hit[2] ?? 'px').toLowerCase()
      return unit === 'rem' || unit === 'em' ? n * 16 : n
    })
    if (nums.length < 2) continue
    const shadow: DesignShadow = {
      offsetX: nums[0] ?? 0,
      offsetY: nums[1] ?? 0,
      blur: nums[2] ?? 0,
      ...(color ? { color } : {}),
    }
    if (!best || shadow.blur >= best.blur) best = shadow
  }
  return best
}

/** Split a CSS value on top-level commas (ignores commas inside `()`). */
function splitTopLevelCssList(raw: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!
    if (ch === '(') depth += 1
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if (ch === ',' && depth === 0) {
      out.push(raw.slice(start, i).trim())
      start = i + 1
    }
  }
  const last = raw.slice(start).trim()
  if (last) out.push(last)
  return out.filter(Boolean)
}

/** Best-effort linear/radial gradient → DesignGradient (angle + colour stops). */
function parseCssGradientValue(raw: string): DesignGradient | undefined {
  const t = raw.trim()
  const linear = t.match(/^linear-gradient\(\s*([\s\S]+)\s*\)$/i)
  const radial = t.match(/^radial-gradient\(\s*([\s\S]+)\s*\)$/i)
  const body = linear?.[1] ?? radial?.[1]
  if (!body) return undefined
  const parts = splitTopLevelCssList(body)
  if (!parts.length) return undefined
  let cssAngle = 180
  let stopStart = 0
  const angleTok = parts[0]!
  if (/^(-?[\d.]+)\s*deg$/i.test(angleTok) || /^(to\s+)/i.test(angleTok)) {
    const degM = angleTok.match(/^(-?[\d.]+)\s*deg$/i)
    if (degM) cssAngle = Number(degM[1])
    else if (/to\s+top\b/i.test(angleTok)) cssAngle = 0
    else if (/to\s+right\b/i.test(angleTok)) cssAngle = 90
    else if (/to\s+bottom\b/i.test(angleTok)) cssAngle = 180
    else if (/to\s+left\b/i.test(angleTok)) cssAngle = 270
    stopStart = 1
  }
  const stops: DesignGradient['stops'] = []
  const stopParts = parts.slice(stopStart)
  for (let i = 0; i < stopParts.length; i++) {
    const p = stopParts[i]!.trim()
    const colorTok = firstCssColorToken(p)
    const color = parseCssColor(colorTok)
    if (!color) continue
    const rest = p.slice(colorTok.length).trim()
    const pct = rest.match(/^(-?[\d.]+)%/)
    const position =
      pct ? Number(pct[1]) / 100 : stopParts.length <= 1 ? 0 : i / (stopParts.length - 1)
    stops.push({ color, position: Math.round(position * 1000) / 1000 })
  }
  if (!stops.length) return undefined
  return {
    type: radial ? 'radial' : 'linear',
    cssAngle: Math.round(cssAngle * 100) / 100,
    stops,
  }
}

/**
 * Parse CSS `background` / layered shorthand into a DesignFill stack (top→bottom).
 * Ignores `url(...)` image layers beyond recording an image fill when present.
 */
export function parseCssBackgroundFills(raw: string | undefined): DesignFill[] {
  if (!raw?.trim() || /^none$/i.test(raw.trim())) return []
  const layers = splitTopLevelCssList(raw)
  const out: DesignFill[] = []
  for (const layer of layers) {
    if (/^url\s*\(/i.test(layer)) {
      out.push({ type: 'image', imageFit: 'cover' })
      continue
    }
    if (/gradient\s*\(/i.test(layer)) {
      const g = parseCssGradientValue(layer)
      if (g) out.push({ type: 'gradient', gradient: g })
      continue
    }
    const c = parseCssColor(firstCssColorToken(layer))
    if (c) out.push({ type: 'solid', color: c })
  }
  return out
}

/**
 * Normalize CSS `object-position` to `X% Y%` for L1 compare.
 * Keywords and percentages only; length offsets are ignored.
 */
export function parseCssObjectPosition(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined
  const tokens = raw.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return undefined

  const xKw: Record<string, number> = { left: 0, center: 50, right: 100 }
  const yKw: Record<string, number> = { top: 0, center: 50, bottom: 100 }

  const pct = (tok: string): number | undefined => {
    const m = tok.match(/^(-?[\d.]+)%$/)
    if (!m) return undefined
    const n = Number(m[1])
    return Number.isFinite(n) ? n : undefined
  }

  const fmt = (x: number, y: number) => `${x}% ${y}%`

  if (tokens.length === 1) {
    const t = tokens[0]!
    if (t === 'center') return fmt(50, 50)
    if (t in xKw && t !== 'center') return fmt(xKw[t]!, 50)
    if (t in yKw && t !== 'center') return fmt(50, yKw[t]!)
    const p = pct(t)
    if (p !== undefined) return fmt(p, 50)
    return undefined
  }

  const a = tokens[0]!
  const b = tokens[1]!
  // CSS allows `top left` (vertical first) when both are keywords.
  const aIsYOnly = a === 'top' || a === 'bottom'
  const bIsXOnly = b === 'left' || b === 'right'
  let x: number | undefined
  let y: number | undefined
  if (aIsYOnly || (a in yKw && bIsXOnly)) {
    y = yKw[a] ?? pct(a)
    x = xKw[b] ?? pct(b)
  } else {
    x = xKw[a] ?? pct(a)
    y = yKw[b] ?? pct(b)
  }
  if (x === undefined && y === undefined) return undefined
  return fmt(x ?? 50, y ?? 50)
}

/** Normalize CSS `transform-origin` the same way as object-position (`X% Y%`). */
export function parseCssTransformOrigin(raw: string | undefined): string | undefined {
  return parseCssObjectPosition(raw)
}

/** Normalize CSS grid-template track list for L1 fingerprinting. */
export function normalizeCssGridTracks(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined
  let s = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  // collapse repeat(N, X) for readability
  s = s.replace(/repeat\(\s*(\d+)\s*,\s*([^)]+)\)/g, (_, n, track) => {
    const t = String(track).trim()
    return Array.from({ length: Number(n) }, () => t).join(' ')
  })
  s = s.replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s || s === 'none') return undefined
  return s
}

/** Build `cols:…|rows:…` fingerprint from template columns/rows. */
export function buildGridTemplateFingerprint(
  columns?: string,
  rows?: string,
): string | undefined {
  const cols = normalizeCssGridTracks(columns)
  const r = normalizeCssGridTracks(rows)
  if (!cols && !r) return undefined
  const parts: string[] = []
  if (cols) parts.push(`cols:${cols}`)
  if (r) parts.push(`rows:${r}`)
  return parts.join('|')
}

export function parseCssDeclarations(css: string): {
  style: DesignStyle
  width?: number
  height?: number
  x?: number
  y?: number
} {
  const style: DesignStyle = {}
  let width: number | undefined
  let height: number | undefined
  let x: number | undefined
  let y: number | undefined
  let aspectRatio: number | undefined
  /** Unitless line-height multiplier; resolved against font-size after decls. */
  let lineHeightMult: number | undefined
  /** letter-spacing in em; resolved against font-size after decls. */
  let letterSpacingEm: number | undefined
  /** word-spacing in em; resolved against font-size after decls. */
  let wordSpacingEm: number | undefined
  /** Absolute `right` / `bottom` — resolve against L1 viewport after decls. */
  let right: number | undefined
  let bottom: number | undefined
  let translateX = 0
  let translateY = 0
  let rotationAccum = 0
  let scaleXAccum: number | undefined
  let scaleYAccum: number | undefined
  let skewXAccum: number | undefined
  let skewYAccum: number | undefined
  let rotateXAccum = 0
  let rotateYAccum = 0
  let perspectiveAccum: number | undefined
  let outlineWidth: number | undefined
  let outlineStyle: string | undefined
  let outlineColor: string | undefined
  let gridTemplateColumns: string | undefined
  let gridTemplateRows: string | undefined

  for (const part of css.split(';')) {
    const idx = part.indexOf(':')
    if (idx < 0) continue
    const prop = part.slice(0, idx).trim().toLowerCase()
    const val = part.slice(idx + 1).trim()
    if (!prop || !val) continue

    switch (prop) {
      case 'width': {
        const pct = val.trim().match(/^(-?[\d.]+)%$/)
        const keyword = val.trim().toLowerCase()
        if (keyword === 'auto' || keyword === 'max-content' || keyword === 'fit-content') {
          style.sizingHorizontal = 'hug'
        } else if (keyword === '100%' || keyword === 'stretch' || keyword === 'fill-available') {
          style.sizingHorizontal = 'fill'
        } else if (pct) {
          width =
            Math.round((Number(pct[1]) / 100) * DEFAULT_CSS_CONTAINER.width * 100) / 100
          style.sizingHorizontal = Number(pct[1]) >= 99.5 ? 'fill' : 'fixed'
        } else {
          width = parseCssLength(val)
          if (width !== undefined) style.sizingHorizontal = 'fixed'
        }
        break
      }
      case 'height': {
        const pct = val.trim().match(/^(-?[\d.]+)%$/)
        const keyword = val.trim().toLowerCase()
        if (keyword === 'auto' || keyword === 'max-content' || keyword === 'fit-content') {
          style.sizingVertical = 'hug'
        } else if (keyword === '100%' || keyword === 'stretch' || keyword === 'fill-available') {
          style.sizingVertical = 'fill'
        } else if (pct) {
          height =
            Math.round((Number(pct[1]) / 100) * DEFAULT_CSS_CONTAINER.height * 100) / 100
          style.sizingVertical = Number(pct[1]) >= 99.5 ? 'fill' : 'fixed'
        } else {
          height = parseCssLength(val)
          if (height !== undefined) style.sizingVertical = 'fixed'
        }
        break
      }
      case 'min-width': {
        const n = parseCssLength(val)
        if (n !== undefined) style.minWidth = n
        break
      }
      case 'max-width': {
        const n = parseCssLength(val)
        if (n !== undefined) style.maxWidth = n
        break
      }
      case 'min-height': {
        const n = parseCssLength(val)
        if (n !== undefined) style.minHeight = n
        break
      }
      case 'max-height': {
        const n = parseCssLength(val)
        if (n !== undefined) style.maxHeight = n
        break
      }
      case 'flex-direction': {
        const v = val.trim().toLowerCase()
        if (v === 'row' || v === 'row-reverse') style.flexDirection = 'row'
        else if (v === 'column' || v === 'column-reverse') style.flexDirection = 'column'
        break
      }
      case 'align-items': {
        const v = val.trim().toLowerCase()
        if (v === 'center') style.alignItems = 'center'
        else if (v === 'flex-end' || v === 'end') style.alignItems = 'end'
        else if (v === 'flex-start' || v === 'start') style.alignItems = 'start'
        else if (v === 'stretch' || v === 'baseline') style.alignItems = 'stretch'
        break
      }
      case 'justify-content': {
        const v = val.trim().toLowerCase()
        if (v === 'center') style.justifyContent = 'center'
        else if (v === 'flex-end' || v === 'end') style.justifyContent = 'end'
        else if (v === 'flex-start' || v === 'start') style.justifyContent = 'start'
        else if (v === 'space-between') style.justifyContent = 'space-between'
        else if (v === 'space-around') style.justifyContent = 'space-around'
        else if (v === 'space-evenly') style.justifyContent = 'space-evenly'
        break
      }
      case 'flex-wrap': {
        const v = val.trim().toLowerCase()
        if (v === 'wrap' || v === 'wrap-reverse') style.flexWrap = 'wrap'
        else if (v === 'nowrap') style.flexWrap = 'nowrap'
        break
      }
      case 'align-content': {
        const v = val.trim().toLowerCase()
        if (v === 'center') style.alignContent = 'center'
        else if (v === 'flex-end' || v === 'end') style.alignContent = 'end'
        else if (v === 'flex-start' || v === 'start') style.alignContent = 'start'
        else if (v === 'stretch' || v === 'normal') style.alignContent = 'stretch'
        else if (v === 'space-between') style.alignContent = 'space-between'
        else if (v === 'space-around') style.alignContent = 'space-around'
        else if (v === 'space-evenly') style.alignContent = 'space-evenly'
        break
      }
      case 'order': {
        const n = Number.parseInt(val, 10)
        if (Number.isFinite(n) && n !== 0) style.order = n
        break
      }
      case 'grid-template-columns': {
        gridTemplateColumns = val
        break
      }
      case 'grid-template-rows': {
        gridTemplateRows = val
        break
      }
      case 'grid-template': {
        // grid-template: rows / columns
        const parts = val.split('/')
        if (parts.length >= 2) {
          gridTemplateRows = parts[0]!.trim()
          gridTemplateColumns = parts.slice(1).join('/').trim()
        } else {
          gridTemplateColumns = val
        }
        break
      }
      case 'align-self': {
        const v = val.trim().toLowerCase()
        if (v === 'center') style.alignSelf = 'center'
        else if (v === 'flex-end' || v === 'end' || v === 'self-end') style.alignSelf = 'end'
        else if (v === 'flex-start' || v === 'start' || v === 'self-start') style.alignSelf = 'start'
        else if (v === 'stretch') style.alignSelf = 'stretch'
        break
      }
      case 'flex-grow': {
        const n = Number.parseFloat(val)
        if (Number.isFinite(n) && n > 0) style.flexGrow = Math.round(n * 1000) / 1000
        break
      }
      case 'flex-shrink': {
        const n = Number.parseFloat(val)
        if (Number.isFinite(n)) style.flexShrink = Math.round(n * 1000) / 1000
        break
      }
      case 'flex': {
        // flex: grow shrink basis | grow | none | auto
        const parts = val.trim().split(/\s+/)
        if (parts[0] === 'none') {
          style.flexGrow = 0
          style.flexShrink = 0
        } else if (parts[0] === 'auto') {
          style.flexGrow = 1
          style.flexShrink = 1
        } else {
          const grow = Number.parseFloat(parts[0] ?? '')
          if (Number.isFinite(grow) && grow > 0) style.flexGrow = Math.round(grow * 1000) / 1000
          if (parts[1] !== undefined) {
            const shrink = Number.parseFloat(parts[1])
            if (Number.isFinite(shrink)) style.flexShrink = Math.round(shrink * 1000) / 1000
          }
        }
        break
      }
      case 'font-style': {
        const v = val.trim().toLowerCase()
        if (v === 'italic' || v === 'oblique') style.fontStyle = 'italic'
        break
      }
      case 'vertical-align': {
        const v = val.trim().toLowerCase()
        if (v === 'middle' || v === 'center') style.textAlignVertical = 'center'
        else if (v === 'bottom' || v === 'text-bottom') style.textAlignVertical = 'bottom'
        else if (v === 'top' || v === 'text-top' || v === 'baseline') style.textAlignVertical = 'top'
        break
      }
      case 'aspect-ratio':
        aspectRatio = parseCssAspectRatio(val)
        if (aspectRatio !== undefined && aspectRatio > 0) {
          style.aspectRatio = Math.round(aspectRatio * 1000) / 1000
        }
        break
      case 'left':
        x = parseCssLength(val)
        break
      case 'top':
        y = parseCssLength(val)
        break
      case 'right':
        right = parseCssLength(val)
        break
      case 'bottom':
        bottom = parseCssLength(val)
        break
      case 'inset': {
        // inset: all | v h | t h b | t r b l
        const parts = val.split(/\s+/).map(parseCssLength)
        const nums = parts.filter((p): p is number => p !== undefined)
        if (nums.length === 1) {
          y = nums[0]
          right = nums[0]
          bottom = nums[0]
          x = nums[0]
        } else if (nums.length === 2) {
          y = nums[0]
          bottom = nums[0]
          x = nums[1]
          right = nums[1]
        } else if (nums.length === 3) {
          y = nums[0]
          right = nums[1]
          x = nums[1]
          bottom = nums[2]
        } else if (nums.length >= 4) {
          y = nums[0]
          right = nums[1]
          bottom = nums[2]
          x = nums[3]
        }
        break
      }
      case 'box-sizing': {
        const v = val.toLowerCase().trim()
        if (v === 'border-box') style.strokeAlign = 'inside'
        else if (v === 'content-box') style.strokeAlign = 'outside'
        break
      }
      case 'background':
      case 'background-color': {
        const fills = parseCssBackgroundFills(val)
        if (fills.length) {
          style.fills = style.fills?.length ? [...fills, ...style.fills] : fills
          const topSolid = fills.find((f) => f.type === 'solid' && f.color)
          const topGrad = fills.find((f) => f.type === 'gradient' && f.gradient)
          if (topGrad?.gradient && !style.gradient) style.gradient = topGrad.gradient
          else if (topSolid?.color && !style.backgroundColor) {
            style.backgroundColor = topSolid.color
          }
          if (fills.some((f) => f.type === 'image') && !style.imageFit) {
            style.imageFit = 'cover'
          }
        } else {
          const c = parseCssColor(firstCssColorToken(val))
          if (c) style.backgroundColor = c
        }
        break
      }
      case 'color': {
        const c = parseCssColor(val)
        if (c) style.color = c
        break
      }
      case 'font-size': {
        const n = parseCssLength(val)
        if (n !== undefined) style.fontSize = n
        break
      }
      case 'margin': {
        const parts = val.split(/\s+/).map(parseCssLength)
        const nums = parts.filter((p): p is number => p !== undefined)
        if (nums.length === 1) {
          style.marginTop = style.marginRight = style.marginBottom = style.marginLeft = nums[0]
        } else if (nums.length === 2) {
          style.marginTop = style.marginBottom = nums[0]
          style.marginRight = style.marginLeft = nums[1]
        } else if (nums.length >= 4) {
          style.marginTop = nums[0]
          style.marginRight = nums[1]
          style.marginBottom = nums[2]
          style.marginLeft = nums[3]
        }
        break
      }
      case 'margin-top':
        style.marginTop = parseCssLength(val)
        break
      case 'margin-right':
        style.marginRight = parseCssLength(val)
        break
      case 'margin-bottom':
        style.marginBottom = parseCssLength(val)
        break
      case 'margin-left':
        style.marginLeft = parseCssLength(val)
        break
      case 'line-height': {
        const trimmed = val.trim().toLowerCase()
        // CSS unitless line-height is a font-size multiplier (not px).
        if (/^(-?[\d.]+)$/.test(trimmed)) {
          const mult = Number(trimmed)
          if (Number.isFinite(mult)) lineHeightMult = mult
        } else if (trimmed !== 'normal') {
          const n = parseCssLength(val)
          if (n !== undefined) style.lineHeight = n
        }
        break
      }
      case 'letter-spacing': {
        const trimmed = val.trim().toLowerCase()
        if (trimmed === 'normal') {
          style.letterSpacing = 0
        } else {
          const em = trimmed.match(/^(-?[\d.]+)em$/)
          if (em) {
            letterSpacingEm = Number(em[1])
          } else {
            const n = parseCssLength(val)
            if (n !== undefined) style.letterSpacing = n
          }
        }
        break
      }
      case 'font-weight': {
        if (val === 'bold' || val === 'bolder') style.fontWeight = 700
        else if (val === 'normal' || val === 'lighter') style.fontWeight = 400
        else {
          const n = Number(val)
          if (Number.isFinite(n)) style.fontWeight = n
        }
        break
      }
      case 'font-family':
        style.fontFamily = val.replace(/^['"]|['"]$/g, '').split(',')[0]?.trim()
        break
      case 'border-radius': {
        const n = parseCssLength(val.split(/\s+/)[0])
        if (n !== undefined) style.cornerRadius = n
        break
      }
      case 'border':
      case 'border-width': {
        const n = parseCssLength(val.split(/\s+/)[0])
        if (n !== undefined) style.borderWidth = n
        if (/dashed/i.test(val)) style.borderStyle = 'dashed'
        else if (/dotted/i.test(val)) style.borderStyle = 'dotted'
        break
      }
      case 'border-style': {
        const v = val.trim().toLowerCase()
        if (v === 'dashed') style.borderStyle = 'dashed'
        else if (v === 'dotted') style.borderStyle = 'dotted'
        else if (v === 'solid') style.borderStyle = 'solid'
        break
      }
      case 'stroke-dasharray': {
        const nums = val
          .trim()
          .toLowerCase()
          .split(/[\s,]+/)
          .map((t) => Number.parseFloat(t))
          .filter((n) => Number.isFinite(n) && n > 0)
        if (nums.length) {
          style.strokeDashArray = nums.map((n) => String(Math.round(n * 100) / 100)).join(',')
          if (!style.borderStyle) {
            const max = Math.max(...nums)
            const min = Math.min(...nums)
            style.borderStyle =
              max <= 2 && max / Math.max(min, 0.01) <= 1.5 ? 'dotted' : 'dashed'
          }
        }
        break
      }
      case 'stroke-linecap': {
        const v = val.trim().toLowerCase()
        if (v === 'round' || v === 'square' || v === 'butt') style.strokeCap = v
        break
      }
      case 'stroke-linejoin': {
        const v = val.trim().toLowerCase()
        if (v === 'round' || v === 'bevel' || v === 'miter') style.strokeJoin = v
        break
      }
      case 'border-color': {
        const c = parseCssColor(val)
        if (c) style.borderColor = c
        break
      }
      case 'border-top':
      case 'border-right':
      case 'border-bottom':
      case 'border-left': {
        const side = prop.slice('border-'.length) as 'top' | 'right' | 'bottom' | 'left'
        const widthTok = val.split(/\s+/).find((t) => parseCssLength(t) !== undefined)
        const w = parseCssLength(widthTok)
        const colorTok = val
          .split(/\s+/)
          .find(
            (t) =>
              !/^(solid|dashed|dotted|double|none|hidden|groove|ridge|inset|outset)$/i.test(t) &&
              parseCssLength(t) === undefined &&
              !!parseCssColor(t),
          )
        const c =
          (colorTok ? parseCssColor(colorTok) : undefined) ??
          (/^(?:rgba?|hsla?|oklch|color-mix|light-dark)\s*\(/i.test(val.trim())
            ? parseCssColor(firstCssColorToken(val))
            : undefined)
        if (side === 'top') {
          if (w !== undefined) style.borderTopWidth = w
          if (c) style.borderTopColor = c
        } else if (side === 'right') {
          if (w !== undefined) style.borderRightWidth = w
          if (c) style.borderRightColor = c
        } else if (side === 'bottom') {
          if (w !== undefined) style.borderBottomWidth = w
          if (c) style.borderBottomColor = c
        } else {
          if (w !== undefined) style.borderLeftWidth = w
          if (c) style.borderLeftColor = c
        }
        break
      }
      case 'border-top-width': {
        const n = parseCssLength(val)
        if (n !== undefined) style.borderTopWidth = n
        break
      }
      case 'border-right-width': {
        const n = parseCssLength(val)
        if (n !== undefined) style.borderRightWidth = n
        break
      }
      case 'border-bottom-width': {
        const n = parseCssLength(val)
        if (n !== undefined) style.borderBottomWidth = n
        break
      }
      case 'border-left-width': {
        const n = parseCssLength(val)
        if (n !== undefined) style.borderLeftWidth = n
        break
      }
      case 'border-top-color': {
        const c = parseCssColor(val)
        if (c) style.borderTopColor = c
        break
      }
      case 'border-right-color': {
        const c = parseCssColor(val)
        if (c) style.borderRightColor = c
        break
      }
      case 'border-bottom-color': {
        const c = parseCssColor(val)
        if (c) style.borderBottomColor = c
        break
      }
      case 'border-left-color': {
        const c = parseCssColor(val)
        if (c) style.borderLeftColor = c
        break
      }
      case 'opacity': {
        const n = Number(val)
        if (Number.isFinite(n)) style.opacity = n
        break
      }
      case 'box-shadow': {
        const fx = parseCssBoxShadowEffects(val)
        if (fx.elevation !== undefined) style.elevation = fx.elevation
        if (fx.innerShadow !== undefined) style.innerShadow = fx.innerShadow
        if (fx.shadow) style.shadow = fx.shadow
        if (fx.insetShadow) style.insetShadow = fx.insetShadow
        if (fx.shadows) style.shadows = fx.shadows
        break
      }
      case 'mix-blend-mode': {
        const v = val.toLowerCase().trim()
        if (v && v !== 'normal') style.blendMode = v
        break
      }
      case 'filter': {
        const b = parseCssFilterBlur(val)
        if (b !== undefined) {
          style.blur =
            typeof style.blur === 'number' ? Math.max(style.blur, b) : b
        }
        const fp = parseCssFilterFingerprint(val)
        if (fp) style.filter = fp
        break
      }
      case 'backdrop-filter': {
        const b = parseCssFilterBlur(val)
        if (b !== undefined) {
          style.backdropBlur =
            typeof style.backdropBlur === 'number'
              ? Math.max(style.backdropBlur, b)
              : b
        }
        break
      }
      case 'text-shadow': {
        const ts = parseCssTextShadow(val)
        if (ts) style.textShadow = ts
        break
      }
      case 'perspective': {
        const n = parseCssLength(val)
        if (n !== undefined && n > 0) perspectiveAccum = n
        break
      }
      case 'direction': {
        const v = val.trim().toLowerCase()
        if (v === 'rtl' || v === 'ltr') style.direction = v
        break
      }
      case 'writing-mode': {
        const v = val.trim().toLowerCase()
        if (v === 'vertical-rl' || v === 'vertical-lr' || v === 'horizontal-tb') {
          style.writingMode = v
        } else if (v === 'tb' || v === 'tb-rl') style.writingMode = 'vertical-rl'
        else if (v === 'lr' || v === 'lr-tb') style.writingMode = 'horizontal-tb'
        break
      }
      case 'outline': {
        // outline: [width] [style] [color] (any order)
        const w = val.match(/(-?[\d.]+)(px|rem|em)\b/i)
        if (w) {
          const n = Number(w[1])
          const unit = (w[2] ?? 'px').toLowerCase()
          outlineWidth = unit === 'rem' || unit === 'em' ? n * 16 : n
        }
        if (/dashed/i.test(val)) outlineStyle = 'dashed'
        else if (/dotted/i.test(val)) outlineStyle = 'dotted'
        else if (/solid/i.test(val)) outlineStyle = 'solid'
        else if (/none/i.test(val)) outlineStyle = 'none'
        const c =
          parseCssColor(val.match(/(#[0-9a-f]{3,8})\b/i)?.[1]) ??
          parseCssColor(val.match(/((?:rgba?|hsla?)\([^)]+\))/i)?.[1])
        if (c) outlineColor = c
        break
      }
      case 'outline-width': {
        const n = parseCssLength(val)
        if (n !== undefined) outlineWidth = n
        break
      }
      case 'outline-style': {
        const v = val.trim().toLowerCase()
        if (v === 'solid' || v === 'dashed' || v === 'dotted' || v === 'none') outlineStyle = v
        break
      }
      case 'outline-color': {
        const c = parseCssColor(val)
        if (c) outlineColor = c
        break
      }
      case 'position': {
        const v = val.trim().toLowerCase()
        if (v === 'absolute' || v === 'relative' || v === 'fixed' || v === 'sticky') {
          style.position = v
        }
        break
      }
      case 'transform-origin': {
        const origin = parseCssTransformOrigin(val)
        if (origin) style.transformOrigin = origin
        break
      }
      case 'visibility': {
        const v = val.trim().toLowerCase()
        if (v === 'hidden' || v === 'collapse') style.visibility = v
        else if (v === 'visible') style.visibility = 'visible'
        break
      }
      case 'display': {
        const v = val.trim().toLowerCase()
        if (
          v === 'none' ||
          v === 'flex' ||
          v === 'inline-flex' ||
          v === 'grid' ||
          v === 'block' ||
          v === 'inline'
        ) {
          style.display = v
        }
        break
      }
      case 'white-space': {
        const v = val.trim().toLowerCase()
        if (
          v === 'nowrap' ||
          v === 'pre' ||
          v === 'pre-wrap' ||
          v === 'pre-line' ||
          v === 'normal'
        ) {
          style.whiteSpace = v
        }
        break
      }
      case 'word-break':
      case 'overflow-wrap':
      case 'word-wrap': {
        const v = val.trim().toLowerCase()
        if (v === 'break-all' || v === 'keep-all') style.wordBreak = v
        else if (v === 'break-word' || v === 'anywhere') style.wordBreak = 'break-word'
        else if (v === 'normal') style.wordBreak = 'normal'
        break
      }
      case 'word-spacing': {
        if (/^normal$/i.test(val.trim())) {
          style.wordSpacing = 0
        } else {
          const em = val.trim().match(/^(-?[\d.]+)em$/i)
          if (em) wordSpacingEm = Number(em[1])
          else {
            const n = parseCssLength(val)
            if (n !== undefined) style.wordSpacing = n
          }
        }
        break
      }
      case 'text-indent': {
        const n = parseCssLength(val)
        if (n !== undefined && Math.abs(n) > 0.5) style.textIndent = n
        break
      }
      case 'transform': {
        const t = parseCssTranslate(val)
        if (t.x !== undefined) translateX += t.x
        if (t.y !== undefined) translateY += t.y
        const rot = parseCssRotate(val)
        if (rot !== undefined) rotationAccum += rot
        const rx = val.match(/rotateX\(\s*([^)]+)\s*\)/i)
        if (rx) {
          const d = parseCssAngleDegrees(rx[1]!.trim())
          if (d !== undefined) rotateXAccum += d
        }
        const ry = val.match(/rotateY\(\s*([^)]+)\s*\)/i)
        if (ry) {
          const d = parseCssAngleDegrees(ry[1]!.trim())
          if (d !== undefined) rotateYAccum += d
        }
        const persp = val.match(/perspective\(\s*([^)]+)\s*\)/i)
        if (persp) {
          const n = parseCssLength(persp[1]!.trim())
          if (n !== undefined && n > 0) perspectiveAccum = n
        }
        const sc = parseCssScale(val)
        if (sc.scaleX !== undefined) {
          scaleXAccum = (scaleXAccum ?? 1) * sc.scaleX
        }
        if (sc.scaleY !== undefined) {
          scaleYAccum = (scaleYAccum ?? 1) * sc.scaleY
        }
        const sk = parseCssSkew(val)
        if (sk.skewX !== undefined) {
          skewXAccum = (skewXAccum ?? 0) + sk.skewX
        }
        if (sk.skewY !== undefined) {
          skewYAccum = (skewYAccum ?? 0) + sk.skewY
        }
        break
      }
      case 'rotate': {
        const rot = parseCssRotate(val)
        if (rot !== undefined) rotationAccum += rot
        break
      }
      case 'scale': {
        const sc = parseCssScale(val)
        if (sc.scaleX !== undefined) scaleXAccum = sc.scaleX
        if (sc.scaleY !== undefined) scaleYAccum = sc.scaleY
        break
      }
      case 'z-index': {
        const n = Number(val.trim())
        if (Number.isFinite(n) && n !== 0) style.zIndex = Math.round(n)
        break
      }
      case 'text-decoration':
      case 'text-decoration-line': {
        const d = parseCssTextDecoration(val)
        if (d && d !== 'none') style.textDecoration = d
        break
      }
      case 'text-transform': {
        const t = parseCssTextTransform(val)
        if (t && t !== 'none') style.textTransform = t
        break
      }
      case 'overflow':
      case 'overflow-x':
      case 'overflow-y': {
        const o = parseCssOverflow(val)
        if (o && o !== 'visible') {
          // Prefer hidden over scroll when mixed axes already set hidden.
          if (style.overflow !== 'hidden') style.overflow = o
        }
        break
      }
      case 'text-overflow': {
        const t = parseCssTextOverflow(val)
        if (t) style.textOverflow = t
        break
      }
      case '-webkit-line-clamp':
      case 'line-clamp': {
        const n = Number(val.trim())
        if (Number.isFinite(n) && n > 0) {
          style.maxLines = Math.round(n)
          if (!style.textOverflow) style.textOverflow = 'ellipsis'
          if (!style.overflow || style.overflow === 'visible') style.overflow = 'hidden'
        }
        break
      }
      case 'clip-path': {
        const fp = parseCssClipPath(val)
        if (fp) {
          style.clipPath = fp
          if (!style.overflow || style.overflow === 'visible') style.overflow = 'hidden'
        }
        break
      }
      case 'object-fit': {
        const v = val.toLowerCase()
        if (v === 'cover') style.imageFit = 'cover'
        else if (v === 'contain' || v === 'scale-down' || v === 'none') style.imageFit = 'contain'
        else if (v === 'fill') style.imageFit = 'fill'
        break
      }
      case 'background-size': {
        if (style.imageFit !== undefined) break
        const v = val.toLowerCase().trim()
        if (v === 'cover') style.imageFit = 'cover'
        else if (v === 'contain') style.imageFit = 'contain'
        else if (v === '100% 100%') style.imageFit = 'fill'
        break
      }
      case 'object-position': {
        const pos = parseCssObjectPosition(val)
        if (pos) style.imagePosition = pos
        break
      }
      case 'background-position': {
        if (style.imagePosition !== undefined) break
        const pos = parseCssObjectPosition(val)
        if (pos) style.imagePosition = pos
        break
      }
      case 'padding': {
        const parts = val.split(/\s+/).map(parseCssLength)
        const nums = parts.filter((p): p is number => p !== undefined)
        if (nums.length === 1) {
          style.paddingTop = style.paddingRight = style.paddingBottom = style.paddingLeft = nums[0]
        } else if (nums.length === 2) {
          style.paddingTop = style.paddingBottom = nums[0]
          style.paddingRight = style.paddingLeft = nums[1]
        } else if (nums.length >= 4) {
          style.paddingTop = nums[0]
          style.paddingRight = nums[1]
          style.paddingBottom = nums[2]
          style.paddingLeft = nums[3]
        }
        break
      }
      case 'padding-top':
        style.paddingTop = parseCssLength(val)
        break
      case 'padding-right':
        style.paddingRight = parseCssLength(val)
        break
      case 'padding-bottom':
        style.paddingBottom = parseCssLength(val)
        break
      case 'padding-left':
        style.paddingLeft = parseCssLength(val)
        break
      case 'gap': {
        const parts = val.trim().split(/\s+/)
        const row = parseCssLength(parts[0]!)
        const col = parts[1] !== undefined ? parseCssLength(parts[1]!) : row
        if (row !== undefined) {
          style.gap = row
          style.rowGap = row
        }
        if (col !== undefined) style.columnGap = col
        if (
          row !== undefined &&
          col !== undefined &&
          Math.abs(row - col) > 0.01
        ) {
          // Keep gap as the primary (row) value; axes stay distinct.
          style.gap = row
        }
        break
      }
      case 'row-gap': {
        const n = parseCssLength(val)
        if (n !== undefined) {
          style.rowGap = n
          if (style.gap === undefined) style.gap = n
        }
        break
      }
      case 'column-gap': {
        const n = parseCssLength(val)
        if (n !== undefined) {
          style.columnGap = n
          if (style.gap === undefined) style.gap = n
        }
        break
      }
      case 'text-align':
        if (val === 'left' || val === 'center' || val === 'right' || val === 'justify') {
          style.textAlign = val
        }
        break
      default:
        break
    }
  }

  if (aspectRatio && aspectRatio > 0) {
    if (width !== undefined && height === undefined) {
      height = Math.round((width / aspectRatio) * 100) / 100
    } else if (height !== undefined && width === undefined) {
      width = Math.round(height * aspectRatio * 100) / 100
    }
  }

  const fontSize = typeof style.fontSize === 'number' ? style.fontSize : 16
  if (lineHeightMult !== undefined) {
    style.lineHeight = Math.round(lineHeightMult * fontSize * 100) / 100
  }
  if (letterSpacingEm !== undefined) {
    style.letterSpacing = Math.round(letterSpacingEm * fontSize * 100) / 100
  }
  if (wordSpacingEm !== undefined) {
    style.wordSpacing = Math.round(wordSpacingEm * fontSize * 100) / 100
  }

  // Absolute right/bottom → x/y against L1 default viewport (360×640).
  // left+right / top+bottom stretch → infer missing width/height.
  const parentW = DEFAULT_CSS_CONTAINER.width
  const parentH = DEFAULT_CSS_CONTAINER.height
  if (width === undefined && x !== undefined && right !== undefined) {
    width = Math.round((parentW - x - right) * 100) / 100
  }
  if (height === undefined && y !== undefined && bottom !== undefined) {
    height = Math.round((parentH - y - bottom) * 100) / 100
  }
  if (x === undefined && right !== undefined && width !== undefined) {
    x = Math.round((parentW - right - width) * 100) / 100
  }
  if (y === undefined && bottom !== undefined && height !== undefined) {
    y = Math.round((parentH - bottom - height) * 100) / 100
  }
  if (translateX) x = Math.round(((x ?? 0) + translateX) * 100) / 100
  if (translateY) y = Math.round(((y ?? 0) + translateY) * 100) / 100
  if (Math.abs(rotationAccum) > 0.5) {
    style.rotation = Math.round(rotationAccum * 100) / 100
  }
  if (scaleXAccum !== undefined && Math.abs(scaleXAccum - 1) > 0.02) {
    style.scaleX = Math.round(scaleXAccum * 1000) / 1000
  }
  if (scaleYAccum !== undefined && Math.abs(scaleYAccum - 1) > 0.02) {
    style.scaleY = Math.round(scaleYAccum * 1000) / 1000
  }
  if (skewXAccum !== undefined && Math.abs(skewXAccum) > 0.5) {
    style.skewX = Math.round(skewXAccum * 100) / 100
  }
  if (skewYAccum !== undefined && Math.abs(skewYAccum) > 0.5) {
    style.skewY = Math.round(skewYAccum * 100) / 100
  }
  if (Math.abs(rotateXAccum) > 0.5) {
    style.rotateX = Math.round(rotateXAccum * 100) / 100
  }
  if (Math.abs(rotateYAccum) > 0.5) {
    style.rotateY = Math.round(rotateYAccum * 100) / 100
  }
  if (perspectiveAccum !== undefined && perspectiveAccum > 0) {
    style.perspective = Math.round(perspectiveAccum * 100) / 100
  }
  if (
    (outlineWidth !== undefined && outlineWidth > 0) ||
    (outlineStyle && outlineStyle !== 'none') ||
    outlineColor
  ) {
    const w = outlineWidth !== undefined ? Math.round(outlineWidth * 100) / 100 : 0
    const s = outlineStyle ?? 'solid'
    const c = (outlineColor ?? '').toLowerCase()
    style.outline = `${w},${s},${c}`
  }

  const gridFp = buildGridTemplateFingerprint(gridTemplateColumns, gridTemplateRows)
  if (gridFp) {
    style.gridTemplate = gridFp
    if (!style.display) style.display = 'grid'
  }

  return { style, width, height, x, y }
}

export interface SimpleStyleRules {
  classes: Map<string, string>
  ids: Map<string, string>
}

function mergeDecl(prev: string | undefined, next: string): string {
  if (!prev) return next
  if (!next) return prev
  return `${prev};${next}`
}

/** Rightmost compound in a selector; collect its .class / #id tokens. */
function targetsFromSelector(selector: string): { classes: string[]; ids: string[] } {
  const compound = selector.trim().split(/[\s>+~]+/).pop() ?? ''
  const classes = [...compound.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]!)
  const ids = [...compound.matchAll(/#([A-Za-z_][\w-]*)/g)].map((m) => m[1]!)
  // `.card.active` should target `active` only — otherwise nested `&.active`
  // overwrites the parent `.card` declarations when both class tokens are applied.
  const focusedClasses = classes.length > 1 ? [classes[classes.length - 1]!] : classes
  const focusedIds = ids.length > 1 ? [ids[ids.length - 1]!] : ids
  return { classes: focusedClasses, ids: focusedIds }
}

function findMatchingBrace(src: string, openIdx: number): number {
  let depth = 0
  for (let i = openIdx; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Extract `.class` / `#id` rules from a CSS(/light SCSS) stylesheet.
 * Supports comma selectors, compound selectors, @media-unwrapped sheets, and
 * one level of SCSS nesting (`&` / descendant).
 */
export function parseSimpleStyleRules(css: string): SimpleStyleRules {
  const classes = new Map<string, string>()
  const ids = new Map<string, string>()
  const sheet = preprocessStylesheet(css)

  const applyRule = (selectorList: string, body: string) => {
    const decls = body
      .replace(/[.#@A-Za-z_&][^{;]*\{[\s\S]*\}/g, '')
      .trim()
    if (!decls || !decls.includes(':')) return
    for (const sel of selectorList.split(',')) {
      const trimmed = sel.trim()
      if (!trimmed) continue
      const { classes: cls, ids: idList } = targetsFromSelector(trimmed)
      for (const c of cls) classes.set(c, mergeDecl(classes.get(c), decls))
      for (const id of idList) ids.set(id, mergeDecl(ids.get(id), decls))
    }
  }

  const resolveChildSelectors = (parentSelectors: string[], childList: string): string[] => {
    const children = childList
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!parentSelectors.length) return children
    return parentSelectors.flatMap((parent) =>
      children.map((child) => (child.includes('&') ? child.replace(/&/g, parent) : `${parent} ${child}`)),
    )
  }

  const walk = (text: string, parentSelectors: string[]) => {
    let i = 0
    const src = text
    while (i < src.length) {
      while (i < src.length && /\s/.test(src[i]!)) i += 1
      if (i >= src.length) break
      if (src[i] === '}') {
        i += 1
        continue
      }

      if (src[i] === '@') {
        const brace = src.indexOf('{', i)
        if (brace < 0) break
        const end = findMatchingBrace(src, brace)
        if (end < 0) break
        // Keep inner of leftover @media-like blocks.
        if (/^@(?:media|supports|layer)\b/i.test(src.slice(i))) {
          walk(src.slice(brace + 1, end), parentSelectors)
        }
        i = end + 1
        continue
      }

      const brace = src.indexOf('{', i)
      if (brace < 0) break
      const rawSelector = src.slice(i, brace).trim()
      const end = findMatchingBrace(src, brace)
      if (end < 0) break
      const inner = src.slice(brace + 1, end)
      const resolved = resolveChildSelectors(parentSelectors, rawSelector)

      if (inner.includes('{')) {
        // Property lines before the first nested rule (selector `{`…}).
        let firstNested = -1
        let from = 0
        while (from < inner.length) {
          const brace = inner.indexOf('{', from)
          if (brace < 0) break
          const before = inner.slice(0, brace)
          const lastSemi = before.lastIndexOf(';')
          const chunk = before.slice(lastSemi + 1).trim()
          if (chunk && (/[.#&@]/.test(chunk) || /^&/.test(chunk))) {
            firstNested = lastSemi + 1
            break
          }
          from = brace + 1
        }
        const leading = (firstNested >= 0 ? inner.slice(0, firstNested) : inner).trim()
        if (leading.includes(':')) applyRule(resolved.join(','), leading)
        walk(inner, resolved)
      } else {
        applyRule(resolved.join(','), inner.trim())
      }
      i = end + 1
    }
  }

  walk(sheet, [])
  return { classes, ids }
}

/** Extract simple `.class { ... }` rules from a CSS stylesheet. */
export function parseSimpleClassRules(css: string): Map<string, string> {
  return parseSimpleStyleRules(css).classes
}

/** Decode a few common HTML entities. */
export function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function findCssMatchingBrace(src: string, openIdx: number): number {
  let depth = 0
  for (let i = openIdx; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function unwrapCssAtRuleBlocks(src: string, re: RegExp): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const slice = src.slice(i)
    const m = slice.match(re)
    if (!m || m.index === undefined) {
      out += src.slice(i)
      break
    }
    const abs = i + m.index
    out += src.slice(i, abs)
    const brace = src.indexOf('{', abs)
    if (brace < 0) {
      out += src.slice(abs)
      break
    }
    const end = findCssMatchingBrace(src, brace)
    if (end < 0) {
      out += src.slice(abs)
      break
    }
    out += src.slice(brace + 1, end)
    i = end + 1
  }
  return out
}

function dropCssAtRuleBlocks(src: string, re: RegExp): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const slice = src.slice(i)
    const m = slice.match(re)
    if (!m || m.index === undefined) {
      out += src.slice(i)
      break
    }
    const abs = i + m.index
    out += src.slice(i, abs)
    const brace = src.indexOf('{', abs)
    if (brace < 0) {
      i = abs + m[0].length
      continue
    }
    const end = findCssMatchingBrace(src, brace)
    if (end < 0) break
    i = end + 1
  }
  return out
}

/**
 * L1 defaults to light appearance:
 * unwrap `prefers-color-scheme: light`, drop `prefers-color-scheme: dark`.
 * Other `@media` blocks are left for the generic unwrap pass.
 */
export function filterPrefersColorSchemeBlocks(
  src: string,
  prefer: 'light' | 'dark' = 'light',
): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const slice = src.slice(i)
    const m = slice.match(/@media\b/i)
    if (!m || m.index === undefined) {
      out += src.slice(i)
      break
    }
    const abs = i + m.index
    out += src.slice(i, abs)
    const brace = src.indexOf('{', abs)
    if (brace < 0) {
      out += src.slice(abs)
      break
    }
    const query = src.slice(abs, brace)
    const end = findCssMatchingBrace(src, brace)
    if (end < 0) {
      out += src.slice(abs)
      break
    }
    const scheme = query.match(/prefers-color-scheme\s*:\s*(light|dark)/i)?.[1]?.toLowerCase()
    if (scheme === prefer) {
      out += src.slice(brace + 1, end)
    } else if (scheme) {
      // opposite scheme — drop
    } else {
      out += src.slice(abs, end + 1)
    }
    i = end + 1
  }
  return out
}

/**
 * Read `color-scheme` declarations to decide L1 light/dark preference.
 * `only dark` / bare `dark` → dark; otherwise light (including `light dark`).
 */
export function resolveCssColorSchemePrefer(css: string): 'light' | 'dark' {
  let prefer: 'light' | 'dark' = 'light'
  // Avoid matching inside `prefers-color-scheme`.
  for (const m of css.matchAll(/(?<![-\w])color-scheme\s*:\s*([^;{}]+)/gi)) {
    const val = m[1]!.trim().toLowerCase().replace(/\s+/g, ' ')
    if (val === 'dark' || val === 'only dark') prefer = 'dark'
    else if (/\blight\b/.test(val)) prefer = 'light'
  }
  return prefer
}

/** Replace `light-dark(a, b)` with the preferred branch before rule parsing. */
export function rewriteLightDarkFunctions(
  css: string,
  prefer: 'light' | 'dark' = 'light',
): string {
  let out = ''
  let i = 0
  while (i < css.length) {
    const rel = css.slice(i).search(/light-dark\s*\(/i)
    if (rel < 0) {
      out += css.slice(i)
      break
    }
    const abs = i + rel
    out += css.slice(i, abs)
    const open = css.indexOf('(', abs)
    if (open < 0) {
      out += css.slice(abs)
      break
    }
    let depth = 0
    let end = -1
    for (let j = open; j < css.length; j++) {
      if (css[j] === '(') depth += 1
      else if (css[j] === ')') {
        depth -= 1
        if (depth === 0) {
          end = j
          break
        }
      }
    }
    if (end < 0) {
      out += css.slice(abs)
      break
    }
    const args = splitCssTopLevelArgs(css.slice(open + 1, end))
    const pick =
      prefer === 'dark' ? (args[1] ?? args[0] ?? '') : (args[0] ?? '')
    out += pick.trim()
    i = end + 1
  }
  return out
}

/**
 * Assumed container size for `@container` / `cq*` (matches parseCssLength).
 */
export const DEFAULT_CSS_CONTAINER = { width: 360, height: 640 }

function parseContainerQueryLength(raw: string): number | undefined {
  const m = raw.trim().match(/^(-?[\d.]+)\s*(px|rem|em|vw|vh|%)?$/i)
  if (!m) return undefined
  const n = Number(m[1])
  if (!Number.isFinite(n)) return undefined
  const u = (m[2] ?? 'px').toLowerCase()
  if (u === 'px') return n
  if (u === 'rem' || u === 'em') return n * 16
  if (u === 'vw') return (n / 100) * DEFAULT_CSS_CONTAINER.width
  if (u === 'vh') return (n / 100) * DEFAULT_CSS_CONTAINER.height
  if (u === '%') return (n / 100) * DEFAULT_CSS_CONTAINER.width
  return n
}

/** Whether an `@container` condition matches the L1 default container size. */
export function containerQueryMatches(
  query: string,
  size: { width: number; height: number } = DEFAULT_CSS_CONTAINER,
): boolean {
  const conditions = [
    ...query.matchAll(/\(\s*(min|max)-(width|height)\s*:\s*([^)]+)\)/gi),
  ]
  if (!conditions.length) return true
  for (const c of conditions) {
    const minmax = c[1]!.toLowerCase()
    const dim = c[2]!.toLowerCase()
    const val = parseContainerQueryLength(c[3]!)
    if (val === undefined) continue
    const actual = dim === 'width' ? size.width : size.height
    if (minmax === 'min' && actual < val) return false
    if (minmax === 'max' && actual > val) return false
  }
  return true
}

/**
 * Keep `@container` blocks that match the default 360×640 container; drop the rest.
 * Matching blocks are unwrapped (inner rules promoted).
 */
export function filterContainerQueryBlocks(
  src: string,
  size: { width: number; height: number } = DEFAULT_CSS_CONTAINER,
): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const slice = src.slice(i)
    const m = slice.match(/@container\b/i)
    if (!m || m.index === undefined) {
      out += src.slice(i)
      break
    }
    const abs = i + m.index
    out += src.slice(i, abs)
    const brace = src.indexOf('{', abs)
    if (brace < 0) {
      out += src.slice(abs)
      break
    }
    const query = src.slice(abs, brace)
    const end = findCssMatchingBrace(src, brace)
    if (end < 0) {
      out += src.slice(abs)
      break
    }
    if (containerQueryMatches(query, size)) {
      out += src.slice(brace + 1, end)
    }
    i = end + 1
  }
  return out
}

/**
 * Flatten light SCSS/LESS noise so rule parsing can see class bodies:
 * comments, :global(), and @media/@supports wrappers.
 * Also inlines custom properties (`var(--token)`) from `:root` / theme blocks.
 * `@media (prefers-color-scheme: …)` / `light-dark()` follow `color-scheme`
 * (default light). `@container` keeps rules matching the default 360×640 size.
 */
export function preprocessStylesheet(css: string): string {
  let s = css.replace(/\/\*[\s\S]*?\*\//g, '\n')
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  s = s.replace(/:global\(([^)]*)\)/g, '$1')
  s = s.replace(/:global\s*\{/g, '{')
  const prefer = resolveCssColorSchemePrefer(s)
  s = filterPrefersColorSchemeBlocks(s, prefer)
  s = rewriteLightDarkFunctions(s, prefer)
  s = filterContainerQueryBlocks(s)
  s = unwrapCssAtRuleBlocks(s, /@(?:media|supports|layer)\b/i)
  s = dropCssAtRuleBlocks(s, /@(?:keyframes|font-face|property)\b/i)
  return resolveCssVarReferences(s)
}

/** Collect `--name: value` custom properties from a stylesheet. */
export function extractCssCustomProperties(css: string): Map<string, string> {
  const vars = new Map<string, string>()
  for (const m of css.matchAll(/(--[A-Za-z_][\w-]*)\s*:\s*([^;{}]+)/g)) {
    const name = m[1]!
    const value = m[2]!.trim()
    if (name && value) vars.set(name, value)
  }
  return vars
}

/**
 * Find the first `display: flex` rule with gap / align-items / justify-content.
 */
export function extractFlexGapHint(css: string):
  | {
      gap: number
      direction: 'row' | 'column'
      alignItems: 'start' | 'center' | 'end' | 'stretch'
      justifyContent: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly'
    }
  | undefined {
  const sheet = preprocessStylesheet(css)
  const parseAlign = (raw: string): 'start' | 'center' | 'end' | 'stretch' => {
    const v = raw.trim().toLowerCase().split(/\s+/)[0] ?? ''
    if (v === 'center') return 'center'
    if (v === 'flex-end' || v === 'end' || v === 'right' || v === 'bottom') return 'end'
    if (v === 'flex-start' || v === 'start' || v === 'left' || v === 'top') return 'start'
    return 'stretch'
  }
  const parseJustify = (
    raw: string,
  ): 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly' => {
    const v = raw.trim().toLowerCase()
    if (v === 'center') return 'center'
    if (v === 'flex-end' || v === 'end' || v === 'right' || v === 'bottom') return 'end'
    if (v === 'space-between') return 'space-between'
    if (v === 'space-around') return 'space-around'
    if (v === 'space-evenly') return 'space-evenly'
    return 'start'
  }
  for (const m of sheet.matchAll(/\{([^{}]+)\}/g)) {
    const body = m[1]!
    if (!/display\s*:\s*flex\b/i.test(body) && !/display\s*:\s*grid\b/i.test(body)) continue
    const dirM = body.match(/flex-direction\s*:\s*(row|column)(?:-reverse)?/i)
    const direction: 'row' | 'column' =
      dirM && dirM[1]!.toLowerCase().startsWith('column') ? 'column' : 'row'
    let gapVal: number | undefined
    const g = body.match(/(?:^|;)\s*gap\s*:\s*([^;]+)/i)
    if (g) gapVal = parseCssLength(g[1]!.trim().split(/\s+/)[0]!)
    if (gapVal === undefined) {
      const specific =
        direction === 'column'
          ? body.match(/(?:^|;)\s*row-gap\s*:\s*([^;]+)/i)
          : body.match(/(?:^|;)\s*column-gap\s*:\s*([^;]+)/i)
      if (specific) gapVal = parseCssLength(specific[1]!.trim())
    }
    let alignItems: 'start' | 'center' | 'end' | 'stretch' = 'stretch'
    const place = body.match(/(?:^|;)\s*place-items\s*:\s*([^;]+)/i)
    const align = body.match(/(?:^|;)\s*align-items\s*:\s*([^;]+)/i)
    if (place) alignItems = parseAlign(place[1]!)
    else if (align) alignItems = parseAlign(align[1]!)
    let justifyContent: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly' =
      'start'
    const placeContent = body.match(/(?:^|;)\s*place-content\s*:\s*([^;]+)/i)
    const justify = body.match(/(?:^|;)\s*justify-content\s*:\s*([^;]+)/i)
    if (justify) justifyContent = parseJustify(justify[1]!)
    else if (placeContent) justifyContent = parseJustify(placeContent[1]!.trim().split(/\s+/)[0]!)
    if (gapVal === undefined && alignItems === 'stretch' && justifyContent === 'start') continue
    return { gap: gapVal ?? 0, direction, alignItems, justifyContent }
  }
  return undefined
}

/**
 * Roughly stack unpositioned siblings using flex gap + align/justify.
 */
export function applyFlexGapLayout(
  children: Array<{
    box: {
      x?: number | { unresolved: true; raw: string }
      y?: number | { unresolved: true; raw: string }
      width?: number | { unresolved: true; raw: string }
      height?: number | { unresolved: true; raw: string }
    }
  }>,
  css: string,
): void {
  const hint = extractFlexGapHint(css)
  if (!hint || children.length < 2) return
  const dim = (v: number | { unresolved: true; raw: string } | undefined): number | undefined =>
    typeof v === 'number' ? v : undefined
  const targets = children.filter((c) => {
    if (dim(c.box.x) !== undefined || dim(c.box.y) !== undefined) return false
    return hint.direction === 'column'
      ? dim(c.box.height) !== undefined
      : dim(c.box.width) !== undefined
  })
  if (targets.length < 2) return

  const mainSizes = targets.map((c) =>
    hint.direction === 'column' ? (dim(c.box.height) ?? 0) : (dim(c.box.width) ?? 0),
  )
  const crossSizes = targets.map((c) =>
    hint.direction === 'column' ? (dim(c.box.width) ?? 0) : (dim(c.box.height) ?? 0),
  )
  const maxCross = Math.max(0, ...crossSizes)
  const sumMain = mainSizes.reduce((a, b) => a + b, 0)
  const n = targets.length
  const containerMain =
    hint.direction === 'row' ? DEFAULT_CSS_CONTAINER.width : DEFAULT_CSS_CONTAINER.height
  const free = Math.max(0, containerMain - sumMain)

  let gap = hint.gap
  let offset = 0
  switch (hint.justifyContent) {
    case 'center': {
      const packed = sumMain + gap * (n - 1)
      offset = Math.max(0, Math.round(((containerMain - packed) / 2) * 100) / 100)
      break
    }
    case 'end': {
      const packed = sumMain + gap * (n - 1)
      offset = Math.max(0, Math.round((containerMain - packed) * 100) / 100)
      break
    }
    case 'space-between':
      if (n > 1) gap = Math.round((free / (n - 1)) * 100) / 100
      break
    case 'space-around':
      if (n > 0) {
        gap = Math.round((free / n) * 100) / 100
        offset = Math.round((gap / 2) * 100) / 100
      }
      break
    case 'space-evenly':
      if (n > 0) {
        gap = Math.round((free / (n + 1)) * 100) / 100
        offset = gap
      }
      break
    case 'start':
      break
    default: {
      const _exhaustive: never = hint.justifyContent
      void _exhaustive
      break
    }
  }

  let cursor = offset
  for (let i = 0; i < targets.length; i++) {
    const child = targets[i]!
    const cross = crossSizes[i] ?? 0
    let crossPos = 0
    if (hint.alignItems === 'center') crossPos = Math.round(((maxCross - cross) / 2) * 100) / 100
    else if (hint.alignItems === 'end') crossPos = Math.round((maxCross - cross) * 100) / 100

    if (hint.direction === 'row') {
      child.box.x = cursor
      child.box.y = crossPos
      cursor += (mainSizes[i] ?? 0) + gap
    } else {
      child.box.y = cursor
      child.box.x = crossPos
      cursor += (mainSizes[i] ?? 0) + gap
    }
  }
}

/**
 * Fallback column stack for siblings that still lack x/y after flex layout.
 * Uses known heights (or a small default for text) so clients can paint a
 * non-overlapping document-order preview.
 */
export function applyDocumentOrderStack(
  children: Array<{
    kind?: string
    text?: string
    box: {
      x?: number | { unresolved: true; raw: string }
      y?: number | { unresolved: true; raw: string }
      width?: number | { unresolved: true; raw: string }
      height?: number | { unresolved: true; raw: string }
    }
  }>,
  gap = 8,
): void {
  if (children.length < 2) return
  const dim = (v: number | { unresolved: true; raw: string } | undefined): number | undefined =>
    typeof v === 'number' ? v : undefined

  const alreadyPlaced = children.some((c) => dim(c.box.x) !== undefined || dim(c.box.y) !== undefined)
  if (alreadyPlaced) {
    // Only fill remaining unpositioned siblings below the last placed one.
    let cursor = 0
    for (const child of children) {
      const y = dim(child.box.y)
      const h = dim(child.box.height) ?? (child.text || child.kind === 'text' ? 20 : undefined)
      if (y !== undefined) {
        cursor = Math.max(cursor, y + (dim(child.box.height) ?? h ?? 0) + gap)
        continue
      }
      if (h === undefined) continue
      if (dim(child.box.x) === undefined) child.box.x = 0
      child.box.y = cursor
      if (dim(child.box.height) === undefined && h !== undefined) child.box.height = h
      cursor += h + gap
    }
    return
  }

  const targets = children.filter(
    (c) => dim(c.box.height) !== undefined || !!c.text || c.kind === 'text',
  )
  if (targets.length < 2) return
  let cursor = 0
  for (const child of targets) {
    const h = dim(child.box.height) ?? 20
    if (dim(child.box.x) === undefined) child.box.x = 0
    child.box.y = cursor
    if (dim(child.box.height) === undefined) child.box.height = h
    cursor += h + gap
  }
}

/**
 * Replace `var(--token)` / `var(--token, fallback)` using declared custom properties.
 * Runs a few passes so nested vars can settle.
 */
export function resolveCssVarReferences(
  css: string,
  extraVars?: Map<string, string>,
): string {
  const vars = extractCssCustomProperties(css)
  if (extraVars) {
    for (const [k, v] of extraVars) {
      if (!vars.has(k)) vars.set(k, v)
    }
  }
  if (!vars.size && !/var\s*\(/i.test(css)) return css

  let out = css
  for (let pass = 0; pass < 5; pass += 1) {
    let changed = false
    out = out.replace(
      /var\s*\(\s*(--[A-Za-z_][\w-]*)\s*(?:,\s*((?:[^()]+|\([^)]*\))*?))?\s*\)/gi,
      (full, name: string, fallback?: string) => {
        const hit = vars.get(name)
        if (hit) {
          changed = true
          return hit
        }
        if (fallback !== undefined && fallback.trim()) {
          changed = true
          return fallback.trim()
        }
        return full
      },
    )
    // Refresh vars from resolved sheet so `--a: var(--b)` can settle.
    for (const [k, v] of extractCssCustomProperties(out)) vars.set(k, v)
    if (!changed) break
  }
  return out
}
