/**
 * Shallow DesignDoc builders for declarative UI stacks.
 * Extracts Text / Button literals and nearby static style / geometry modifiers.
 */
import type { DesignDoc, DesignNode, DesignStyle, HexColor } from '../types.js'
import { parseCssColor } from './web-css.js'

function composeColor(raw: string): HexColor | undefined {
  // Color(0xAARRGGBB) or Color(0xFFRRGGBB)
  const hex = raw.match(/0x([0-9A-Fa-f]{6,8})/)
  if (hex) {
    const h = hex[1]!
    if (h.length === 8) return `#${h.slice(2)}${h.slice(0, 2)}`.toLowerCase()
    return `#${h}`.toLowerCase()
  }
  return parseCssColor(raw.replace(/^["']|["']$/g, ''))
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

function parseComposeWindow(window: string): {
  style: DesignStyle
  width?: number
  height?: number
} {
  const style: DesignStyle = {}
  let width: number | undefined
  let height: number | undefined

  const fs =
    window.match(/fontSize\s*=\s*([\d.]+)\s*\.sp/) ??
    window.match(/\.fontSize\s*\(\s*([\d.]+)\s*\.sp\s*\)/)
  if (fs) style.fontSize = Number(fs[1])

  const color =
    window.match(/color\s*=\s*(Color\([^)]+\)|Color\.[A-Za-z]+)/)?.[1] ??
    window.match(/\.color\s*\(\s*(Color\([^)]+\)|Color\.[A-Za-z]+)\s*\)/)?.[1]
  if (color) {
    const c = composeColor(color)
    if (c) style.color = c
  }

  const bg =
    window.match(/\.background\s*\(\s*(Color\([^)]+\)|Color\.[A-Za-z]+)/)?.[1] ??
    window.match(/background\s*=\s*(Color\([^)]+\)|Color\.[A-Za-z]+)/)?.[1]
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

  const padAll = window.match(/\.padding\s*\(\s*([\d.]+)\s*\.dp\s*\)/)
  if (padAll) applyUniformPadding(style, Number(padAll[1]))
  const padHV = window.match(
    /\.padding\s*\(\s*(?:horizontal\s*=\s*([\d.]+)\s*\.dp)?\s*,?\s*(?:vertical\s*=\s*([\d.]+)\s*\.dp)?\s*\)/,
  )
  if (padHV && (padHV[1] || padHV[2]) && !padAll) {
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

  return { style, width, height }
}

function pushTextNode(
  children: DesignNode[],
  id: string,
  text: string,
  style: DesignStyle,
  box: { width?: number; height?: number },
): void {
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

  // Text("...") or Text(text = "...")
  const textRe = /\bText\s*\(\s*(?:text\s*=\s*)?"([^"\\]*(?:\\.[^"\\]*)*)"/g
  let m: RegExpExecArray | null
  while ((m = textRe.exec(src))) {
    const text = m[1]!.replace(/\\"/g, '"')
    const window = src.slice(m.index, Math.min(src.length, m.index + 420))
    const parsed = parseComposeWindow(window)
    pushTextNode(children, `compose-${seq++}`, text, parsed.style, {
      width: parsed.width,
      height: parsed.height,
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
    children.push({
      id: `compose-bg-${seq++}`,
      name: 'background',
      kind: 'view',
      box: {},
      style: { backgroundColor },
      children: [],
    })
  }

  return {
    root: {
      id: 'compose-root',
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

function parseSwiftuiWindow(window: string): {
  style: DesignStyle
  width?: number
  height?: number
} {
  const style: DesignStyle = {}
  let width: number | undefined
  let height: number | undefined

  const fs =
    window.match(/\.font\s*\(\s*\.system\s*\(\s*size:\s*([\d.]+)/) ??
    window.match(/\.font\s*\(\s*\.custom\s*\([^,]+,\s*size:\s*([\d.]+)/)
  if (fs) style.fontSize = Number(fs[1])

  const fg = window.match(
    /\.foreground(?:Color|Style)\s*\(\s*(Color\([^)]+\)|Color\.[A-Za-z]+|UIColor\([^)]+\))\s*\)/,
  )
  if (fg) {
    const c =
      composeColor(fg[1] ?? '') ||
      (() => {
        const swift = (fg[1] ?? '').match(
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

  const bg = window.match(/\.background\s*\(\s*(Color\([^)]+\)|Color\.[A-Za-z]+)\s*\)/)
  if (bg) {
    const c = composeColor(bg[1] ?? '')
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

  const padAll = window.match(/\.padding\s*\(\s*([\d.]+)\s*\)/)
  if (padAll) applyUniformPadding(style, Number(padAll[1]))
  const padEdge = window.match(
    /\.padding\s*\(\s*\.(horizontal|vertical|top|bottom|leading|trailing|all)\s*,\s*([\d.]+)\s*\)/,
  )
  if (padEdge && !padAll) {
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
  } else if (/\.padding\s*\(\s*\)/.test(window) && !padAll && !padEdge) {
    applyUniformPadding(style, 16) // SwiftUI default system padding ~16pt heuristic
  }

  const radius = window.match(/\.cornerRadius\s*\(\s*([\d.]+)\s*\)/)
  if (radius) style.cornerRadius = Number(radius[1])

  return { style, width, height }
}

/** SwiftUI source → shallow DesignDoc. */
export function swiftuiSourceToDesignDoc(src: string, rootName: string): DesignDoc {
  const children: DesignNode[] = []
  let seq = 0

  const textRe = /\bText\s*\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*\)/g
  let m: RegExpExecArray | null
  while ((m = textRe.exec(src))) {
    const text = m[1]!.replace(/\\"/g, '"')
    const window = src.slice(m.index, Math.min(src.length, m.index + 480))
    const parsed = parseSwiftuiWindow(window)
    pushTextNode(children, `swiftui-${seq++}`, text, parsed.style, {
      width: parsed.width,
      height: parsed.height,
    })
  }

  return {
    root: {
      id: 'swiftui-root',
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

function parseFlutterWindow(window: string): {
  style: DesignStyle
  width?: number
  height?: number
} {
  const style: DesignStyle = {}
  let width: number | undefined
  let height: number | undefined

  const fs = window.match(/fontSize:\s*([\d.]+)/)
  if (fs) style.fontSize = Number(fs[1])

  const color = window.match(/color:\s*(Color\([^)]+\)|Colors\.[A-Za-z0-9.]+)/)?.[1]
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
    /BoxDecoration\s*\([\s\S]{0,120}?color:\s*(Color\([^)]+\)|Colors\.[A-Za-z0-9.]+)/,
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

  const radius =
    window.match(/BorderRadius\.circular\s*\(\s*([\d.]+)\s*\)/) ??
    window.match(/borderRadius:\s*BorderRadius\.circular\s*\(\s*([\d.]+)\s*\)/)
  if (radius) style.cornerRadius = Number(radius[1])

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

  return { style, width, height }
}

/** Flutter Dart source → shallow DesignDoc. */
export function flutterSourceToDesignDoc(src: string, rootName: string): DesignDoc {
  const children: DesignNode[] = []
  let seq = 0

  const textRe = /\bText\s*\(\s*(?:['"]([^'"\\]*(?:\\.[^'"\\]*)*)['"])/g
  let m: RegExpExecArray | null
  while ((m = textRe.exec(src))) {
    const text = (m[1] ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"')
    // Look behind for wrapping Container/Padding as well as after.
    const start = Math.max(0, m.index - 600)
    const window = src.slice(start, Math.min(src.length, m.index + 400))
    const parsed = parseFlutterWindow(window)
    pushTextNode(children, `flutter-${seq++}`, text, parsed.style, {
      width: parsed.width,
      height: parsed.height,
    })
  }

  // Orphan Containers with explicit size (no Text inside the match window already counted).
  for (const cm of src.matchAll(
    /Container\s*\(\s*(?:[\s\S]*?)width:\s*([\d.]+)(?:[\s\S]*?)height:\s*([\d.]+)/g,
  )) {
    const slice = cm[0]
    if (/\bText\s*\(/.test(slice)) continue
    children.push({
      id: `flutter-box-${seq++}`,
      name: 'Container',
      kind: 'view',
      box: { width: Number(cm[1]), height: Number(cm[2]) },
      style: {},
      children: [],
    })
  }

  return {
    root: {
      id: 'flutter-root',
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

function parseRnStyleBody(body: string): {
  style: DesignStyle
  width?: number
  height?: number
} {
  const style: DesignStyle = {}
  let width: number | undefined
  let height: number | undefined

  const fs = body.match(/fontSize\s*:\s*([\d.]+)/)
  if (fs) style.fontSize = Number(fs[1])
  const color = body.match(/color\s*:\s*['"](#[0-9A-Fa-f]{3,8})['"]/)
  if (color) style.color = parseCssColor(color[1])
  const bg = body.match(/backgroundColor\s*:\s*['"](#[0-9A-Fa-f]{3,8})['"]/)
  if (bg) style.backgroundColor = parseCssColor(bg[1])
  const br = body.match(/borderRadius\s*:\s*([\d.]+)/)
  if (br) style.cornerRadius = Number(br[1])
  const fw = body.match(/fontWeight\s*:\s*['"]?(bold|normal|\d{3})['"]?/)
  if (fw) {
    if (fw[1] === 'bold') style.fontWeight = 700
    else if (fw[1] === 'normal') style.fontWeight = 400
    else style.fontWeight = Number(fw[1])
  }
  const w = body.match(/width\s*:\s*([\d.]+)/)
  if (w) width = Number(w[1])
  const h = body.match(/height\s*:\s*([\d.]+)/)
  if (h) height = Number(h[1])

  const pad = body.match(/padding\s*:\s*([\d.]+)/)
  if (pad) applyUniformPadding(style, Number(pad[1]))
  const padH = body.match(/paddingHorizontal\s*:\s*([\d.]+)/)
  if (padH) {
    style.paddingLeft = Number(padH[1])
    style.paddingRight = Number(padH[1])
  }
  const padV = body.match(/paddingVertical\s*:\s*([\d.]+)/)
  if (padV) {
    style.paddingTop = Number(padV[1])
    style.paddingBottom = Number(padV[1])
  }
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const m = body.match(new RegExp(`padding${side}\\s*:\\s*([\\d.]+)`))
    if (m) {
      const key = `padding${side}` as keyof DesignStyle
      ;(style as Record<string, number | undefined>)[key] = Number(m[1])
    }
  }

  const margin = body.match(/margin\s*:\s*([\d.]+)/)
  if (margin) applyUniformMargin(style, Number(margin[1]))
  const marginH = body.match(/marginHorizontal\s*:\s*([\d.]+)/)
  if (marginH) {
    style.marginLeft = Number(marginH[1])
    style.marginRight = Number(marginH[1])
  }
  const marginV = body.match(/marginVertical\s*:\s*([\d.]+)/)
  if (marginV) {
    style.marginTop = Number(marginV[1])
    style.marginBottom = Number(marginV[1])
  }

  return { style, width, height }
}

/** React Native JSX/TSX → shallow DesignDoc (Text + StyleSheet / inline style). */
export function reactNativeSourceToDesignDoc(src: string, rootName: string): DesignDoc {
  const children: DesignNode[] = []
  let seq = 0

  // Resolve StyleSheet.create map for style={styles.xxx} references.
  const sheet = new Map<string, string>()
  const sheetBlock = src.match(/StyleSheet\.create\s*\(\s*\{([\s\S]*?)\}\s*\)/)
  if (sheetBlock) {
    for (const m of sheetBlock[1]!.matchAll(/(\w+)\s*:\s*\{([^{}]*)\}/g)) {
      sheet.set(m[1]!, m[2] ?? '')
    }
  }

  for (const m of src.matchAll(/<Text\b([^>]*)>([^<{]+)<\/Text>/gi)) {
    const attrs = m[1] ?? ''
    const text = (m[2] ?? '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    let style: DesignStyle = {}
    let width: number | undefined
    let height: number | undefined

    const styleObj = attrs.match(/style=\{\{([\s\S]*?)\}\}/)
    if (styleObj) {
      const parsed = parseRnStyleBody(styleObj[1] ?? '')
      style = parsed.style
      width = parsed.width
      height = parsed.height
    } else {
      const ref = attrs.match(/style=\{styles\.(\w+)\}/)
      if (ref && sheet.has(ref[1]!)) {
        const parsed = parseRnStyleBody(sheet.get(ref[1]!)!)
        style = parsed.style
        width = parsed.width
        height = parsed.height
      }
    }

    pushTextNode(children, `rn-${seq++}`, text, style, { width, height })
  }

  // Views with explicit geometry (non-text).
  for (const m of src.matchAll(/<View\b([^>]*)\/?>/gi)) {
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

  return {
    root: {
      id: 'rn-root',
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

function parseArkuiWindow(window: string): {
  style: DesignStyle
  width?: number
  height?: number
} {
  const style: DesignStyle = {}
  let width: number | undefined
  let height: number | undefined

  const fs = window.match(/\.fontSize\s*\(\s*([\d.]+)\s*\)/)
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

  return { style, width, height }
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
    })
  }

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
