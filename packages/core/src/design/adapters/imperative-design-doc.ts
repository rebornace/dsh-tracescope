/**
 * Build a shallow DesignDoc from imperative UI source (Android View / UIKit).
 * Only statically resolvable literals become nodes — dynamic values are skipped.
 * Style calls on the same receiver are merged onto the matching text node.
 */
import type { DesignDoc, DesignNode, DesignStyle, HexColor } from '../types.js'
import { parseCssColor } from './web-css.js'

function androidColor(raw: string): HexColor | undefined {
  const t = raw.trim()
  // Color.parseColor("#RRGGBB")
  const parseColor = t.match(/parseColor\s*\(\s*["'](#[0-9A-Fa-f]{3,8})["']\s*\)/)
  if (parseColor) return parseCssColor(parseColor[1])
  // 0xAARRGGBB or 0xFFRRGGBB
  const hexLit = t.match(/0x([0-9A-Fa-f]{6,8})\b/)
  if (hexLit) {
    const h = hexLit[1]!
    if (h.length === 8) return `#${h.slice(2)}${h.slice(0, 2)}`.toLowerCase()
    return `#${h}`.toLowerCase()
  }
  // Color.rgb(r,g,b)
  const rgb = t.match(/Color\.rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
  if (rgb) {
    const hex = (n: string) =>
      Math.max(0, Math.min(255, Number(n)))
        .toString(16)
        .padStart(2, '0')
    return `#${hex(rgb[1]!)}${hex(rgb[2]!)}${hex(rgb[3]!)}`
  }
  return parseCssColor(t.replace(/^["']|["']$/g, ''))
}

function applyAndroidReceiverStyles(
  style: DesignStyle,
  box: DesignNode['box'],
  window: string,
): void {
  const colorCall = window.match(/\.setTextColor\s*\(((?:[^()]|\([^()]*\))*)\)/)
  if (colorCall) {
    const color = androidColor(colorCall[1] ?? '')
    if (color) style.color = color
  }
  // Kotlin property: textColor = ...
  const colorProp = window.match(/\btextColor\s*=\s*([^\n;]+)/)
  if (colorProp && !style.color) {
    const color = androidColor(colorProp[1] ?? '')
    if (color) style.color = color
  }

  const sizeCall = window.match(/\.setTextSize\s*\(\s*(?:[^,]+,\s*)?([\d.]+)f?\s*\)/)
  if (sizeCall) style.fontSize = Number(sizeCall[1])
  const sizeProp = window.match(/\btextSize\s*=\s*([\d.]+)f?/)
  if (sizeProp && style.fontSize === undefined) style.fontSize = Number(sizeProp[1])

  const bg = window.match(/\.setBackgroundColor\s*\(((?:[^()]|\([^()]*\))*)\)/)
  if (bg) {
    const backgroundColor = androidColor(bg[1] ?? '')
    if (backgroundColor) style.backgroundColor = backgroundColor
  }

  const typeface = window.match(
    /\.setTypeface\s*\([^)]*Typeface\.(BOLD|BOLD_ITALIC|NORMAL|ITALIC)/i,
  )
  if (typeface && /BOLD/i.test(typeface[1] ?? '')) style.fontWeight = 700

  const pad4 = window.match(
    /\.setPadding\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/,
  )
  if (pad4) {
    style.paddingLeft = Number(pad4[1])
    style.paddingTop = Number(pad4[2])
    style.paddingRight = Number(pad4[3])
    style.paddingBottom = Number(pad4[4])
  }
  const padRel = window.match(
    /\.setPaddingRelative\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/,
  )
  if (padRel && !pad4) {
    style.paddingLeft = Number(padRel[1])
    style.paddingTop = Number(padRel[2])
    style.paddingRight = Number(padRel[3])
    style.paddingBottom = Number(padRel[4])
  }

  const lp = window.match(
    /(?:layoutParams\s*=\s*)?(?:\w+\.)*LayoutParams\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/,
  )
  if (lp) {
    box.width = Number(lp[1])
    box.height = Number(lp[2])
  }
  const wh = window.match(
    /\.set(?:Width|MeasuredWidth)\s*\(\s*(\d+)\s*\)[\s\S]{0,80}?\.set(?:Height|MeasuredHeight)\s*\(\s*(\d+)\s*\)/,
  )
  if (wh) {
    box.width = Number(wh[1])
    box.height = Number(wh[2])
  }

  const radius = window.match(
    /(?:cornerRadius|setCornerRadius)\s*(?:=\s*|\()\s*([\d.]+)f?/,
  )
  if (radius) style.cornerRadius = Number(radius[1])
}

/** Android Java/Kotlin imperative View → DesignDoc. */
export function androidViewSourceToDesignDoc(src: string, rootName: string): DesignDoc {
  const children: DesignNode[] = []
  let seq = 0
  const seenTexts = new Set<string>()

  // receiver.setText("...") — merge nearby styles on the same receiver
  for (const m of src.matchAll(
    /(?:^|[^.\w])([A-Za-z_][\w]*)\.setText\s*\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*\)/gm,
  )) {
    const receiver = m[1]!
    const text = m[2]!.replace(/\\"/g, '"').trim()
    if (!text) continue
    const key = `${receiver}::${text}`
    if (seenTexts.has(key)) continue
    seenTexts.add(key)
    const start = Math.max(0, m.index! - 80)
    const window = src.slice(start, Math.min(src.length, m.index! + 520))
    // Prefer statements that mention the same receiver.
    const focused = window
      .split(/[\n;{}]/)
      .filter((line) => line.includes(receiver) || /LayoutParams|setPadding|setText/.test(line))
      .join('\n')
    const style: DesignStyle = {}
    const box: DesignNode['box'] = {}
    applyAndroidReceiverStyles(style, box, focused.length > 20 ? focused : window)
    children.push({
      id: `imp-${seq++}`,
      name: text.slice(0, 24),
      kind: 'text',
      text,
      box,
      style,
      children: [],
    })
  }

  // Kotlin: receiver.text = "..."
  for (const m of src.matchAll(
    /(?:^|[^.\w])([A-Za-z_][\w]*)\.text\s*=\s*"([^"\\]*(?:\\.[^"\\]*)*)"/gm,
  )) {
    const receiver = m[1]!
    const text = m[2]!.replace(/\\"/g, '"').trim()
    if (!text) continue
    const key = `${receiver}::${text}`
    if (seenTexts.has(key)) continue
    seenTexts.add(key)
    const start = Math.max(0, m.index! - 80)
    const window = src.slice(start, Math.min(src.length, m.index! + 520))
    const style: DesignStyle = {}
    const box: DesignNode['box'] = {}
    applyAndroidReceiverStyles(style, box, window)
    children.push({
      id: `imp-${seq++}`,
      name: text.slice(0, 24),
      kind: 'text',
      text,
      box,
      style,
      children: [],
    })
  }

  // Bare setText without clear receiver (keep prior behaviour)
  for (const m of src.matchAll(/\.setText\s*\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*\)/g)) {
    const text = m[1]!.replace(/\\"/g, '"').trim()
    if (!text || [...seenTexts].some((k) => k.endsWith(`::${text}`))) continue
    seenTexts.add(`_::${text}`)
    children.push({
      id: `imp-${seq++}`,
      name: text.slice(0, 24),
      kind: 'text',
      text,
      box: {},
      style: {},
      children: [],
    })
  }

  // Orphan LayoutParams not already attached
  for (const m of src.matchAll(/LayoutParams\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g)) {
    const width = Number(m[1])
    const height = Number(m[2])
    if (!Number.isFinite(width) || !Number.isFinite(height)) continue
    if (children.some((c) => c.box.width === width && c.box.height === height)) continue
    children.push({
      id: `imp-lp-${seq++}`,
      name: 'layoutParams',
      kind: 'view',
      box: { width, height },
      style: {},
      children: [],
    })
  }

  return {
    root: {
      id: 'android-view-root',
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

function uiColor(raw: string): HexColor | undefined {
  const t = raw.trim()
  const swift = t.match(
    /UIColor\s*\(\s*red:\s*([\d.]+)\s*,\s*green:\s*([\d.]+)\s*,\s*blue:\s*([\d.]+)/,
  )
  if (swift) {
    const hex = (n: string) =>
      Math.max(0, Math.min(255, Math.round(Number(n) * 255)))
        .toString(16)
        .padStart(2, '0')
    return `#${hex(swift[1]!)}${hex(swift[2]!)}${hex(swift[3]!)}`
  }
  const objc = t.match(
    /colorWithRed:\s*([\d.]+)\s+green:\s*([\d.]+)\s+blue:\s*([\d.]+)/,
  )
  if (objc) {
    const hex = (n: string) =>
      Math.max(0, Math.min(255, Math.round(Number(n) * 255)))
        .toString(16)
        .padStart(2, '0')
    return `#${hex(objc[1]!)}${hex(objc[2]!)}${hex(objc[3]!)}`
  }
  return parseCssColor(t.replace(/^@"|"$|^'|'$/g, ''))
}

function applyUikitReceiverStyles(
  style: DesignStyle,
  box: DesignNode['box'],
  window: string,
): void {
  const colorCall = window.match(/(?:setTextColor:|\.textColor\s*=)\s*([^;\n]+)/)
  if (colorCall) {
    const color = uiColor(colorCall[1] ?? '')
    if (color) style.color = color
  }

  const font = window.match(
    /(?:boldSystemFontOfSize:\s*|systemFontOfSize:\s*|systemFont\s*\(\s*ofSize:\s*|UIFont\.systemFont\(ofSize:\s*)([\d.]+)/,
  )
  if (font) style.fontSize = Number(font[1])

  if (
    /(?:boldSystemFontOfSize:|weight:\s*UIFontWeightBold|\.boldSystemFont|weight:\s*\.bold|UIFontWeightBold)/.test(
      window,
    )
  ) {
    style.fontWeight = 700
  }

  const bg = window.match(/(?:setBackgroundColor:|\.backgroundColor\s*=)\s*([^;\n]+)/)
  if (bg) {
    const backgroundColor = uiColor(bg[1] ?? '')
    if (backgroundColor) style.backgroundColor = backgroundColor
  }

  const radius = window.match(/\.layer\.cornerRadius\s*=\s*([\d.]+)/)
  if (radius) style.cornerRadius = Number(radius[1])

  const frame =
    window.match(
      /CGRectMake\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/,
    ) ??
    window.match(
      /CGRect\s*\(\s*x:\s*([\d.]+)\s*,\s*y:\s*([\d.]+)\s*,\s*width:\s*([\d.]+)\s*,\s*height:\s*([\d.]+)\s*\)/,
    ) ??
    window.match(
      /CGRect(?:Make)?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/,
    )
  if (frame) {
    box.x = Number(frame[1])
    box.y = Number(frame[2])
    box.width = Number(frame[3])
    box.height = Number(frame[4])
  }

  // contentEdgeInsets / layoutMargins
  const insets = window.match(
    /UIEdgeInsets(?:Make)?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/,
  )
  if (insets) {
    style.paddingTop = Number(insets[1])
    style.paddingLeft = Number(insets[2])
    style.paddingBottom = Number(insets[3])
    style.paddingRight = Number(insets[4])
  }
}

/** UIKit ObjC/Swift imperative → DesignDoc. */
export function uikitSourceToDesignDoc(src: string, rootName: string): DesignDoc {
  const children: DesignNode[] = []
  let seq = 0
  const seenTexts = new Set<string>()

  // ObjC: [label setText:@"..."] or label.text = @"..."
  for (const m of src.matchAll(
    /(?:\[([A-Za-z_][\w]*)\s+setText:\s*@"([^"\\]*(?:\\.[^"\\]*)*)"\]|([A-Za-z_][\w]*)\.text\s*=\s*@"([^"\\]*(?:\\.[^"\\]*)*)")/g,
  )) {
    const receiver = m[1] ?? m[3] ?? '_'
    const text = (m[2] ?? m[4] ?? '').replace(/\\"/g, '"').trim()
    if (!text) continue
    const key = `${receiver}::${text}`
    if (seenTexts.has(key)) continue
    seenTexts.add(key)
    const start = Math.max(0, m.index! - 80)
    const window = src.slice(start, Math.min(src.length, m.index! + 520))
    const style: DesignStyle = {}
    const box: DesignNode['box'] = {}
    applyUikitReceiverStyles(style, box, window)
    children.push({
      id: `uikit-${seq++}`,
      name: text.slice(0, 24),
      kind: 'text',
      text,
      box,
      style,
      children: [],
    })
  }

  // Swift: label.text = "..."
  for (const m of src.matchAll(
    /(?:^|[^.\w])([A-Za-z_][\w]*)\.text\s*=\s*"([^"\\]*(?:\\.[^"\\]*)*)"/gm,
  )) {
    const receiver = m[1]!
    const text = m[2]!.replace(/\\"/g, '"').trim()
    if (!text) continue
    const key = `${receiver}::${text}`
    if (seenTexts.has(key)) continue
    seenTexts.add(key)
    const start = Math.max(0, m.index! - 80)
    const window = src.slice(start, Math.min(src.length, m.index! + 520))
    const style: DesignStyle = {}
    const box: DesignNode['box'] = {}
    applyUikitReceiverStyles(style, box, window)
    children.push({
      id: `uikit-${seq++}`,
      name: text.slice(0, 24),
      kind: 'text',
      text,
      box,
      style,
      children: [],
    })
  }

  // Fallback bare patterns
  for (const m of src.matchAll(/(?:setText:|\.text\s*=)\s*@"([^"\\]*(?:\\.[^"\\]*)*)"/g)) {
    const text = m[1]!.replace(/\\"/g, '"').trim()
    if (!text || [...seenTexts].some((k) => k.endsWith(`::${text}`))) continue
    seenTexts.add(`_::${text}`)
    children.push({
      id: `uikit-${seq++}`,
      name: text.slice(0, 24),
      kind: 'text',
      text,
      box: {},
      style: {},
      children: [],
    })
  }

  // Orphan CGRect frames not already attached
  for (const m of src.matchAll(
    /CGRect(?:Make)?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g,
  )) {
    const box = {
      x: Number(m[1]),
      y: Number(m[2]),
      width: Number(m[3]),
      height: Number(m[4]),
    }
    if (children.some((c) => c.box.width === box.width && c.box.height === box.height && c.box.x === box.x)) {
      continue
    }
    children.push({
      id: `uikit-frame-${seq++}`,
      name: 'frame',
      kind: 'view',
      box,
      style: {},
      children: [],
    })
  }

  return {
    root: {
      id: 'uikit-root',
      name: rootName,
      kind: 'frame',
      box: {},
      style: {},
      children,
    },
    scale: 1,
    source: 'uikit',
  }
}
