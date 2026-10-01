import type { CSSProperties } from 'react'

export interface GradientStop {
  color: string
  position: number
}

export interface HifiGradient {
  type: 'linear' | 'radial'
  cssAngle: number
  stops: GradientStop[]
}

export interface HifiStyle {
  backgroundColor?: string
  color?: string
  fontSize?: number
  fontWeight?: number
  /** Original font family from the source (e.g. "PingFang SC"). */
  fontFamily?: string
  borderRadius?: number
  /** Per-corner radii [topLeft, topRight, bottomRight, bottomLeft]. */
  borderRadii?: [number, number, number, number]
  borderWidth?: number
  borderColor?: string
  borderTopWidth?: number
  borderRightWidth?: number
  borderBottomWidth?: number
  borderLeftWidth?: number
  borderTopColor?: string
  borderRightColor?: string
  borderBottomColor?: string
  borderLeftColor?: string
  gradient?: HifiGradient
  opacity?: number
  /** Approximate elevation / outer shadow blur in logical px. */
  elevation?: number
  /** Approximate inner / inset shadow blur. */
  innerShadow?: number
  /** Layer / backdrop blur radius. */
  blur?: number
  /** Primary outer shadow (offset + blur + optional colour/spread). */
  shadow?: {
    offsetX: number
    offsetY: number
    blur: number
    spread?: number
    color?: string
    inset?: boolean
  }
  /** Primary inset shadow. */
  insetShadow?: {
    offsetX: number
    offsetY: number
    blur: number
    spread?: number
    color?: string
    inset?: boolean
  }
  /** Full shadow stack. */
  shadows?: Array<{
    offsetX: number
    offsetY: number
    blur: number
    spread?: number
    color?: string
    inset?: boolean
  }>
  /** CSS mix-blend-mode. */
  blendMode?: string
  /** Clockwise rotation in degrees. */
  rotation?: number
  /** Non-uniform scale factors. */
  scaleX?: number
  scaleY?: number
  skewX?: number
  skewY?: number
  zIndex?: number
  /** Stroke alignment relative to the path. */
  strokeAlign?: 'inside' | 'outside' | 'center'
  /** Full fill stack (solid / gradient / image). */
  fills?: Array<{
    type: 'solid' | 'gradient' | 'image'
    color?: string
    gradient?: HifiGradient
    imageRef?: string
    imageFit?: 'fill' | 'contain' | 'cover'
    opacity?: number
  }>
  textAlign?: string
  textDecoration?: 'none' | 'underline' | 'line-through' | 'underline line-through'
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  overflow?: 'visible' | 'hidden' | 'scroll'
  clipPath?: string
  aspectRatio?: number
  maxLines?: number
  textOverflow?: 'clip' | 'ellipsis'
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  textAdvanceWidth?: number
  textBlockHeight?: number
  flexDirection?: 'row' | 'column'
  alignItems?: 'start' | 'center' | 'end' | 'stretch'
  justifyContent?:
    | 'start'
    | 'center'
    | 'end'
    | 'space-between'
    | 'space-around'
    | 'space-evenly'
  fontStyle?: 'normal' | 'italic'
  textAlignVertical?: 'top' | 'center' | 'bottom'
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  strokeDashArray?: string
  strokeCap?: 'butt' | 'round' | 'square'
  strokeJoin?: 'miter' | 'round' | 'bevel'
  paragraphSpacing?: number
  sizingHorizontal?: 'fixed' | 'hug' | 'fill'
  sizingVertical?: 'fixed' | 'hug' | 'fill'
  backdropBlur?: number
  position?: 'absolute' | 'relative' | 'fixed' | 'sticky'
  rowGap?: number
  columnGap?: number
  flexWrap?: 'nowrap' | 'wrap'
  alignContent?:
    | 'start'
    | 'center'
    | 'end'
    | 'stretch'
    | 'space-between'
    | 'space-around'
    | 'space-evenly'
  order?: number
  gridTemplate?: string
  alignSelf?: 'start' | 'center' | 'end' | 'stretch'
  flexGrow?: number
  flexShrink?: number
  transformOrigin?: string
  visibility?: 'visible' | 'hidden' | 'collapse'
  display?: 'none' | 'flex' | 'inline-flex' | 'grid' | 'block' | 'inline'
  whiteSpace?: 'normal' | 'nowrap' | 'pre' | 'pre-wrap' | 'pre-line'
  wordBreak?: 'normal' | 'break-all' | 'keep-all' | 'break-word'
  wordSpacing?: number
  textIndent?: number
  perspective?: number
  rotateX?: number
  rotateY?: number
  textShadow?: {
    offsetX: number
    offsetY: number
    blur: number
    spread?: number
    color?: string
    inset?: boolean
  }
  direction?: 'ltr' | 'rtl'
  writingMode?: 'horizontal-tb' | 'vertical-rl' | 'vertical-lr'
  filter?: string
  outline?: string
  /** Text line height in logical units. */
  lineHeight?: number
  /** How an image is fitted into its box. */
  imageFit?: 'fill' | 'contain' | 'cover'
}

export interface HifiNode {
  id: string
  name: string
  kind: 'frame' | 'text' | 'image' | 'view' | 'dynamic' | 'icon' | 'shape'
  text?: string
  imageUrl?: string
  x: number
  y: number
  width: number
  height: number
  dynamic?: boolean
  aiInferred?: boolean
  aiNote?: string
  /** AI-inferred content for a runtime surface (absolute coords). */
  inferredChildren?: HifiNode[]
  style: HifiStyle
  children: HifiNode[]
}

export interface DiffBox {
  designNodeId?: string
  codeNodeId?: string
  nodeName: string
  property: string
  severity: 'high' | 'medium' | 'low'
  expected?: unknown
  actual?: unknown
  needsReview?: boolean
}

interface HifiScreenProps {
  root: HifiNode
  width: number
  height: number
  /** Which side this renders (selects whether diff uses design/code node id). */
  side: 'design' | 'code'
  diffs: DiffBox[]
  activeNodeId: string
  onSelectNode: (id: string) => void
}

const SEVERITY_COLOR: Record<DiffBox['severity'], string> = {
  high: '#e5484d',
  medium: '#f5a623',
  low: '#4c9aff',
}

/** Render a normalised gradient as a CSS background value. */
function gradientCss(g: HifiGradient): string | undefined {
  if (g.stops.length < 2) return undefined
  const stops = g.stops
    .map((s) => `${s.color} ${Math.round(s.position * 100)}%`)
    .join(', ')
  if (g.type === 'radial') return `radial-gradient(circle, ${stops})`
  return `linear-gradient(${g.cssAngle}deg, ${stops})`
}

/** Map the neutral image-fit to a CSS object-fit value. */
function objectFitOf(fit: HifiStyle['imageFit']): 'fill' | 'contain' | 'cover' {
  return fit ?? 'cover'
}

/**
 * Clamp a corner radius so it never exceeds half the shortest edge.
 *
 * Figma/Android express a pill as a fixed large radius (Figma `cornerRadius:
 * 22` on a 40-tall button; Android `<corners android:radius="100dp">`). When a
 * node's measured box is shorter/narrower than 2r, an un-clamped radius would
 * be silently scaled per-corner by the browser and stop looking like a clean
 * capsule (or square off entirely). Pinning r <= min(w,h)/2 keeps the exact
 * pill/rounded shape regardless of measurement drift. Border is inside the
 * box, so subtract its width when measuring the available radius.
 */
function clampRadius(radius: number, width: number, height: number, border = 0): number {
  const max = Math.max(0, (Math.min(width, height) - border * 2) / 2)
  return Math.max(0, Math.min(radius, max))
}

/**
 * Build a CSS font stack for a source font family. The design uses macOS fonts
 * (PingFang SC / SF Pro) that are absent on Windows; an explicit CJK-capable
 * fallback keeps glyph metrics close and avoids the browser silently falling
 * back to a much wider/narrower font, which was wrapping and clipping text.
 */
function fontStackOf(family?: string): string {
  const cjk = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Source Han Sans SC",SimHei,sans-serif'
  const latin =
    '"SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif'
  if (!family) return cjk
  if (/pingfang|hiragino|yahei|han/i.test(family)) return `"${family}",${cjk}`
  if (/sf pro|sf\b/i.test(family)) return `"${family}",${latin}`
  return `"${family}",${cjk}`
}

function nodeBaseStyle(node: HifiNode): CSSProperties {
  const s: CSSProperties = {
    position: 'absolute',
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    boxSizing: 'border-box',
  }
  const st = node.style
  if (st.backgroundColor) s.background = st.backgroundColor
  if (st.gradient) {
    const g = gradientCss(st.gradient)
    if (g) s.background = g
  }
  const borderForRadius = st.borderWidth ?? 0
  if (typeof st.borderRadius === 'number' && st.borderRadius > 0) {
    s.borderRadius = clampRadius(st.borderRadius, node.width, node.height, borderForRadius)
  }
  // Mixed corners take precedence; Figma order maps directly to CSS order.
  // Clamp each corner independently (same half-edge cap) so an oversized
  // per-corner value still forms a clean pill rather than a distorted box.
  if (Array.isArray(st.borderRadii)) {
    s.borderRadius = st.borderRadii
      .map((r) => clampRadius(r, node.width, node.height, borderForRadius) + 'px')
      .join(' ')
  }
  if (st.borderWidth) {
    s.borderStyle = 'solid'
    s.borderWidth = st.borderWidth
    s.borderColor = st.borderColor
  }
  const applySide = (
    width: number | undefined,
    color: string | undefined,
    setW: (v: number) => void,
    setC: (v: string) => void,
    setS: (v: string) => void,
  ) => {
    if (!width) return
    setS('solid')
    setW(width)
    if (color || st.borderColor) setC((color ?? st.borderColor)!)
  }
  applySide(
    st.borderTopWidth,
    st.borderTopColor,
    (v) => {
      s.borderTopWidth = v
    },
    (v) => {
      s.borderTopColor = v
    },
    (v) => {
      s.borderTopStyle = v
    },
  )
  applySide(
    st.borderRightWidth,
    st.borderRightColor,
    (v) => {
      s.borderRightWidth = v
    },
    (v) => {
      s.borderRightColor = v
    },
    (v) => {
      s.borderRightStyle = v
    },
  )
  applySide(
    st.borderBottomWidth,
    st.borderBottomColor,
    (v) => {
      s.borderBottomWidth = v
    },
    (v) => {
      s.borderBottomColor = v
    },
    (v) => {
      s.borderBottomStyle = v
    },
  )
  applySide(
    st.borderLeftWidth,
    st.borderLeftColor,
    (v) => {
      s.borderLeftWidth = v
    },
    (v) => {
      s.borderLeftColor = v
    },
    (v) => {
      s.borderLeftStyle = v
    },
  )
  if (typeof st.opacity === 'number') s.opacity = st.opacity
  const shadows: string[] = []
  if (st.shadows?.length) {
    for (const sh of st.shadows) {
      const color = sh.color ?? (sh.inset ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.22)')
      const spread = sh.spread ?? 0
      const prefix = sh.inset ? 'inset ' : ''
      shadows.push(
        `${prefix}${sh.offsetX}px ${sh.offsetY}px ${sh.blur}px ${spread}px ${color}`,
      )
    }
  } else {
    if (st.shadow) {
      const sh = st.shadow
      const color = sh.color ?? 'rgba(0,0,0,0.22)'
      const spread = sh.spread ?? 0
      shadows.push(
        `${sh.offsetX}px ${sh.offsetY}px ${sh.blur}px ${spread}px ${color}`,
      )
    } else if (typeof st.elevation === 'number' && st.elevation > 0) {
      const blur = Math.round(st.elevation * 100) / 100
      const y = Math.round(st.elevation * 0.35 * 100) / 100
      shadows.push(`0 ${y}px ${blur}px rgba(0,0,0,0.22)`)
    }
    if (st.insetShadow) {
      const sh = st.insetShadow
      const color = sh.color ?? 'rgba(0,0,0,0.18)'
      const spread = sh.spread ?? 0
      shadows.push(
        `inset ${sh.offsetX}px ${sh.offsetY}px ${sh.blur}px ${spread}px ${color}`,
      )
    } else if (typeof st.innerShadow === 'number' && st.innerShadow > 0) {
      const blur = Math.round(st.innerShadow * 100) / 100
      shadows.push(`inset 0 1px ${blur}px rgba(0,0,0,0.18)`)
    }
  }
  if (shadows.length) s.boxShadow = shadows.join(', ')
  if (typeof st.blur === 'number' && st.blur > 0) {
    s.filter = `blur(${Math.round(st.blur * 100) / 100}px)`
  }
  if (st.blendMode) s.mixBlendMode = st.blendMode as CSSProperties['mixBlendMode']
  {
    const parts: string[] = []
    if (typeof st.rotation === 'number' && Math.abs(st.rotation) > 0.5) {
      parts.push(`rotate(${st.rotation}deg)`)
    }
    const sx = typeof st.scaleX === 'number' ? st.scaleX : undefined
    const sy = typeof st.scaleY === 'number' ? st.scaleY : undefined
    if (sx !== undefined || sy !== undefined) {
      parts.push(`scale(${sx ?? 1}, ${sy ?? 1})`)
    }
    if (typeof st.skewX === 'number' && Math.abs(st.skewX) > 0.5) {
      parts.push(`skewX(${st.skewX}deg)`)
    }
    if (typeof st.skewY === 'number' && Math.abs(st.skewY) > 0.5) {
      parts.push(`skewY(${st.skewY}deg)`)
    }
    if (parts.length) s.transform = parts.join(' ')
  }
  if (typeof st.zIndex === 'number') s.zIndex = st.zIndex
  if (st.color) s.color = st.color
  if (st.fontSize) s.fontSize = st.fontSize
  if (st.fontWeight) s.fontWeight = st.fontWeight
  if (st.fontFamily) s.fontFamily = fontStackOf(st.fontFamily)
  if (st.lineHeight) s.lineHeight = st.lineHeight
  if (st.textAlign) s.textAlign = st.textAlign === 'right' ? 'right' : st.textAlign === 'left' ? 'left' : 'center'
  if (st.textDecoration && st.textDecoration !== 'none') {
    s.textDecorationLine = st.textDecoration
  }
  if (st.textTransform && st.textTransform !== 'none') {
    s.textTransform = st.textTransform
  }
  if (st.overflow && st.overflow !== 'visible') {
    s.overflow = st.overflow
  }
  if (st.clipPath) {
    if (st.clipPath === 'circle') s.clipPath = 'circle(50%)'
    else if (st.clipPath === 'ellipse') s.clipPath = 'ellipse(50% 50% at 50% 50%)'
    else if (st.clipPath.startsWith('mask')) {
      // Mask layers: approximate with hidden overflow; exact mask needs sibling wiring.
      if (!s.overflow || s.overflow === 'visible') s.overflow = 'hidden'
    } else if (st.clipPath === 'outline' || st.clipPath === 'inset') {
      if (!s.overflow || s.overflow === 'visible') s.overflow = 'hidden'
    }
  }
  if (typeof st.aspectRatio === 'number' && st.aspectRatio > 0) {
    s.aspectRatio = String(st.aspectRatio)
  }
  if (typeof st.minWidth === 'number' && st.minWidth > 0) s.minWidth = st.minWidth
  if (typeof st.maxWidth === 'number' && st.maxWidth > 0) s.maxWidth = st.maxWidth
  if (typeof st.minHeight === 'number' && st.minHeight > 0) s.minHeight = st.minHeight
  if (typeof st.maxHeight === 'number' && st.maxHeight > 0) s.maxHeight = st.maxHeight
  if (st.flexDirection) s.flexDirection = st.flexDirection
  if (st.alignItems) {
    s.alignItems =
      st.alignItems === 'start'
        ? 'flex-start'
        : st.alignItems === 'end'
          ? 'flex-end'
          : st.alignItems
  }
  if (st.justifyContent) {
    s.justifyContent =
      st.justifyContent === 'start'
        ? 'flex-start'
        : st.justifyContent === 'end'
          ? 'flex-end'
          : st.justifyContent
  }
  if (st.fontStyle === 'italic') s.fontStyle = 'italic'
  if (st.borderStyle && st.borderStyle !== 'solid') s.borderStyle = st.borderStyle
  if (typeof st.backdropBlur === 'number' && st.backdropBlur > 0) {
    s.backdropFilter = `blur(${st.backdropBlur}px)`
    // Safari
    ;(s as CSSProperties & { WebkitBackdropFilter?: string }).WebkitBackdropFilter =
      `blur(${st.backdropBlur}px)`
  }
  if (st.position) s.position = st.position
  if (typeof st.rowGap === 'number') s.rowGap = st.rowGap
  if (typeof st.columnGap === 'number') s.columnGap = st.columnGap
  if (st.flexWrap) s.flexWrap = st.flexWrap
  if (st.alignContent) {
    s.alignContent =
      st.alignContent === 'start'
        ? 'flex-start'
        : st.alignContent === 'end'
          ? 'flex-end'
          : st.alignContent
  }
  if (typeof st.order === 'number') s.order = st.order
  if (st.gridTemplate) {
    // Fingerprint `cols:…|rows:…` → CSS grid-template-*
    const cols = st.gridTemplate.match(/cols:([^|]+)/)?.[1]?.trim()
    const rows = st.gridTemplate.match(/rows:([^|]+)/)?.[1]?.trim()
    if (cols) s.gridTemplateColumns = cols
    if (rows) s.gridTemplateRows = rows
    if (!s.display) s.display = 'grid'
  }
  if (st.alignSelf) {
    s.alignSelf =
      st.alignSelf === 'start'
        ? 'flex-start'
        : st.alignSelf === 'end'
          ? 'flex-end'
          : st.alignSelf
  }
  if (typeof st.flexGrow === 'number') s.flexGrow = st.flexGrow
  if (typeof st.flexShrink === 'number') s.flexShrink = st.flexShrink
  if (st.transformOrigin) s.transformOrigin = st.transformOrigin
  if (st.visibility) s.visibility = st.visibility
  if (st.display) s.display = st.display
  if (st.whiteSpace) s.whiteSpace = st.whiteSpace
  if (st.wordBreak) s.wordBreak = st.wordBreak
  if (typeof st.wordSpacing === 'number') s.wordSpacing = st.wordSpacing
  if (typeof st.textIndent === 'number') s.textIndent = st.textIndent
  if (typeof st.perspective === 'number') s.perspective = st.perspective
  if (typeof st.rotateX === 'number' || typeof st.rotateY === 'number') {
    const parts: string[] = []
    if (typeof st.rotateX === 'number') parts.push(`rotateX(${st.rotateX}deg)`)
    if (typeof st.rotateY === 'number') parts.push(`rotateY(${st.rotateY}deg)`)
    s.transform = [s.transform, ...parts].filter(Boolean).join(' ')
  }
  if (st.textShadow) {
    const ts = st.textShadow
    s.textShadow = `${ts.offsetX}px ${ts.offsetY}px ${ts.blur}px ${ts.color ?? '#000'}`
  }
  if (st.direction) s.direction = st.direction
  if (st.writingMode) s.writingMode = st.writingMode
  if (st.filter) {
    const cssFilter = st.filter
      .split('|')
      .map((part) => {
        const [fn, val] = part.split(':')
        return fn && val !== undefined ? `${fn}(${val})` : ''
      })
      .filter(Boolean)
      .join(' ')
    if (cssFilter) {
      s.filter = [typeof s.filter === 'string' ? s.filter : '', cssFilter]
        .filter(Boolean)
        .join(' ')
    }
  }
  if (st.outline) {
    const [w, styleName, color] = st.outline.split(',')
    if (w && styleName) s.outline = `${w}px ${styleName} ${color || 'currentColor'}`
  }
  if (st.textAlignVertical === 'center') s.alignItems = s.alignItems ?? 'center'
  if (st.textOverflow) s.textOverflow = st.textOverflow
  if (typeof st.maxLines === 'number' && st.maxLines > 0) {
    if (st.maxLines === 1) {
      s.whiteSpace = 'nowrap'
      if (!s.textOverflow) s.textOverflow = 'ellipsis'
      if (!s.overflow || s.overflow === 'visible') s.overflow = 'hidden'
    } else {
      s.display = '-webkit-box'
      ;(s as CSSProperties & { WebkitLineClamp?: number }).WebkitLineClamp = st.maxLines
      ;(s as CSSProperties & { WebkitBoxOrient?: string }).WebkitBoxOrient = 'vertical'
      if (!s.overflow || s.overflow === 'visible') s.overflow = 'hidden'
      if (!s.textOverflow) s.textOverflow = 'ellipsis'
    }
  }
  return s
}

/** Index diffs by the node id relevant to this side. */
function diffsByNode(diffs: DiffBox[], side: 'design' | 'code') {
  const map = new Map<string, DiffBox[]>()
  for (const d of diffs) {
    const id = side === 'design' ? d.designNodeId : d.codeNodeId
    if (!id) continue
    const list = map.get(id) ?? []
    list.push(d)
    map.set(id, list)
  }
  return map
}

/**
 * Flatten the tree in pre-order into a list of nodes that all share the SAME
 * root coordinate space. Node boxes are absolute viewport coordinates, so they
 * must be painted as siblings — nesting them (each absolute inside another
 * absolute) re-applied every ancestor's offset and pushed deep content far off
 * its true position.
 */
function flattenTree(root: HifiNode): HifiNode[] {
  const out: HifiNode[] = []
  const walk = (node: HifiNode): void => {
    out.push(node)
    // AI-inferred content shares the same absolute space; emit immediately
    // after its runtime region so it paints on top of the placeholder box.
    for (const inferred of node.inferredChildren ?? []) walk(inferred)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return out
}

export function HifiScreen({
  root,
  width,
  height,
  side,
  diffs,
  activeNodeId,
  onSelectNode,
}: HifiScreenProps) {
  const diffIndex = diffsByNode(diffs, side)

  /** Paint one node's own box/content. Children are flat siblings, not nested. */
  function renderNode(node: HifiNode) {
    const nodeDiffs = diffIndex.get(node.id) ?? []
    const worst = nodeDiffs.reduce<DiffBox['severity'] | null>(
      (acc, d) => {
        if (!acc) return d.severity
        const rank = { high: 3, medium: 2, low: 1 }
        return rank[d.severity] > rank[acc] ? d.severity : acc
      },
      null,
    )
    const isActive = activeNodeId === node.id
    // Default view is clean (no markers). Only the node selected from the diff
    // list (or by direct click) gets an outline, coloured by its worst diff so
    // the two sides show exactly where that difference is.
    let outline: string | undefined
    if (isActive) {
      outline = worst
        ? `2px solid ${SEVERITY_COLOR[worst]}`
        : '2px solid #0f6e56'
    }
    const base = nodeBaseStyle(node)

    return (
      <div
        key={node.id}
        style={{ ...base, outline, outlineOffset: -1 }}
        onClick={(e) => {
          e.stopPropagation()
          onSelectNode(node.id)
        }}
        title={node.name}
      >
        {node.kind === 'image' && node.imageUrl ? (
          <img
            src={node.imageUrl}
            alt={node.name}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              objectFit: objectFitOf(node.style.imageFit),
            }}
          />
        ) : null}

        {node.kind === 'icon' ? (
          node.imageUrl ? (
            <img
              src={node.imageUrl}
              alt={node.name}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                // Icons are transparent PNGs; letterbox them so the glyph is
                // never cropped, regardless of the node box's exact aspect.
                objectFit: 'contain',
              }}
            />
          ) : (
            // Icon with no rendered glyph yet (e.g. render chunk failed): keep
            // the box transparent rather than painting a coloured square.
            null
          )
        ) : null}

        {node.kind === 'text' && node.text ? (
          (() => {
            // Decide wrapping from BOTH an explicit newline and the box geometry:
            // a soft-wrapped paragraph has no "\n" but its box is taller than one
            // line (e.g. width-constrained body copy). A single auto-sized line
            // never wraps — the wider Windows fallback font used to do that and
            // then got clipped.
            const lineHeightPx = node.style.lineHeight ?? node.fontSize ?? 14
            const explicitWrap = /\n/.test(node.text)
            const fitsMultiple = node.height > lineHeightPx * 1.5
            const wraps = explicitWrap || fitsMultiple
            const align =
              node.style.textAlign === 'right'
                ? 'flex-end'
                : node.style.textAlign === 'left' || node.style.textAlign === 'justify'
                  ? 'flex-start'
                  : 'center'
            const cssTextAlign =
              node.style.textAlign === 'right'
                ? 'right'
                : node.style.textAlign === 'left'
                  ? 'left'
                  : node.style.textAlign === 'justify'
                    ? 'justify'
                    : 'center'
            return (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: align,
                  boxSizing: 'border-box',
                  padding: 0,
                }}
              >
                <span
                  style={{
                    width: wraps ? '100%' : undefined,
                    maxWidth: '100%',
                    lineHeight: `${lineHeightPx}px`,
                    whiteSpace: wraps ? 'pre-wrap' : 'nowrap',
                    textAlign: cssTextAlign,
                    overflow: 'visible',
                  }}
                >
                  {node.text}
                </span>
              </div>
            )
          })()
        ) : null}

        {node.dynamic && !(node.inferredChildren?.length) ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px dashed #b9a98a',
              borderRadius: 4,
              background:
                'repeating-linear-gradient(45deg,#f3ede1,#f3ede1 8px,#efe7d6 8px,#efe7d6 16px)',
              color: '#8a7a5c',
              fontSize: 11,
            }}
          >
            运行时动态区域
          </div>
        ) : null}

        {node.dynamic && node.inferredChildren?.length ? (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              background: '#0f6e56',
              color: '#fff',
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: '0 0 6px 0',
            }}
          >
            {node.aiInferred ? 'AI 还原' : '设计稿还原'}
          </div>
        ) : null}

        {node.aiInferred && node.aiNote ? (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              background: '#6d4bd6',
              color: '#fff',
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: '0 0 6px 0',
              maxWidth: '100%',
            }}
            title={node.aiNote}
          >
            AI 推断{node.aiNote ? `：${node.aiNote}` : ''}
          </div>
        ) : null}
      </div>
    )
  }

  const flatNodes = flattenTree(root)

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      {flatNodes.map(renderNode)}
    </div>
  )
}
