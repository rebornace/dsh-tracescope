/**
 * Figma source: fetch nodes over the official REST API and normalise the node
 * tree into the vendor-neutral {@link DesignDoc}.
 */
import type {
  DesignDoc,
  DesignFill,
  DesignGradient,
  DesignNode,
  DesignNodeKind,
  DesignStyle,
  HexColor,
} from '../types.js'
import { estimateTextAdvance, estimateTextBlock } from '../text-metrics.js'

const FIGMA_API = 'https://api.figma.com/v1'

export interface FigmaTransportOptions {
  /** Total attempts per request, including the first one (default 3). */
  attempts?: number
  /** Per-attempt connect timeout in ms (default 20000). */
  timeoutMs?: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Translate a `Retry-After` header into a delay in ms. Accepts either an
 * integer number of seconds or an HTTP date; falls back to exponential backoff
 * when missing/unparseable. Capped so a bad header can't stall a request long.
 */
function retryAfterDelayMs(retryAfter: string | null, attempt: number): number {
  const fallback = Math.min(4000, 500 * 2 ** attempt)
  if (!retryAfter) return fallback
  const asSeconds = Number(retryAfter)
  if (Number.isFinite(asSeconds)) return Math.min(8000, Math.max(0, asSeconds * 1000))
  const dateMs = Date.parse(retryAfter)
  if (!Number.isNaN(dateMs)) return Math.min(8000, Math.max(0, dateMs - Date.now()))
  return fallback
}

/**
 * Fetch with a connect timeout and automatic retries.
 *
 * Access to api.figma.com is frequently slow / intermittently reset on some
 * networks; a single transient failure used to surface the raw English
 * "fetch failed". We retry network-level errors and 5xx responses with a short
 * backoff. HTTP 4xx (auth/not found) is returned immediately and never retried.
 */
async function figmaFetch(
  url: string,
  headers: Record<string, string>,
  options: FigmaTransportOptions & { fetchImpl?: typeof fetch },
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch
  const attempts = Math.max(1, options.attempts ?? 3)
  const timeoutMs = options.timeoutMs ?? 20000

  let lastCause: unknown
  let firedOwnTimeout = false
  let retryDelayMs = 0
  for (let i = 0; i < attempts; i += 1) {
    if (retryDelayMs > 0) {
      await sleep(retryDelayMs)
      retryDelayMs = 0
    }
    firedOwnTimeout = false

    const controller = new AbortController()
    const timer = setTimeout(() => {
      firedOwnTimeout = true
      controller.abort()
    }, timeoutMs)

    let response: Response
    try {
      response = await fetchImpl(url, { headers, signal: controller.signal })
    } catch (error) {
      clearTimeout(timer)
      lastCause = (error as { cause?: unknown })?.cause ?? error
      retryDelayMs = Math.min(4000, 500 * 2 ** i)
      continue
    }
    clearTimeout(timer)

    // Rate limited -> retry, honoring Retry-After (seconds or HTTP date) when
    // present so a burst of thumbnail requests backs off instead of failing.
    if (response.status === 429 && i < attempts - 1) {
      retryDelayMs = retryAfterDelayMs(response.headers.get('retry-after'), i)
      continue
    }
    // Transient server error -> retry; anything else (incl. other 4xx) is final.
    if (response.status < 500 || i === attempts - 1) return response
    retryDelayMs = Math.min(4000, 500 * 2 ** i)
  }

  const code =
    lastCause && typeof lastCause === 'object'
      ? String((lastCause as { code?: string }).code ?? '')
      : ''
  const isTimeout = firedOwnTimeout || /TIMEOUT/i.test(code)
  throw new Error(
    isTimeout
      ? `连接 Figma 超时（已重试 ${attempts} 次）。请检查网络或代理后重试。`
      : `无法连接 Figma 服务（已重试 ${attempts} 次，${code || 'network error'}）。请检查网络或代理后重试。`,
  )
}

export interface FigmaClientOptions extends FigmaTransportOptions {
  token: string
  /** Logical-unit scale applied to raw Figma lengths (default 1). */
  scale?: number
  fetchImpl?: typeof fetch
}

// Loose typings for only the fields we consume.
interface FigmaColor {
  r: number
  g: number
  b: number
  a?: number
}
interface FigmaGradientStop {
  position: number
  color: FigmaColor
}
interface FigmaVector {
  x: number
  y: number
}
interface FigmaPaint {
  type: string
  visible?: boolean
  color?: FigmaColor
  opacity?: number
  /** IMAGE fills only. */
  scaleMode?: string
  /** IMAGE fill asset id, resolved via the /image-fills endpoint. */
  imageRef?: string
  /** GRADIENT_* fills only. */
  gradientHandlePositions?: FigmaVector[]
  gradientStops?: FigmaGradientStop[]
}
interface FigmaTypeStyle {
  fontFamily?: string
  fontSize?: number
  fontWeight?: number | string
  /** Regular | Italic | Bold Italic | Oblique … */
  italic?: boolean
  fontStyle?: string
  lineHeightPx?: number
  letterSpacing?: number
  paragraphSpacing?: number
  /** First-line indent in px. */
  paragraphIndent?: number
  textAlignHorizontal?: string
  textAlignVertical?: string
  /** UNDERLINE | STRIKETHROUGH | none */
  textDecoration?: string
  /** UPPER | LOWER | TITLE | SMALL_CAPS | ORIGINAL */
  textCase?: string
}
interface FigmaBBox {
  x: number
  y: number
  width: number
  height: number
}
interface FigmaEffect {
  type: string
  visible?: boolean
  radius?: number
  color?: FigmaColor
  offset?: FigmaVector
  spread?: number
}
interface FigmaNode {
  id: string
  name: string
  type: string
  visible?: boolean
  children?: FigmaNode[]
  absoluteBoundingBox?: FigmaBBox
  fills?: FigmaPaint[]
  strokes?: FigmaPaint[]
  strokeWeight?: number
  /** Per-side stroke weights when borders differ (Figma). */
  individualStrokeWeights?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
  effects?: FigmaEffect[]
  opacity?: number
  /** Figma blend mode, e.g. MULTIPLY / PASS_THROUGH. */
  blendMode?: string
  /** Rotation in degrees (File API) when present. */
  rotation?: number
  /** 2×3 affine matrix [[a,c,tx],[b,d,ty]]. */
  relativeTransform?: [[number, number, number], [number, number, number]]
  /** CENTER | INSIDE | OUTSIDE */
  strokeAlign?: string
  /** NONE | ROUND | SQUARE | … */
  strokeCap?: string
  /** MITER | BEVEL | ROUND */
  strokeJoin?: string
  cornerRadius?: number
  /** Per-corner radii [topLeft, topRight, bottomRight, bottomLeft] when mixed. */
  rectangleCornerRadii?: [number, number, number, number]
  characters?: string
  style?: FigmaTypeStyle
  /** FRAME clips overflowing children. */
  clipsContent?: boolean
  /** Layer is used as a boolean / alpha mask for siblings below. */
  isMask?: boolean
  /** ALPHA | VECTOR | LUMINANCE */
  maskType?: string
  /** TEXT truncation: DISABLED | ENDING. */
  textTruncation?: string
  /** Max lines when textTruncation is ENDING. */
  maxLines?: number
  /** WIDTH_AND_HEIGHT | HEIGHT | NONE | TRUNCATE */
  textAutoResize?: string
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  /** Dash lengths for dashed strokes; empty / absent → solid. */
  strokeDashes?: number[]
  layoutMode?: string
  itemSpacing?: number
  primaryAxisAlignItems?: string
  counterAxisAlignItems?: string
  /** AUTO | SPACE_BETWEEN — packed lines when wrapping. */
  counterAxisAlignContent?: string
  layoutSizingHorizontal?: string
  layoutSizingVertical?: string
  /** NO_WRAP | WRAP */
  layoutWrap?: string
  /** INHERIT | STRETCH | MIN | CENTER | MAX — child align-self in auto-layout. */
  layoutAlign?: string
  /** 0..1 grow factor along primary axis. */
  layoutGrow?: number
  /** ABSOLUTE | AUTO */
  layoutPositioning?: string
  /** Item z-order among siblings (higher paints later). */
  itemReverseZIndex?: boolean
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
}
interface FigmaNodesResponse {
  nodes?: Record<string, { document?: FigmaNode }>
  err?: unknown
  status?: number
  message?: string
}

export function figmaColorToHex(color: FigmaColor, paintOpacity = 1): HexColor {
  const a = (color.a ?? 1) * paintOpacity
  const toByte = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0')
  const rgb = `${toByte(color.r)}${toByte(color.g)}${toByte(color.b)}`
  return a < 1 ? `#${rgb}${toByte(a)}` : `#${rgb}`
}

/** Map Figma blendMode → CSS mix-blend-mode; omit normal/pass-through. */
export function normalizeFigmaBlendMode(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (key === 'PASS_THROUGH' || key === 'NORMAL') return undefined
  const map: Record<string, string> = {
    MULTIPLY: 'multiply',
    SCREEN: 'screen',
    OVERLAY: 'overlay',
    DARKEN: 'darken',
    LIGHTEN: 'lighten',
    COLOR_DODGE: 'color-dodge',
    COLOR_BURN: 'color-burn',
    HARD_LIGHT: 'hard-light',
    SOFT_LIGHT: 'soft-light',
    DIFFERENCE: 'difference',
    EXCLUSION: 'exclusion',
    HUE: 'hue',
    SATURATION: 'saturation',
    COLOR: 'color',
    LUMINOSITY: 'luminosity',
    PLUS_DARKER: 'plus-darker',
    PLUS_LIGHTER: 'plus-lighter',
  }
  return map[key]
}

function visiblePaints(paints: FigmaPaint[] | undefined): FigmaPaint[] {
  return (paints ?? []).filter((f) => f.visible !== false)
}

function firstSolidFill(node: FigmaNode): FigmaPaint | undefined {
  return visiblePaints(node.fills).find(
    (f) => f.type === 'SOLID' && f.color,
  )
}

/** First visible gradient paint, if any. */
function firstGradientFill(node: FigmaNode): FigmaPaint | undefined {
  return visiblePaints(node.fills).find((f) => f.type.startsWith('GRADIENT_'))
}

/** Map a Figma image fill scaleMode to the neutral image-fit. */
function imageFitOf(paint: FigmaPaint): DesignStyle['imageFit'] {
  switch (paint.scaleMode) {
    case 'FIT':
      return 'contain'
    case 'FILL':
      return 'cover'
    case 'STRETCH':
      return 'fill'
    default:
      // Figma's default for image rectangles is FILL (cover the box).
      return 'cover'
  }
}

/** Convert a Figma gradient paint into the neutral gradient model. */
function convertGradient(paint: FigmaPaint): DesignGradient | undefined {
  const stops = (paint.gradientStops ?? [])
    .filter((s) => s.color)
    .map((s) => ({
      position: Math.max(0, Math.min(1, s.position)),
      color: figmaColorToHex(s.color, paint.opacity ?? 1),
    }))
  if (stops.length < 2) return undefined

  const type: DesignGradient['type'] =
    paint.type === 'GRADIENT_RADIAL' ? 'radial' : 'linear'

  // Default to a top->bottom gradient when handles are missing.
  const handles = paint.gradientHandlePositions
  let cssAngle = 180
  if (handles && handles.length >= 2) {
    const start = handles[0]!
    const end = handles[1]!
    const dx = end.x - start.x
    const dy = end.y - start.y
    // CSS angle: 0deg = to top, 90deg = to right (clockwise).
    cssAngle = (Math.atan2(dx, -dy) * 180) / Math.PI
  }

  return { type, cssAngle, stops }
}

function hasImageFill(node: FigmaNode): boolean {
  return visiblePaints(node.fills).some(
    (f) => f.type === 'IMAGE' || f.type === 'GRADIENT_IMAGE',
  )
}

/** First visible image fill. */
function firstImageFill(node: FigmaNode): FigmaPaint | undefined {
  return visiblePaints(node.fills).find((f) => f.type === 'IMAGE')
}

/** Convert all visible fills into a top→bottom DesignFill stack. */
function convertFigmaFills(node: FigmaNode): DesignFill[] {
  const paints = visiblePaints(node.fills)
  const out: DesignFill[] = []
  for (const paint of paints) {
    if (paint.type === 'SOLID' && paint.color) {
      out.push({
        type: 'solid',
        color: figmaColorToHex(paint.color, paint.opacity ?? 1),
        ...(typeof paint.opacity === 'number' && paint.opacity < 1
          ? { opacity: Math.round(paint.opacity * 100) / 100 }
          : {}),
      })
    } else if (paint.type.startsWith('GRADIENT_')) {
      const g = convertGradient(paint)
      if (g) out.push({ type: 'gradient', gradient: g })
    } else if (paint.type === 'IMAGE') {
      out.push({
        type: 'image',
        imageFit: imageFitOf(paint),
        ...(paint.imageRef ? { imageRef: paint.imageRef } : {}),
      })
    }
  }
  return out
}

/** Degrees clockwise from Figma `rotation` or `relativeTransform`. */
function figmaRotationDegrees(node: FigmaNode): number | undefined {
  if (typeof node.rotation === 'number' && Number.isFinite(node.rotation)) {
    // File API may send degrees; Plugin API uses radians. Heuristic: |r| > 2π → degrees.
    const r = node.rotation
    if (Math.abs(r) > Math.PI * 2 + 0.01) return r
    return (r * 180) / Math.PI
  }
  const m = node.relativeTransform
  if (m && m.length >= 2 && m[0] && m[1]) {
    const a = m[0][0]
    const b = m[1][0]
    if (typeof a === 'number' && typeof b === 'number') {
      return (Math.atan2(b, a) * 180) / Math.PI
    }
  }
  return undefined
}

/** Scale + skew from `relativeTransform` (identity / near-zero omitted). */
function figmaAffineExtras(node: FigmaNode): {
  scaleX?: number
  scaleY?: number
  skewX?: number
  skewY?: number
} {
  const m = node.relativeTransform
  if (!m || m.length < 2 || !m[0] || !m[1]) return {}
  const a = m[0][0]
  const c = m[0][1]
  const b = m[1][0]
  const d = m[1][1]
  if (
    typeof a !== 'number' ||
    typeof b !== 'number' ||
    typeof c !== 'number' ||
    typeof d !== 'number'
  ) {
    return {}
  }
  // QR-style 2×2 decomposition: scaleX, rotation, skewX, scaleY.
  const sx = Math.hypot(a, b)
  if (!(sx > 1e-8)) return {}
  const det = a * d - b * c
  const sy = det / sx
  const skewRad = Math.atan2(a * c + b * d, sx * sx)
  const out: {
    scaleX?: number
    scaleY?: number
    skewX?: number
    skewY?: number
  } = {}
  if (Number.isFinite(sx) && Math.abs(sx - 1) > 0.02) {
    out.scaleX = Math.round(sx * 1000) / 1000
  }
  if (Number.isFinite(sy) && Math.abs(Math.abs(sy) - 1) > 0.02) {
    out.scaleY = Math.round(sy * 1000) / 1000
  }
  const skewDeg = (skewRad * 180) / Math.PI
  if (Number.isFinite(skewDeg) && Math.abs(skewDeg) > 0.5) {
    out.skewX = Math.round(skewDeg * 100) / 100
  }
  return out
}

function mapFigmaTextDecoration(
  raw: string | undefined,
): DesignStyle['textDecoration'] | undefined {
  if (!raw) return undefined
  const key = raw.toUpperCase()
  if (key === 'UNDERLINE') return 'underline'
  if (key === 'STRIKETHROUGH') return 'line-through'
  if (key.includes('UNDERLINE') && key.includes('STRIKE')) return 'underline line-through'
  if (key === 'NONE') return 'none'
  return undefined
}

function mapFigmaTextCase(raw: string | undefined): DesignStyle['textTransform'] | undefined {
  if (!raw) return undefined
  switch (raw.toUpperCase()) {
    case 'UPPER':
    case 'UPPERCASE':
      return 'uppercase'
    case 'LOWER':
    case 'LOWERCASE':
      return 'lowercase'
    case 'TITLE':
    case 'TITLE_CASE':
      return 'capitalize'
    case 'ORIGINAL':
    case 'NONE':
      return 'none'
    default:
      return undefined
  }
}

/** Map Figma primary-axis align → justifyContent. */
function mapFigmaPrimaryAlign(
  raw: string | undefined,
): DesignStyle['justifyContent'] | undefined {
  if (!raw) return undefined
  const key = raw.toUpperCase()
  if (key === 'MIN' || key === 'MIN_X' || key === 'MIN_Y') return 'start'
  if (key === 'CENTER') return 'center'
  if (key === 'MAX' || key === 'MAX_X' || key === 'MAX_Y') return 'end'
  if (key === 'SPACE_BETWEEN') return 'space-between'
  if (key === 'SPACE_AROUND') return 'space-around'
  if (key === 'SPACE_EVENLY') return 'space-evenly'
  return undefined
}

/** Map Figma counter-axis align → alignItems. */
function mapFigmaCounterAlign(
  raw: string | undefined,
): DesignStyle['alignItems'] | undefined {
  if (!raw) return undefined
  const key = raw.toUpperCase()
  if (key === 'MIN' || key === 'MIN_X' || key === 'MIN_Y') return 'start'
  if (key === 'CENTER') return 'center'
  if (key === 'MAX' || key === 'MAX_X' || key === 'MAX_Y') return 'end'
  if (key === 'BASELINE' || key === 'STRETCH') return 'stretch'
  return undefined
}

function mapFigmaSizing(raw: string | undefined): DesignStyle['sizingHorizontal'] | undefined {
  if (!raw) return undefined
  const key = raw.toUpperCase()
  if (key === 'FIXED') return 'fixed'
  if (key === 'HUG') return 'hug'
  if (key === 'FILL') return 'fill'
  return undefined
}

function mapKind(node: FigmaNode): DesignNodeKind {
  switch (node.type) {
    case 'TEXT':
      return 'text'
    case 'RECTANGLE':
      return hasImageFill(node) ? 'image' : 'shape'
    case 'VECTOR':
    case 'LINE':
    case 'STAR':
    case 'ELLIPSE':
    case 'REGULAR_POLYGON':
    case 'BOOLEAN_OPERATION':
      return 'icon'
    case 'GROUP':
      return 'group'
    case 'INSTANCE':
    case 'COMPONENT':
    case 'COMPONENT_SET':
      return 'view'
    case 'FRAME':
    default:
      return 'frame'
  }
}

function round(v: number, scale: number): number {
  return Math.round(v * scale * 100) / 100
}

function convertNode(node: FigmaNode, scale: number): DesignNode {
  const style: DesignStyle = {}
  const box = node.absoluteBoundingBox
    ? {
        x: round(node.absoluteBoundingBox.x, scale),
        y: round(node.absoluteBoundingBox.y, scale),
        width: round(node.absoluteBoundingBox.width, scale),
        height: round(node.absoluteBoundingBox.height, scale),
      }
    : {}

  const solid = firstSolidFill(node)
  const gradientPaint = firstGradientFill(node)

  // Full fill stack (Figma paints[0] is topmost → store top→bottom).
  const fillStack = convertFigmaFills(node)
  if (fillStack.length) style.fills = fillStack

  if (node.type === 'TEXT') {
    // Text fills paint the glyphs: support both solid and gradient colours.
    if (solid?.color) {
      style.color = figmaColorToHex(solid.color, solid.opacity ?? 1)
    } else if (gradientPaint) {
      style.gradient = convertGradient(gradientPaint)
    }
  } else {
    // Shape / frame backgrounds: gradient wins over a flat solid fill, matching
    // how Figma composites the topmost paint.
    if (gradientPaint) {
      style.gradient = convertGradient(gradientPaint)
    } else if (solid?.color) {
      style.backgroundColor = figmaColorToHex(solid.color, solid.opacity ?? 1)
    }
    const imagePaint = firstImageFill(node)
    if (imagePaint) {
      style.imageFit = imageFitOf(imagePaint)
      if (imagePaint.imageRef) style.imageRef = imagePaint.imageRef
    }
  }

  // Strokes -> border (Figma strokes are centred; CSS border is a close match).
  const strokePaint = visiblePaints(node.strokes).find(
    (f) => f.type === 'SOLID' && f.color,
  )
  const strokeColor =
    strokePaint?.color != null
      ? figmaColorToHex(strokePaint.color, strokePaint.opacity ?? 1)
      : undefined
  const ind = node.individualStrokeWeights
  if (ind && (ind.top || ind.right || ind.bottom || ind.left)) {
    if (typeof ind.top === 'number' && ind.top > 0) style.borderTopWidth = round(ind.top, scale)
    if (typeof ind.right === 'number' && ind.right > 0) {
      style.borderRightWidth = round(ind.right, scale)
    }
    if (typeof ind.bottom === 'number' && ind.bottom > 0) {
      style.borderBottomWidth = round(ind.bottom, scale)
    }
    if (typeof ind.left === 'number' && ind.left > 0) style.borderLeftWidth = round(ind.left, scale)
    if (strokeColor) {
      style.borderColor = strokeColor
      if (style.borderTopWidth !== undefined) style.borderTopColor = strokeColor
      if (style.borderRightWidth !== undefined) style.borderRightColor = strokeColor
      if (style.borderBottomWidth !== undefined) style.borderBottomColor = strokeColor
      if (style.borderLeftWidth !== undefined) style.borderLeftColor = strokeColor
    }
  } else if (strokeColor && typeof node.strokeWeight === 'number' && node.strokeWeight > 0) {
    style.borderWidth = round(node.strokeWeight, scale)
    style.borderColor = strokeColor
  }
  if (node.strokeAlign) {
    const sa = String(node.strokeAlign).toUpperCase()
    if (sa === 'INSIDE') style.strokeAlign = 'inside'
    else if (sa === 'OUTSIDE') style.strokeAlign = 'outside'
    else if (sa === 'CENTER') style.strokeAlign = 'center'
  }
  if (Array.isArray(node.strokeDashes) && node.strokeDashes.length > 0) {
    const dashes = node.strokeDashes.filter((n) => typeof n === 'number' && n > 0)
    if (dashes.length) {
      // Short equal dashes ≈ dotted; otherwise dashed.
      const max = Math.max(...dashes)
      const min = Math.min(...dashes)
      style.borderStyle = max <= 2 && max / Math.max(min, 0.01) <= 1.5 ? 'dotted' : 'dashed'
      style.strokeDashArray = dashes.map((n) => String(round(n, scale))).join(',')
    }
  }
  const cap = String(node.strokeCap ?? '').toUpperCase()
  if (cap === 'ROUND') style.strokeCap = 'round'
  else if (cap === 'SQUARE') style.strokeCap = 'square'
  else if (cap === 'NONE' || cap === 'BUTT') style.strokeCap = 'butt'
  const join = String(node.strokeJoin ?? '').toUpperCase()
  if (join === 'ROUND') style.strokeJoin = 'round'
  else if (join === 'BEVEL') style.strokeJoin = 'bevel'
  else if (join === 'MITER') style.strokeJoin = 'miter'

  const rotationDeg = figmaRotationDegrees(node)
  if (rotationDeg !== undefined && Math.abs(rotationDeg) > 0.5) {
    style.rotation = Math.round(rotationDeg * 100) / 100
  }
  const scales = figmaAffineExtras(node)
  if (scales.scaleX !== undefined) style.scaleX = scales.scaleX
  if (scales.scaleY !== undefined) style.scaleY = scales.scaleY
  if (scales.skewX !== undefined) style.skewX = scales.skewX
  if (scales.skewY !== undefined) style.skewY = scales.skewY

  // DROP_SHADOW / INNER_SHADOW → full stack + primary outer/inset.
  const shadowEffects = (node.effects ?? []).filter(
    (e) =>
      e.visible !== false &&
      (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') &&
      typeof e.radius === 'number',
  )
  if (shadowEffects.length) {
    const stack = shadowEffects.map((e) => {
      const inset = e.type === 'INNER_SHADOW'
      return {
        offsetX: round(e.offset?.x ?? 0, scale),
        offsetY: round(e.offset?.y ?? 0, scale),
        blur: round(e.radius ?? 0, scale),
        ...(typeof e.spread === 'number' ? { spread: round(e.spread, scale) } : {}),
        ...(e.color ? { color: figmaColorToHex(e.color) } : {}),
        ...(inset ? { inset: true as const } : {}),
      }
    })
    style.shadows = stack
    const outers = stack.filter((s) => !s.inset)
    const inners = stack.filter((s) => s.inset)
    if (outers.length) {
      const best = outers.reduce((a, b) => (a.blur >= b.blur ? a : b))
      style.shadow = best
      style.elevation = best.blur
    }
    if (inners.length) {
      const best = inners.reduce((a, b) => (a.blur >= b.blur ? a : b))
      style.insetShadow = best
      style.innerShadow = best.blur
    }
  }
  // LAYER_BLUR → blur; BACKGROUND_BLUR → backdropBlur.
  const layerBlurs = (node.effects ?? []).filter(
    (e) =>
      e.visible !== false &&
      e.type === 'LAYER_BLUR' &&
      typeof e.radius === 'number',
  )
  if (layerBlurs.length) {
    style.blur = Math.max(...layerBlurs.map((e) => round(e.radius ?? 0, scale)))
  }
  const backdropBlurs = (node.effects ?? []).filter(
    (e) =>
      e.visible !== false &&
      e.type === 'BACKGROUND_BLUR' &&
      typeof e.radius === 'number',
  )
  if (backdropBlurs.length) {
    style.backdropBlur = Math.max(
      ...backdropBlurs.map((e) => round(e.radius ?? 0, scale)),
    )
  }

  if (typeof node.blendMode === 'string') {
    const bm = normalizeFigmaBlendMode(node.blendMode)
    if (bm) style.blendMode = bm
  }

  if (node.clipsContent === true) style.overflow = 'hidden'
  if (node.isMask === true) {
    const mt = String(node.maskType ?? '').toUpperCase()
    if (mt === 'LUMINANCE') style.clipPath = 'mask:luminance'
    else if (mt === 'VECTOR') style.clipPath = 'mask:vector'
    else style.clipPath = 'mask:alpha'
    if (!style.overflow) style.overflow = 'hidden'
  }

  if (typeof node.cornerRadius === 'number') style.cornerRadius = round(node.cornerRadius, scale)
  // Mixed corner radii take precedence over the uniform value (Figma only sends
  // rectangleCornerRadii when the four corners differ).
  if (Array.isArray(node.rectangleCornerRadii) && node.rectangleCornerRadii.length === 4) {
    style.cornerRadii = node.rectangleCornerRadii.map((v) => round(v, scale)) as [
      number,
      number,
      number,
      number,
    ]
  }
  if (typeof node.opacity === 'number') style.opacity = Math.round(node.opacity * 100) / 100

  if (node.layoutMode === 'VERTICAL' || node.layoutMode === 'HORIZONTAL') {
    style.flexDirection = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column'
    if (typeof node.paddingTop === 'number') style.paddingTop = round(node.paddingTop, scale)
    if (typeof node.paddingRight === 'number') style.paddingRight = round(node.paddingRight, scale)
    if (typeof node.paddingBottom === 'number') style.paddingBottom = round(node.paddingBottom, scale)
    if (typeof node.paddingLeft === 'number') style.paddingLeft = round(node.paddingLeft, scale)
    if (typeof node.itemSpacing === 'number' && node.itemSpacing > 0) {
      style.gap = round(node.itemSpacing, scale)
      if (node.layoutMode === 'VERTICAL') style.rowGap = style.gap
      else style.columnGap = style.gap
    }
    const primary = mapFigmaPrimaryAlign(node.primaryAxisAlignItems)
    if (primary) style.justifyContent = primary
    const counter = mapFigmaCounterAlign(node.counterAxisAlignItems)
    if (counter) style.alignItems = counter
  }

  if (typeof node.minWidth === 'number' && node.minWidth > 0) {
    style.minWidth = round(node.minWidth, scale)
  }
  if (typeof node.maxWidth === 'number' && node.maxWidth > 0 && Number.isFinite(node.maxWidth)) {
    style.maxWidth = round(node.maxWidth, scale)
  }
  if (typeof node.minHeight === 'number' && node.minHeight > 0) {
    style.minHeight = round(node.minHeight, scale)
  }
  if (typeof node.maxHeight === 'number' && node.maxHeight > 0 && Number.isFinite(node.maxHeight)) {
    style.maxHeight = round(node.maxHeight, scale)
  }

  const sizeH = mapFigmaSizing(node.layoutSizingHorizontal)
  if (sizeH) style.sizingHorizontal = sizeH
  const sizeV = mapFigmaSizing(node.layoutSizingVertical)
  if (sizeV) style.sizingVertical = sizeV
  if (String(node.layoutPositioning ?? '').toUpperCase() === 'ABSOLUTE') {
    style.position = 'absolute'
  }
  if (String(node.layoutWrap ?? '').toUpperCase() === 'WRAP') {
    style.flexWrap = 'wrap'
    const content = String(node.counterAxisAlignContent ?? '').toUpperCase()
    if (content === 'SPACE_BETWEEN') style.alignContent = 'space-between'
    else if (content === 'AUTO' || content === 'STRETCH') style.alignContent = 'stretch'
  }
  const layoutAlign = String(node.layoutAlign ?? '').toUpperCase()
  if (layoutAlign === 'STRETCH') style.alignSelf = 'stretch'
  else if (layoutAlign === 'MIN') style.alignSelf = 'start'
  else if (layoutAlign === 'CENTER') style.alignSelf = 'center'
  else if (layoutAlign === 'MAX') style.alignSelf = 'end'
  if (typeof node.layoutGrow === 'number' && node.layoutGrow > 0) {
    style.flexGrow = Math.round(node.layoutGrow * 1000) / 1000
  }
  // Figma rotates about the layer center; record when a transform is present.
  if (
    (style.rotation !== undefined || style.scaleX !== undefined || style.scaleY !== undefined) &&
    style.transformOrigin === undefined
  ) {
    style.transformOrigin = '50% 50%'
  }
  if (node.visible === false) {
    style.visibility = 'hidden'
    style.display = 'none'
  }

  if (node.type === 'TEXT' && node.style) {
    const s = node.style
    if (s.fontFamily) style.fontFamily = s.fontFamily
    if (typeof s.fontSize === 'number') style.fontSize = round(s.fontSize, scale)
    if (s.fontWeight !== undefined) {
      const weight = typeof s.fontWeight === 'number' ? s.fontWeight : Number.parseInt(s.fontWeight, 10)
      if (Number.isFinite(weight)) style.fontWeight = weight
    }
    if (s.italic === true || /italic|oblique/i.test(String(s.fontStyle ?? ''))) {
      style.fontStyle = 'italic'
    }
    if (typeof s.lineHeightPx === 'number' && Number.isFinite(s.lineHeightPx)) {
      style.lineHeight = round(s.lineHeightPx, scale)
    }
    if (typeof s.letterSpacing === 'number') style.letterSpacing = round(s.letterSpacing, scale)
    if (typeof s.paragraphSpacing === 'number' && s.paragraphSpacing > 0) {
      style.paragraphSpacing = round(s.paragraphSpacing, scale)
    }
    if (typeof s.paragraphIndent === 'number' && Math.abs(s.paragraphIndent) > 0.5) {
      style.textIndent = round(s.paragraphIndent, scale)
    }
    switch (s.textAlignHorizontal) {
      case 'CENTER':
        style.textAlign = 'center'
        break
      case 'RIGHT':
        style.textAlign = 'right'
        break
      case 'JUSTIFIED':
        style.textAlign = 'justify'
        break
      case 'LEFT':
      default:
        style.textAlign = 'left'
        break
    }
    switch (String(s.textAlignVertical ?? '').toUpperCase()) {
      case 'CENTER':
        style.textAlignVertical = 'center'
        break
      case 'BOTTOM':
        style.textAlignVertical = 'bottom'
        break
      case 'TOP':
        style.textAlignVertical = 'top'
        break
      default:
        break
    }
    const deco = mapFigmaTextDecoration(s.textDecoration)
    if (deco && deco !== 'none') style.textDecoration = deco
    const transform = mapFigmaTextCase(s.textCase)
    if (transform && transform !== 'none') style.textTransform = transform
  }

  if (node.type === 'TEXT') {
    const trunc = String(node.textTruncation ?? '').toUpperCase()
    if (trunc === 'ENDING') {
      style.textOverflow = 'ellipsis'
      if (typeof node.maxLines === 'number' && node.maxLines > 0) {
        style.maxLines = Math.round(node.maxLines)
      } else {
        style.maxLines = 1
      }
    } else if (typeof node.maxLines === 'number' && node.maxLines > 0) {
      style.maxLines = Math.round(node.maxLines)
      style.textOverflow = 'ellipsis'
    }
    const autoResize = String(node.textAutoResize ?? '').toUpperCase()
    if (autoResize === 'WIDTH_AND_HEIGHT' || autoResize === 'TRUNCATE') {
      style.whiteSpace = 'nowrap'
    } else if (autoResize === 'HEIGHT' || autoResize === 'NONE') {
      if (style.maxLines === 1) style.whiteSpace = 'nowrap'
      else style.whiteSpace = 'normal'
    }
    const chars = node.characters ?? ''
    const fs = typeof style.fontSize === 'number' ? style.fontSize : undefined
    if (chars && fs) {
      const metricOpts = {
        letterSpacing:
          typeof style.letterSpacing === 'number' ? style.letterSpacing : undefined,
        fontWeight: style.fontWeight,
      }
      style.textAdvanceWidth = estimateTextAdvance(chars, fs, metricOpts)
      const maxW =
        typeof style.maxWidth === 'number'
          ? style.maxWidth
          : typeof box.width === 'number'
            ? box.width
            : undefined
      const lh = typeof style.lineHeight === 'number' ? style.lineHeight : undefined
      const block = estimateTextBlock(chars, fs, {
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
  }

  return {
    id: node.id,
    name: node.name,
    kind: mapKind(node),
    text: node.type === 'TEXT' ? node.characters : undefined,
    box,
    style,
    children: (node.children ?? [])
      .filter((c) => c.visible !== false && c.type !== 'SLICE')
      .map((c) => convertNode(c, scale)),
  }
}

export function normalizeFigmaTree(root: FigmaNode, scale = 1): DesignDoc {
  const doc: DesignDoc = { root: convertNode(root, scale), scale, source: 'figma' }
  rebaseTreeToRootOrigin(doc.root)
  return doc
}

/**
 * Figma's `absoluteBoundingBox` is positioned relative to the whole file
 * canvas (e.g. a frame can sit at x=-666, y=7589). We paint every fetched node
 * as its own screen with its origin at (0,0) and a viewport of the root's size,
 * so those absolute offsets would push every child off-screen. Translate the
 * whole tree by minus the root box origin, making the root start at (0,0) and
 * all children relative to it (matching the Android layout engine).
 */
function rebaseTreeToRootOrigin(root: DesignNode): void {
  const originX = typeof root.box.x === 'number' ? root.box.x : 0
  const originY = typeof root.box.y === 'number' ? root.box.y : 0
  if (originX === 0 && originY === 0) return
  const shift = (node: DesignNode): void => {
    if (typeof node.box.x === 'number') node.box.x -= originX
    if (typeof node.box.y === 'number') node.box.y -= originY
    for (const child of node.children) shift(child)
  }
  shift(root)
}

/** Extract just the file key from a Figma file/design URL. */
export function parseFigmaFileKey(input: string): string {
  const url = new URL(input)
  const parts = url.pathname.split('/').filter(Boolean)
  // /design/<fileKey>/... or /file/<fileKey>/...
  const keyIndex = parts.findIndex((p) => p === 'design' || p === 'file')
  const fileKey = keyIndex >= 0 ? parts[keyIndex + 1] ?? '' : ''
  if (!fileKey) throw new Error('无法从链接解析 Figma file key')
  return fileKey
}

/** Parse a Figma URL and return the file key plus node id (normalised to `a:b`). */
export function parseFigmaUrl(input: string): { fileKey: string; nodeId: string } {
  const fileKey = parseFigmaFileKey(input)
  const url = new URL(input)
  const rawId = url.searchParams.get('node-id')
  if (!rawId) throw new Error('链接缺少 node-id')
  return { fileKey, nodeId: rawId.replace(/-/g, ':') }
}

export async function fetchFigmaDoc(
  fileKeyOrUrl: string,
  nodeId: string | undefined,
  options: FigmaClientOptions,
): Promise<DesignDoc> {
  let fileKey = fileKeyOrUrl
  let resolvedNodeId = nodeId
  const isUrl = /^https?:\/\//.test(fileKeyOrUrl)
  if (isUrl) {
    const parsed = parseFigmaUrl(fileKeyOrUrl)
    fileKey = parsed.fileKey
    resolvedNodeId = parsed.nodeId
  }
  if (!resolvedNodeId) throw new Error('需要 Figma node id')

  const url = `${FIGMA_API}/files/${fileKey}/nodes?ids=${encodeURIComponent(resolvedNodeId)}`
  const response = await figmaFetch(url, { 'X-Figma-Token': options.token }, options)
  if (!response.ok) {
    throw new Error(`Figma API 请求失败：${response.status} ${response.statusText}`)
  }
  const payload = (await response.json()) as FigmaNodesResponse
  if (payload.err || payload.status) {
    throw new Error(`Figma API 错误：${payload.message ?? JSON.stringify(payload.err)}`)
  }
  const entry = payload.nodes?.[resolvedNodeId]?.document
  if (!entry) throw new Error(`Figma 节点 ${resolvedNodeId} 不存在或无权限`)
  return normalizeFigmaTree(entry, options.scale ?? 1)
}

export interface FigmaRenderOptions extends FigmaTransportOptions {
  token: string
  /** Render scale (default 2 for a crisp preview). */
  scale?: number
  format?: 'png' | 'jpg' | 'svg'
  fetchImpl?: typeof fetch
}

export interface FigmaRenderResult {
  /** Short-lived S3 URL of the rendered image (expires after ~30 days). */
  url: string
  /** Node id the image was rendered for. */
  nodeId: string
}

/**
 * Ask Figma to server-side render a node to an image. This produces the exact
 * visual of the design (images, effects, fonts included) without an LLM or any
 * local rendering. The returned URL is temporary, so call it on demand and do
 * not persist it long term.
 */
export async function renderFigmaNode(
  fileKeyOrUrl: string,
  nodeId: string | undefined,
  options: FigmaRenderOptions,
): Promise<FigmaRenderResult> {
  let fileKey = fileKeyOrUrl
  let resolvedNodeId = nodeId
  if (/^https?:\/\//.test(fileKeyOrUrl)) {
    const parsed = parseFigmaUrl(fileKeyOrUrl)
    fileKey = parsed.fileKey
    resolvedNodeId = parsed.nodeId
  }
  if (!resolvedNodeId) throw new Error('需要 Figma node id 才能渲染')

  const params = new URLSearchParams({
    ids: resolvedNodeId,
    format: options.format ?? 'png',
    scale: String(options.scale ?? 2),
  })
  const url = `${FIGMA_API}/images/${fileKey}?${params.toString()}`
  const response = await figmaFetch(url, { 'X-Figma-Token': options.token }, options)
  if (!response.ok) {
    throw new Error(`Figma 渲染请求失败：${response.status} ${response.statusText}`)
  }
  const payload = (await response.json()) as {
    err?: unknown
    images?: Record<string, string | null>
  }
  if (payload.err) throw new Error(`Figma 渲染错误：${JSON.stringify(payload.err)}`)
  const imageUrl = payload.images?.[resolvedNodeId]
  if (!imageUrl) throw new Error('Figma 未返回该节点的渲染图（可能选中了不可渲染的元素）')
  return { url: imageUrl, nodeId: resolvedNodeId }
}

/**
 * Server-side render several nodes to images in a single request and return a
 * map of node id -> temporary image URL. Nodes Figma cannot render are simply
 * absent from the map (never fatal), so the caller can show a text fallback.
 */
export async function renderFigmaNodesBatch(
  fileKey: string,
  nodeIds: string[],
  options: FigmaRenderOptions,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (!nodeIds.length) return result

  const params = new URLSearchParams({
    ids: nodeIds.join(','),
    format: options.format ?? 'png',
    scale: String(options.scale ?? 1),
  })
  const url = `${FIGMA_API}/images/${fileKey}?${params.toString()}`
  const response = await figmaFetch(url, { 'X-Figma-Token': options.token }, options)
  if (!response.ok) {
    throw new Error(`Figma 渲染请求失败：${response.status} ${response.statusText}`)
  }
  const payload = (await response.json()) as {
    err?: unknown
    images?: Record<string, string | null>
  }
  if (payload.err) throw new Error(`Figma 渲染错误：${JSON.stringify(payload.err)}`)
  const images = payload.images ?? {}
  for (const id of nodeIds) {
    const u =
      images[id] ||
      images[id.replace(/-/g, ':')] ||
      images[id.replace(/:/g, '-')] ||
      null
    if (u) result.set(id.replace(/-/g, ':'), u)
  }
  // Also pick up any unexpected key forms Figma returned.
  for (const [rawId, u] of Object.entries(images)) {
    if (!u) continue
    const normalized = rawId.replace(/-/g, ':')
    if (!result.has(normalized)) result.set(normalized, u)
  }
  return result
}

/**
 * Resolve IMAGE-paint asset ids to usable URLs in ONE request
 * (`GET /files/{file_key}/images`). The endpoint returns every image fill used
 * by the file, so we simply pick out the refs requested. Best effort: unknown
 * refs are absent from the returned map.
 */
export async function fetchFigmaImageFills(
  fileKey: string,
  imageRefs: string[],
  options: FigmaRenderOptions,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const wanted = new Set(imageRefs)
  if (!wanted.size) return result

  const url = `${FIGMA_API}/files/${fileKey}/images`
  const response = await figmaFetch(url, { 'X-Figma-Token': options.token }, options)
  if (!response.ok) {
    throw new Error(`Figma 图片资源请求失败：${response.status} ${response.statusText}`)
  }
  const payload = (await response.json()) as {
    error?: boolean
    status?: number
    meta?: { images?: Record<string, string> }
  }
  if (payload.error) throw new Error('Figma 图片资源返回错误')
  const images = payload.meta?.images ?? {}
  for (const ref of wanted) {
    const u = images[ref]
    if (u) result.set(ref, u)
  }
  return result
}

// ---------------------------------------------------------------------------
// Whole-file page inventory
// ---------------------------------------------------------------------------

export interface FigmaPageSummary {
  id: string
  name: string
  type: string
  box: { x: number; y: number; width: number; height: number }
}

export interface FigmaCanvasSummary {
  id: string
  name: string
  pages: FigmaPageSummary[]
  /** True when this canvas is a component/icon library, not app screens. */
  componentLibrary: boolean
}

export interface FigmaFileInventory {
  fileKey: string
  canvases: FigmaCanvasSummary[]
  /** Flattened list of real (non-library) pages. */
  pages: FigmaPageSummary[]
}

// Top-level elements that represent actual pages. A GROUP (e.g. the
// auto-generated "External Symbols" placeholder) is not a selectable screen.
const PAGE_NODE_TYPES = new Set(['FRAME', 'INSTANCE', 'COMPONENT'])

// Ignore sub-120px helper/placeholder elements even when top level.
const MIN_PAGE_EDGE = 120

function toPageSummary(node: FigmaNode): FigmaPageSummary | null {
  if (!PAGE_NODE_TYPES.has(node.type)) return null
  const b = node.absoluteBoundingBox
  if (!b) return null
  if (b.width < MIN_PAGE_EDGE && b.height < MIN_PAGE_EDGE) return null
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    box: { x: b.x, y: b.y, width: b.width, height: b.height },
  }
}

/** A canvas is treated as a component library when its children are mostly
 * COMPONENT / COMPONENT_SET nodes (the design-system / icon sheet). */
function isComponentLibraryCanvas(nodes: FigmaNode[]): boolean {
  if (!nodes.length) return false
  const components = nodes.filter((n) => n.type === 'COMPONENT' || n.type === 'COMPONENT_SET').length
  return components / nodes.length >= 0.6 && nodes.length >= 10
}

/**
 * Fetch the file's top-level structure (document -> canvases -> top pages) and
 * return every app page grouped by canvas, excluding the component library.
 */
export async function fetchFigmaFileInventory(
  fileKeyOrUrl: string,
  options: FigmaTransportOptions & { token: string; fetchImpl?: typeof fetch },
): Promise<FigmaFileInventory> {
  const fileKey = /^https?:\/\//.test(fileKeyOrUrl)
    ? parseFigmaFileKey(fileKeyOrUrl)
    : fileKeyOrUrl

  const url = `${FIGMA_API}/files/${fileKey}?depth=2`
  const response = await figmaFetch(url, { 'X-Figma-Token': options.token }, options)
  if (!response.ok) {
    throw new Error(`Figma 文件请求失败：${response.status} ${response.statusText}`)
  }
  const payload = (await response.json()) as { document?: FigmaNode }
  const doc = payload.document
  if (!doc) throw new Error('Figma 文件结构为空')

  const canvases: FigmaCanvasSummary[] = []
  const pages: FigmaPageSummary[] = []
  for (const canvasNode of doc.children ?? []) {
    const children = canvasNode.children ?? []
    const componentLibrary = isComponentLibraryCanvas(canvasNode.children ?? [])
    const pageSummaries = children
      .map(toPageSummary)
      .filter((p): p is FigmaPageSummary => p !== null)
    canvases.push({
      id: canvasNode.id,
      name: canvasNode.name,
      pages: pageSummaries,
      componentLibrary,
    })
    if (!componentLibrary) pages.push(...pageSummaries)
  }

  return { fileKey, canvases, pages }
}

/** Node ids requested per `/nodes` call (keeps large frames from bloating one request). */
const DOCS_BATCH_CHUNK = 12
/** `/nodes` requests in flight at once. */
const DOCS_BATCH_CONCURRENCY = 4

/**
 * Fetch several node documents and normalise each. Requests are split into
 * small, concurrently-run chunks: a single request for dozens of frames (some
 * very tall) made Figma spend ~40s serialising one huge payload, which looked
 * like a hang. Chunks fail independently, so one slow/failed frame never
 * blocks the rest of the scan. Nodes that could not be fetched are omitted.
 */
export async function fetchFigmaDocsBatch(
  fileKey: string,
  nodeIds: string[],
  options: FigmaTransportOptions & { token: string; fetchImpl?: typeof fetch; scale?: number },
): Promise<Map<string, DesignDoc>> {
  const result = new Map<string, DesignDoc>()
  if (!nodeIds.length) return result

  const chunks: string[][] = []
  for (let i = 0; i < nodeIds.length; i += DOCS_BATCH_CHUNK) {
    chunks.push(nodeIds.slice(i, i + DOCS_BATCH_CHUNK))
  }

  const scale = options.scale ?? 1
  let cursor = 0
  const workers = Array.from({ length: Math.min(DOCS_BATCH_CONCURRENCY, chunks.length) }, async () => {
    while (cursor < chunks.length) {
      const chunk = chunks[cursor]!
      cursor += 1
      try {
        const url = `${FIGMA_API}/files/${fileKey}/nodes?ids=${encodeURIComponent(chunk.join(','))}`
        const response = await figmaFetch(url, { 'X-Figma-Token': options.token }, options)
        if (!response.ok) continue
        const payload = (await response.json()) as {
          nodes?: Record<string, { document?: FigmaNode }>
        }
        for (const id of chunk) {
          const entry = payload.nodes?.[id]?.document
          if (entry) result.set(id, normalizeFigmaTree(entry, scale))
        }
      } catch {
        // Skip this chunk; its pages are simply absent from the overview.
      }
    }
  })
  await Promise.all(workers)
  return result
}
