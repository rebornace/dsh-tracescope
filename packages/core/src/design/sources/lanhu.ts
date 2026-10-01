/**
 * Lanhu (蓝湖) source: fetch design annotations over the web API and normalise
 * them into the vendor-neutral {@link DesignDoc}.
 *
 * Auth uses a browser Cookie (and optional Authorization header) — lanhu has no
 * public personal-access-token like Figma. Users copy Cookie from DevTools.
 *
 * Protocol reference (not a source copy): community project
 * https://github.com/DC911360/lanhu-mcp-server (Cookie / Authorization,
 * `/api/project/image(s)`, `json_url` annotation payload). This file is an
 * original TraceScope adapter that maps those payloads into {@link DesignDoc};
 * it does not vendor that repository's client, DDS, or MCP layers.
 */
import type {
  DesignDoc,
  DesignFill,
  DesignGradient,
  DesignNode,
  DesignNodeKind,
  DesignShadow,
  DesignStyle,
  HexColor,
} from '../types.js'
import { estimateTextAdvance, estimateTextBlock } from '../text-metrics.js'

const LANHU_HOSTS = new Set([
  'lanhuapp.com',
  'www.lanhuapp.com',
  'lanhu.woa.com',
  'www.lanhu.woa.com',
])

export interface LanhuTransportOptions {
  attempts?: number
  timeoutMs?: number
}

export interface LanhuClientOptions extends LanhuTransportOptions {
  /** Full Cookie header value from an authenticated browser session. */
  cookie: string
  /** Optional Authorization header (some enterprise tenants require it). */
  authorization?: string
  /** Logical-unit scale override; defaults to 1 (already converted from @Nx). */
  scale?: number
  fetchImpl?: typeof fetch
}

export interface LanhuUrlParts {
  tenantId: string
  projectId: string
  imageId: string
  /** Original host used for API base (lanhuapp.com vs lanhu.woa.com). */
  host: string
}

export interface LanhuPageSummary {
  id: string
  name: string
  type: string
  box: { x: number; y: number; width: number; height: number }
  /** Cover / preview URL when known. */
  previewUrl?: string
}

export interface LanhuProjectInventory {
  projectId: string
  tenantId: string
  pages: LanhuPageSummary[]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function round(v: number): number {
  return Math.round(v * 100) / 100
}

function to1x(value: number, scale: number): number {
  return scale > 1 ? value / scale : value
}

function rgbaToHex(r: number, g: number, b: number, a = 1): HexColor {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  const rr = clamp(r).toString(16).padStart(2, '0')
  const gg = clamp(g).toString(16).padStart(2, '0')
  const bb = clamp(b).toString(16).padStart(2, '0')
  const aa = clamp(Math.round(a * 255)).toString(16).padStart(2, '0')
  return aa === 'ff' ? `#${rr}${gg}${bb}` : `#${rr}${gg}${bb}${aa}`
}

function parseColor(c: unknown): HexColor | undefined {
  if (!c || typeof c !== 'object') return undefined
  const o = c as { r?: number; g?: number; b?: number; a?: number }
  if (typeof o.r !== 'number' || typeof o.g !== 'number' || typeof o.b !== 'number') return undefined
  return rgbaToHex(o.r, o.g, o.b, typeof o.a === 'number' ? o.a : 1)
}

/** Apply a fill-level opacity (0–1) onto an already-parsed hex colour. */
function withFillOpacity(hex: HexColor | undefined, opacity: unknown): HexColor | undefined {
  if (!hex) return undefined
  const op = Number(opacity)
  if (!Number.isFinite(op) || !(op < 1)) return hex
  const raw = hex.replace(/^#/, '')
  let r = 0
  let g = 0
  let b = 0
  let a = 255
  if (raw.length === 3) {
    r = parseInt(raw[0]! + raw[0]!, 16)
    g = parseInt(raw[1]! + raw[1]!, 16)
    b = parseInt(raw[2]! + raw[2]!, 16)
  } else if (raw.length >= 6) {
    r = parseInt(raw.slice(0, 2), 16)
    g = parseInt(raw.slice(2, 4), 16)
    b = parseInt(raw.slice(4, 6), 16)
    if (raw.length === 8) a = parseInt(raw.slice(6, 8), 16)
  } else {
    return hex
  }
  return rgbaToHex(r, g, b, (a / 255) * op)
}

/** Normalize blend mode tokens to CSS mix-blend-mode; omit normal/pass-through. */
function normalizeLanhuBlendMode(raw: string): string | undefined {
  const key = raw.trim().toLowerCase().replace(/[\s_]+/g, '-')
  if (!key || key === 'normal' || key === 'pass-through' || key === 'passthrough') {
    return undefined
  }
  const allowed = new Set([
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'color-dodge',
    'color-burn',
    'hard-light',
    'soft-light',
    'difference',
    'exclusion',
    'hue',
    'saturation',
    'color',
    'luminosity',
    'plus-darker',
    'plus-lighter',
  ])
  return allowed.has(key) ? key : undefined
}

/** True when the URL looks like a Lanhu design / project link. */
export function isLanhuUrl(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed) return false
  if (/lanhuapp\.com|lanhu\.woa\.com/i.test(trimmed)) return true
  try {
    const u = new URL(trimmed)
    return LANHU_HOSTS.has(u.hostname.toLowerCase())
  } catch {
    return false
  }
}

/**
 * Parse query params from a Lanhu share / detail URL.
 * Hash-routed links (`#/item/...?pid=`) put params after `?` inside the hash.
 */
export function parseLanhuUrl(input: string): LanhuUrlParts {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('蓝湖链接为空')

  let host = 'lanhuapp.com'
  let search = ''
  try {
    const u = new URL(trimmed)
    host = u.hostname.toLowerCase().replace(/^www\./, '') || host
    search = u.search
    if (u.hash.includes('?')) {
      search = u.hash.slice(u.hash.indexOf('?'))
    }
  } catch {
    const hashQ = trimmed.indexOf('?')
    if (hashQ >= 0) search = trimmed.slice(hashQ)
  }

  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const projectId =
    params.get('project_id') ||
    params.get('pid') ||
    params.get('projectId') ||
    ''
  const imageId = params.get('image_id') || params.get('imageId') || params.get('docId') || ''
  const tenantId = params.get('tid') || params.get('team_id') || params.get('tenantId') || '0'

  if (!projectId) {
    throw new Error('无法从蓝湖链接解析 project_id / pid，请打开具体项目或设计稿后复制链接')
  }

  return { tenantId, projectId, imageId, host }
}

function apiBase(host: string): string {
  if (host.includes('woa')) return 'https://lanhu.woa.com'
  return 'https://lanhuapp.com'
}

function authHeaders(options: LanhuClientOptions): Record<string, string> {
  const cookie = options.cookie.trim()
  if (!cookie) throw new Error('需要蓝湖 Cookie（从浏览器登录态复制）')
  const headers: Record<string, string> = {
    Cookie: cookie,
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  }
  const auth = options.authorization?.trim()
  if (auth) headers.Authorization = auth
  return headers
}

async function lanhuFetch(
  url: string,
  options: LanhuClientOptions & { method?: string; body?: string },
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch
  const attempts = Math.max(1, options.attempts ?? 3)
  const timeoutMs = options.timeoutMs ?? 20000
  const headers = authHeaders(options)

  let lastCause: unknown
  let firedOwnTimeout = false
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) await sleep(Math.min(4000, 500 * 2 ** (i - 1)))
    firedOwnTimeout = false
    const controller = new AbortController()
    const timer = setTimeout(() => {
      firedOwnTimeout = true
      controller.abort()
    }, timeoutMs)
    try {
      const response = await fetchImpl(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body,
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (response.status === 401) {
        throw new Error('蓝湖认证失败（401），请重新从浏览器复制 Cookie')
      }
      if (response.status === 403) {
        throw new Error('蓝湖权限不足（403），请确认账号可访问该项目')
      }
      if (response.status === 429 && i < attempts - 1) continue
      if (response.status >= 500 && i < attempts - 1) continue
      return response
    } catch (error) {
      clearTimeout(timer)
      if (error instanceof Error && /蓝湖认证|蓝湖权限/.test(error.message)) throw error
      lastCause = (error as { cause?: unknown })?.cause ?? error
    }
  }

  const code =
    lastCause && typeof lastCause === 'object'
      ? String((lastCause as { code?: string }).code ?? '')
      : ''
  const isTimeout = firedOwnTimeout || /TIMEOUT/i.test(code)
  throw new Error(
    isTimeout
      ? `连接蓝湖超时（已重试 ${attempts} 次）。请检查网络后重试。`
      : `无法连接蓝湖服务（已重试 ${attempts} 次，${code || 'network error'}）。请检查网络后重试。`,
  )
}

function okBusinessCode(code: unknown): boolean {
  return code === '00000' || code === 0 || code === '0'
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`蓝湖返回非 JSON（HTTP ${response.status}）`)
  }
}

interface RawLayer {
  id?: string
  name?: string
  type?: string
  width?: number
  height?: number
  left?: number
  top?: number
  position_x?: number
  position_y?: number
  isVisible?: boolean
  visible?: boolean
  opacity?: number
  layers?: RawLayer[]
  children?: RawLayer[]
  fills?: Array<Record<string, unknown>>
  borders?: Array<Record<string, unknown>>
  shadows?: Array<Record<string, unknown>>
  shadow?: Record<string, unknown> | Array<Record<string, unknown>>
  blur?: number
  layerBlur?: number
  gaussianBlur?: number
  backdropBlur?: number
  backgroundBlur?: number
  position?: string
  layoutPositioning?: string
  rowGap?: number
  columnGap?: number
  blendMode?: string
  blend?: string
  /** Rotation in degrees when present on the annotation. */
  rotation?: number
  rotate?: number
  angle?: number
  scaleX?: number
  scaleY?: number
  skewX?: number
  skewY?: number
  zIndex?: number
  z_index?: number
  strokeAlign?: string
  /** Clip overflowing children when present. */
  clipsContent?: boolean
  overflow?: string
  isMask?: boolean
  maskType?: string
  clipPath?: string
  aspectRatio?: number
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  maxLines?: number
  textTruncation?: string
  textOverflow?: string
  textAlignVertical?: string
  flexDirection?: string
  layoutMode?: string
  alignItems?: string
  justifyContent?: string
  sizingHorizontal?: string
  sizingVertical?: string
  layoutSizingHorizontal?: string
  layoutSizingVertical?: string
  flexWrap?: string
  layoutWrap?: string
  alignContent?: string
  counterAxisAlignContent?: string
  order?: number | string
  gridTemplate?: string
  alignSelf?: string
  layoutAlign?: string
  flexGrow?: number | string
  layoutGrow?: number | string
  flexShrink?: number | string
  transformOrigin?: string
  visibility?: string
  display?: string
  whiteSpace?: string
  wordBreak?: string
  wordSpacing?: number | string
  textIndent?: number | string
  paragraphIndent?: number | string
  direction?: string
  writingMode?: string
  filter?: string
  outline?: string
  perspective?: number | string
  rotateX?: number | string
  rotateY?: number | string
  borderStyle?: string
  strokeStyle?: string
  strokeDashes?: number[]
  strokeCap?: string
  strokeJoin?: string
  paragraphSpacing?: number
  lineCount?: number
  text?: {
    text?: string
    value?: string
    content?: string
    style?: { content?: string; text?: string }
  }
  textInfo?: {
    text?: string
    content?: string
    value?: string
    size?: number
    fontSize?: number
    color?: unknown
  }
  characters?: string
  content?: string
  style?: Record<string, unknown>
  frame?: {
    left?: number
    top?: number
    x?: number
    y?: number
    width?: number
    height?: number
  }
  realFrame?: {
    left?: number
    top?: number
    x?: number
    y?: number
    width?: number
    height?: number
  }
  ddsType?: string
  ddsImage?: { imageUrl?: string; size?: { width?: number; height?: number } }
  image?: { imageUrl?: string; size?: { width?: number; height?: number } }
  symbolID?: string
  points?: unknown
  shapeType?: string
}

function resolveLayerId(node: RawLayer, path: string): string {
  if (typeof node.id === 'string' && node.id) return node.id
  return `lh-${path}`
}

function childLayers(raw: RawLayer): RawLayer[] {
  if (Array.isArray(raw.layers) && raw.layers.length) return raw.layers
  if (Array.isArray(raw.children) && raw.children.length) return raw.children
  return []
}

function extractTextContent(raw: RawLayer): string | undefined {
  const candidates: unknown[] = [
    raw.text?.text,
    raw.text?.value,
    raw.text?.content,
    raw.text?.style?.content,
    raw.text?.style?.text,
    raw.textInfo?.text,
    raw.textInfo?.content,
    raw.textInfo?.value,
    raw.characters,
    raw.content,
    raw.style?.text,
    raw.style?.content,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return undefined
}

function isShapeName(name: string): boolean {
  return /^(矩形|圆形|椭圆|路径|形状|编组|蒙版|Border|Cap|Vector|Group|Rectangle|Oval|Path)/.test(
    name || '',
  )
}

function mapKind(raw: RawLayer): DesignNodeKind {
  const typeHint = String(raw.type || raw.ddsType || '').toLowerCase()
  if (typeHint.includes('text') || extractTextContent(raw) !== undefined) return 'text'
  if (raw.text?.text !== undefined) return 'text'
  if (
    (raw.style?.fontSize || raw.textInfo?.size || raw.textInfo?.fontSize) &&
    !isShapeName(raw.name || '')
  ) {
    return 'text'
  }
  if (typeHint.includes('artboard') || raw.ddsType === 'artboard-group') return 'frame'
  if (typeHint.includes('image') || raw.fills?.some((f) => f.type === 'image')) return 'image'
  if (childLayers(raw).length) return 'group'
  if (raw.symbolID || typeHint.includes('symbol') || typeHint.includes('component')) return 'frame'
  if (raw.points || raw.shapeType || typeHint.includes('shape')) return 'shape'
  if (isShapeName(raw.name || '')) return 'shape'
  return 'view'
}

function layerGeometry(
  raw: RawLayer,
  scale: number,
): { relX: number; relY: number; width: number; height: number } {
  const frame = raw.frame || raw.realFrame
  const rawW = Number(raw.width ?? frame?.width ?? 0) || 0
  const rawH = Number(raw.height ?? frame?.height ?? 0) || 0
  const rawX = Number(raw.left ?? raw.position_x ?? frame?.left ?? frame?.x ?? 0) || 0
  const rawY = Number(raw.top ?? raw.position_y ?? frame?.top ?? frame?.y ?? 0) || 0
  // Many Lanhu dumps already store logical @1x sizes while ArtboardScale=2 refers
  // to export bitmaps. If both edges look like phone logical sizes, don't divide.
  const looksLogical =
    scale > 1 &&
    rawW > 0 &&
    rawH > 0 &&
    rawW <= 600 &&
    rawH <= 1400 &&
    (rawW >= 280 || rawH >= 400)
  const s = looksLogical ? 1 : scale
  return {
    relX: to1x(rawX, s),
    relY: to1x(rawY, s),
    width: to1x(rawW, s),
    height: to1x(rawH, s),
  }
}

function parseGradient(fill: Record<string, unknown>): DesignGradient | undefined {
  if (fill.type !== 'gradient') return undefined
  const stopsRaw = Array.isArray(fill.stops) ? fill.stops : []
  const stops = stopsRaw
    .map((s) => {
      const stop = s as { color?: unknown; position?: number }
      const color = parseColor(stop.color)
      if (!color) return null
      return { color, position: typeof stop.position === 'number' ? stop.position : 0 }
    })
    .filter((s): s is { color: HexColor; position: number } => !!s)
  if (!stops.length) return undefined
  const from = (fill.from as { x?: number; y?: number }) || {}
  const to = (fill.to as { x?: number; y?: number }) || {}
  const dx = (to.x ?? 1) - (from.x ?? 0)
  const dy = (to.y ?? 1) - (from.y ?? 0)
  // CSS angle: 0deg = bottom→top; convert from vector.
  const cssAngle = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360)
  return {
    type: fill.gradientType === 'radial' ? 'radial' : 'linear',
    cssAngle,
    stops,
  }
}

function convertStyle(raw: RawLayer, scale: number, kind: DesignNodeKind): DesignStyle {
  const style: DesignStyle = {}
  const fills = Array.isArray(raw.fills) ? raw.fills : []
  const solid = fills.find((f) => f.type === 'color' && f.color)
  const gradientFill = fills.find((f) => f.type === 'gradient')
  const imageFill = fills.find((f) => f.type === 'image')

  // Full fill stack (top→bottom) for multi-paint layers.
  const fillStack: DesignFill[] = []
  for (const f of fills) {
    const t = String(f.type ?? '').toLowerCase()
    if ((t === 'color' || t === 'solid') && f.color) {
      const color = withFillOpacity(parseColor(f.color), f.opacity ?? f.alpha)
      if (color) {
        fillStack.push({
          type: 'solid',
          color,
          ...(typeof f.opacity === 'number' && f.opacity < 1
            ? { opacity: Math.round(Number(f.opacity) * 100) / 100 }
            : typeof f.alpha === 'number' && Number(f.alpha) < 1
              ? { opacity: Math.round(Number(f.alpha) * 100) / 100 }
              : {}),
        })
      }
    } else if (t === 'gradient') {
      const g = parseGradient(f)
      if (g) fillStack.push({ type: 'gradient', gradient: g })
    } else if (t === 'image') {
      const url = (f.image as { url?: string } | undefined)?.url
      fillStack.push({
        type: 'image',
        imageFit: 'cover',
        ...(url ? { imageRef: url } : {}),
      })
    }
  }
  if (fillStack.length) style.fills = fillStack

  if (kind === 'text') {
    const typo = raw.style || {}
    const textInfo = raw.textInfo || {}
    if (typo.textColor) style.color = parseColor(typo.textColor)
    else if (textInfo.color) style.color = parseColor(textInfo.color)
    else if (solid?.color) {
      style.color = withFillOpacity(parseColor(solid.color), solid.opacity ?? solid.alpha)
    }
    if (typeof typo.fontFamily === 'string') style.fontFamily = typo.fontFamily
    const fontSize = Number(typo.fontSize ?? textInfo.size ?? textInfo.fontSize)
    if (Number.isFinite(fontSize) && fontSize > 0) {
      style.fontSize = round(to1x(fontSize, scale))
    }
    if (typeof typo.fontWeight === 'number') style.fontWeight = typo.fontWeight
    if (typeof typo.lineHeight === 'number') style.lineHeight = round(to1x(typo.lineHeight, scale))
    if (typeof typo.letterSpacing === 'number' || typeof typo.kerning === 'number') {
      style.letterSpacing = round(to1x(Number(typo.letterSpacing ?? typo.kerning ?? 0), scale))
    }
    const para = Number(typo.paragraphSpacing ?? typo.paragraphGap ?? raw.paragraphSpacing)
    if (Number.isFinite(para) && para > 0) style.paragraphSpacing = round(to1x(para, scale))
    const align = String(typo.textAlign || 'left')
    if (align === 'center' || align === 'right' || align === 'justify') style.textAlign = align
    else style.textAlign = 'left'
    const valign = String(
      typo.textAlignVertical ?? typo.verticalAlign ?? raw.textAlignVertical ?? '',
    ).toLowerCase()
    if (valign === 'center' || valign === 'middle') style.textAlignVertical = 'center'
    else if (valign === 'bottom') style.textAlignVertical = 'bottom'
    else if (valign === 'top') style.textAlignVertical = 'top'
    if (
      typo.italic === true ||
      /italic|oblique/i.test(String(typo.fontStyle ?? typo.style ?? ''))
    ) {
      style.fontStyle = 'italic'
    }
    const decoRaw = String(
      typo.textDecoration ?? typo.decoration ?? typo.underline ?? '',
    ).toLowerCase()
    if (/underline/.test(decoRaw) && /line-?through|strike/.test(decoRaw)) {
      style.textDecoration = 'underline line-through'
    } else if (/underline/.test(decoRaw) || typo.underline === true) {
      style.textDecoration = 'underline'
    } else if (/line-?through|strike/.test(decoRaw)) {
      style.textDecoration = 'line-through'
    }
    const caseRaw = String(
      typo.textTransform ?? typo.textCase ?? typo.case ?? '',
    ).toLowerCase()
    if (caseRaw === 'uppercase' || caseRaw === 'upper') style.textTransform = 'uppercase'
    else if (caseRaw === 'lowercase' || caseRaw === 'lower') style.textTransform = 'lowercase'
    else if (caseRaw === 'capitalize' || caseRaw === 'title') style.textTransform = 'capitalize'
  } else {
    const gradient = gradientFill ? parseGradient(gradientFill) : undefined
    if (gradient) style.gradient = gradient
    else if (solid?.color) {
      style.backgroundColor = withFillOpacity(
        parseColor(solid.color),
        solid.opacity ?? solid.alpha,
      )
    }
    if (imageFill) {
      style.imageFit = 'cover'
      const url = (imageFill.image as { url?: string } | undefined)?.url
      if (url) style.imageRef = url
    }
  }

  const borders = Array.isArray(raw.borders) ? raw.borders : []
  const border = borders[0]
  if (border) {
    const thickness = Number(border.thickness ?? border.width ?? 0)
    if (thickness > 0) {
      style.borderWidth = round(to1x(thickness, scale))
      style.borderColor = parseColor(border.color)
    }
    const radius = Number(border.radius ?? 0)
    if (radius > 0) style.cornerRadius = round(to1x(radius, scale))
    // Per-side thickness when present (Sketch / 蓝湖 occasional export).
    const sides = ['top', 'right', 'bottom', 'left'] as const
    for (const side of sides) {
      const key = `thickness${side[0]!.toUpperCase()}${side.slice(1)}`
      const v = Number(border[key] ?? border[`${side}Width`] ?? border[side])
      if (Number.isFinite(v) && v > 0) {
        const w = round(to1x(v, scale))
        if (side === 'top') style.borderTopWidth = w
        else if (side === 'right') style.borderRightWidth = w
        else if (side === 'bottom') style.borderBottomWidth = w
        else style.borderLeftWidth = w
      }
    }
    const alignRaw = String(
      border.position ?? border.align ?? border.strokeAlign ?? raw.strokeAlign ?? '',
    )
      .trim()
      .toLowerCase()
    if (alignRaw === 'inside' || alignRaw === 'inner') style.strokeAlign = 'inside'
    else if (alignRaw === 'outside' || alignRaw === 'outer') style.strokeAlign = 'outside'
    else if (alignRaw === 'center' || alignRaw === 'centre' || alignRaw === 'middle') {
      style.strokeAlign = 'center'
    }
  }

  const shadowList: Array<Record<string, unknown>> = Array.isArray(raw.shadows)
    ? raw.shadows
    : Array.isArray(raw.shadow)
      ? raw.shadow
      : raw.shadow
        ? [raw.shadow]
        : []
  let bestOuter: DesignShadow | undefined
  let bestInner: DesignShadow | undefined
  const stack: DesignShadow[] = []
  for (const sh of shadowList) {
    if (sh.isEnabled === false || sh.enabled === false) continue
    const blur = Number(sh.blur ?? sh.blurRadius ?? sh.radius ?? 0)
    if (!Number.isFinite(blur) || blur < 0) continue
    const offsetX = Number(
      sh.offsetX ?? sh.x ?? (sh.offset as { x?: number } | undefined)?.x ?? 0,
    )
    const offsetY = Number(
      sh.offsetY ?? sh.y ?? (sh.offset as { y?: number } | undefined)?.y ?? 0,
    )
    const spreadRaw = Number(sh.spread ?? sh.spreadRadius)
    const color =
      parseColor(sh.color) ??
      (typeof sh.color === 'string' && sh.color.startsWith('#')
        ? (sh.color.toLowerCase() as HexColor)
        : undefined)
    const inset =
      sh.inset === true ||
      sh.inner === true ||
      /inner|inset/i.test(String(sh.type ?? sh.style ?? ''))
    const candidate: DesignShadow = {
      offsetX: round(to1x(Number.isFinite(offsetX) ? offsetX : 0, scale)),
      offsetY: round(to1x(Number.isFinite(offsetY) ? offsetY : 0, scale)),
      blur: round(to1x(blur, scale)),
      ...(Number.isFinite(spreadRaw) ? { spread: round(to1x(spreadRaw, scale)) } : {}),
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
  if (stack.length) style.shadows = stack
  if (bestOuter) {
    style.shadow = bestOuter
    style.elevation = bestOuter.blur
  }
  if (bestInner) {
    style.insetShadow = bestInner
    style.innerShadow = bestInner.blur
  }

  const layerBlur = Number(
    raw.blur ?? raw.layerBlur ?? (raw.style?.blur as number | undefined) ?? raw.gaussianBlur,
  )
  if (Number.isFinite(layerBlur) && layerBlur > 0) {
    style.blur = round(to1x(layerBlur, scale))
  }
  const backdropBlur = Number(
    raw.backdropBlur ??
      raw.backgroundBlur ??
      (raw.style?.backdropBlur as number | undefined) ??
      (raw.style?.backgroundBlur as number | undefined),
  )
  if (Number.isFinite(backdropBlur) && backdropBlur > 0) {
    style.backdropBlur = round(to1x(backdropBlur, scale))
  }
  const posRaw = String(
    raw.position ?? raw.layoutPositioning ?? raw.style?.position ?? '',
  ).toLowerCase()
  if (
    posRaw === 'absolute' ||
    posRaw === 'relative' ||
    posRaw === 'fixed' ||
    posRaw === 'sticky'
  ) {
    style.position = posRaw
  }
  const rowGap = Number(raw.rowGap ?? raw.style?.rowGap)
  if (Number.isFinite(rowGap) && rowGap > 0) {
    style.rowGap = round(to1x(rowGap, scale))
    if (style.gap === undefined) style.gap = style.rowGap
  }
  const columnGap = Number(raw.columnGap ?? raw.style?.columnGap)
  if (Number.isFinite(columnGap) && columnGap > 0) {
    style.columnGap = round(to1x(columnGap, scale))
    if (style.gap === undefined) style.gap = style.columnGap
  }

  const blendRaw = String(
    raw.blendMode ?? raw.blend ?? raw.style?.blendMode ?? raw.style?.mixBlendMode ?? '',
  ).trim()
  if (blendRaw) {
    const bm = normalizeLanhuBlendMode(blendRaw)
    if (bm) style.blendMode = bm
  }

  const opacity = typeof raw.opacity === 'number' ? raw.opacity : Number(raw.style?.opacity)
  if (Number.isFinite(opacity) && opacity < 1) style.opacity = Math.round(opacity * 100) / 100

  const rotRaw = Number(
    raw.rotation ??
      raw.rotate ??
      raw.angle ??
      raw.style?.rotation ??
      raw.style?.rotate ??
      raw.style?.angle,
  )
  if (Number.isFinite(rotRaw) && Math.abs(rotRaw) > 0.5) {
    // Heuristic: |r| ≤ 2π+ε → radians (plugin-style); else degrees.
    const deg =
      Math.abs(rotRaw) <= Math.PI * 2 + 0.01 ? (rotRaw * 180) / Math.PI : rotRaw
    if (Math.abs(deg) > 0.5) style.rotation = Math.round(deg * 100) / 100
  }

  const sx = Number(raw.scaleX ?? raw.style?.scaleX ?? (raw as { scale?: number }).scale)
  const sy = Number(raw.scaleY ?? raw.style?.scaleY ?? (raw as { scale?: number }).scale)
  if (Number.isFinite(sx) && Math.abs(sx - 1) > 0.02) {
    style.scaleX = Math.round(sx * 1000) / 1000
  }
  if (Number.isFinite(sy) && Math.abs(sy - 1) > 0.02) {
    style.scaleY = Math.round(sy * 1000) / 1000
  }

  const skewX = Number(raw.skewX ?? raw.style?.skewX)
  const skewY = Number(raw.skewY ?? raw.style?.skewY)
  if (Number.isFinite(skewX) && Math.abs(skewX) > 0.5) {
    style.skewX = Math.round(skewX * 100) / 100
  }
  if (Number.isFinite(skewY) && Math.abs(skewY) > 0.5) {
    style.skewY = Math.round(skewY * 100) / 100
  }

  const zRaw = Number(raw.zIndex ?? raw.z_index ?? raw.style?.zIndex ?? raw.style?.z_index)
  if (Number.isFinite(zRaw) && zRaw !== 0) style.zIndex = Math.round(zRaw)

  if (
    raw.clipsContent === true ||
    /^(hidden|clip)$/i.test(String(raw.overflow ?? raw.style?.overflow ?? ''))
  ) {
    style.overflow = 'hidden'
  } else if (/^(scroll|auto)$/i.test(String(raw.overflow ?? raw.style?.overflow ?? ''))) {
    style.overflow = 'scroll'
  }

  if (raw.isMask === true) {
    const mt = String(raw.maskType ?? raw.style?.maskType ?? '').toLowerCase()
    if (mt.includes('lumin')) style.clipPath = 'mask:luminance'
    else if (mt.includes('vector')) style.clipPath = 'mask:vector'
    else style.clipPath = 'mask:alpha'
    if (!style.overflow) style.overflow = 'hidden'
  }
  const clipRaw = String(raw.clipPath ?? raw.style?.clipPath ?? '').trim().toLowerCase()
  if (clipRaw && !style.clipPath) {
    if (clipRaw.startsWith('circle')) style.clipPath = 'circle'
    else if (clipRaw.startsWith('ellipse')) style.clipPath = 'ellipse'
    else if (clipRaw.startsWith('inset')) style.clipPath = 'inset'
    else if (clipRaw.startsWith('polygon')) style.clipPath = 'polygon'
    else if (clipRaw.startsWith('path')) style.clipPath = 'path'
    else style.clipPath = 'custom'
  }

  const ar = Number(raw.aspectRatio ?? raw.style?.aspectRatio)
  if (Number.isFinite(ar) && ar > 0) style.aspectRatio = Math.round(ar * 1000) / 1000

  const minW = Number(raw.minWidth ?? raw.style?.minWidth)
  const maxW = Number(raw.maxWidth ?? raw.style?.maxWidth)
  const minH = Number(raw.minHeight ?? raw.style?.minHeight)
  const maxH = Number(raw.maxHeight ?? raw.style?.maxHeight)
  if (Number.isFinite(minW) && minW > 0) style.minWidth = round(to1x(minW, scale))
  if (Number.isFinite(maxW) && maxW > 0) style.maxWidth = round(to1x(maxW, scale))
  if (Number.isFinite(minH) && minH > 0) style.minHeight = round(to1x(minH, scale))
  if (Number.isFinite(maxH) && maxH > 0) style.maxHeight = round(to1x(maxH, scale))

  const flexDir = String(raw.flexDirection ?? raw.layoutMode ?? raw.style?.flexDirection ?? '')
    .toLowerCase()
  if (flexDir === 'row' || flexDir === 'horizontal') style.flexDirection = 'row'
  else if (flexDir === 'column' || flexDir === 'vertical') style.flexDirection = 'column'
  const alignItems = String(raw.alignItems ?? raw.style?.alignItems ?? '').toLowerCase()
  if (alignItems === 'center') style.alignItems = 'center'
  else if (alignItems === 'flex-end' || alignItems === 'end') style.alignItems = 'end'
  else if (alignItems === 'flex-start' || alignItems === 'start') style.alignItems = 'start'
  else if (alignItems === 'stretch') style.alignItems = 'stretch'
  const justify = String(raw.justifyContent ?? raw.style?.justifyContent ?? '').toLowerCase()
  if (justify === 'center') style.justifyContent = 'center'
  else if (justify === 'flex-end' || justify === 'end') style.justifyContent = 'end'
  else if (justify === 'flex-start' || justify === 'start') style.justifyContent = 'start'
  else if (justify === 'space-between') style.justifyContent = 'space-between'
  else if (justify === 'space-around') style.justifyContent = 'space-around'
  else if (justify === 'space-evenly') style.justifyContent = 'space-evenly'

  const sizeH = String(raw.sizingHorizontal ?? raw.layoutSizingHorizontal ?? raw.style?.sizingHorizontal ?? '')
    .toLowerCase()
  if (sizeH === 'fixed' || sizeH === 'hug' || sizeH === 'fill') style.sizingHorizontal = sizeH
  const sizeV = String(raw.sizingVertical ?? raw.layoutSizingVertical ?? raw.style?.sizingVertical ?? '')
    .toLowerCase()
  if (sizeV === 'fixed' || sizeV === 'hug' || sizeV === 'fill') style.sizingVertical = sizeV

  const flexWrap = String(raw.flexWrap ?? raw.layoutWrap ?? raw.style?.flexWrap ?? '').toLowerCase()
  if (flexWrap === 'wrap' || flexWrap === 'wrap-reverse') style.flexWrap = 'wrap'
  else if (flexWrap === 'nowrap') style.flexWrap = 'nowrap'
  const alignContent = String(
    raw.alignContent ?? raw.counterAxisAlignContent ?? raw.style?.alignContent ?? '',
  ).toLowerCase()
  if (alignContent === 'center') style.alignContent = 'center'
  else if (alignContent === 'flex-end' || alignContent === 'end') style.alignContent = 'end'
  else if (alignContent === 'flex-start' || alignContent === 'start') style.alignContent = 'start'
  else if (alignContent === 'stretch' || alignContent === 'auto') style.alignContent = 'stretch'
  else if (alignContent === 'space-between' || alignContent === 'space_between') {
    style.alignContent = 'space-between'
  } else if (alignContent === 'space-around' || alignContent === 'space_around') {
    style.alignContent = 'space-around'
  } else if (alignContent === 'space-evenly' || alignContent === 'space_evenly') {
    style.alignContent = 'space-evenly'
  }
  const orderRaw = raw.order ?? raw.style?.order
  if (typeof orderRaw === 'number' && orderRaw !== 0) style.order = orderRaw
  else if (typeof orderRaw === 'string') {
    const n = Number.parseInt(orderRaw, 10)
    if (Number.isFinite(n) && n !== 0) style.order = n
  }
  const gridTemplate = String(
    raw.gridTemplate ?? raw.style?.gridTemplate ?? '',
  ).trim()
  if (gridTemplate) style.gridTemplate = gridTemplate.toLowerCase()
  const alignSelf = String(raw.alignSelf ?? raw.layoutAlign ?? raw.style?.alignSelf ?? '').toLowerCase()
  if (alignSelf === 'center') style.alignSelf = 'center'
  else if (alignSelf === 'flex-end' || alignSelf === 'end' || alignSelf === 'max') style.alignSelf = 'end'
  else if (alignSelf === 'flex-start' || alignSelf === 'start' || alignSelf === 'min') {
    style.alignSelf = 'start'
  } else if (alignSelf === 'stretch') style.alignSelf = 'stretch'
  const flexGrowRaw = raw.flexGrow ?? raw.layoutGrow ?? raw.style?.flexGrow
  if (typeof flexGrowRaw === 'number' && flexGrowRaw > 0) {
    style.flexGrow = Math.round(flexGrowRaw * 1000) / 1000
  } else if (typeof flexGrowRaw === 'string') {
    const n = Number.parseFloat(flexGrowRaw)
    if (Number.isFinite(n) && n > 0) style.flexGrow = Math.round(n * 1000) / 1000
  }
  const flexShrinkRaw = raw.flexShrink ?? raw.style?.flexShrink
  if (typeof flexShrinkRaw === 'number' && Number.isFinite(flexShrinkRaw)) {
    style.flexShrink = Math.round(flexShrinkRaw * 1000) / 1000
  } else if (typeof flexShrinkRaw === 'string') {
    const n = Number.parseFloat(flexShrinkRaw)
    if (Number.isFinite(n)) style.flexShrink = Math.round(n * 1000) / 1000
  }

  const transformOrigin = String(
    raw.transformOrigin ?? raw.style?.transformOrigin ?? '',
  ).trim()
  if (transformOrigin) style.transformOrigin = transformOrigin
  const visibility = String(raw.visibility ?? raw.style?.visibility ?? '').toLowerCase()
  if (visibility === 'hidden' || visibility === 'collapse' || visibility === 'visible') {
    style.visibility = visibility
  }
  const display = String(raw.display ?? raw.style?.display ?? '').toLowerCase()
  if (
    display === 'none' ||
    display === 'flex' ||
    display === 'inline-flex' ||
    display === 'grid' ||
    display === 'block' ||
    display === 'inline'
  ) {
    style.display = display
  }
  const whiteSpace = String(raw.whiteSpace ?? raw.style?.whiteSpace ?? '').toLowerCase()
  if (
    whiteSpace === 'nowrap' ||
    whiteSpace === 'pre' ||
    whiteSpace === 'pre-wrap' ||
    whiteSpace === 'pre-line' ||
    whiteSpace === 'normal'
  ) {
    style.whiteSpace = whiteSpace
  }
  const wordBreak = String(raw.wordBreak ?? raw.style?.wordBreak ?? '').toLowerCase()
  if (
    wordBreak === 'break-all' ||
    wordBreak === 'keep-all' ||
    wordBreak === 'break-word' ||
    wordBreak === 'normal'
  ) {
    style.wordBreak = wordBreak
  }
  const wordSpacingRaw = raw.wordSpacing ?? raw.style?.wordSpacing
  if (typeof wordSpacingRaw === 'number' && Math.abs(wordSpacingRaw) > 0.01) {
    style.wordSpacing = round(to1x(wordSpacingRaw, scale))
  } else if (typeof wordSpacingRaw === 'string') {
    const n = Number.parseFloat(wordSpacingRaw)
    if (Number.isFinite(n) && Math.abs(n) > 0.01) style.wordSpacing = round(to1x(n, scale))
  }
  const textIndentRaw =
    raw.textIndent ?? raw.paragraphIndent ?? raw.style?.textIndent ?? raw.style?.paragraphIndent
  if (typeof textIndentRaw === 'number' && Math.abs(textIndentRaw) > 0.5) {
    style.textIndent = round(to1x(textIndentRaw, scale))
  } else   if (typeof textIndentRaw === 'string') {
    const n = Number.parseFloat(textIndentRaw)
    if (Number.isFinite(n) && Math.abs(n) > 0.5) style.textIndent = round(to1x(n, scale))
  }
  const direction = String(raw.direction ?? raw.style?.direction ?? '').toLowerCase()
  if (direction === 'rtl' || direction === 'ltr') style.direction = direction
  const writingMode = String(raw.writingMode ?? raw.style?.writingMode ?? '').toLowerCase()
  if (
    writingMode === 'vertical-rl' ||
    writingMode === 'vertical-lr' ||
    writingMode === 'horizontal-tb'
  ) {
    style.writingMode = writingMode
  }
  const filterRaw = String(raw.filter ?? raw.style?.filter ?? '').trim()
  if (filterRaw) style.filter = filterRaw.toLowerCase()
  const outlineRaw = String(raw.outline ?? raw.style?.outline ?? '').trim()
  if (outlineRaw) style.outline = outlineRaw.toLowerCase()
  const persp = Number(raw.perspective ?? raw.style?.perspective)
  if (Number.isFinite(persp) && persp > 0) style.perspective = round(to1x(persp, scale))
  const rotX = Number(raw.rotateX ?? raw.style?.rotateX)
  if (Number.isFinite(rotX) && Math.abs(rotX) > 0.5) style.rotateX = Math.round(rotX * 100) / 100
  const rotY = Number(raw.rotateY ?? raw.style?.rotateY)
  if (Number.isFinite(rotY) && Math.abs(rotY) > 0.5) style.rotateY = Math.round(rotY * 100) / 100

  const borderStyleRaw = String(
    raw.borderStyle ?? raw.style?.borderStyle ?? raw.strokeStyle ?? '',
  ).toLowerCase()
  if (borderStyleRaw === 'dashed' || borderStyleRaw === 'dotted' || borderStyleRaw === 'solid') {
    style.borderStyle = borderStyleRaw
  }
  const dashArr = Array.isArray(raw.strokeDashes)
    ? raw.strokeDashes
    : Array.isArray(raw.style?.strokeDashes)
      ? (raw.style!.strokeDashes as unknown[])
      : []
  if (!style.borderStyle && dashArr.length) {
    const nums = dashArr.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    if (nums.length) {
      const max = Math.max(...nums)
      const min = Math.min(...nums)
      style.borderStyle = max <= 2 && max / Math.max(min, 0.01) <= 1.5 ? 'dotted' : 'dashed'
      style.strokeDashArray = nums.map((n) => String(Math.round(n * 100) / 100)).join(',')
    }
  } else if (dashArr.length && !style.strokeDashArray) {
    const nums = dashArr.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    if (nums.length) {
      style.strokeDashArray = nums.map((n) => String(Math.round(n * 100) / 100)).join(',')
    }
  }
  const strokeCap = String(raw.strokeCap ?? raw.style?.strokeCap ?? '').toLowerCase()
  if (strokeCap === 'round' || strokeCap === 'square' || strokeCap === 'butt') {
    style.strokeCap = strokeCap
  }
  const strokeJoin = String(raw.strokeJoin ?? raw.style?.strokeJoin ?? '').toLowerCase()
  if (strokeJoin === 'round' || strokeJoin === 'bevel' || strokeJoin === 'miter') {
    style.strokeJoin = strokeJoin
  }

  const maxLines = Number(
    raw.maxLines ?? raw.style?.maxLines ?? raw.style?.numberOfLines ?? raw.lineCount,
  )
  if (Number.isFinite(maxLines) && maxLines > 0) {
    style.maxLines = Math.round(maxLines)
  }
  const truncRaw = String(
    raw.textTruncation ??
      raw.textOverflow ??
      raw.style?.textOverflow ??
      raw.style?.textTruncation ??
      '',
  ).toLowerCase()
  if (/ellipsis|ending|truncate/.test(truncRaw)) {
    style.textOverflow = 'ellipsis'
    if (style.maxLines === undefined) style.maxLines = 1
  } else if (/clip/.test(truncRaw)) {
    style.textOverflow = 'clip'
  }

  return style
}

function convertLayer(
  raw: RawLayer,
  scale: number,
  path: string,
  parentAbsX: number,
  parentAbsY: number,
): DesignNode | null {
  if (raw.isVisible === false || raw.visible === false) return null

  const geom = layerGeometry(raw, scale)
  const absX = parentAbsX + geom.relX
  const absY = parentAbsY + geom.relY
  const extracted = extractTextContent(raw)
  let kind = mapKind(raw)
  if (extracted) kind = 'text'
  const id = resolveLayerId(raw, path)
  const children = childLayers(raw)
    .map((child, i) => convertLayer(child, scale, `${path}_${i}`, absX, absY))
    .filter((n): n is DesignNode => !!n)

  const text =
    kind === 'text'
      ? extracted || String(raw.name || '').trim() || undefined
      : extracted || undefined

  // Prefer DDS export image as imageRef when present.
  const style = convertStyle(raw, scale, kind)
  const dds = raw.ddsImage || raw.image
  if (dds?.imageUrl && !style.imageRef) {
    style.imageRef = dds.imageUrl
    if (!style.imageFit) style.imageFit = 'cover'
  }
  if (kind === 'text' && text) {
    const fs = typeof style.fontSize === 'number' ? style.fontSize : 14
    const metricOpts = {
      letterSpacing:
        typeof style.letterSpacing === 'number' ? style.letterSpacing : undefined,
      fontWeight: style.fontWeight,
    }
    style.textAdvanceWidth = estimateTextAdvance(text, fs, metricOpts)
    const maxW =
      typeof style.maxWidth === 'number'
        ? style.maxWidth
        : Number.isFinite(geom.width)
          ? round(geom.width)
          : undefined
    const lh = typeof style.lineHeight === 'number' ? style.lineHeight : undefined
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

  return {
    id,
    name: raw.name || id,
    kind,
    text,
    box: {
      x: round(absX),
      y: round(absY),
      width: round(geom.width),
      height: round(geom.height),
    },
    style,
    children,
  }
}

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

/** Convert raw lanhu annotation JSON (json_url payload) into a DesignDoc. */
export function normalizeLanhuAnnotation(
  raw: Record<string, unknown>,
  options?: { name?: string; imageId?: string; scale?: number },
): DesignDoc {
  const artboardScale = Number(raw.ArtboardScale ?? raw.scale ?? 2) || 2
  const infoRaw =
    (Array.isArray(raw.info) && raw.info) ||
    (Array.isArray(raw.artboards) && raw.artboards) ||
    (Array.isArray(raw.layers) && raw.layers) ||
    []
  const info = infoRaw as RawLayer[]
  if (!info.length) throw new Error('蓝湖标注数据为空（无画板）')

  const boardArea = (ab: RawLayer): number => {
    const frame = ab.frame || ab.realFrame
    const w = Number(ab.width ?? frame?.width ?? 0) || 0
    const h = Number(ab.height ?? frame?.height ?? 0) || 0
    return w * h
  }

  // Prefer the largest artboard as the screen root (common multi-board dumps).
  const boards = info
    .map((ab, i) => ({ ab, i, area: boardArea(ab) }))
    .sort((a, b) => b.area - a.area)

  const primary = boards[0]!
  const rootLayer = convertLayer(primary.ab, artboardScale, String(primary.i), 0, 0)
  if (!rootLayer) throw new Error('蓝湖画板不可见或无法解析')

  // Attach sibling artboards as children when they nest geometrically inside
  // the primary board; otherwise keep only the primary screen.
  for (const board of boards.slice(1)) {
    const child = convertLayer(board.ab, artboardScale, String(board.i), 0, 0)
    if (!child) continue
    const inside =
      (child.box.x ?? 0) >= (rootLayer.box.x ?? 0) - 1 &&
      (child.box.y ?? 0) >= (rootLayer.box.y ?? 0) - 1 &&
      (child.box.x ?? 0) + (Number(child.box.width) || 0) <=
        (rootLayer.box.x ?? 0) + (Number(rootLayer.box.width) || 0) + 1 &&
      (child.box.y ?? 0) + (Number(child.box.height) || 0) <=
        (rootLayer.box.y ?? 0) + (Number(rootLayer.box.height) || 0) + 1
    if (inside) rootLayer.children.push(child)
  }

  if (options?.name) rootLayer.name = options.name
  if (options?.imageId) rootLayer.id = options.imageId

  const scale = options?.scale ?? 1
  const doc: DesignDoc = { root: rootLayer, scale, source: 'lanhu' }
  rebaseTreeToRootOrigin(doc.root)
  return doc
}

async function getDesignDetail(
  parts: Pick<LanhuUrlParts, 'projectId' | 'imageId' | 'host'>,
  options: LanhuClientOptions,
): Promise<Record<string, unknown>> {
  if (!parts.imageId) throw new Error('蓝湖链接缺少 image_id')
  const url = `${apiBase(parts.host)}/api/project/image?pid=${encodeURIComponent(parts.projectId)}&image_id=${encodeURIComponent(parts.imageId)}`
  const response = await lanhuFetch(url, options)
  if (!response.ok) {
    throw new Error(`蓝湖设计稿详情失败：${response.status} ${response.statusText}`)
  }
  const payload = await readJson(response)
  if (!okBusinessCode(payload.code) && payload.code !== undefined) {
    throw new Error(`蓝湖设计稿详情失败：${String(payload.msg ?? payload.message ?? payload.code)}`)
  }
  return (payload.result ?? payload.data ?? {}) as Record<string, unknown>
}

async function fetchAnnotationJson(
  detail: Record<string, unknown>,
  options: LanhuClientOptions,
): Promise<Record<string, unknown>> {
  const versions = Array.isArray(detail.versions) ? detail.versions : []
  const latest = versions[0] as { json_url?: string } | undefined
  const jsonUrl = latest?.json_url
  if (!jsonUrl || typeof jsonUrl !== 'string') {
    throw new Error('该蓝湖设计稿没有标注数据（json_url），请确认已生成标注')
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(jsonUrl)
  } catch {
    throw new Error('蓝湖标注 URL 无效')
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error('蓝湖标注 URL 协议不安全')
  }
  const response = await lanhuFetch(jsonUrl, options)
  if (!response.ok) {
    throw new Error(`拉取蓝湖标注失败：${response.status} ${response.statusText}`)
  }
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('蓝湖标注 JSON 解析失败')
  }
}

/**
 * Fetch one Lanhu design (by URL or projectId+imageId) and normalise to DesignDoc.
 */
export async function fetchLanhuDoc(
  urlOrParts: string | LanhuUrlParts,
  options: LanhuClientOptions,
): Promise<DesignDoc> {
  const parts = typeof urlOrParts === 'string' ? parseLanhuUrl(urlOrParts) : urlOrParts
  if (!parts.imageId) {
    throw new Error('蓝湖链接缺少 image_id。请打开具体设计稿页面后复制链接，或先扫描整个项目。')
  }
  const detail = await getDesignDetail(parts, options)
  const raw = await fetchAnnotationJson(detail, options)
  return normalizeLanhuAnnotation(raw, {
    name: typeof detail.name === 'string' ? detail.name : undefined,
    imageId: parts.imageId,
    scale: options.scale ?? 1,
  })
}

function pickPreviewUrl(row: Record<string, unknown>): string {
  const candidates: unknown[] = [
    row.url,
    row.cover,
    row.preview,
    row.preview_url,
    row.sketch_url,
    row.image_url,
    (row.dds as { url?: string; imageUrl?: string } | undefined)?.url,
    (row.dds as { url?: string; imageUrl?: string } | undefined)?.imageUrl,
    (row.versions as Array<{ url?: string }> | undefined)?.[0]?.url,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//i.test(c.trim())) return c.trim()
  }
  return ''
}

/** Cover / preview image URL for a design. */
export async function fetchLanhuPreviewUrl(
  urlOrParts: string | LanhuUrlParts,
  options: LanhuClientOptions,
): Promise<string> {
  const parts = typeof urlOrParts === 'string' ? parseLanhuUrl(urlOrParts) : urlOrParts
  const detail = await getDesignDetail(parts, options)
  const url = pickPreviewUrl(detail)
  if (!url) throw new Error('蓝湖设计稿没有预览图')
  return url
}

/**
 * Download a Lanhu cover/preview with auth cookies and return a data URL so the
 * sidebar `<img>` does not depend on CDN hotlink / cookie-less browser fetches.
 */
export async function fetchLanhuPreviewDataUrl(
  urlOrParts: string | LanhuUrlParts,
  options: LanhuClientOptions,
): Promise<string> {
  const remote = await fetchLanhuPreviewUrl(urlOrParts, options)
  const cookie = options.cookie.trim()
  if (!cookie) throw new Error('需要蓝湖 Cookie（从浏览器登录态复制）')
  const headers: Record<string, string> = {
    Cookie: cookie,
    Accept: 'image/*,*/*;q=0.8',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  }
  const auth = options.authorization?.trim()
  if (auth) headers.Authorization = auth
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(remote, { headers, redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`蓝湖预览图下载失败：${response.status} ${response.statusText}`)
  }
  const contentType = response.headers.get('content-type') || 'image/png'
  const buf = Buffer.from(await response.arrayBuffer())
  // Full-page compare rasters can exceed thumbnail size; keep aligned with proxy-image.
  if (buf.byteLength > 8 * 1024 * 1024) throw new Error('蓝湖预览图过大')
  const mime = contentType.startsWith('image/') ? contentType.split(';')[0]! : 'image/png'
  return `data:${mime};base64,${buf.toString('base64')}`
}

/**
 * List every design image in a Lanhu project (whole-project scan).
 */
export async function fetchLanhuProjectInventory(
  urlOrParts: string | LanhuUrlParts,
  options: LanhuClientOptions,
): Promise<LanhuProjectInventory> {
  const parts = typeof urlOrParts === 'string' ? parseLanhuUrl(urlOrParts) : urlOrParts
  const teamId = encodeURIComponent(parts.tenantId || '0')
  const url =
    `${apiBase(parts.host)}/api/project/images?project_id=${encodeURIComponent(parts.projectId)}` +
    `&team_id=${teamId}&dds_status=1&position=1&show_cb_src=1&comment=1`
  const response = await lanhuFetch(url, options)
  if (!response.ok) {
    throw new Error(`蓝湖项目设计稿列表失败：${response.status} ${response.statusText}`)
  }
  const payload = await readJson(response)
  if (!okBusinessCode(payload.code) && payload.code !== undefined) {
    throw new Error(`蓝湖项目设计稿列表失败：${String(payload.msg ?? payload.message ?? payload.code)}`)
  }
  const data = (payload.data ?? {}) as Record<string, unknown>
  const images = (data.images ?? data.list ?? data) as unknown
  const list = Array.isArray(images) ? images : []

  const pages: LanhuPageSummary[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = String(row.image_id ?? row.id ?? '').trim()
    if (!id) continue
    const name = String(row.name ?? row.image_name ?? id)
    const width = Number(row.width ?? row.w ?? 390) || 390
    const height = Number(row.height ?? row.h ?? 844) || 844
    const previewUrl = pickPreviewUrl(row) || undefined
    pages.push({
      id,
      name,
      type: 'ARTBOARD',
      box: { x: 0, y: 0, width, height },
      previewUrl,
    })
  }

  return {
    projectId: parts.projectId,
    tenantId: parts.tenantId,
    pages,
  }
}

/**
 * Batch preview URLs for project images. Uses inventory cover when present;
 * otherwise fetches detail per id (best-effort, skips failures).
 */
export async function fetchLanhuPreviewUrls(
  urlOrParts: string | LanhuUrlParts,
  imageIds: string[],
  options: LanhuClientOptions,
): Promise<Record<string, string>> {
  const parts = typeof urlOrParts === 'string' ? parseLanhuUrl(urlOrParts) : urlOrParts
  const ids = [...new Set(imageIds.map((id) => id.trim()).filter(Boolean))]
  const out: Record<string, string> = {}
  if (!ids.length) return out

  let inventoryPages: LanhuPageSummary[] = []
  try {
    const inv = await fetchLanhuProjectInventory(parts, options)
    inventoryPages = inv.pages
  } catch {
    inventoryPages = []
  }
  const fromInv = new Map(
    inventoryPages.filter((p) => p.previewUrl).map((p) => [p.id, p.previewUrl!]),
  )

  for (const id of ids) {
    const hit = fromInv.get(id)
    if (hit) {
      out[id] = hit
      continue
    }
    try {
      out[id] = await fetchLanhuPreviewUrl({ ...parts, imageId: id }, options)
    } catch {
      // Layer ids from multi-board expand are not image ids — fall back to URL image.
      if (parts.imageId && parts.imageId !== id) {
        try {
          out[id] = await fetchLanhuPreviewUrl(parts, options)
        } catch {
          /* skip */
        }
      }
    }
  }
  return out
}

/**
 * Like {@link fetchLanhuPreviewUrls}, but returns data URLs fetched with the
 * caller's Cookie so the UI can render without CDN cookie/hotlink issues.
 */
export async function fetchLanhuPreviewDataUrls(
  urlOrParts: string | LanhuUrlParts,
  imageIds: string[],
  options: LanhuClientOptions,
): Promise<Record<string, string>> {
  const parts = typeof urlOrParts === 'string' ? parseLanhuUrl(urlOrParts) : urlOrParts
  const remote = await fetchLanhuPreviewUrls(parts, imageIds, options)
  const out: Record<string, string> = {}
  const entries = Object.entries(remote)
  const CONCURRENCY = 4
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const chunk = entries.slice(i, i + CONCURRENCY)
    await Promise.all(
      chunk.map(async ([id, url]) => {
        try {
          const response = await lanhuFetch(url, options)
          if (!response.ok) return
          const contentType = response.headers.get('content-type') || 'image/png'
          const buf = Buffer.from(await response.arrayBuffer())
          if (buf.byteLength > 6 * 1024 * 1024) return
          const mime = contentType.startsWith('image/')
            ? contentType.split(';')[0]!
            : 'image/png'
          out[id] = `data:${mime};base64,${buf.toString('base64')}`
        } catch {
          /* keep missing */
        }
      }),
    )
  }
  return out
}

/** Build a lanhu detail URL for a specific image within the same project. */
export function buildLanhuImageUrl(baseUrl: string, imageId: string): string {
  const parts = parseLanhuUrl(baseUrl)
  const host = parts.host.includes('woa') ? 'lanhu.woa.com' : 'lanhuapp.com'
  const q = new URLSearchParams({
    tid: parts.tenantId || '0',
    pid: parts.projectId,
    project_id: parts.projectId,
    image_id: imageId,
  })
  return `https://${host}/web/#/item/project/detailDetach?${q.toString()}`
}
