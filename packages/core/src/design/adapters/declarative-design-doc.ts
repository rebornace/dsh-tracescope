/**
 * Shallow DesignDoc builders for declarative UI stacks.
 * Extracts Text / Button literals and nearby static style / geometry modifiers.
 */
import type { DesignDoc, DesignNode, DesignStyle, HexColor } from '../types.js'
import {
  indexInRanges,
  makeListFrame,
  sliceBalancedBrace,
  tileListTemplate,
} from '../list-template-expand.js'
import { estimateTextAdvance, estimateTextBlock } from '../text-metrics.js'
import { applyDocumentOrderStack, applyFlexGapLayout, parseCssColor, parseCssFilterBlur, parseCssFilterFingerprint, parseCssTextShadow, parseCssTransformOrigin } from './web-css.js'

/** Shared L1 axis-layout hint for Column/Row / VStack/HStack / flex. */
export type AxisLayoutHint = {
  direction: 'row' | 'column'
  gap: number
  alignItems: 'start' | 'center' | 'end' | 'stretch'
  justifyContent: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly'
}

function axisHintToCss(hint: AxisLayoutHint): string {
  const align =
    hint.alignItems === 'start'
      ? 'flex-start'
      : hint.alignItems === 'end'
        ? 'flex-end'
        : hint.alignItems
  const justify =
    hint.justifyContent === 'start'
      ? 'flex-start'
      : hint.justifyContent === 'end'
        ? 'flex-end'
        : hint.justifyContent
  // extractFlexGapHint scans `{ ... }` rule bodies.
  return `.axis{display:flex;flex-direction:${hint.direction};gap:${hint.gap}px;align-items:${align};justify-content:${justify}}`
}

function ensureStackableSizes(children: DesignNode[], direction: 'row' | 'column'): void {
  for (const c of children) {
    if (direction === 'column' && typeof c.box.height !== 'number') {
      c.box.height = c.kind === 'text' || c.text ? 20 : 24
    }
    if (direction === 'row' && typeof c.box.width !== 'number') {
      c.box.width = c.text ? Math.min(360, Math.max(40, c.text.length * 12)) : 48
    }
    if (direction === 'row' && typeof c.box.height !== 'number' && (c.kind === 'text' || c.text)) {
      c.box.height = 20
    }
  }
}

/** Apply Column/Row-style stack; returns true when coordinates were assigned. */
export function applyAxisLayout(children: DesignNode[], hint: AxisLayoutHint | undefined): boolean {
  if (!hint || children.length < 2) return false
  ensureStackableSizes(children, hint.direction)
  applyFlexGapLayout(children, axisHintToCss(hint))
  return children.some((c) => typeof c.box.x === 'number' || typeof c.box.y === 'number')
}

function sliceBalancedArgs(src: string, openParenIndex: number): string | undefined {
  if (src[openParenIndex] !== '(') return undefined
  let depth = 0
  for (let i = openParenIndex; i < src.length; i++) {
    const ch = src[i]
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return src.slice(openParenIndex + 1, i)
    }
  }
  return undefined
}

function mapComposeArrangement(
  name: string | undefined,
): AxisLayoutHint['justifyContent'] | undefined {
  if (!name) return undefined
  const n = name.toLowerCase()
  if (n === 'center') return 'center'
  if (n === 'spacebetween') return 'space-between'
  if (n === 'spacearound') return 'space-around'
  if (n === 'spaceevenly') return 'space-evenly'
  if (n === 'end' || n === 'bottom' || n === 'right') return 'end'
  if (n === 'start' || n === 'top' || n === 'left') return 'start'
  return undefined
}

function mapComposeAlignment(name: string | undefined): AxisLayoutHint['alignItems'] | undefined {
  if (!name) return undefined
  const n = name.toLowerCase()
  if (n.includes('center')) return 'center'
  if (n.includes('end') || n.includes('right') || n.includes('bottom')) return 'end'
  if (n.includes('start') || n.includes('left') || n.includes('top')) return 'start'
  return 'stretch'
}

/** First Column/Row call args → axis hint (Compose). */
export function extractComposeAxisHint(src: string): AxisLayoutHint | undefined {
  const re = /\b(Column|Row)\s*\(/g
  let best: { kind: string; args: string; index: number } | undefined
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const open = (m.index ?? 0) + m[0].length - 1
    const args = sliceBalancedArgs(src, open)
    if (args === undefined) continue
    const hit = { kind: m[1]!, args, index: m.index ?? 0 }
    if (!best || hit.index < best.index) best = hit
  }
  if (!best) return undefined
  const direction: 'row' | 'column' = best.kind === 'Row' ? 'row' : 'column'
  let gap = 0
  const spaced = best.args.match(/Arrangement\.spacedBy\s*\(\s*([\d.]+)\s*\.dp/)
  if (spaced) gap = Number(spaced[1])
  const arrangeName =
    best.args.match(/(?:vertical|horizontal)Arrangement\s*=\s*Arrangement\.(\w+)/)?.[1] ??
    best.args.match(/Arrangement\.(\w+)/)?.[1]
  let justifyContent = mapComposeArrangement(arrangeName) ?? 'start'
  if (spaced) justifyContent = 'start'
  const alignName = best.args.match(/(?:horizontal|vertical)Alignment\s*=\s*Alignment\.(\w+)/)?.[1]
  const alignItems = mapComposeAlignment(alignName) ?? 'start'
  return { direction, gap, alignItems, justifyContent }
}

/** First VStack/HStack → axis hint (SwiftUI). */
export function extractSwiftuiAxisHint(src: string): AxisLayoutHint | undefined {
  const re = /\b(VStack|HStack|ZStack)\s*(?:\(|\{)/g
  let best: { kind: string; args: string; index: number } | undefined
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const kind = m[1]!
    if (kind === 'ZStack') continue
    const openChar = src[(m.index ?? 0) + m[0].length - 1]
    let args = ''
    if (openChar === '(') {
      const open = (m.index ?? 0) + m[0].length - 1
      args = sliceBalancedArgs(src, open) ?? ''
    }
    const hit = { kind, args, index: m.index ?? 0 }
    if (!best || hit.index < best.index) best = hit
  }
  if (!best) return undefined
  const direction: 'row' | 'column' = best.kind === 'HStack' ? 'row' : 'column'
  let gap = 8
  const spacing = best.args.match(/spacing\s*:\s*([\d.]+)/)
  if (spacing) gap = Number(spacing[1])
  else if (/spacing\s*:\s*nil/.test(best.args) || /spacing\s*:\s*\.none/.test(best.args)) gap = 0
  let alignItems: AxisLayoutHint['alignItems'] = 'center'
  const align = best.args.match(/alignment\s*:\s*\.(\w+)/)?.[1]?.toLowerCase()
  if (align) {
    if (align.includes('leading') || align.includes('top') || align === 'left') alignItems = 'start'
    else if (align.includes('trailing') || align.includes('bottom') || align === 'right') {
      alignItems = 'end'
    } else if (align.includes('center')) alignItems = 'center'
  }
  return { direction, gap, alignItems, justifyContent: 'start' }
}

function mapFlutterMainAxis(name: string | undefined): AxisLayoutHint['justifyContent'] {
  if (!name) return 'start'
  const n = name.toLowerCase()
  if (n === 'center') return 'center'
  if (n === 'end') return 'end'
  if (n === 'spacebetween') return 'space-between'
  if (n === 'spacearound') return 'space-around'
  if (n === 'spaceevenly') return 'space-evenly'
  return 'start'
}

function mapFlutterCrossAxis(name: string | undefined): AxisLayoutHint['alignItems'] {
  if (!name) return 'center'
  const n = name.toLowerCase()
  if (n === 'center') return 'center'
  if (n === 'end') return 'end'
  if (n === 'start') return 'start'
  if (n === 'stretch') return 'stretch'
  return 'center'
}

/** First Column/Row widget → axis hint (Flutter). */
export function extractFlutterAxisHint(src: string): AxisLayoutHint | undefined {
  const matches = [...src.matchAll(/\b(Column|Row)\s*\(/g)]
  if (!matches.length) return undefined
  const first = matches.reduce((a, b) => ((a.index ?? 0) <= (b.index ?? 0) ? a : b))
  const kind = first[1]!
  const start = (first.index ?? 0) + first[0].length
  const window = src.slice(start, Math.min(src.length, start + 900))
  const direction: 'row' | 'column' = kind === 'Row' ? 'row' : 'column'
  const main = window.match(/mainAxisAlignment\s*:\s*MainAxisAlignment\.(\w+)/)?.[1]
  const cross = window.match(/crossAxisAlignment\s*:\s*CrossAxisAlignment\.(\w+)/)?.[1]
  let gap = 0
  // Common spacer between children: SizedBox(height: N) / width
  const spacer =
    direction === 'column'
      ? window.match(/SizedBox\s*\(\s*height:\s*([\d.]+)/)
      : window.match(/SizedBox\s*\(\s*width:\s*([\d.]+)/)
  if (spacer) gap = Number(spacer[1])
  return {
    direction,
    gap,
    alignItems: mapFlutterCrossAxis(cross),
    justifyContent: mapFlutterMainAxis(main),
  }
}

/** First flexDirection in RN styles → axis hint. */
export function extractRnAxisHint(src: string): AxisLayoutHint | undefined {
  const dir = src.match(/flexDirection\s*:\s*['"](row|column)['"]/i)?.[1]?.toLowerCase() as
    | 'row'
    | 'column'
    | undefined
  if (!dir) return undefined
  let gap = 0
  const g =
    src.match(/\bgap\s*:\s*([\d.]+)/)?.[1] ??
    (dir === 'column'
      ? src.match(/rowGap\s*:\s*([\d.]+)/)?.[1]
      : src.match(/columnGap\s*:\s*([\d.]+)/)?.[1])
  if (g) gap = Number(g)
  let alignItems: AxisLayoutHint['alignItems'] = 'stretch'
  const align = src.match(/alignItems\s*:\s*['"](\w+)['"]/i)?.[1]?.toLowerCase()
  if (align === 'center') alignItems = 'center'
  else if (align === 'flex-end' || align === 'end') alignItems = 'end'
  else if (align === 'flex-start' || align === 'start') alignItems = 'start'
  let justifyContent: AxisLayoutHint['justifyContent'] = 'start'
  const justify = src.match(/justifyContent\s*:\s*['"]([\w-]+)['"]/i)?.[1]?.toLowerCase()
  if (justify === 'center') justifyContent = 'center'
  else if (justify === 'flex-end' || justify === 'end') justifyContent = 'end'
  else if (justify === 'space-between') justifyContent = 'space-between'
  else if (justify === 'space-around') justifyContent = 'space-around'
  else if (justify === 'space-evenly') justifyContent = 'space-evenly'
  return { direction: dir, gap, alignItems, justifyContent }
}

function finalizeDeclarativeLayout(
  children: DesignNode[],
  hint: AxisLayoutHint | undefined,
): DesignStyle {
  const rootStyle: DesignStyle = {}
  if (hint) {
    rootStyle.flexDirection = hint.direction
    rootStyle.alignItems = hint.alignItems
    rootStyle.justifyContent = hint.justifyContent
    if (hint.gap > 0) {
      rootStyle.gap = hint.gap
      if (hint.direction === 'column') rootStyle.rowGap = hint.gap
      else rootStyle.columnGap = hint.gap
    }
  }
  if (applyAxisLayout(children, hint)) {
    // coordinates assigned
  } else {
    applyDocumentOrderStack(children)
  }
  return rootStyle
}

function composeColor(raw: string): HexColor | undefined {
  // Color.Red / Color.Red.copy(alpha = 0.5f)
  const namedCompose: Record<string, HexColor> = {
    red: '#ff0000',
    green: '#00ff00',
    blue: '#0000ff',
    white: '#ffffff',
    black: '#000000',
    cyan: '#00ffff',
    magenta: '#ff00ff',
    yellow: '#ffff00',
    gray: '#888888',
    grey: '#888888',
    lightgray: '#cccccc',
    darkgray: '#444444',
    transparent: '#00000000',
  }
  const copyAlpha = raw.match(
    /Color\.([A-Za-z]+)\.copy\s*\(\s*(?:alpha\s*=\s*)?([\d.]+)\s*f?\s*\)/i,
  )
  if (copyAlpha) {
    const base = namedCompose[copyAlpha[1]!.toLowerCase()]
    const op = Number(copyAlpha[2])
    if (base && Number.isFinite(op)) return bakeHexOpacity(base, op)
  }
  const namedOnly = raw.match(/^Color\.([A-Za-z]+)$/i)
  if (namedOnly) {
    const hit = namedCompose[namedOnly[1]!.toLowerCase()]
    if (hit) return hit
  }
  // Color(0xAARRGGBB) or Color(0xFFRRGGBB)
  const hex = raw.match(/0x([0-9A-Fa-f]{6,8})/)
  if (hex) {
    const h = hex[1]!
    if (h.length === 8) return `#${h.slice(2)}${h.slice(0, 2)}`.toLowerCase()
    return `#${h}`.toLowerCase()
  }
  return parseCssColor(raw.replace(/^["']|["']$/g, ''))
}

/** Multiply a hex colour's alpha by `opacity` (0–1). */
function bakeHexOpacity(hex: HexColor, opacity: number): HexColor {
  const raw = hex.replace(/^#/, '')
  let r = 0
  let g = 0
  let b = 0
  let a = 255
  if (raw.length === 3) {
    r = parseInt(raw[0]! + raw[0]!, 16)
    g = parseInt(raw[1]! + raw[1]!, 16)
    b = parseInt(raw[2]! + raw[2]!, 16)
  } else if (raw.length === 6 || raw.length === 8) {
    r = parseInt(raw.slice(0, 2), 16)
    g = parseInt(raw.slice(2, 4), 16)
    b = parseInt(raw.slice(4, 6), 16)
    if (raw.length === 8) a = parseInt(raw.slice(6, 8), 16)
  } else {
    return hex
  }
  const aa = Math.max(0, Math.min(255, Math.round(a * opacity)))
  const h = (n: number) => n.toString(16).padStart(2, '0')
  return aa >= 255 ? `#${h(r)}${h(g)}${h(b)}` : `#${h(r)}${h(g)}${h(b)}${h(aa)}`
}

function flutterColor(raw: string): HexColor | undefined {
  return composeColor(raw)
}

function num(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

function applyUniformPadding(style: DesignStyle, value: number): void {
  style.paddingTop = value
  style.paddingRight = value
  style.paddingBottom = value
  style.paddingLeft = value
}

function applyUniformMargin(style: DesignStyle, value: number): void {
  style.marginTop = value
  style.marginRight = value
  style.marginBottom = value
  style.marginLeft = value
}

/** Approximate iOS system / semantic colours (light appearance). */
const SWIFTUI_SYSTEM_COLORS: Record<string, HexColor> = {
  primary: '#000000',
  secondary: '#3c3c43',
  tertiary: '#3c3c43',
  quaternary: '#3c3c43',
  accentColor: '#007aff',
  blue: '#007aff',
  red: '#ff3b30',
  green: '#34c759',
  orange: '#ff9500',
  yellow: '#ffcc00',
  pink: '#ff2d55',
  purple: '#af52de',
  teal: '#5ac8fa',
  indigo: '#5856d6',
  mint: '#00c7be',
  cyan: '#32ade6',
  brown: '#a2845e',
  gray: '#8e8e93',
  grey: '#8e8e93',
  white: '#ffffff',
  black: '#000000',
  clear: '#00000000',
}

function parseComposeWindow(window: string): {
  style: DesignStyle
  width?: number
  height?: number
  x?: number
  y?: number
} {
  const style: DesignStyle = {}
  let width: number | undefined
  let height: number | undefined

  const fs =
    window.match(/fontSize\s*=\s*([\d.]+)\s*\.sp/) ??
    window.match(/\.fontSize\s*\(\s*([\d.]+)\s*\.sp\s*\)/)
  if (fs) style.fontSize = Number(fs[1])
  if (style.fontSize === undefined) {
    // After typography rewrite: style may still reference MaterialTheme.typography.X
    const typo = window.match(/MaterialTheme\.typography\.(\w+)/)?.[1]
      ?? window.match(/typography\.(\w+)/)?.[1]
    if (typo) {
      const defaults: Record<string, number> = {
        displayLarge: 57,
        displayMedium: 45,
        displaySmall: 36,
        headlineLarge: 32,
        headlineMedium: 28,
        headlineSmall: 24,
        titleLarge: 22,
        titleMedium: 16,
        titleSmall: 14,
        bodyLarge: 16,
        bodyMedium: 14,
        bodySmall: 12,
        labelLarge: 14,
        labelMedium: 12,
        labelSmall: 11,
      }
      if (defaults[typo] !== undefined) style.fontSize = defaults[typo]
    }
  }

  const color =
    window.match(/color\s*=\s*(Color\([^)]+\)|Color\.[A-Za-z]+(?:\.copy\s*\([^)]*\))?|MaterialTheme\.colorScheme\.\w+|['"]#[0-9A-Fa-f]{3,8}['"])/)?.[1] ??
    window.match(/\.color\s*\(\s*(Color\([^)]+\)|Color\.[A-Za-z]+(?:\.copy\s*\([^)]*\))?|MaterialTheme\.colorScheme\.\w+|['"]#[0-9A-Fa-f]{3,8}['"])\s*\)/)?.[1]
  if (color) {
    const c = composeColor(color)
    if (c) style.color = c
  }

  const bg =
    window.match(/\.background\s*\(\s*(Color\([^)]+\)|Color\.[A-Za-z]+(?:\.copy\s*\([^)]*\))?|MaterialTheme\.colorScheme\.\w+|['"]#[0-9A-Fa-f]{3,8}['"])/)?.[1] ??
    window.match(/background\s*=\s*(Color\([^)]+\)|Color\.[A-Za-z]+(?:\.copy\s*\([^)]*\))?|MaterialTheme\.colorScheme\.\w+|['"]#[0-9A-Fa-f]{3,8}['"])/)?.[1]
  if (bg) {
    const c = composeColor(bg)
    if (c) style.backgroundColor = c
  }

  const fw = window.match(
    /fontWeight\s*=\s*FontWeight\.(?:W(\d{3})|Bold|SemiBold|Medium|Light|Thin|Black|Normal)/i,
  )
  if (fw) {
    if (fw[1]) style.fontWeight = Number(fw[1])
    else {
      const name = (fw[0].match(/FontWeight\.(\w+)/i)?.[1] ?? '').toLowerCase()
      const map: Record<string, number> = {
        thin: 100,
        light: 300,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        black: 900,
      }
      if (map[name] !== undefined) style.fontWeight = map[name]
    }
  }

  const size = window.match(/\.size\s*\(\s*([\d.]+)\s*\.dp(?:\s*,\s*([\d.]+)\s*\.dp)?\s*\)/)
  if (size) {
    width = num(size[1])
    height = num(size[2] ?? size[1])
  }
  const wOnly =
    window.match(/\.width\s*\(\s*([\d.]+)\s*\.dp\s*\)/) ??
    window.match(/Modifier\.width\s*\(\s*([\d.]+)\s*\.dp\s*\)/)
  if (wOnly && width === undefined) width = num(wOnly[1])
  const hOnly =
    window.match(/\.height\s*\(\s*([\d.]+)\s*\.dp\s*\)/) ??
    window.match(/Modifier\.height\s*\(\s*([\d.]+)\s*\.dp\s*\)/)
  if (hOnly && height === undefined) height = num(hOnly[1])

  // fillMax* → assume 360×640 logical screen for L1 compare.
  if (/\.fillMaxSize\s*\(/.test(window)) {
    if (width === undefined) width = 360
    if (height === undefined) height = 640
    style.sizingHorizontal = 'fill'
    style.sizingVertical = 'fill'
  }
  const fillW = window.match(/\.fillMaxWidth\s*\(\s*(?:([\d.]+)\s*f?)?\s*\)/)
  if (fillW && width === undefined) {
    width = fillW[1] ? Math.round(360 * Number(fillW[1]) * 100) / 100 : 360
    style.sizingHorizontal = 'fill'
  }
  const fillH = window.match(/\.fillMaxHeight\s*\(\s*(?:([\d.]+)\s*f?)?\s*\)/)
  if (fillH && height === undefined) {
    height = fillH[1] ? Math.round(640 * Number(fillH[1]) * 100) / 100 : 640
    style.sizingVertical = 'fill'
  }
  if (width !== undefined && style.sizingHorizontal === undefined) style.sizingHorizontal = 'fixed'
  if (height !== undefined && style.sizingVertical === undefined) style.sizingVertical = 'fixed'

  const padValuesAll =
    window.match(/\.padding\s*\(\s*PaddingValues\s*\(\s*([\d.]+)\s*\.dp\s*\)\s*\)/) ??
    window.match(/\.padding\s*\(\s*PaddingValues\s*\(\s*all\s*=\s*([\d.]+)\s*\.dp/)
  if (padValuesAll) applyUniformPadding(style, Number(padValuesAll[1]))

  const padValuesHV = window.match(
    /\.padding\s*\(\s*PaddingValues\s*\(\s*(?:horizontal\s*=\s*([\d.]+)\s*\.dp)?\s*,?\s*(?:vertical\s*=\s*([\d.]+)\s*\.dp)?/,
  )
  if (padValuesHV && (padValuesHV[1] || padValuesHV[2]) && !padValuesAll) {
    const h = num(padValuesHV[1])
    const v = num(padValuesHV[2])
    if (h !== undefined) {
      style.paddingLeft = h
      style.paddingRight = h
    }
    if (v !== undefined) {
      style.paddingTop = v
      style.paddingBottom = v
    }
  }

  const padValuesSides = window.match(
    /\.padding\s*\(\s*PaddingValues\s*\(\s*(?:start\s*=\s*([\d.]+)\s*\.dp)?\s*,?\s*(?:top\s*=\s*([\d.]+)\s*\.dp)?\s*,?\s*(?:end\s*=\s*([\d.]+)\s*\.dp)?\s*,?\s*(?:bottom\s*=\s*([\d.]+)\s*\.dp)?/,
  )
  if (
    padValuesSides &&
    (padValuesSides[1] || padValuesSides[2] || padValuesSides[3] || padValuesSides[4]) &&
    !padValuesAll &&
    !(padValuesHV && (padValuesHV[1] || padValuesHV[2]))
  ) {
    if (padValuesSides[1]) style.paddingLeft = Number(padValuesSides[1])
    if (padValuesSides[2]) style.paddingTop = Number(padValuesSides[2])
    if (padValuesSides[3]) style.paddingRight = Number(padValuesSides[3])
    if (padValuesSides[4]) style.paddingBottom = Number(padValuesSides[4])
  }

  const padAll = window.match(/\.padding\s*\(\s*([\d.]+)\s*\.dp\s*\)/)
  if (padAll && !padValuesAll) applyUniformPadding(style, Number(padAll[1]))
  const padHV = window.match(
    /\.padding\s*\(\s*(?:horizontal\s*=\s*([\d.]+)\s*\.dp)?\s*,?\s*(?:vertical\s*=\s*([\d.]+)\s*\.dp)?\s*\)/,
  )
  if (
    padHV &&
    (padHV[1] || padHV[2]) &&
    !padAll &&
    !padValuesAll &&
    !(padValuesHV && (padValuesHV[1] || padValuesHV[2])) &&
    !(padValuesSides && (padValuesSides[1] || padValuesSides[2] || padValuesSides[3] || padValuesSides[4]))
  ) {
    const h = num(padHV[1])
    const v = num(padHV[2])
    if (h !== undefined) {
      style.paddingLeft = h
      style.paddingRight = h
    }
    if (v !== undefined) {
      style.paddingTop = v
      style.paddingBottom = v
    }
  }

  const radius =
    window.match(/RoundedCornerShape\s*\(\s*([\d.]+)\s*\.dp\s*\)/) ??
    window.match(/\.clip\s*\(\s*RoundedCornerShape\s*\(\s*([\d.]+)/)
  if (radius) style.cornerRadius = Number(radius[1])
  if (style.cornerRadius === undefined) {
    const shapeRole =
      window.match(/MaterialTheme\.shapes\.(\w+)/)?.[1] ??
      window.match(/(?:^|[^\w.])shapes\.(\w+)/)?.[1]
    if (shapeRole) {
      const defaults: Record<string, number> = {
        extraSmall: 4,
        small: 4,
        medium: 12,
        large: 16,
        extraLarge: 28,
      }
      if (defaults[shapeRole] !== undefined) style.cornerRadius = defaults[shapeRole]
    }
  }

  // WindowInsets padding helpers (L1 chrome heuristics).
  if (/\.statusBarsPadding\s*\(/.test(window) && style.paddingTop === undefined) {
    style.paddingTop = 24
  }
  if (/\.navigationBarsPadding\s*\(/.test(window) && style.paddingBottom === undefined) {
    style.paddingBottom = 48
  }
  if (/\.imePadding\s*\(/.test(window) && style.paddingBottom === undefined) {
    style.paddingBottom = 320
  }
  if (/\.displayCutoutPadding\s*\(/.test(window)) {
    if (style.paddingTop === undefined) style.paddingTop = 24
    if (style.paddingLeft === undefined) style.paddingLeft = 0
    if (style.paddingRight === undefined) style.paddingRight = 0
  }
  if (
    /\.systemBarsPadding\s*\(/.test(window) ||
    /\.safeDrawingPadding\s*\(/.test(window) ||
    /\.windowInsetsPadding\s*\(\s*WindowInsets\.(?:safeDrawing|systemBars)\b/.test(window)
  ) {
    if (style.paddingTop === undefined) style.paddingTop = 24
    if (style.paddingBottom === undefined) style.paddingBottom = 48
  }
  if (
    /\.windowInsetsPadding\s*\(\s*WindowInsets\.statusBars\b/.test(window) &&
    style.paddingTop === undefined
  ) {
    style.paddingTop = 24
  }
  if (
    /\.windowInsetsPadding\s*\(\s*WindowInsets\.navigationBars\b/.test(window) &&
    style.paddingBottom === undefined
  ) {
    style.paddingBottom = 48
  }
  if (
    /\.windowInsetsPadding\s*\(\s*WindowInsets\.ime\b/.test(window) &&
    style.paddingBottom === undefined
  ) {
    style.paddingBottom = 320
  }
  if (/\.windowInsetsPadding\s*\(\s*WindowInsets\.displayCutout\b/.test(window)) {
    if (style.paddingTop === undefined) style.paddingTop = 24
  }
  const winInsets = window.match(
    /\.windowInsetsPadding\s*\(\s*WindowInsets\s*\(\s*(?:left\s*=\s*([\d.]+)\s*\.dp)?\s*,?\s*(?:top\s*=\s*([\d.]+)\s*\.dp)?\s*,?\s*(?:right\s*=\s*([\d.]+)\s*\.dp)?\s*,?\s*(?:bottom\s*=\s*([\d.]+)\s*\.dp)?/,
  )
  if (winInsets) {
    if (winInsets[1] && style.paddingLeft === undefined) style.paddingLeft = Number(winInsets[1])
    if (winInsets[2] && style.paddingTop === undefined) style.paddingTop = Number(winInsets[2])
    if (winInsets[3] && style.paddingRight === undefined) style.paddingRight = Number(winInsets[3])
    if (winInsets[4] && style.paddingBottom === undefined) style.paddingBottom = Number(winInsets[4])
  }

  const shadow =
    window.match(/\.shadow\s*\(\s*(?:elevation\s*=\s*)?([\d.]+)\s*\.dp/) ??
    window.match(/Modifier\.shadow\s*\(\s*([\d.]+)\s*\.dp/)
  if (shadow) style.elevation = Number(shadow[1])

  const letterSp =
    window.match(/letterSpacing\s*=\s*(-?[\d.]+)\s*\.sp/) ??
    window.match(/\.letterSpacing\s*\(\s*(-?[\d.]+)\s*\.sp\s*\)/)
  if (letterSp) style.letterSpacing = Number(letterSp[1])

  const lineH =
    window.match(/lineHeight\s*=\s*([\d.]+)\s*\.sp/) ??
    window.match(/\.lineHeight\s*\(\s*([\d.]+)\s*\.sp\s*\)/)
  if (lineH) style.lineHeight = Number(lineH[1])

  const alpha =
    window.match(/\.alpha\s*\(\s*([\d.]+)\s*f?\s*\)/) ??
    window.match(/\balpha\s*=\s*([\d.]+)\s*f?\b/)
  if (alpha) {
    const n = Number(alpha[1])
    if (Number.isFinite(n) && n < 1) style.opacity = Math.round(n * 100) / 100
  }

  const rotate =
    window.match(/\.rotate\s*\(\s*(-?[\d.]+)\s*\.deg/) ??
    window.match(/Modifier\.rotate\s*\(\s*(-?[\d.]+)\s*\.deg/) ??
    window.match(/\.rotate\s*\(\s*degrees\s*=\s*(-?[\d.]+)/)
  if (rotate) {
    const n = Number(rotate[1])
    if (Number.isFinite(n) && Math.abs(n) > 0.5) style.rotation = Math.round(n * 100) / 100
  }

  const scaleNamed = window.match(
    /\.scale\s*\(\s*(?:scaleX\s*=\s*)?(-?[\d.]+)(?:\s*f)?\s*,\s*(?:scaleY\s*=\s*)?(-?[\d.]+)/,
  )
  const scaleUniform =
    window.match(/\.scale\s*\(\s*(-?[\d.]+)(?:\s*f)?\s*\)/) ??
    window.match(/Modifier\.scale\s*\(\s*(-?[\d.]+)/)
  if (scaleNamed) {
    const sx = Number(scaleNamed[1])
    const sy = Number(scaleNamed[2])
    if (Number.isFinite(sx) && Math.abs(sx - 1) > 0.02) style.scaleX = Math.round(sx * 1000) / 1000
    if (Number.isFinite(sy) && Math.abs(sy - 1) > 0.02) style.scaleY = Math.round(sy * 1000) / 1000
  } else if (scaleUniform) {
    const s = Number(scaleUniform[1])
    if (Number.isFinite(s) && Math.abs(s - 1) > 0.02) {
      style.scaleX = style.scaleY = Math.round(s * 1000) / 1000
    }
  }

  const zIndex =
    window.match(/\.zIndex\s*\(\s*(-?\d+(?:\.\d+)?)\s*f?\s*\)/) ??
    window.match(/zIndex\s*=\s*(-?\d+(?:\.\d+)?)\s*f?/)
  if (zIndex) {
    const n = Number(zIndex[1])
    if (Number.isFinite(n) && n !== 0) style.zIndex = Math.round(n)
  }

  if (/TextDecoration\.Underline/i.test(window) || /\.underline\s*\(/.test(window)) {
    style.textDecoration = 'underline'
  }
  if (/TextDecoration\.LineThrough/i.test(window) || /TextDecoration\.Strike/i.test(window)) {
    style.textDecoration =
      style.textDecoration === 'underline' ? 'underline line-through' : 'line-through'
  }
  if (/textTransform\s*=\s*TextTransform\.Uppercase/i.test(window)) {
    style.textTransform = 'uppercase'
  } else if (/textTransform\s*=\s*TextTransform\.Lowercase/i.test(window)) {
    style.textTransform = 'lowercase'
  } else if (/textTransform\s*=\s*TextTransform\.Capitalize/i.test(window)) {
    style.textTransform = 'capitalize'
  }

  if (/\.clip\s*\(/.test(window) || /Modifier\.clip\b/.test(window)) {
    style.overflow = 'hidden'
    if (/CircleShape|RoundedCornerShape\s*\(\s*50\s*\.percent/i.test(window)) {
      style.clipPath = 'circle'
    } else if (/RoundedCornerShape/i.test(window) && !style.clipPath) {
      style.clipPath = 'inset'
    } else if (!style.clipPath) {
      style.clipPath = 'custom'
    }
  }
  const aspect =
    window.match(/\.aspectRatio\s*\(\s*([\d.]+)\s*f?\s*(?:\/\s*([\d.]+)\s*f?)?\s*\)/) ??
    window.match(/aspectRatio\s*=\s*([\d.]+)\s*f?\s*(?:\/\s*([\d.]+)\s*f?)?/)
  if (aspect) {
    const a = Number(aspect[1])
    const b = aspect[2] !== undefined ? Number(aspect[2]) : 1
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) {
      style.aspectRatio = Math.round((a / b) * 1000) / 1000
    }
  }
  const maxLines =
    window.match(/maxLines\s*=\s*(\d+)/) ??
    window.match(/\.maxLines?\s*\(\s*(\d+)\s*\)/)
  if (maxLines) {
    style.maxLines = Number(maxLines[1])
    style.textOverflow = 'ellipsis'
  }
  if (/TextOverflow\.Ellipsis/i.test(window) || /overflow\s*=\s*TextOverflow\.Ellipsis/i.test(window)) {
    style.textOverflow = 'ellipsis'
    if (style.maxLines === undefined) style.maxLines = 1
  }
  if (/FontStyle\.Italic|fontStyle\s*=\s*FontStyle\.Italic/i.test(window)) {
    style.fontStyle = 'italic'
  }
  if (/PathEffect\.dashPathEffect|dashPathEffect\s*\(/i.test(window)) {
    style.borderStyle = 'dashed'
    const dashNums = window.match(
      /dashPathEffect\s*\(\s*(?:floatArrayOf|floatArrayOf)\s*\(\s*([\d.\sf,]+)\s*\)/i,
    ) ?? window.match(/dashPathEffect\s*\(\s*floatArrayOf\s*\(([^)]+)\)/i)
    if (dashNums) {
      const nums = dashNums[1]!
        .split(/[\s,]+/)
        .map((t) => Number.parseFloat(t.replace(/f$/i, '')))
        .filter((n) => Number.isFinite(n) && n > 0)
      if (nums.length) style.strokeDashArray = nums.join(',')
    } else {
      const arr = window.match(/dashPathEffect\s*\(\s*\[([^\]]+)\]/)
      if (arr) {
        const nums = arr[1]!
          .split(/[\s,]+/)
          .map((t) => Number.parseFloat(t))
          .filter((n) => Number.isFinite(n) && n > 0)
        if (nums.length) style.strokeDashArray = nums.join(',')
      }
    }
  }
  const strokeCap =
    window.match(/StrokeCap\.(\w+)/i) ?? window.match(/cap\s*=\s*StrokeCap\.(\w+)/i)
  if (strokeCap) {
    const c = strokeCap[1]!.toLowerCase()
    if (c === 'round' || c === 'square' || c === 'butt') style.strokeCap = c
  }
  const strokeJoin =
    window.match(/StrokeJoin\.(\w+)/i) ?? window.match(/join\s*=\s*StrokeJoin\.(\w+)/i)
  if (strokeJoin) {
    const j = strokeJoin[1]!.toLowerCase()
    if (j === 'round' || j === 'bevel' || j === 'miter') style.strokeJoin = j
  }
  // Modifier.weight / FlowRow|FlowColumn → flex grow / wrap.
  const weight =
    window.match(/\.weight\s*\(\s*([\d.]+)\s*f?\s*(?:,|\))/) ??
    window.match(/Modifier\.weight\s*\(\s*([\d.]+)\s*f?/)
  if (weight) {
    const n = Number(weight[1])
    if (Number.isFinite(n) && n > 0) style.flexGrow = Math.round(n * 1000) / 1000
  }
  if (/\bFlowRow\b|\bFlowColumn\b/.test(window)) style.flexWrap = 'wrap'
  if (
    /\bFlowRow\b|\bFlowColumn\b/.test(window) &&
    /Arrangement\.(SpaceBetween|spacedBy)/i.test(window)
  ) {
    style.alignContent = 'space-between'
  } else if (/\bFlowRow\b|\bFlowColumn\b/.test(window) && /Arrangement\.Center/i.test(window)) {
    style.alignContent = 'center'
  }
  const alignMod =
    window.match(/\.align\s*\(\s*Alignment\.(\w+)/) ??
    window.match(/Modifier\.align\s*\(\s*Alignment\.(\w+)/)
  if (alignMod) {
    const a = alignMod[1]!.toLowerCase()
    if (a.includes('end') || a.includes('bottom') || a.includes('right')) style.alignSelf = 'end'
    else if (a.includes('start') || a.includes('top') || a.includes('left')) style.alignSelf = 'start'
    else if (a.includes('center')) style.alignSelf = 'center'
  }
  if (/\.hidden\s*\(/.test(window) || /\bInvisible\b/.test(window)) {
    style.visibility = 'hidden'
  }
  if (
    (style.rotation !== undefined || style.scaleX !== undefined || style.scaleY !== undefined) &&
    !style.transformOrigin
  ) {
    style.transformOrigin = '50% 50%'
  }
  if (style.maxLines === 1) style.whiteSpace = style.whiteSpace ?? 'nowrap'
  const softWrap = window.match(/softWrap\s*=\s*(true|false)/i)
  if (softWrap) style.whiteSpace = softWrap[1]!.toLowerCase() === 'false' ? 'nowrap' : 'normal'
  if (/overflow\s*=\s*TextOverflow\.Visible/i.test(window) || /softWrap\s*=\s*true/i.test(window)) {
    /* keep normal */
  }
  if (/breakStrategy\s*=\s*BreakStrategy\.Simple/i.test(window)) style.wordBreak = 'keep-all'
  else if (/breakAll|Hyphens\.None/i.test(window)) style.wordBreak = 'break-all'
  const wordSp =
    window.match(/wordSpacing\s*=\s*(-?[\d.]+)\s*\.sp/) ??
    window.match(/\.wordSpacing\s*\(\s*(-?[\d.]+)\s*\.sp/)
  if (wordSp) {
    const n = Number(wordSp[1])
    if (Number.isFinite(n) && Math.abs(n) > 0.01) style.wordSpacing = n
  }
  const textIndent =
    window.match(/textIndent\s*=\s*(-?[\d.]+)\s*\.sp/) ??
    window.match(/\.textIndent\s*\(\s*(-?[\d.]+)\s*\.sp/) ??
    window.match(/firstLineIndent\s*=\s*(-?[\d.]+)/)
  if (textIndent) {
    const n = Number(textIndent[1])
    if (Number.isFinite(n) && Math.abs(n) > 0.5) style.textIndent = n
  }

  // Modifier.widthIn / heightIn / sizeIn → min/max box constraints.
  const widthIn = window.match(
    /\.widthIn\s*\(\s*(?:min\s*=\s*([\d.]+)\s*\.dp)?\s*,?\s*(?:max\s*=\s*([\d.]+)\s*\.dp)?/,
  )
  if (widthIn) {
    if (widthIn[1]) style.minWidth = Number(widthIn[1])
    if (widthIn[2]) style.maxWidth = Number(widthIn[2])
  }
  const heightIn = window.match(
    /\.heightIn\s*\(\s*(?:min\s*=\s*([\d.]+)\s*\.dp)?\s*,?\s*(?:max\s*=\s*([\d.]+)\s*\.dp)?/,
  )
  if (heightIn) {
    if (heightIn[1]) style.minHeight = Number(heightIn[1])
    if (heightIn[2]) style.maxHeight = Number(heightIn[2])
  }
  const sizeIn = window.match(/\.sizeIn\s*\(\s*([^)]*)\)/)
  if (sizeIn) {
    const body = sizeIn[1] ?? ''
    const minW = body.match(/minWidth\s*=\s*([\d.]+)\s*\.dp/)
    const maxW = body.match(/maxWidth\s*=\s*([\d.]+)\s*\.dp/)
    const minH = body.match(/minHeight\s*=\s*([\d.]+)\s*\.dp/)
    const maxH = body.match(/maxHeight\s*=\s*([\d.]+)\s*\.dp/)
    if (minW) style.minWidth = Number(minW[1])
    if (maxW) style.maxWidth = Number(maxW[1])
    if (minH) style.minHeight = Number(minH[1])
    if (maxH) style.maxHeight = Number(maxH[1])
  }

  const blur =
    window.match(/\.blur\s*\(\s*(?:radius\s*=\s*)?([\d.]+)\s*\.dp/) ??
    window.match(/Modifier\.blur\s*\(\s*([\d.]+)\s*\.dp/)
  if (blur) style.blur = Number(blur[1])

  const offsetNamed = window.match(
    /\.offset\s*\(\s*x\s*=\s*(-?[\d.]+)\s*\.dp\s*,\s*y\s*=\s*(-?[\d.]+)\s*\.dp/,
  )
  const offsetPos = window.match(
    /\.offset\s*\(\s*(-?[\d.]+)\s*\.dp\s*,\s*(-?[\d.]+)\s*\.dp\s*\)/,
  )
  const off = offsetNamed ?? offsetPos
  let ox: number | undefined
  let oy: number | undefined
  if (off) {
    ox = Number(off[1])
    oy = Number(off[2])
  }

  return { style, width, height, x: ox, y: oy }
}

function pushTextNode(
  children: DesignNode[],
  id: string,
  text: string,
  style: DesignStyle,
  box: { width?: number; height?: number; x?: number; y?: number },
): void {
  const fs = typeof style.fontSize === 'number' ? style.fontSize : 14
  const metricOpts = {
    letterSpacing:
      typeof style.letterSpacing === 'number' ? style.letterSpacing : undefined,
    fontWeight: style.fontWeight,
  }
  if (text && style.textAdvanceWidth === undefined) {
    style.textAdvanceWidth = estimateTextAdvance(text, fs, metricOpts)
  }
  if (text && style.textBlockHeight === undefined) {
    const lh = typeof style.lineHeight === 'number' ? style.lineHeight : undefined
    const maxW =
      typeof style.maxWidth === 'number'
        ? style.maxWidth
        : typeof box.width === 'number'
          ? box.width
          : undefined
    const block = estimateTextBlock(text, fs, {
      ...metricOpts,
      maxWidth: maxW,
      lineHeight: lh,
    })
    let lines = block.lines
    if (typeof style.maxLines === 'number' && style.maxLines > 0) {
      lines = Math.min(lines, style.maxLines)
    }
    const lineH = lh ?? Math.round(fs * 1.2 * 100) / 100
    style.textBlockHeight = Math.round(lineH * lines * 100) / 100
  }
  children.push({
    id,
    name: text.slice(0, 24) || 'Text',
    kind: 'text',
    text,
    box,
    style,
    children: [],
  })
}

/** Jetpack Compose source → shallow DesignDoc. */
export function composeSourceToDesignDoc(src: string, rootName: string): DesignDoc {
  const children: DesignNode[] = []
  let seq = 0
  const consumed: Array<[number, number]> = []

  // LazyColumn / LazyRow: tile item-template Text literals.
  const lazyRe = /\b(LazyColumn|LazyRow)\s*(?:\([^)]*\))?\s*\{/g
  let lazyM: RegExpExecArray | null
  while ((lazyM = lazyRe.exec(src))) {
    const open = (lazyM.index ?? 0) + lazyM[0].length - 1
    const body = sliceBalancedBrace(src, open)
    if (body === undefined) continue
    const end = open + 1 + body.length + 1
    consumed.push([lazyM.index ?? 0, end])
    const itemNodes: DesignNode[] = []
    const textRe = /\bText\s*\(\s*(?:text\s*=\s*)?"([^"\\]*(?:\\.[^"\\]*)*)"/g
    let tm: RegExpExecArray | null
    while ((tm = textRe.exec(body))) {
      const text = tm[1]!.replace(/\\"/g, '"')
      const window = body.slice(tm.index, Math.min(body.length, tm.index + 420))
      const parsed = parseComposeWindow(window)
      pushTextNode(itemNodes, `compose-lazy-item-${seq++}`, text, parsed.style, {
        width: parsed.width,
        height: parsed.height,
        x: parsed.x,
        y: parsed.y,
      })
    }
    if (!itemNodes.length) {
      itemNodes.push({
        id: `compose-lazy-ph-${seq++}`,
        name: 'item',
        kind: 'view',
        box: { height: 48, width: 360 },
        style: {},
        children: [],
      })
    }
    const direction = lazyM[1] === 'LazyRow' ? 'row' : 'column'
    const tiles = tileListTemplate(itemNodes, {
      idPrefix: `compose-lazy-${seq}`,
      direction,
      gap: 8,
    })
    children.push(
      makeListFrame(`compose-list-${seq++}`, lazyM[1]!, tiles, 8),
    )
  }

  // Text("...") or Text(text = "...") outside lazy blocks.
  const textRe = /\bText\s*\(\s*(?:text\s*=\s*)?"([^"\\]*(?:\\.[^"\\]*)*)"/g
  let m: RegExpExecArray | null
  while ((m = textRe.exec(src))) {
    if (indexInRanges(m.index, consumed)) continue
    const text = m[1]!.replace(/\\"/g, '"')
    const window = src.slice(m.index, Math.min(src.length, m.index + 420))
    const parsed = parseComposeWindow(window)
    pushTextNode(children, `compose-${seq++}`, text, parsed.style, {
      width: parsed.width,
      height: parsed.height,
        x: parsed.x,
        y: parsed.y,
    })
  }

  // Button(onClick=...) { Text("...") } — Button text already caught; also Button("label") rare.
  for (const bm of src.matchAll(/\bButton\s*\([^)]*\)\s*\{([\s\S]{0,200}?)\}/g)) {
    const inner = bm[1] ?? ''
    if (/\bText\s*\(/.test(inner)) continue // already extracted
  }

  // Standalone Modifier backgrounds not already attached to a Text window.
  for (const bm of src.matchAll(/\.background\s*\(\s*(Color\([^)]+\))\s*(?:,\s*[^)]*)?\)/g)) {
    const backgroundColor = composeColor(bm[1] ?? '')
    if (!backgroundColor) continue
    // Skip if this background already sits in a text window we parsed.
    const around = src.slice(Math.max(0, bm.index! - 120), bm.index! + 40)
    if (/\bText\s*\(/.test(around)) continue
    if (indexInRanges(bm.index ?? 0, consumed)) continue
    children.push({
      id: `compose-bg-${seq++}`,
      name: 'background',
      kind: 'view',
      box: {},
      style: { backgroundColor },
      children: [],
    })
  }

  const rootStyle = finalizeDeclarativeLayout(children, extractComposeAxisHint(src))

  return {
    root: {
      id: 'compose-root',
      name: rootName,
      kind: 'frame',
      box: {},
      style: rootStyle,
      children,
    },
    scale: 1,
    source: 'manual',
  }
}

function parseSwiftuiWindow(window: string): {
  style: DesignStyle
  width?: number
  height?: number
  x?: number
  y?: number
} {
  const style: DesignStyle = {}
  let width: number | undefined
  let height: number | undefined

  const fs =
    window.match(/\.font\s*\(\s*\.system\s*\(\s*size:\s*([\d.]+)/) ??
    window.match(/\.font\s*\(\s*\.custom\s*\([^,]+,\s*size:\s*([\d.]+)/)
  if (fs) style.fontSize = Number(fs[1])
  if (style.fontSize === undefined) {
    const dyn = window.match(/\.font\s*\(\s*\.(\w+)(?:\s*\.weight\s*\(\s*\.(\w+)\s*\))?/)
    if (dyn) {
      // Large Dynamic Type defaults + HIG weights for SwiftUI text styles.
      const map: Record<string, { size: number; weight?: number }> = {
        largeTitle: { size: 34, weight: 400 },
        title: { size: 28, weight: 400 },
        title2: { size: 22, weight: 400 },
        title3: { size: 20, weight: 400 },
        headline: { size: 17, weight: 600 },
        body: { size: 17, weight: 400 },
        callout: { size: 16, weight: 400 },
        subheadline: { size: 15, weight: 400 },
        footnote: { size: 13, weight: 400 },
        caption: { size: 12, weight: 400 },
        caption2: { size: 11, weight: 400 },
      }
      const key = dyn[1] ?? ''
      const hit = map[key]
      if (hit) {
        style.fontSize = hit.size
        if (hit.weight !== undefined) style.fontWeight = hit.weight
      }
      const weightName = dyn[2]
      if (weightName) {
        const wm: Record<string, number> = {
          ultraLight: 100,
          thin: 200,
          light: 300,
          regular: 400,
          medium: 500,
          semibold: 600,
          bold: 700,
          heavy: 800,
          black: 900,
        }
        if (wm[weightName] !== undefined) style.fontWeight = wm[weightName]
      }
    }
  }

  // .font(.system(size:weight:)) already handled above for size; catch weight-only system.
  const sysWeight = window.match(
    /\.font\s*\(\s*\.system\s*\([^)]*weight:\s*\.(\w+)/,
  )
  if (sysWeight && style.fontWeight === undefined) {
    const wm: Record<string, number> = {
      ultraLight: 100,
      thin: 200,
      light: 300,
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      heavy: 800,
      black: 900,
    }
    const key = sysWeight[1] ?? ''
    if (wm[key] !== undefined) style.fontWeight = wm[key]
  }

  const fg = window.match(
    /\.foreground(?:Color|Style)\s*\(\s*(?:\.(\w+)|Color\.(\w+)|(Color\([^)]+\)|UIColor\([^)]+\)))\s*\)/,
  )
  if (fg) {
    const semantic = fg[1] ?? fg[2]
    const c = semantic
      ? SWIFTUI_SYSTEM_COLORS[semantic]
      : composeColor(fg[3] ?? '') ||
        (() => {
          const swift = (fg[3] ?? '').match(
            /red:\s*([\d.]+)\s*,\s*green:\s*([\d.]+)\s*,\s*blue:\s*([\d.]+)/,
          )
          if (!swift) return undefined
          const hex = (n: string) =>
            Math.max(0, Math.min(255, Math.round(Number(n) * 255)))
              .toString(16)
              .padStart(2, '0')
          return `#${hex(swift[1]!)}${hex(swift[2]!)}${hex(swift[3]!)}` as HexColor
        })()
    if (c) style.color = c
  }

  const bgSemantic = window.match(/\.background\s*\(\s*\.(\w+)\s*\)/)
  const bgColorDot = window.match(/\.background\s*\(\s*Color\.(\w+)\s*\)/)
  const bgExpr = window.match(/\.background\s*\(\s*(Color\([^)]+\))\s*\)/)
  if (bgSemantic) {
    const c = SWIFTUI_SYSTEM_COLORS[bgSemantic[1] ?? '']
    if (c) style.backgroundColor = c
  } else if (bgColorDot) {
    const c = SWIFTUI_SYSTEM_COLORS[bgColorDot[1] ?? '']
    if (c) style.backgroundColor = c
  } else if (bgExpr) {
    const c = composeColor(bgExpr[1] ?? '')
    if (c) style.backgroundColor = c
  }

  if (/\.bold\s*\(/.test(window) || /\.fontWeight\s*\(\s*\.bold\s*\)/.test(window)) {
    style.fontWeight = 700
  } else {
    const fw = window.match(/\.fontWeight\s*\(\s*\.(\w+)\s*\)/)
    if (fw) {
      const map: Record<string, number> = {
        ultraLight: 100,
        thin: 200,
        light: 300,
        regular: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        heavy: 800,
        black: 900,
      }
      const key = fw[1] ?? ''
      if (map[key] !== undefined) style.fontWeight = map[key]
    }
  }

  const frame = window.match(
    /\.frame\s*\(\s*(?:width:\s*([\d.]+))?\s*,?\s*(?:height:\s*([\d.]+))?/,
  )
  if (frame) {
    width = num(frame[1])
    height = num(frame[2])
  }
  // .frame(minWidth:/maxWidth:/minHeight:/maxHeight:)
  const frameMinW = window.match(/\.frame\s*\([^)]*minWidth:\s*([\d.]+)/)
  const frameMaxW = window.match(/\.frame\s*\([^)]*maxWidth:\s*([\d.]+)/)
  const frameMinH = window.match(/\.frame\s*\([^)]*minHeight:\s*([\d.]+)/)
  const frameMaxH = window.match(/\.frame\s*\([^)]*maxHeight:\s*([\d.]+)/)
  if (frameMinW) style.minWidth = Number(frameMinW[1])
  if (frameMaxW) style.maxWidth = Number(frameMaxW[1])
  if (frameMinH) style.minHeight = Number(frameMinH[1])
  if (frameMaxH) style.maxHeight = Number(frameMaxH[1])

  const padAll = window.match(/\.padding\s*\(\s*([\d.]+)\s*\)/)
  if (padAll) applyUniformPadding(style, Number(padAll[1]))
  const padInsets = window.match(
    /\.padding\s*\(\s*EdgeInsets\s*\(\s*top:\s*([\d.]+)\s*,\s*leading:\s*([\d.]+)\s*,\s*bottom:\s*([\d.]+)\s*,\s*trailing:\s*([\d.]+)\s*\)\s*\)/,
  )
  const padInit = window.match(
    /\.padding\s*\(\s*\.init\s*\(\s*top:\s*([\d.]+)\s*,\s*leading:\s*([\d.]+)\s*,\s*bottom:\s*([\d.]+)\s*,\s*trailing:\s*([\d.]+)\s*\)\s*\)/,
  )
  const padEdgeInsets = padInsets ?? padInit
  if (padEdgeInsets && !padAll) {
    style.paddingTop = Number(padEdgeInsets[1])
    style.paddingLeft = Number(padEdgeInsets[2])
    style.paddingBottom = Number(padEdgeInsets[3])
    style.paddingRight = Number(padEdgeInsets[4])
  }
  const padEdge = window.match(
    /\.padding\s*\(\s*\.(horizontal|vertical|top|bottom|leading|trailing|all)\s*,\s*([\d.]+)\s*\)/,
  )
  if (padEdge && !padAll && !padEdgeInsets) {
    const edge = padEdge[1]
    const v = Number(padEdge[2])
    if (edge === 'horizontal' || edge === 'leading' || edge === 'trailing') {
      if (edge === 'horizontal' || edge === 'leading') style.paddingLeft = v
      if (edge === 'horizontal' || edge === 'trailing') style.paddingRight = v
    } else if (edge === 'vertical' || edge === 'top' || edge === 'bottom') {
      if (edge === 'vertical' || edge === 'top') style.paddingTop = v
      if (edge === 'vertical' || edge === 'bottom') style.paddingBottom = v
    } else if (edge === 'all') {
      applyUniformPadding(style, v)
    }
  } else if (
    /\.padding\s*\(\s*\)/.test(window) &&
    !padAll &&
    !padEdge &&
    !padEdgeInsets
  ) {
    applyUniformPadding(style, 16) // SwiftUI default system padding ~16pt heuristic
  }

  const radius = window.match(/\.cornerRadius\s*\(\s*([\d.]+)\s*\)/)
  if (radius) style.cornerRadius = Number(radius[1])

  // safeAreaPadding — same edge mapping as padding.
  const safePadAll = window.match(/\.safeAreaPadding\s*\(\s*([\d.]+)\s*\)/)
  if (safePadAll && !padAll && !padEdgeInsets && !padEdge) {
    applyUniformPadding(style, Number(safePadAll[1]))
  }
  const safePadEdge = window.match(
    /\.safeAreaPadding\s*\(\s*\.(horizontal|vertical|top|bottom|leading|trailing|all)\s*,\s*([\d.]+)\s*\)/,
  )
  if (safePadEdge && !padAll && !padEdgeInsets && !padEdge && !safePadAll) {
    const edge = safePadEdge[1]
    const v = Number(safePadEdge[2])
    if (edge === 'horizontal' || edge === 'leading' || edge === 'trailing') {
      if (edge === 'horizontal' || edge === 'leading') style.paddingLeft = v
      if (edge === 'horizontal' || edge === 'trailing') style.paddingRight = v
    } else if (edge === 'vertical' || edge === 'top' || edge === 'bottom') {
      if (edge === 'vertical' || edge === 'top') style.paddingTop = v
      if (edge === 'vertical' || edge === 'bottom') style.paddingBottom = v
    } else if (edge === 'all') {
      applyUniformPadding(style, v)
    }
  }
  // safeAreaInset(edge:) — apply typical device chrome padding when that edge is unset.
  const safeInset = window.match(
    /\.safeAreaInset\s*\(\s*edge:\s*\.(top|bottom|leading|trailing)/,
  )
  if (safeInset) {
    const edge = safeInset[1]
    const defaults: Record<string, number> = {
      top: 47,
      bottom: 34,
      leading: 0,
      trailing: 0,
    }
    const v = defaults[edge ?? ''] ?? 0
    if (edge === 'top' && style.paddingTop === undefined) style.paddingTop = v
    if (edge === 'bottom' && style.paddingBottom === undefined) style.paddingBottom = v
    if (edge === 'leading' && style.paddingLeft === undefined) style.paddingLeft = v
    if (edge === 'trailing' && style.paddingRight === undefined) style.paddingRight = v
  }

  const shadow =
    window.match(/\.shadow\s*\(\s*(?:color:[^,]*,\s*)?radius:\s*([\d.]+)/) ??
    window.match(/\.shadow\s*\(\s*radius:\s*([\d.]+)/)
  if (shadow) style.elevation = Number(shadow[1])

  // Full SwiftUI shadow(color: .black.opacity(0.2), radius: 8, x: 0, y: 4)
  const fullShadow = window.match(
    /\.shadow\s*\(\s*(?:color:\s*([^,]+)\s*,\s*)?radius:\s*([\d.]+)\s*(?:,\s*x:\s*(-?[\d.]+))?\s*(?:,\s*y:\s*(-?[\d.]+))?/,
  )
  if (fullShadow) {
    const blur = Number(fullShadow[2])
    const ox = fullShadow[3] !== undefined ? Number(fullShadow[3]) : 0
    const oy = fullShadow[4] !== undefined ? Number(fullShadow[4]) : 0
    let color: HexColor | undefined
    const colorRaw = fullShadow[1]?.trim()
    if (colorRaw) {
      const named = colorRaw.match(/\.(\w+)/)
      if (named) color = SWIFTUI_SYSTEM_COLORS[named[1]!] ?? SWIFTUI_SYSTEM_COLORS.black
      const hex = colorRaw.match(/#([0-9A-Fa-f]{3,8})/)
      if (hex) color = parseCssColor(`#${hex[1]}`)
    }
    style.shadow = {
      offsetX: ox,
      offsetY: oy,
      blur,
      ...(color ? { color } : {}),
    }
    style.elevation = blur
  }

  const tracking = window.match(/\.tracking\s*\(\s*(-?[\d.]+)\s*\)/)
  if (tracking) style.letterSpacing = Number(tracking[1])

  const lineSpacing = window.match(/\.lineSpacing\s*\(\s*([\d.]+)\s*\)/)
  if (lineSpacing) {
    const extra = Number(lineSpacing[1])
    if (Number.isFinite(extra)) {
      // SwiftUI lineSpacing is added to the font's intrinsic line height.
      const fs = typeof style.fontSize === 'number' ? style.fontSize : 17
      style.lineHeight = Math.round((fs + extra) * 100) / 100
    }
  }

  const opacity = window.match(/\.opacity\s*\(\s*([\d.]+)\s*\)/)
  if (opacity) {
    const n = Number(opacity[1])
    if (Number.isFinite(n) && n < 1) style.opacity = Math.round(n * 100) / 100
  }

  const rotate =
    window.match(/\.rotationEffect\s*\(\s*\.degrees\s*\(\s*(-?[\d.]+)\s*\)/) ??
    window.match(/\.rotationEffect\s*\(\s*Angle\.degrees\s*\(\s*(-?[\d.]+)\s*\)/) ??
    window.match(/\.rotation3DEffect\s*\(\s*\.degrees\s*\(\s*(-?[\d.]+)\s*\)/)
  if (rotate) {
    const n = Number(rotate[1])
    if (Number.isFinite(n) && Math.abs(n) > 0.5) style.rotation = Math.round(n * 100) / 100
  }

  const scaleXY = window.match(
    /\.scaleEffect\s*\(\s*(?:x:\s*)?(-?[\d.]+)\s*,\s*(?:y:\s*)?(-?[\d.]+)/,
  )
  const scaleU = window.match(/\.scaleEffect\s*\(\s*(-?[\d.]+)\s*\)/)
  if (scaleXY) {
    const sx = Number(scaleXY[1])
    const sy = Number(scaleXY[2])
    if (Number.isFinite(sx) && Math.abs(sx - 1) > 0.02) style.scaleX = Math.round(sx * 1000) / 1000
    if (Number.isFinite(sy) && Math.abs(sy - 1) > 0.02) style.scaleY = Math.round(sy * 1000) / 1000
  } else if (scaleU) {
    const s = Number(scaleU[1])
    if (Number.isFinite(s) && Math.abs(s - 1) > 0.02) {
      style.scaleX = style.scaleY = Math.round(s * 1000) / 1000
    }
  }

  const zIndex = window.match(/\.zIndex\s*\(\s*(-?\d+)\s*\)/)
  if (zIndex) {
    const n = Number(zIndex[1])
    if (Number.isFinite(n) && n !== 0) style.zIndex = n
  }

  if (/\.underline\s*\(/.test(window)) style.textDecoration = 'underline'
  if (/\.strikethrough\s*\(/.test(window)) {
    style.textDecoration =
      style.textDecoration === 'underline' ? 'underline line-through' : 'line-through'
  }
  if (/\.textCase\s*\(\s*\.uppercase/.test(window)) style.textTransform = 'uppercase'
  else if (/\.textCase\s*\(\s*\.lowercase/.test(window)) style.textTransform = 'lowercase'

  if (/\.clipped\s*\(/.test(window) || /\.clipShape\s*\(/.test(window)) {
    style.overflow = 'hidden'
    if (/clipShape\s*\(\s*Circle\s*\(/i.test(window) || /\.clipShape\s*\(\s*\.circle/i.test(window)) {
      style.clipPath = 'circle'
    } else if (/Ellipse|Capsule/i.test(window)) {
      style.clipPath = 'ellipse'
    } else if (/RoundedRectangle|UnevenRoundedRectangle/i.test(window)) {
      style.clipPath = 'inset'
    } else if (!style.clipPath) {
      style.clipPath = 'custom'
    }
  }
  const aspect = window.match(/\.aspectRatio\s*\(\s*([\d.]+)\s*(?:,\s*contentMode:)?/)
  if (aspect) {
    const n = Number(aspect[1])
    if (Number.isFinite(n) && n > 0) style.aspectRatio = Math.round(n * 1000) / 1000
  }
  const lineLimit = window.match(/\.lineLimit\s*\(\s*(\d+)\s*\)/)
  if (lineLimit) {
    style.maxLines = Number(lineLimit[1])
    style.textOverflow = 'ellipsis'
  }
  if (/\.truncationMode\s*\(\s*\.tail/.test(window)) {
    style.textOverflow = 'ellipsis'
    if (style.maxLines === undefined) style.maxLines = 1
  }
  if (/\.italic\s*\(/.test(window) || /\.font\s*\(\s*\.italic/.test(window)) {
    style.fontStyle = 'italic'
  }
  if (/StrokeStyle\s*\([^)]*dash\s*:/i.test(window) || /\.dash\s*\(\s*\[/.test(window)) {
    style.borderStyle = 'dashed'
    const dash = window.match(/dash\s*:\s*\[([^\]]+)\]/i) ?? window.match(/\.dash\s*\(\s*\[([^\]]+)\]/)
    if (dash) {
      const nums = dash[1]!
        .split(/[\s,]+/)
        .map((t) => Number.parseFloat(t))
        .filter((n) => Number.isFinite(n) && n > 0)
      if (nums.length) style.strokeDashArray = nums.join(',')
    }
  }
  const lineCap = window.match(/lineCap\s*:\s*\.(\w+)/i) ?? window.match(/CGLineCap\.(\w+)/i)
  if (lineCap) {
    const c = lineCap[1]!.toLowerCase()
    if (c === 'round') style.strokeCap = 'round'
    else if (c === 'square') style.strokeCap = 'square'
    else if (c === 'butt') style.strokeCap = 'butt'
  }
  const lineJoin = window.match(/lineJoin\s*:\s*\.(\w+)/i) ?? window.match(/CGLineJoin\.(\w+)/i)
  if (lineJoin) {
    const j = lineJoin[1]!.toLowerCase()
    if (j === 'round') style.strokeJoin = 'round'
    else if (j === 'bevel') style.strokeJoin = 'bevel'
    else if (j === 'miter') style.strokeJoin = 'miter'
  }
  // .frame(maxWidth: .infinity) → fill
  if (/\.frame\s*\([^)]*maxWidth:\s*\.infinity/.test(window)) style.sizingHorizontal = 'fill'
  if (/\.frame\s*\([^)]*maxHeight:\s*\.infinity/.test(window)) style.sizingVertical = 'fill'
  if (width !== undefined && style.sizingHorizontal === undefined) style.sizingHorizontal = 'fixed'
  if (height !== undefined && style.sizingVertical === undefined) style.sizingVertical = 'fixed'

  const layoutPriority = window.match(/\.layoutPriority\s*\(\s*(-?[\d.]+)\s*\)/)
  if (layoutPriority) {
    const n = Number(layoutPriority[1])
    if (Number.isFinite(n) && n > 0) style.flexGrow = Math.round(n * 1000) / 1000
  }
  const frameAlign = window.match(/\.frame\s*\([^)]*alignment:\s*\.(\w+)/)
  if (frameAlign) {
    const a = frameAlign[1]!.toLowerCase()
    if (a.includes('trailing') || a.includes('bottom') || a.includes('toptrailing') || a.includes('bottomtrailing')) {
      style.alignSelf = 'end'
    } else if (a.includes('leading') || a.includes('top') || a.includes('bottomleading') || a.includes('topleading')) {
      style.alignSelf = 'start'
    } else if (a.includes('center')) style.alignSelf = 'center'
  }

  const blur = window.match(/\.blur\s*\(\s*(?:radius:\s*)?([\d.]+)\s*\)/)
  if (blur) style.blur = Number(blur[1])
  if (
    /\.background\s*\(\s*\.ultraThinMaterial|\.thinMaterial|\.regularMaterial|\.thickMaterial|\.ultraThickMaterial/i.test(
      window,
    ) ||
    /\.background\s*\(\s*Material\./i.test(window)
  ) {
    // System materials ≈ light backdrop blur for L1 soft compare.
    if (style.backdropBlur === undefined) style.backdropBlur = 20
  }
  if (/\.positioned\s*\(/.test(window) || /\.absoluteOffset\s*\(/.test(window)) {
    style.position = 'absolute'
  }
  if (/\.hidden\s*\(/.test(window) || /\.opacity\s*\(\s*0\s*\)/.test(window)) {
    style.visibility = 'hidden'
  }
  if (
    (style.rotation !== undefined || style.scaleX !== undefined || style.scaleY !== undefined) &&
    !style.transformOrigin
  ) {
    style.transformOrigin = '50% 50%'
  }
  if (style.maxLines === 1) style.whiteSpace = style.whiteSpace ?? 'nowrap'
  if (/\.lineLimit\s*\(\s*1\s*\)/.test(window)) style.whiteSpace = 'nowrap'
  const firstLineIndent = window.match(/\.firstLineIndent\s*\(\s*(-?[\d.]+)\s*\)/)
  if (firstLineIndent) {
    const n = Number(firstLineIndent[1])
    if (Number.isFinite(n) && Math.abs(n) > 0.5) style.textIndent = n
  }

  const offset = window.match(
    /\.offset\s*\(\s*(?:x:\s*(-?[\d.]+))?\s*,?\s*(?:y:\s*(-?[\d.]+))?\s*\)/,
  )
  let ox: number | undefined
  let oy: number | undefined
  if (offset && (offset[1] || offset[2])) {
    if (offset[1]) ox = Number(offset[1])
    if (offset[2]) oy = Number(offset[2])
  }

  return { style, width, height, x: ox, y: oy }
}

/** SwiftUI source → shallow DesignDoc. */
export function swiftuiSourceToDesignDoc(src: string, rootName: string): DesignDoc {
  const children: DesignNode[] = []
  let seq = 0
  const consumed: Array<[number, number]> = []

  // List / ForEach / LazyVStack / LazyHStack: tile Text templates.
  const listRe = /\b(List|ForEach|LazyVStack|LazyHStack)\s*(?:\(|\{)/g
  let listM: RegExpExecArray | null
  while ((listM = listRe.exec(src))) {
    if (indexInRanges(listM.index ?? 0, consumed)) continue
    const kind = listM[1]!
    const openChar = src[(listM.index ?? 0) + listM[0].length - 1]
    let bodyStart = (listM.index ?? 0) + listM[0].length - 1
    if (openChar === '(') {
      const args = sliceBalancedArgs(src, bodyStart)
      if (args === undefined) continue
      const afterArgs = bodyStart + 1 + args.length + 1
      const brace = src.indexOf('{', afterArgs)
      if (brace < 0 || /[^\s]/.test(src.slice(afterArgs, brace))) continue
      bodyStart = brace
    }
    const body = sliceBalancedBrace(src, bodyStart)
    if (body === undefined) continue
    const end = bodyStart + 1 + body.length + 1
    consumed.push([listM.index ?? 0, end])
    const itemNodes: DesignNode[] = []
    const textRe = /\bText\s*\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*\)/g
    let tm: RegExpExecArray | null
    while ((tm = textRe.exec(body))) {
      const text = tm[1]!.replace(/\\"/g, '"')
      const window = body.slice(tm.index, Math.min(body.length, tm.index + 480))
      const parsed = parseSwiftuiWindow(window)
      pushTextNode(itemNodes, `swiftui-list-item-${seq++}`, text, parsed.style, {
        width: parsed.width,
        height: parsed.height,
        x: parsed.x,
        y: parsed.y,
      })
    }
    if (!itemNodes.length) {
      itemNodes.push({
        id: `swiftui-list-ph-${seq++}`,
        name: 'item',
        kind: 'view',
        box: { height: 44, width: 360 },
        style: {},
        children: [],
      })
    }
    const direction = kind === 'LazyHStack' ? 'row' : 'column'
    const tiles = tileListTemplate(itemNodes, {
      idPrefix: `swiftui-list-${seq}`,
      direction,
      gap: kind === 'List' ? 0 : 8,
    })
    children.push(makeListFrame(`swiftui-list-${seq++}`, kind, tiles, kind === 'List' ? 0 : 8))
  }

  const textRe = /\bText\s*\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*\)/g
  let m: RegExpExecArray | null
  while ((m = textRe.exec(src))) {
    if (indexInRanges(m.index, consumed)) continue
    const text = m[1]!.replace(/\\"/g, '"')
    const window = src.slice(m.index, Math.min(src.length, m.index + 480))
    const parsed = parseSwiftuiWindow(window)
    pushTextNode(children, `swiftui-${seq++}`, text, parsed.style, {
      width: parsed.width,
      height: parsed.height,
        x: parsed.x,
        y: parsed.y,
    })
  }

  const rootStyle = finalizeDeclarativeLayout(children, extractSwiftuiAxisHint(src))

  return {
    root: {
      id: 'swiftui-root',
      name: rootName,
      kind: 'frame',
      box: {},
      style: rootStyle,
      children,
    },
    scale: 1,
    source: 'manual',
  }
}

function parseFlutterWindow(window: string): {
  style: DesignStyle
  width?: number
  height?: number
  x?: number
  y?: number
} {
  const style: DesignStyle = {}
  let width: number | undefined
  let height: number | undefined

  const fs = window.match(/fontSize:\s*([\d.]+)/)
  if (fs) style.fontSize = Number(fs[1])
  if (style.fontSize === undefined) {
    // After rewrite: TextStyle(fontSize: 14) from textTheme; or inline Theme.of textTheme.
    const fromStyle = window.match(/TextStyle\s*\([^)]*fontSize:\s*([\d.]+)/)
    if (fromStyle) style.fontSize = Number(fromStyle[1])
  }

  const color = window.match(
    /color:\s*(Color\([^)]+\)|Colors\.[A-Za-z0-9.]+|Theme\.of\([^)]*\)\.[A-Za-z.]+|['"]#[0-9A-Fa-f]{3,8}['"])/,
  )?.[1]
  if (color) {
    const c = flutterColor(color)
    if (c) style.color = c
  }

  const fw = window.match(/fontWeight:\s*FontWeight\.(w(\d{3})|bold|normal|w500|w600|w700)/i)
  if (fw) {
    if (fw[2]) style.fontWeight = Number(fw[2])
    else if (/bold/i.test(fw[1] ?? '')) style.fontWeight = 700
    else if (/w500/i.test(fw[1] ?? '')) style.fontWeight = 500
    else if (/w600/i.test(fw[1] ?? '')) style.fontWeight = 600
    else if (/w700/i.test(fw[1] ?? '')) style.fontWeight = 700
    else style.fontWeight = 400
  }

  const bg = window.match(/color:\s*(Color\([^)]+\))/g)
  // Prefer decoration color for background when BoxDecoration present.
  const decBg = window.match(
    /BoxDecoration\s*\([\s\S]{0,120}?color:\s*(Color\([^)]+\)|Colors\.[A-Za-z0-9.]+|['"]#[0-9A-Fa-f]{3,8}['"])/,
  )
  if (decBg) {
    const c = flutterColor(decBg[1] ?? '')
    if (c) style.backgroundColor = c
  }
  void bg

  const padAll =
    window.match(/padding:\s*(?:const\s+)?EdgeInsets\.all\s*\(\s*([\d.]+)\s*\)/) ??
    window.match(/padding:\s*(?:const\s+)?EdgeInsets\.symmetric\s*\([^)]*\)/)
  if (padAll && padAll[1]) applyUniformPadding(style, Number(padAll[1]))
  const padSym = window.match(
    /EdgeInsets\.symmetric\s*\(\s*(?:horizontal:\s*([\d.]+))?\s*,?\s*(?:vertical:\s*([\d.]+))?/,
  )
  if (padSym && (padSym[1] || padSym[2]) && !padAll?.[1]) {
    const h = num(padSym[1])
    const v = num(padSym[2])
    if (h !== undefined) {
      style.paddingLeft = h
      style.paddingRight = h
    }
    if (v !== undefined) {
      style.paddingTop = v
      style.paddingBottom = v
    }
  }
  const padLtrb = window.match(
    /EdgeInsets\.fromLTRB\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/,
  )
  if (padLtrb && !padAll?.[1] && !(padSym && (padSym[1] || padSym[2]))) {
    style.paddingLeft = Number(padLtrb[1])
    style.paddingTop = Number(padLtrb[2])
    style.paddingRight = Number(padLtrb[3])
    style.paddingBottom = Number(padLtrb[4])
  }
  const padSteb = window.match(
    /EdgeInsets\.fromSTEB\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/,
  )
  if (
    padSteb &&
    !padAll?.[1] &&
    !(padSym && (padSym[1] || padSym[2])) &&
    !padLtrb
  ) {
    style.paddingLeft = Number(padSteb[1])
    style.paddingTop = Number(padSteb[2])
    style.paddingRight = Number(padSteb[3])
    style.paddingBottom = Number(padSteb[4])
  }
  const padOnly = window.match(
    /EdgeInsets\.only\s*\(\s*(?:left:\s*([\d.]+))?\s*,?\s*(?:top:\s*([\d.]+))?\s*,?\s*(?:right:\s*([\d.]+))?\s*,?\s*(?:bottom:\s*([\d.]+))?/,
  )
  if (
    padOnly &&
    (padOnly[1] || padOnly[2] || padOnly[3] || padOnly[4]) &&
    !padAll?.[1] &&
    !(padSym && (padSym[1] || padSym[2])) &&
    !padLtrb &&
    !padSteb
  ) {
    if (padOnly[1]) style.paddingLeft = Number(padOnly[1])
    if (padOnly[2]) style.paddingTop = Number(padOnly[2])
    if (padOnly[3]) style.paddingRight = Number(padOnly[3])
    if (padOnly[4]) style.paddingBottom = Number(padOnly[4])
  }

  const radius =
    window.match(/BorderRadius\.circular\s*\(\s*([\d.]+)\s*\)/) ??
    window.match(/BorderRadius\.all\s*\(\s*(?:const\s+)?Radius\.circular\s*\(\s*([\d.]+)\s*\)\s*\)/) ??
    window.match(/borderRadius:\s*BorderRadius\.circular\s*\(\s*([\d.]+)\s*\)/) ??
    window.match(/borderRadius:\s*BorderRadius\.all\s*\(\s*(?:const\s+)?Radius\.circular\s*\(\s*([\d.]+)\s*\)\s*\)/)
  if (radius) style.cornerRadius = Number(radius[1])
  if (style.cornerRadius === undefined) {
    // BorderRadius.only(... Radius.circular(N) ...) — take the first radius as L1 approx.
    const only = window.match(
      /BorderRadius\.only\s*\([\s\S]{0,200}?Radius\.circular\s*\(\s*([\d.]+)\s*\)/,
    )
    if (only) style.cornerRadius = Number(only[1])
  }

  const sized = window.match(
    /(?:SizedBox|Container)\s*\(\s*(?:[\s\S]*?)width:\s*([\d.]+)(?:[\s\S]*?)height:\s*([\d.]+)/,
  )
  if (sized) {
    width = num(sized[1])
    height = num(sized[2])
  } else {
    // Fallback: bare width/height near the Text (common Container children pattern).
    const w = window.match(/\bwidth:\s*([\d.]+)/)
    const h = window.match(/\bheight:\s*([\d.]+)/)
    if (w) width = num(w[1])
    if (h) height = num(h[1])
  }

  const elev =
    window.match(/\belevation:\s*([\d.]+)/) ??
    window.match(/BoxShadow\s*\([^)]*blurRadius:\s*([\d.]+)/)
  if (elev) style.elevation = Number(elev[1])

  // BoxShadow(color: ..., offset: Offset(x, y), blurRadius: n, spreadRadius: n)
  const boxShadowIdx = window.search(/BoxShadow\s*\(/)
  if (boxShadowIdx >= 0) {
    const open = window.indexOf('(', boxShadowIdx)
    let depth = 0
    let end = -1
    for (let i = open; i < window.length; i++) {
      if (window[i] === '(') depth += 1
      else if (window[i] === ')') {
        depth -= 1
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end > open) {
      const body = window.slice(open + 1, end)
      const blurM = body.match(/blurRadius:\s*([\d.]+)/)
      const spreadM = body.match(/spreadRadius:\s*(-?[\d.]+)/)
      const offM = body.match(/Offset\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/)
      const colorM = body.match(
        /color:\s*(Color\([^)]+\)|Colors\.[A-Za-z0-9.]+|['"]#[0-9A-Fa-f]{3,8}['"])/,
      )
      if (blurM) {
        const blur = Number(blurM[1])
        const inset = /blurStyle:\s*BlurStyle\.inner/.test(body)
        const color = colorM ? flutterColor(colorM[1] ?? '') : undefined
        const shadow = {
          offsetX: offM ? Number(offM[1]) : 0,
          offsetY: offM ? Number(offM[2]) : 0,
          blur,
          ...(spreadM ? { spread: Number(spreadM[1]) } : {}),
          ...(color ? { color } : {}),
        }
        if (inset) {
          style.insetShadow = shadow
          style.innerShadow = blur
        } else {
          style.shadow = shadow
          style.elevation = blur
        }
      }
    }
  }

  const letterSp = window.match(/letterSpacing:\s*(-?[\d.]+)/)
  if (letterSp) style.letterSpacing = Number(letterSp[1])

  // TextStyle.height is a multiplier of fontSize (not a box height).
  const tsHeight = window.match(/TextStyle\s*\([^)]*?\bheight:\s*([\d.]+)/)
  if (tsHeight && typeof style.fontSize === 'number') {
    style.lineHeight = Math.round(Number(tsHeight[1]) * style.fontSize * 100) / 100
  }

  const opacity =
    window.match(/Opacity\s*\(\s*opacity:\s*([\d.]+)/) ??
    window.match(/\.withOpacity\s*\(\s*([\d.]+)\s*\)/)
  if (opacity) {
    const n = Number(opacity[1])
    if (Number.isFinite(n) && n < 1) {
      // Prefer baking into fill/text colour when present; else node opacity.
      if (typeof style.color === 'string') style.color = bakeHexOpacity(style.color, n)
      else if (typeof style.backgroundColor === 'string') {
        style.backgroundColor = bakeHexOpacity(style.backgroundColor, n)
      } else {
        style.opacity = Math.round(n * 100) / 100
      }
    }
  }

  // ImageFilter.blur → layer blur; BackdropFilter → backdropBlur.
  if (/BackdropFilter\b/.test(window)) {
    const bb =
      window.match(/BackdropFilter\s*\([^)]*ImageFilter\.blur\s*\(\s*sigmaX:\s*([\d.]+)/) ??
      window.match(/BackdropFilter\s*\([^)]*sigmaX:\s*([\d.]+)/) ??
      window.match(/BackdropFilter[\s\S]{0,160}?blur\s*\(\s*(?:sigmaX:\s*)?([\d.]+)/)
    if (bb) style.backdropBlur = Number(bb[1])
  }
  const blur =
    window.match(/ImageFilter\.blur\s*\(\s*sigmaX:\s*([\d.]+)/) ??
    window.match(/\.blur\s*\(\s*([\d.]+)\s*\)/)
  if (blur && !/BackdropFilter\b/.test(window)) style.blur = Number(blur[1])

  const rotateRad =
    window.match(
      /Transform\.rotate\s*\(\s*(?:angle:\s*)?(-?[\d.]+)\s*(?:\s*,|\))/,
    ) ?? window.match(/Matrix4\.rotationZ\s*\(\s*(-?[\d.]+)\s*\)/)
  if (rotateRad) {
    const rad = Number(rotateRad[1])
    if (Number.isFinite(rad)) {
      const deg = (rad * 180) / Math.PI
      if (Math.abs(deg) > 0.5) style.rotation = Math.round(deg * 100) / 100
    }
  }
  const rotatedBox = window.match(/RotatedBox\s*\(\s*quarterTurns:\s*(-?\d+)/)
  if (rotatedBox && style.rotation === undefined) {
    const turns = Number(rotatedBox[1])
    if (Number.isFinite(turns) && turns !== 0) {
      style.rotation = Math.round(((turns * 90) % 360) * 100) / 100
    }
  }

  const scaleF =
    window.match(/Transform\.scale\s*\(\s*(?:scale:\s*)?(-?[\d.]+)/) ??
    window.match(/Transform\.scale\s*\(\s*(-?[\d.]+)\s*,/)
  if (scaleF) {
    const s = Number(scaleF[1])
    if (Number.isFinite(s) && Math.abs(s - 1) > 0.02) {
      style.scaleX = style.scaleY = Math.round(s * 1000) / 1000
    }
  }

  // Matrix4 skew approximations are rare; prefer Transform with explicit comments skipped.

  if (/TextDecoration\.underline/i.test(window)) style.textDecoration = 'underline'
  if (/TextDecoration\.lineThrough/i.test(window)) {
    style.textDecoration =
      style.textDecoration === 'underline' ? 'underline line-through' : 'line-through'
  }
  if (/TextTransformer\.toUpperCase/i.test(window)) style.textTransform = 'uppercase'
  else if (/TextTransformer\.toLowerCase/i.test(window)) style.textTransform = 'lowercase'

  if (/ClipRect\b|ClipRRect\b|clipBehavior:\s*Clip\.(hardEdge|antiAlias)/i.test(window)) {
    style.overflow = 'hidden'
    if (/ClipOval\b|ClipRRect/i.test(window) && /BorderRadius\.circular/i.test(window)) {
      style.clipPath = 'circle'
    } else if (/ClipOval\b/.test(window)) {
      style.clipPath = 'ellipse'
    } else if (/ClipRRect\b/.test(window)) {
      style.clipPath = 'inset'
    } else if (/ClipPath\b/.test(window)) {
      style.clipPath = 'path'
    } else if (!style.clipPath) {
      style.clipPath = 'custom'
    }
  }
  if (/ClipOval\b/.test(window)) {
    style.overflow = 'hidden'
    style.clipPath = style.clipPath ?? 'ellipse'
  }
  const aspect =
    window.match(/AspectRatio\s*\(\s*aspectRatio:\s*([\d.]+)/) ??
    window.match(/aspectRatio:\s*([\d.]+)/)
  if (aspect) {
    const n = Number(aspect[1])
    if (Number.isFinite(n) && n > 0) style.aspectRatio = Math.round(n * 1000) / 1000
  }
  const maxLines =
    window.match(/maxLines:\s*(\d+)/) ?? window.match(/maxLines\s*:\s*(\d+)/)
  if (maxLines) {
    style.maxLines = Number(maxLines[1])
    style.textOverflow = 'ellipsis'
  }
  if (/overflow:\s*TextOverflow\.ellipsis/i.test(window)) {
    style.textOverflow = 'ellipsis'
    if (style.maxLines === undefined) style.maxLines = 1
  }
  if (/FontStyle\.italic|fontStyle:\s*FontStyle\.italic/i.test(window)) {
    style.fontStyle = 'italic'
  }
  if (/dashPattern\s*:/.test(window)) {
    style.borderStyle = 'dashed'
    const dash = window.match(/dashPattern\s*:\s*\[([^\]]+)\]/)
    if (dash) {
      const nums = dash[1]!
        .split(/[\s,]+/)
        .map((t) => Number.parseFloat(t))
        .filter((n) => Number.isFinite(n) && n > 0)
      if (nums.length) style.strokeDashArray = nums.join(',')
    }
  }
  const strokeCapFl =
    window.match(/strokeCap:\s*StrokeCap\.(\w+)/i) ?? window.match(/StrokeCap\.(\w+)/)
  if (strokeCapFl) {
    const c = strokeCapFl[1]!.toLowerCase()
    if (c === 'round' || c === 'square' || c === 'butt') style.strokeCap = c
  }
  const strokeJoinFl =
    window.match(/strokeJoin:\s*StrokeJoin\.(\w+)/i) ?? window.match(/StrokeJoin\.(\w+)/)
  if (strokeJoinFl) {
    const j = strokeJoinFl[1]!.toLowerCase()
    if (j === 'round' || j === 'bevel' || j === 'miter') style.strokeJoin = j
  }
  if (/SizedBox\.expand|width:\s*double\.infinity/.test(window)) style.sizingHorizontal = 'fill'
  if (/height:\s*double\.infinity/.test(window)) style.sizingVertical = 'fill'
  if (width !== undefined && style.sizingHorizontal === undefined) style.sizingHorizontal = 'fixed'
  if (height !== undefined && style.sizingVertical === undefined) style.sizingVertical = 'fixed'

  // BoxConstraints / ConstrainedBox → min/max.
  const boxConstraints = window.match(/BoxConstraints\s*\(\s*([^)]*)\)/)
  if (boxConstraints) {
    const body = boxConstraints[1] ?? ''
    const minW = body.match(/minWidth:\s*([\d.]+)/)
    const maxW = body.match(/maxWidth:\s*([\d.]+)/)
    const minH = body.match(/minHeight:\s*([\d.]+)/)
    const maxH = body.match(/maxHeight:\s*([\d.]+)/)
    if (minW) style.minWidth = Number(minW[1])
    if (maxW && maxW[1] !== 'double.infinity' && Number.isFinite(Number(maxW[1]))) {
      style.maxWidth = Number(maxW[1])
    }
    if (minH) style.minHeight = Number(minH[1])
    if (maxH && maxH[1] !== 'double.infinity' && Number.isFinite(Number(maxH[1]))) {
      style.maxHeight = Number(maxH[1])
    }
  }
  const constraintsLoose = window.match(
    /constraints:\s*BoxConstraints\.(?:tightFor|loose)\s*\(\s*(?:width:\s*([\d.]+))?\s*,?\s*(?:height:\s*([\d.]+))?/,
  )
  if (constraintsLoose && !boxConstraints) {
    if (constraintsLoose[1]) {
      style.minWidth = style.maxWidth = Number(constraintsLoose[1])
    }
    if (constraintsLoose[2]) {
      style.minHeight = style.maxHeight = Number(constraintsLoose[2])
    }
  }

  // Expanded / Flexible → flexGrow; Wrap → flexWrap; Align → alignSelf.
  if (/\bExpanded\s*\(/.test(window)) {
    const flex = window.match(/Expanded\s*\([^)]*flex:\s*([\d.]+)/)
    style.flexGrow = flex ? Number(flex[1]) : 1
  } else {
    const flexible = window.match(/Flexible\s*\([^)]*flex:\s*([\d.]+)/)
    if (flexible) {
      const n = Number(flexible[1])
      if (Number.isFinite(n) && n > 0) style.flexGrow = n
    } else if (/\bFlexible\s*\(/.test(window)) {
      style.flexGrow = 1
    }
  }
  if (/\bWrap\s*\(/.test(window)) style.flexWrap = 'wrap'
  const runAlign = window.match(/runAlignment:\s*WrapAlignment\.(\w+)/i)
  if (runAlign) {
    const a = runAlign[1]!.toLowerCase()
    if (a === 'center') style.alignContent = 'center'
    else if (a === 'end') style.alignContent = 'end'
    else if (a === 'start') style.alignContent = 'start'
    else if (a === 'spacebetween') style.alignContent = 'space-between'
    else if (a === 'spacearound') style.alignContent = 'space-around'
    else if (a === 'spaceevenly') style.alignContent = 'space-evenly'
  }
  const alignFlutter = window.match(/Align\s*\([^)]*alignment:\s*Alignment\.(\w+)/)
  if (alignFlutter) {
    const a = alignFlutter[1]!.toLowerCase()
    if (a.includes('right') || a.includes('bottomright') || a.includes('topright')) {
      style.alignSelf = 'end'
    } else if (a.includes('left') || a.includes('bottomleft') || a.includes('topleft')) {
      style.alignSelf = 'start'
    } else if (a.includes('center')) style.alignSelf = 'center'
  }

  if (/Visibility\s*\.\s*hidden|Opacity\s*\(\s*opacity:\s*0\b/i.test(window)) {
    style.visibility = 'hidden'
  }
  if (
    (style.rotation !== undefined || style.scaleX !== undefined || style.scaleY !== undefined) &&
    !style.transformOrigin
  ) {
    style.transformOrigin = '50% 50%'
  }
  if (style.maxLines === 1 || /softWrap:\s*false/i.test(window)) {
    style.whiteSpace = style.whiteSpace ?? 'nowrap'
  }
  if (/softWrap:\s*true/i.test(window)) style.whiteSpace = 'normal'
  const wordSpFl = window.match(/wordSpacing:\s*(-?[\d.]+)/)
  if (wordSpFl) {
    const n = Number(wordSpFl[1])
    if (Number.isFinite(n) && Math.abs(n) > 0.01) style.wordSpacing = n
  }
  const textIndentFl =
    window.match(/textIndent:\s*(-?[\d.]+)/) ??
    window.match(/TextIndent\s*\(\s*(?:firstLine:\s*)?(-?[\d.]+)/)
  if (textIndentFl) {
    const n = Number(textIndentFl[1])
    if (Number.isFinite(n) && Math.abs(n) > 0.5) style.textIndent = n
  }

  const positionedLeft = window.match(/Positioned\s*\([^)]*\bleft:\s*(-?[\d.]+)/)
  const positionedTop = window.match(/Positioned\s*\([^)]*\btop:\s*(-?[\d.]+)/)
  if (/Positioned\s*\(/.test(window)) style.position = 'absolute'
  const translate = window.match(
    /Transform\.translate\s*\(\s*offset:\s*(?:const\s+)?Offset\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/,
  )
  let ox: number | undefined
  let oy: number | undefined
  if (positionedLeft) ox = Number(positionedLeft[1])
  if (positionedTop) oy = Number(positionedTop[1])
  if (translate) {
    ox = (ox ?? 0) + Number(translate[1])
    oy = (oy ?? 0) + Number(translate[2])
  }

  return { style, width, height, x: ox, y: oy }
}

/** Flutter Dart source → shallow DesignDoc. */
export function flutterSourceToDesignDoc(src: string, rootName: string): DesignDoc {
  const children: DesignNode[] = []
  let seq = 0
  const consumed: Array<[number, number]> = []

  // ListView( / ListView.builder( / ListView.separated(
  const listRe = /\bListView(?:\.(?:builder|separated))?\s*\(/g
  let listM: RegExpExecArray | null
  while ((listM = listRe.exec(src))) {
    const open = (listM.index ?? 0) + listM[0].length - 1
    // Find matching ) then optional trailing content; body is call args.
    let depth = 0
    let end = -1
    for (let i = open; i < src.length; i++) {
      if (src[i] === '(') depth += 1
      else if (src[i] === ')') {
        depth -= 1
        if (depth === 0) {
          end = i + 1
          break
        }
      }
    }
    if (end < 0) continue
    const call = src.slice(listM.index ?? 0, end)
    consumed.push([listM.index ?? 0, end])
    const itemNodes: DesignNode[] = []
    const textRe = /\bText\s*\(\s*(?:['"]([^'"\\]*(?:\\.[^'"\\]*)*)['"])/g
    let tm: RegExpExecArray | null
    while ((tm = textRe.exec(call))) {
      const text = (tm[1] ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"')
      const start = Math.max(0, tm.index - 200)
      const window = call.slice(start, Math.min(call.length, tm.index + 300))
      const parsed = parseFlutterWindow(window)
      pushTextNode(itemNodes, `flutter-list-item-${seq++}`, text, parsed.style, {
        width: parsed.width,
        height: parsed.height,
        x: parsed.x,
        y: parsed.y,
      })
    }
    if (!itemNodes.length) {
      itemNodes.push({
        id: `flutter-list-ph-${seq++}`,
        name: 'item',
        kind: 'view',
        box: { height: 48, width: 360 },
        style: {},
        children: [],
      })
    }
    const tiles = tileListTemplate(itemNodes, {
      idPrefix: `flutter-list-${seq}`,
      direction: 'column',
      gap: 8,
    })
    children.push(makeListFrame(`flutter-list-${seq++}`, 'ListView', tiles, 8))
  }

  const textRe = /\bText\s*\(\s*(?:['"]([^'"\\]*(?:\\.[^'"\\]*)*)['"])/g
  let m: RegExpExecArray | null
  while ((m = textRe.exec(src))) {
    if (indexInRanges(m.index, consumed)) continue
    const text = (m[1] ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"')
    // Look behind for wrapping Container/Padding as well as after.
    const start = Math.max(0, m.index - 600)
    const window = src.slice(start, Math.min(src.length, m.index + 400))
    const parsed = parseFlutterWindow(window)
    pushTextNode(children, `flutter-${seq++}`, text, parsed.style, {
      width: parsed.width,
      height: parsed.height,
        x: parsed.x,
        y: parsed.y,
    })
  }

  // Orphan Containers with explicit size (no Text inside already counted).
  for (const cm of src.matchAll(/\bContainer\s*\(/g)) {
    const start = cm.index ?? 0
    if (indexInRanges(start, consumed)) continue
    let depth = 0
    let end = -1
    for (let i = start + cm[0].length - 1; i < src.length; i++) {
      const ch = src[i]
      if (ch === '(') depth += 1
      else if (ch === ')') {
        depth -= 1
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end < 0) continue
    const slice = src.slice(start, end + 1)
    if (/\bText\s*\(/.test(slice)) continue
    const parsed = parseFlutterWindow(slice)
    if (parsed.width === undefined || parsed.height === undefined) continue
    if (
      !parsed.style.backgroundColor &&
      parsed.style.cornerRadius === undefined &&
      Object.keys(parsed.style).length === 0
    ) {
      // Still emit sized boxes without decoration.
    }
    children.push({
      id: `flutter-box-${seq++}`,
      name: 'Container',
      kind: 'view',
      box: { width: parsed.width, height: parsed.height },
      style: parsed.style,
      children: [],
    })
  }

  const rootStyle = finalizeDeclarativeLayout(children, extractFlutterAxisHint(src))

  return {
    root: {
      id: 'flutter-root',
      name: rootName,
      kind: 'frame',
      box: {},
      style: rootStyle,
      children,
    },
    scale: 1,
    source: 'manual',
  }
}

function parseRnStyleBody(body: string): {
  style: DesignStyle
  width?: number
  height?: number
  x?: number
  y?: number
} {
  // StyleSheet.hairlineWidth ≈ 1/PixelRatio; L1 uses 0.5 (typical 2x).
  const normalized = body.replace(/StyleSheet\.hairlineWidth\b/g, '0.5')
  const style: DesignStyle = {}
  let width: number | undefined
  let height: number | undefined

  const fs = normalized.match(/fontSize\s*:\s*([\d.]+)/)
  if (fs) style.fontSize = Number(fs[1])
  const color = normalized.match(/color\s*:\s*['"](#[0-9A-Fa-f]{3,8})['"]/)
  if (color) style.color = parseCssColor(color[1])
  const bg = normalized.match(/backgroundColor\s*:\s*['"](#[0-9A-Fa-f]{3,8})['"]/)
  if (bg) style.backgroundColor = parseCssColor(bg[1])
  const br = normalized.match(/borderRadius\s*:\s*([\d.]+)/)
  if (br) style.cornerRadius = Number(br[1])
  const bw = normalized.match(/borderWidth\s*:\s*([\d.]+)/)
  if (bw) style.borderWidth = Number(bw[1])
  const bc = normalized.match(/borderColor\s*:\s*['"](#[0-9A-Fa-f]{3,8})['"]/)
  if (bc) style.borderColor = parseCssColor(bc[1])
  const bstyle = normalized.match(/borderStyle\s*:\s*['"](solid|dashed|dotted)['"]/i)
  if (bstyle) {
    const v = bstyle[1]!.toLowerCase()
    if (v === 'dashed' || v === 'dotted' || v === 'solid') style.borderStyle = v
  }
  const dashArray =
    normalized.match(/strokeDasharray\s*:\s*['"]([^'"]+)['"]/i) ??
    normalized.match(/borderDashPattern\s*:\s*\[([^\]]+)\]/)
  if (dashArray) {
    const nums = dashArray[1]!
      .split(/[\s,]+/)
      .map((t) => Number.parseFloat(t))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (nums.length) {
      style.strokeDashArray = nums.join(',')
      if (!style.borderStyle) style.borderStyle = 'dashed'
    }
  }
  const strokeCap = normalized.match(/strokeLinecap\s*:\s*['"](\w+)['"]/i)
  if (strokeCap) {
    const v = strokeCap[1]!.toLowerCase()
    if (v === 'round' || v === 'square' || v === 'butt') style.strokeCap = v
  }
  const strokeJoin = normalized.match(/strokeLinejoin\s*:\s*['"](\w+)['"]/i)
  if (strokeJoin) {
    const v = strokeJoin[1]!.toLowerCase()
    if (v === 'round' || v === 'bevel' || v === 'miter') style.strokeJoin = v
  }
  const fw = normalized.match(/fontWeight\s*:\s*['"]?(bold|normal|\d{3})['"]?/)
  if (fw) {
    if (fw[1] === 'bold') style.fontWeight = 700
    else if (fw[1] === 'normal') style.fontWeight = 400
    else style.fontWeight = Number(fw[1])
  }
  const w = normalized.match(/width\s*:\s*([\d.]+)/)
  if (w) {
    width = Number(w[1])
    style.sizingHorizontal = 'fixed'
  }
  const h = normalized.match(/height\s*:\s*([\d.]+)/)
  if (h) {
    height = Number(h[1])
    style.sizingVertical = 'fixed'
  }
  if (/width\s*:\s*['"]?100%['"]?/.test(normalized) || /alignSelf\s*:\s*['"]stretch['"]/.test(normalized)) {
    style.sizingHorizontal = 'fill'
  }
  if (/height\s*:\s*['"]?100%['"]?/.test(normalized)) style.sizingVertical = 'fill'
  const minW = normalized.match(/minWidth\s*:\s*([\d.]+)/)
  if (minW) style.minWidth = Number(minW[1])
  const maxW = normalized.match(/maxWidth\s*:\s*([\d.]+)/)
  if (maxW) style.maxWidth = Number(maxW[1])
  const minH = normalized.match(/minHeight\s*:\s*([\d.]+)/)
  if (minH) style.minHeight = Number(minH[1])
  const maxH = normalized.match(/maxHeight\s*:\s*([\d.]+)/)
  if (maxH) style.maxHeight = Number(maxH[1])

  const pad = normalized.match(/padding\s*:\s*([\d.]+)/)
  if (pad) applyUniformPadding(style, Number(pad[1]))
  const padH = normalized.match(/paddingHorizontal\s*:\s*([\d.]+)/)
  if (padH) {
    style.paddingLeft = Number(padH[1])
    style.paddingRight = Number(padH[1])
  }
  const padV = normalized.match(/paddingVertical\s*:\s*([\d.]+)/)
  if (padV) {
    style.paddingTop = Number(padV[1])
    style.paddingBottom = Number(padV[1])
  }
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const m = normalized.match(new RegExp(`padding${side}\\s*:\\s*([\\d.]+)`))
    if (m) {
      const key = `padding${side}` as keyof DesignStyle
      ;(style as Record<string, number | undefined>)[key] = Number(m[1])
    }
  }

  const margin = normalized.match(/margin\s*:\s*([\d.]+)/)
  if (margin) applyUniformMargin(style, Number(margin[1]))
  const marginH = normalized.match(/marginHorizontal\s*:\s*([\d.]+)/)
  if (marginH) {
    style.marginLeft = Number(marginH[1])
    style.marginRight = Number(marginH[1])
  }
  const marginV = normalized.match(/marginVertical\s*:\s*([\d.]+)/)
  if (marginV) {
    style.marginTop = Number(marginV[1])
    style.marginBottom = Number(marginV[1])
  }

  const elev =
    normalized.match(/\belevation\s*:\s*([\d.]+)/) ??
    normalized.match(/shadowRadius\s*:\s*([\d.]+)/)
  if (elev) style.elevation = Number(elev[1])

  // RN shadowColor / shadowOffset / shadowRadius / shadowOpacity
  const shadowRadius = normalized.match(/shadowRadius\s*:\s*([\d.]+)/)
  const shadowColor = normalized.match(/shadowColor\s*:\s*['"](#[0-9A-Fa-f]{3,8})['"]/)
  const shadowOff = normalized.match(
    /shadowOffset\s*:\s*\{\s*(?:width\s*:\s*(-?[\d.]+))?\s*,?\s*(?:height\s*:\s*(-?[\d.]+))?/,
  )
  const shadowOpacity = normalized.match(/shadowOpacity\s*:\s*([\d.]+)/)
  if (shadowRadius || shadowOff || shadowColor) {
    const blur = shadowRadius ? Number(shadowRadius[1]) : style.elevation ?? 0
    let color = shadowColor ? parseCssColor(shadowColor[1]) : undefined
    if (color && shadowOpacity) {
      const op = Number(shadowOpacity[1])
      if (Number.isFinite(op) && op < 1) color = bakeHexOpacity(color, op)
    }
    style.shadow = {
      offsetX: shadowOff?.[1] !== undefined ? Number(shadowOff[1]) : 0,
      offsetY: shadowOff?.[2] !== undefined ? Number(shadowOff[2]) : 0,
      blur: typeof blur === 'number' ? blur : 0,
      ...(color ? { color } : {}),
    }
    if (typeof blur === 'number') style.elevation = blur
  }

  const letterSp = normalized.match(/letterSpacing\s*:\s*(-?[\d.]+)/)
  if (letterSp) style.letterSpacing = Number(letterSp[1])
  const lineH = normalized.match(/lineHeight\s*:\s*([\d.]+)/)
  if (lineH) style.lineHeight = Number(lineH[1])
  const opacity = normalized.match(/\bopacity\s*:\s*([\d.]+)/)
  if (opacity) {
    const n = Number(opacity[1])
    if (Number.isFinite(n) && n < 1) style.opacity = Math.round(n * 100) / 100
  }

  const rotate =
    normalized.match(/rotate\s*:\s*['"](-?[\d.]+)deg['"]/) ??
    normalized.match(/rotateZ\s*:\s*['"](-?[\d.]+)deg['"]/) ??
    normalized.match(/\{\s*rotate\s*:\s*['"](-?[\d.]+)deg['"]/)
  if (rotate) {
    const n = Number(rotate[1])
    if (Number.isFinite(n) && Math.abs(n) > 0.5) style.rotation = Math.round(n * 100) / 100
  }

  const scale =
    normalized.match(/\bscale\s*:\s*(-?[\d.]+)/) ??
    normalized.match(/\{\s*scale\s*:\s*(-?[\d.]+)/)
  const scaleX = normalized.match(/scaleX\s*:\s*(-?[\d.]+)/)
  const scaleY = normalized.match(/scaleY\s*:\s*(-?[\d.]+)/)
  if (scaleX) {
    const n = Number(scaleX[1])
    if (Number.isFinite(n) && Math.abs(n - 1) > 0.02) style.scaleX = Math.round(n * 1000) / 1000
  }
  if (scaleY) {
    const n = Number(scaleY[1])
    if (Number.isFinite(n) && Math.abs(n - 1) > 0.02) style.scaleY = Math.round(n * 1000) / 1000
  }
  if (scale && style.scaleX === undefined && style.scaleY === undefined) {
    const n = Number(scale[1])
    if (Number.isFinite(n) && Math.abs(n - 1) > 0.02) {
      style.scaleX = style.scaleY = Math.round(n * 1000) / 1000
    }
  }

  const skewX =
    normalized.match(/skewX\s*:\s*['"](-?[\d.]+)deg['"]/) ??
    normalized.match(/\{\s*skewX\s*:\s*['"](-?[\d.]+)deg['"]/)
  const skewY =
    normalized.match(/skewY\s*:\s*['"](-?[\d.]+)deg['"]/) ??
    normalized.match(/\{\s*skewY\s*:\s*['"](-?[\d.]+)deg['"]/)
  if (skewX) {
    const n = Number(skewX[1])
    if (Number.isFinite(n) && Math.abs(n) > 0.5) style.skewX = Math.round(n * 100) / 100
  }
  if (skewY) {
    const n = Number(skewY[1])
    if (Number.isFinite(n) && Math.abs(n) > 0.5) style.skewY = Math.round(n * 100) / 100
  }

  const zIndex = normalized.match(/\bzIndex\s*:\s*(-?\d+)/)
  if (zIndex) {
    const n = Number(zIndex[1])
    if (Number.isFinite(n) && n !== 0) style.zIndex = n
  }

  const deco = normalized.match(/textDecorationLine\s*:\s*['"]([^'"]+)['"]/)
  if (deco) {
    const v = deco[1]!.toLowerCase()
    if (v.includes('underline') && v.includes('line-through')) {
      style.textDecoration = 'underline line-through'
    } else if (v.includes('underline')) style.textDecoration = 'underline'
    else if (v.includes('line-through')) style.textDecoration = 'line-through'
  }
  const transform = normalized.match(/textTransform\s*:\s*['"]([^'"]+)['"]/)
  if (transform) {
    const v = transform[1]!.toLowerCase()
    if (v === 'uppercase' || v === 'lowercase' || v === 'capitalize') style.textTransform = v
  }

  const overflow = normalized.match(/\boverflow\s*:\s*['"]([^'"]+)['"]/)
  if (overflow) {
    const v = overflow[1]!.toLowerCase()
    if (v === 'hidden') style.overflow = 'hidden'
    else if (v === 'scroll') style.overflow = 'scroll'
  }
  const aspect = normalized.match(/aspectRatio\s*:\s*([\d.]+)/)
  if (aspect) {
    const n = Number(aspect[1])
    if (Number.isFinite(n) && n > 0) style.aspectRatio = Math.round(n * 1000) / 1000
  }
  const maxLines =
    normalized.match(/numberOfLines\s*:\s*(\d+)/) ??
    normalized.match(/maxLines\s*:\s*(\d+)/)
  if (maxLines) {
    style.maxLines = Number(maxLines[1])
    style.textOverflow = 'ellipsis'
  }
  const ellipsize = normalized.match(/ellipsizeMode\s*:\s*['"]([^'"]+)['"]/)
  if (ellipsize && /tail|head|middle|clip/i.test(ellipsize[1]!)) {
    style.textOverflow = /clip/i.test(ellipsize[1]!) ? 'clip' : 'ellipsis'
    if (style.maxLines === undefined) style.maxLines = 1
  }
  if (/fontStyle\s*:\s*['"]italic['"]/i.test(normalized)) style.fontStyle = 'italic'
  const textAlignV = normalized.match(/textAlignVertical\s*:\s*['"](\w+)['"]/)
  if (textAlignV) {
    const v = textAlignV[1]!.toLowerCase()
    if (v === 'center' || v === 'middle') style.textAlignVertical = 'center'
    else if (v === 'bottom') style.textAlignVertical = 'bottom'
    else if (v === 'top') style.textAlignVertical = 'top'
  }
  const pos = normalized.match(/\bposition\s*:\s*['"](absolute|relative|fixed|sticky)['"]/i)
  if (pos) {
    style.position = pos[1]!.toLowerCase() as DesignStyle['position']
  }
  const rowGap = normalized.match(/rowGap\s*:\s*([\d.]+)/)
  if (rowGap) {
    style.rowGap = Number(rowGap[1])
    if (style.gap === undefined) style.gap = style.rowGap
  }
  const columnGap = normalized.match(/columnGap\s*:\s*([\d.]+)/)
  if (columnGap) {
    style.columnGap = Number(columnGap[1])
    if (style.gap === undefined) style.gap = style.columnGap
  }
  const flexWrap = normalized.match(/flexWrap\s*:\s*['"](\w+)['"]/i)
  if (flexWrap) {
    const v = flexWrap[1]!.toLowerCase()
    if (v === 'wrap' || v === 'wrap-reverse') style.flexWrap = 'wrap'
    else if (v === 'nowrap') style.flexWrap = 'nowrap'
  }
  const alignContent = normalized.match(/alignContent\s*:\s*['"]([\w-]+)['"]/i)
  if (alignContent) {
    const v = alignContent[1]!.toLowerCase()
    if (v === 'center') style.alignContent = 'center'
    else if (v === 'flex-end' || v === 'end') style.alignContent = 'end'
    else if (v === 'flex-start' || v === 'start') style.alignContent = 'start'
    else if (v === 'stretch') style.alignContent = 'stretch'
    else if (v === 'space-between') style.alignContent = 'space-between'
    else if (v === 'space-around') style.alignContent = 'space-around'
    else if (v === 'space-evenly') style.alignContent = 'space-evenly'
  }
  const orderM = normalized.match(/\border\s*:\s*(-?\d+)/)
  if (orderM) {
    const n = Number(orderM[1])
    if (Number.isFinite(n) && n !== 0) style.order = n
  }
  const alignSelf = normalized.match(/alignSelf\s*:\s*['"]([\w-]+)['"]/i)
  if (alignSelf) {
    const v = alignSelf[1]!.toLowerCase()
    if (v === 'center') style.alignSelf = 'center'
    else if (v === 'flex-end' || v === 'end') style.alignSelf = 'end'
    else if (v === 'flex-start' || v === 'start') style.alignSelf = 'start'
    else if (v === 'stretch') style.alignSelf = 'stretch'
  }
  const flexGrow = normalized.match(/flexGrow\s*:\s*([\d.]+)/)
  if (flexGrow) {
    const n = Number(flexGrow[1])
    if (Number.isFinite(n) && n > 0) style.flexGrow = n
  }
  const flexShrink = normalized.match(/flexShrink\s*:\s*([\d.]+)/)
  if (flexShrink) {
    const n = Number(flexShrink[1])
    if (Number.isFinite(n)) style.flexShrink = n
  }
  // Shorthand flex: number → grow
  const flexShort = normalized.match(/\bflex\s*:\s*([\d.]+)/)
  if (flexShort && style.flexGrow === undefined) {
    const n = Number(flexShort[1])
    if (Number.isFinite(n) && n > 0) style.flexGrow = n
  }
  const transformOrigin = normalized.match(
    /transformOrigin\s*:\s*['"]([^'"]+)['"]/,
  )
  if (transformOrigin) {
    const origin = parseCssTransformOrigin(transformOrigin[1])
    if (origin) style.transformOrigin = origin
  } else if (
    (style.rotation !== undefined || style.scaleX !== undefined || style.scaleY !== undefined) &&
    !style.transformOrigin
  ) {
    style.transformOrigin = '50% 50%'
  }
  if (/display\s*:\s*['"]none['"]/i.test(normalized)) style.display = 'none'
  const vis = normalized.match(/visibility\s*:\s*['"](\w+)['"]/i)
  if (vis) {
    const v = vis[1]!.toLowerCase()
    if (v === 'hidden' || v === 'collapse' || v === 'visible') style.visibility = v
  }
  if (/opacity\s*:\s*0(?:\.0+)?\b/.test(normalized)) style.visibility = style.visibility ?? 'hidden'
  const whiteSpace = normalized.match(/whiteSpace\s*:\s*['"]([\w-]+)['"]/i)
  if (whiteSpace) {
    const v = whiteSpace[1]!.toLowerCase()
    if (v === 'nowrap' || v === 'pre' || v === 'pre-wrap' || v === 'pre-line' || v === 'normal') {
      style.whiteSpace = v
    }
  } else if (style.maxLines === 1) {
    style.whiteSpace = style.whiteSpace ?? 'nowrap'
  }
  const wordBreak = normalized.match(/wordBreak\s*:\s*['"]([\w-]+)['"]/i)
  if (wordBreak) {
    const v = wordBreak[1]!.toLowerCase()
    if (v === 'break-all' || v === 'keep-all' || v === 'break-word' || v === 'normal') {
      style.wordBreak = v
    }
  }
  const wordSpacing = normalized.match(/wordSpacing\s*:\s*(-?[\d.]+)/)
  if (wordSpacing) {
    const n = Number(wordSpacing[1])
    if (Number.isFinite(n) && Math.abs(n) > 0.01) style.wordSpacing = n
  }
  const textIndent = normalized.match(/textIndent\s*:\s*(-?[\d.]+)/)
  if (textIndent) {
    const n = Number(textIndent[1])
    if (Number.isFinite(n) && Math.abs(n) > 0.5) style.textIndent = n
  }
  const direction = normalized.match(/\bdirection\s*:\s*['"](ltr|rtl)['"]/i)
  if (direction) style.direction = direction[1]!.toLowerCase() as 'ltr' | 'rtl'
  const writingMode = normalized.match(/writingMode\s*:\s*['"]([\w-]+)['"]/i)
  if (writingMode) {
    const v = writingMode[1]!.toLowerCase()
    if (v === 'vertical-rl' || v === 'vertical-lr' || v === 'horizontal-tb') {
      style.writingMode = v
    }
  }
  const persp = normalized.match(/perspective\s*:\s*([\d.]+)/)
  if (persp) {
    const n = Number(persp[1])
    if (Number.isFinite(n) && n > 0) style.perspective = n
  }
  const rotX = normalized.match(/rotateX\s*:\s*['"]?(-?[\d.]+)deg['"]?/i)
  if (rotX) {
    const n = Number(rotX[1])
    if (Number.isFinite(n) && Math.abs(n) > 0.5) style.rotateX = n
  }
  const rotY = normalized.match(/rotateY\s*:\s*['"]?(-?[\d.]+)deg['"]?/i)
  if (rotY) {
    const n = Number(rotY[1])
    if (Number.isFinite(n) && Math.abs(n) > 0.5) style.rotateY = n
  }
  const textShadow = normalized.match(/textShadow\s*:\s*['"]([^'"]+)['"]/)
  if (textShadow) {
    const ts = parseCssTextShadow(textShadow[1])
    if (ts) style.textShadow = ts
  }
  const filterFp = normalized.match(/\bfilter\s*:\s*['"]([^'"]+)['"]/)
  if (filterFp) {
    const b = parseCssFilterBlur(filterFp[1])
    if (b !== undefined) style.blur = b
    const fp = parseCssFilterFingerprint(filterFp[1])
    if (fp) style.filter = fp
  }

  // Absolute position / transform translate
  let ox: number | undefined
  let oy: number | undefined
  const left = normalized.match(/\bleft\s*:\s*(-?[\d.]+)/)
  const top = normalized.match(/\btop\s*:\s*(-?[\d.]+)/)
  if (left) ox = Number(left[1])
  if (top) oy = Number(top[1])
  const tx = normalized.match(/translateX\s*:\s*(-?[\d.]+)/)
  const ty = normalized.match(/translateY\s*:\s*(-?[\d.]+)/)
  if (tx) ox = (ox ?? 0) + Number(tx[1])
  if (ty) oy = (oy ?? 0) + Number(ty[1])

  return { style, width, height, x: ox, y: oy }
}

/** React Native JSX/TSX → shallow DesignDoc (Text + StyleSheet / inline style). */
export function reactNativeSourceToDesignDoc(src: string, rootName: string): DesignDoc {
  const children: DesignNode[] = []
  let seq = 0
  const consumed: Array<[number, number]> = []

  // Resolve StyleSheet.create maps (may appear in companion styles.ts too).
  const sheet = new Map<string, string>()
  const extractSheetBody = (from: number): string => {
    const open = src.indexOf('{', from)
    if (open < 0) return ''
    let depth = 0
    for (let i = open; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1
      else if (src[i] === '}') {
        depth -= 1
        if (depth === 0) return src.slice(open + 1, i)
      }
    }
    return ''
  }
  for (const m of src.matchAll(/StyleSheet\.create\s*\(\s*\{/g)) {
    const body = extractSheetBody(m.index ?? 0)
    if (!body) continue
    for (const entry of body.matchAll(/(\w+)\s*:\s*\{/g)) {
      const key = entry[1]!
      const keyIdx = (entry.index ?? 0) + (m.index ?? 0)
      // Find object body for this key relative to sheet body start.
      const localFrom = body.indexOf(entry[0]!)
      const brace = body.indexOf('{', localFrom)
      if (brace < 0) continue
      let depth = 0
      let end = brace
      for (; end < body.length; end += 1) {
        if (body[end] === '{') depth += 1
        else if (body[end] === '}') {
          depth -= 1
          if (depth === 0) break
        }
      }
      sheet.set(key, body.slice(brace + 1, end))
      void keyIdx
    }
  }

  const parseRnTextAttrs = (
    attrs: string,
  ): { style: DesignStyle; width?: number; height?: number; x?: number; y?: number } => {
    let style: DesignStyle = {}
    let width: number | undefined
    let height: number | undefined
    let x: number | undefined
    let y: number | undefined
    const inlineStart = attrs.search(/style=\{\{/)
    let styleBody: string | undefined
    if (inlineStart >= 0) {
      // JSX `style={{ ... }}` → object starts at the second `{`.
      const open = attrs.indexOf('{{', inlineStart) + 1
      if (open > 0) {
        let depth = 0
        let end = open
        for (; end < attrs.length; end += 1) {
          if (attrs[end] === '{') depth += 1
          else if (attrs[end] === '}') {
            depth -= 1
            if (depth === 0) break
          }
        }
        styleBody = attrs.slice(open + 1, end)
      }
    }
    if (styleBody !== undefined) {
      const parsed = parseRnStyleBody(styleBody)
      style = parsed.style
      width = parsed.width
      height = parsed.height
      x = parsed.x
      y = parsed.y
    } else {
      const ref = attrs.match(/style=\{styles\.(\w+)\}/)
      if (ref && sheet.has(ref[1]!)) {
        const parsed = parseRnStyleBody(sheet.get(ref[1]!)!)
        style = parsed.style
        width = parsed.width
        height = parsed.height
        x = parsed.x
        y = parsed.y
      }
    }
    const numLines =
      attrs.match(/numberOfLines\s*=\s*\{?\s*(\d+)\s*\}?/) ??
      attrs.match(/maxLines\s*=\s*\{?\s*(\d+)\s*\}?/)
    if (numLines) {
      style.maxLines = Number(numLines[1])
      if (!style.textOverflow) style.textOverflow = 'ellipsis'
    }
    const ellip =
      attrs.match(/ellipsizeMode\s*=\s*['"]([^'"]+)['"]/) ??
      attrs.match(/ellipsizeMode\s*=\s*\{\s*['"]([^'"]+)['"]\s*\}/)
    if (ellip && /tail|head|middle|clip/i.test(ellip[1]!)) {
      style.textOverflow = /clip/i.test(ellip[1]!) ? 'clip' : 'ellipsis'
      if (style.maxLines === undefined) style.maxLines = 1
    }
    return { style, width, height, x, y }
  }

  // FlatList / SectionList: tile renderItem template.
  for (const m of src.matchAll(/<(FlatList|SectionList)\b([\s\S]*?)(?:\/>|>([\s\S]*?)<\/\1>)/gi)) {
    const tag = m[1] ?? 'FlatList'
    const start = m.index ?? 0
    const end = start + m[0].length
    consumed.push([start, end])
    const hay = m[0]
    const itemNodes: DesignNode[] = []
    for (const tm of hay.matchAll(/<Text\b([^>]*)>([^<{]+)<\/Text>/gi)) {
      const text = (tm[2] ?? '').replace(/\s+/g, ' ').trim()
      if (!text) continue
      const parsed = parseRnTextAttrs(tm[1] ?? '')
      pushTextNode(itemNodes, `rn-list-item-${seq++}`, text, parsed.style, {
        width: parsed.width,
        height: parsed.height,
        x: parsed.x,
        y: parsed.y,
      })
    }
    if (!itemNodes.length) {
      itemNodes.push({
        id: `rn-list-ph-${seq++}`,
        name: 'item',
        kind: 'view',
        box: { height: 48, width: 360 },
        style: {},
        children: [],
      })
    }
    const tiles = tileListTemplate(itemNodes, {
      idPrefix: `rn-list-${seq}`,
      direction: 'column',
      gap: 8,
    })
    children.push(makeListFrame(`rn-list-${seq++}`, tag, tiles, 8))
  }

  for (const m of src.matchAll(/<Text\b([^>]*)>([^<{]+)<\/Text>/gi)) {
    if (indexInRanges(m.index ?? 0, consumed)) continue
    const attrs = m[1] ?? ''
    const text = (m[2] ?? '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    const parsed = parseRnTextAttrs(attrs)
    pushTextNode(children, `rn-${seq++}`, text, parsed.style, {
      width: parsed.width,
      height: parsed.height,
        x: parsed.x,
        y: parsed.y,
    })
  }

  // Views with explicit geometry (non-text).
  for (const m of src.matchAll(/<View\b([^>]*)\/?>/gi)) {
    if (indexInRanges(m.index ?? 0, consumed)) continue
    const attrs = m[1] ?? ''
    const styleObj = attrs.match(/style=\{\{([\s\S]*?)\}\}/)
    const ref = attrs.match(/style=\{styles\.(\w+)\}/)
    const body = styleObj?.[1] ?? (ref && sheet.has(ref[1]!) ? sheet.get(ref[1]!)! : '')
    if (!body) continue
    const parsed = parseRnStyleBody(body)
    if (
      parsed.width === undefined &&
      parsed.height === undefined &&
      Object.keys(parsed.style).length === 0
    ) {
      continue
    }
    children.push({
      id: `rn-view-${seq++}`,
      name: ref?.[1] ?? 'View',
      kind: 'view',
      box: { width: parsed.width, height: parsed.height },
      style: parsed.style,
      children: [],
    })
  }

  const rootStyle = finalizeDeclarativeLayout(children, extractRnAxisHint(src))

  return {
    root: {
      id: 'rn-root',
      name: rootName,
      kind: 'frame',
      box: {},
      style: rootStyle,
      children,
    },
    scale: 1,
    source: 'manual',
  }
}

function parseArkuiWindow(window: string): {
  style: DesignStyle
  width?: number
  height?: number
  x?: number
  y?: number
} {
  const style: DesignStyle = {}
  let width: number | undefined
  let height: number | undefined

  const fsFp = window.match(/\.fontSize\s*\(\s*fp\s*\(\s*([\d.]+)\s*\)\s*\)/)
  const fs = fsFp ?? window.match(/\.fontSize\s*\(\s*([\d.]+)\s*\)/)
  if (fs) style.fontSize = Number(fs[1])
  const color = window.match(/\.fontColor\s*\(\s*['"](#[0-9A-Fa-f]{3,8})['"]\s*\)/)
  if (color) style.color = parseCssColor(color[1])
  const bg = window.match(/\.backgroundColor\s*\(\s*['"](#[0-9A-Fa-f]{3,8})['"]\s*\)/)
  if (bg) style.backgroundColor = parseCssColor(bg[1])
  const fw = window.match(/\.fontWeight\s*\(\s*(?:FontWeight\.)?(\w+|\d+)\s*\)/)
  if (fw) {
    const raw = fw[1] ?? ''
    if (/^\d+$/.test(raw)) style.fontWeight = Number(raw)
    else {
      const map: Record<string, number> = {
        Lighter: 300,
        Normal: 400,
        Regular: 400,
        Medium: 500,
        Bold: 700,
        Bolder: 800,
      }
      if (map[raw] !== undefined) style.fontWeight = map[raw]
    }
  }
  const radius = window.match(/\.borderRadius\s*\(\s*([\d.]+)\s*\)/)
  if (radius) style.cornerRadius = Number(radius[1])

  const padAll = window.match(/\.padding\s*\(\s*([\d.]+)\s*\)/)
  if (padAll) applyUniformPadding(style, Number(padAll[1]))
  const padObj = window.match(
    /\.padding\s*\(\s*\{\s*(?:top:\s*([\d.]+))?\s*,?\s*(?:right:\s*([\d.]+))?\s*,?\s*(?:bottom:\s*([\d.]+))?\s*,?\s*(?:left:\s*([\d.]+))?/,
  )
  if (padObj && !padAll) {
    if (padObj[1]) style.paddingTop = Number(padObj[1])
    if (padObj[2]) style.paddingRight = Number(padObj[2])
    if (padObj[3]) style.paddingBottom = Number(padObj[3])
    if (padObj[4]) style.paddingLeft = Number(padObj[4])
  }

  const w = window.match(/\.width\s*\(\s*([\d.]+)\s*\)/)
  if (w) width = Number(w[1])
  const h = window.match(/\.height\s*\(\s*([\d.]+)\s*\)/)
  if (h) height = Number(h[1])
  // .constraintSize({ minWidth, maxWidth, minHeight, maxHeight })
  const constraintSize = window.match(/\.constraintSize\s*\(\s*\{([^}]*)\}/)
  if (constraintSize) {
    const body = constraintSize[1] ?? ''
    const minW = body.match(/minWidth\s*:\s*([\d.]+)/)
    const maxW = body.match(/maxWidth\s*:\s*([\d.]+)/)
    const minH = body.match(/minHeight\s*:\s*([\d.]+)/)
    const maxH = body.match(/maxHeight\s*:\s*([\d.]+)/)
    if (minW) style.minWidth = Number(minW[1])
    if (maxW) style.maxWidth = Number(maxW[1])
    if (minH) style.minHeight = Number(minH[1])
    if (maxH) style.maxHeight = Number(maxH[1])
  }

  const letterSp = window.match(/\.letterSpacing\s*\(\s*(-?[\d.]+)\s*\)/)
  if (letterSp) style.letterSpacing = Number(letterSp[1])
  const lineH = window.match(/\.lineHeight\s*\(\s*([\d.]+)\s*\)/)
  if (lineH) style.lineHeight = Number(lineH[1])
  const opacity = window.match(/\.opacity\s*\(\s*([\d.]+)\s*\)/)
  if (opacity) {
    const n = Number(opacity[1])
    if (Number.isFinite(n) && n < 1) style.opacity = Math.round(n * 100) / 100
  }

  const rotate =
    window.match(/\.rotate\s*\(\s*\{\s*angle\s*:\s*(-?[\d.]+)/) ??
    window.match(/\.rotate\s*\(\s*(-?[\d.]+)\s*\)/)
  if (rotate) {
    const n = Number(rotate[1])
    if (Number.isFinite(n) && Math.abs(n) > 0.5) style.rotation = Math.round(n * 100) / 100
  }

  const scaleObj = window.match(
    /\.scale\s*\(\s*\{\s*(?:x:\s*(-?[\d.]+))?\s*,?\s*(?:y:\s*(-?[\d.]+))?/,
  )
  const scaleU = window.match(/\.scale\s*\(\s*(-?[\d.]+)\s*\)/)
  if (scaleObj && (scaleObj[1] || scaleObj[2])) {
    if (scaleObj[1]) {
      const sx = Number(scaleObj[1])
      if (Number.isFinite(sx) && Math.abs(sx - 1) > 0.02) {
        style.scaleX = Math.round(sx * 1000) / 1000
      }
    }
    if (scaleObj[2]) {
      const sy = Number(scaleObj[2])
      if (Number.isFinite(sy) && Math.abs(sy - 1) > 0.02) {
        style.scaleY = Math.round(sy * 1000) / 1000
      }
    }
  } else if (scaleU) {
    const s = Number(scaleU[1])
    if (Number.isFinite(s) && Math.abs(s - 1) > 0.02) {
      style.scaleX = style.scaleY = Math.round(s * 1000) / 1000
    }
  }

  const zIndex =
    window.match(/\.zIndex\s*\(\s*(-?\d+)\s*\)/) ?? window.match(/zIndex\s*:\s*(-?\d+)/)
  if (zIndex) {
    const n = Number(zIndex[1])
    if (Number.isFinite(n) && n !== 0) style.zIndex = n
  }

  if (/\.decoration\s*\(\s*\{\s*type:\s*TextDecorationType\.Underline/i.test(window)) {
    style.textDecoration = 'underline'
  }
  if (/\.decoration\s*\(\s*\{\s*type:\s*TextDecorationType\.LineThrough/i.test(window)) {
    style.textDecoration =
      style.textDecoration === 'underline' ? 'underline line-through' : 'line-through'
  }

  if (/\.clip\s*\(/.test(window) || /\.clipShape\s*\(/.test(window)) {
    style.overflow = 'hidden'
    if (/Circle|circular/i.test(window)) style.clipPath = 'circle'
    else if (!style.clipPath) style.clipPath = 'custom'
  }
  const aspect =
    window.match(/\.aspectRatio\s*\(\s*\{\s*ratio\s*:\s*([\d.]+)/) ??
    window.match(/\.aspectRatio\s*\(\s*([\d.]+)\s*\)/)
  if (aspect) {
    const n = Number(aspect[1])
    if (Number.isFinite(n) && n > 0) style.aspectRatio = Math.round(n * 1000) / 1000
  }
  const maxLines =
    window.match(/\.maxLines\s*\(\s*(\d+)\s*\)/) ?? window.match(/maxLines\s*:\s*(\d+)/)
  if (maxLines) {
    style.maxLines = Number(maxLines[1])
    style.textOverflow = 'ellipsis'
  }
  if (/\.textOverflow\s*\(\s*TextOverflow\.Ellipsis/i.test(window)) {
    style.textOverflow = 'ellipsis'
    if (style.maxLines === undefined) style.maxLines = 1
  }
  if (/\.fontStyle\s*\(\s*FontStyle\.Italic/i.test(window) || /\.italic\s*\(/.test(window)) {
    style.fontStyle = 'italic'
  }

  const blur = window.match(/\.blur\s*\(\s*([\d.]+)\s*\)/)
  if (blur) style.blur = Number(blur[1])

  const offset = window.match(/\.offset\s*\(\s*\{[\s\S]*?x:\s*(-?[\d.]+)[\s\S]*?y:\s*(-?[\d.]+)/)
  let ox: number | undefined
  let oy: number | undefined
  if (offset) {
    ox = Number(offset[1])
    oy = Number(offset[2])
  }

  return { style, width, height, x: ox, y: oy }
}

/** HarmonyOS ArkUI (.ets) → shallow DesignDoc. */
export function arkuiSourceToDesignDoc(src: string, rootName: string): DesignDoc {
  const children: DesignNode[] = []
  let seq = 0

  const textRe = /\bText\s*\(\s*(?:\$?r\([^)]+\)\s*,?\s*)?['"]([^'"\\]*(?:\\.[^'"\\]*)*)['"]/g
  let m: RegExpExecArray | null
  while ((m = textRe.exec(src))) {
    const text = (m[1] ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"')
    const window = src.slice(m.index, Math.min(src.length, m.index + 360))
    const parsed = parseArkuiWindow(window)
    pushTextNode(children, `ark-${seq++}`, text, parsed.style, {
      width: parsed.width,
      height: parsed.height,
        x: parsed.x,
        y: parsed.y,
    })
  }

  applyDocumentOrderStack(children)

  return {
    root: {
      id: 'ark-root',
      name: rootName,
      kind: 'frame',
      box: {},
      style: {},
      children,
    },
    scale: 1,
    source: 'manual',
  }
}
