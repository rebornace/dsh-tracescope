/**
 * Shared CSS / HTML helpers for web adapters.
 */
import type { DesignStyle, HexColor } from '../types.js'

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
  const rgb = v.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/,
  )
  if (rgb) {
    const hex = (n: string) =>
      Math.max(0, Math.min(255, Number(n)))
        .toString(16)
        .padStart(2, '0')
    const a = rgb[4] !== undefined ? Number(rgb[4]) : 1
    const body = `#${hex(rgb[1]!)}${hex(rgb[2]!)}${hex(rgb[3]!)}`
    if (a < 1) {
      const aa = Math.round(a * 255)
        .toString(16)
        .padStart(2, '0')
      return `${body}${aa}`
    }
    return body
  }
  return undefined
}

/** Parse a CSS length (px/rem/em/number) into logical px (rem≈16). */
export function parseCssLength(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const v = raw.trim().toLowerCase()
  if (v === '0') return 0
  const m = v.match(/^(-?[\d.]+)(px|rem|em)?$/)
  if (!m) return undefined
  const n = Number(m[1])
  if (!Number.isFinite(n)) return undefined
  const unit = m[2] ?? 'px'
  if (unit === 'px') return Math.round(n * 100) / 100
  if (unit === 'rem' || unit === 'em') return Math.round(n * 16 * 100) / 100
  return undefined
}

/** Parse an inline style attribute / CSS declaration block into DesignStyle + box sizes. */
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

  for (const part of css.split(';')) {
    const idx = part.indexOf(':')
    if (idx < 0) continue
    const prop = part.slice(0, idx).trim().toLowerCase()
    const val = part.slice(idx + 1).trim()
    if (!prop || !val) continue

    switch (prop) {
      case 'width':
        width = parseCssLength(val)
        break
      case 'height':
        height = parseCssLength(val)
        break
      case 'left':
        x = parseCssLength(val)
        break
      case 'top':
        y = parseCssLength(val)
        break
      case 'background':
      case 'background-color': {
        const c = parseCssColor(val.split(/\s+/)[0])
        if (c) style.backgroundColor = c
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
        const n = parseCssLength(val) ?? (Number.isFinite(Number(val)) ? Number(val) : undefined)
        if (n !== undefined) style.lineHeight = n
        break
      }
      case 'letter-spacing': {
        const n = parseCssLength(val)
        if (n !== undefined) style.letterSpacing = n
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
        break
      }
      case 'border-color': {
        const c = parseCssColor(val)
        if (c) style.borderColor = c
        break
      }
      case 'opacity': {
        const n = Number(val)
        if (Number.isFinite(n)) style.opacity = n
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
      case 'text-align':
        if (val === 'left' || val === 'center' || val === 'right' || val === 'justify') {
          style.textAlign = val
        }
        break
      default:
        break
    }
  }

  return { style, width, height, x, y }
}

export interface SimpleStyleRules {
  classes: Map<string, string>
  ids: Map<string, string>
}

/** Extract simple `.class` / `#id` rules from a CSS stylesheet. */
export function parseSimpleStyleRules(css: string): SimpleStyleRules {
  const classes = new Map<string, string>()
  const ids = new Map<string, string>()
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /([.#])([A-Za-z_][\w-]*)\s*\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned))) {
    const kind = m[1]
    const name = m[2] ?? ''
    const body = (m[3] ?? '').trim()
    if (!name || !body) continue
    if (kind === '.') classes.set(name, body)
    else ids.set(name, body)
  }
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
