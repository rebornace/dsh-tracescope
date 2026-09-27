/**
 * Figma source: fetch nodes over the official REST API and normalise the node
 * tree into the vendor-neutral {@link DesignDoc}.
 */
import type {
  DesignDoc,
  DesignNode,
  DesignNodeKind,
  DesignStyle,
  HexColor,
} from '../types.js'

const FIGMA_API = 'https://api.figma.com/v1'

export interface FigmaTransportOptions {
  /** Total attempts per request, including the first one (default 3). */
  attempts?: number
  /** Per-attempt connect timeout in ms (default 20000). */
  timeoutMs?: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) await sleep(Math.min(4000, 500 * 2 ** (i - 1)))
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
      continue
    }
    clearTimeout(timer)

    // Transient server error -> retry; anything else (incl. all 4xx) is final.
    if (response.status < 500 || i === attempts - 1) return response
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
interface FigmaPaint {
  type: string
  visible?: boolean
  color?: FigmaColor
  opacity?: number
}
interface FigmaTypeStyle {
  fontFamily?: string
  fontSize?: number
  fontWeight?: number | string
  lineHeightPx?: number
  letterSpacing?: number
}
interface FigmaBBox {
  x: number
  y: number
  width: number
  height: number
}
interface FigmaNode {
  id: string
  name: string
  type: string
  visible?: boolean
  children?: FigmaNode[]
  absoluteBoundingBox?: FigmaBBox
  fills?: FigmaPaint[]
  opacity?: number
  cornerRadius?: number
  characters?: string
  style?: FigmaTypeStyle
  layoutMode?: string
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

function firstSolidFill(node: FigmaNode): FigmaPaint | undefined {
  return (node.fills ?? []).find(
    (f) => f.visible !== false && f.type === 'SOLID' && f.color,
  )
}

function hasImageFill(node: FigmaNode): boolean {
  return (node.fills ?? []).some(
    (f) => f.visible !== false && (f.type === 'IMAGE' || f.type === 'GRADIENT_IMAGE'),
  )
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
  // For text nodes a SOLID fill is the glyph color, not a background.
  if (solid?.color && node.type !== 'TEXT') {
    style.backgroundColor = figmaColorToHex(solid.color, solid.opacity ?? 1)
  }
  if (typeof node.cornerRadius === 'number') style.cornerRadius = round(node.cornerRadius, scale)
  if (typeof node.opacity === 'number') style.opacity = Math.round(node.opacity * 100) / 100

  if (node.layoutMode === 'VERTICAL' || node.layoutMode === 'HORIZONTAL') {
    if (typeof node.paddingTop === 'number') style.paddingTop = round(node.paddingTop, scale)
    if (typeof node.paddingRight === 'number') style.paddingRight = round(node.paddingRight, scale)
    if (typeof node.paddingBottom === 'number') style.paddingBottom = round(node.paddingBottom, scale)
    if (typeof node.paddingLeft === 'number') style.paddingLeft = round(node.paddingLeft, scale)
  }

  if (node.type === 'TEXT' && node.style) {
    const s = node.style
    if (s.fontFamily) style.fontFamily = s.fontFamily
    if (typeof s.fontSize === 'number') style.fontSize = round(s.fontSize, scale)
    if (s.fontWeight !== undefined) {
      const weight = typeof s.fontWeight === 'number' ? s.fontWeight : Number.parseInt(s.fontWeight, 10)
      if (Number.isFinite(weight)) style.fontWeight = weight
    }
    if (typeof s.lineHeightPx === 'number' && Number.isFinite(s.lineHeightPx)) {
      style.lineHeight = round(s.lineHeightPx, scale)
    }
    if (typeof s.letterSpacing === 'number') style.letterSpacing = round(s.letterSpacing, scale)
    if (solid?.color) style.color = figmaColorToHex(solid.color, solid.opacity ?? 1)
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
  return { root: convertNode(root, scale), scale, source: 'figma' }
}

/** Parse a Figma URL and return the file key plus node id (normalised to `a:b`). */
export function parseFigmaUrl(input: string): { fileKey: string; nodeId: string } {
  const url = new URL(input)
  const parts = url.pathname.split('/').filter(Boolean)
  // /design/<fileKey>/... or /file/<fileKey>/...
  const keyIndex = parts.findIndex((p) => p === 'design' || p === 'file')
  const fileKey = keyIndex >= 0 ? parts[keyIndex + 1] : ''
  if (!fileKey) throw new Error('无法从链接解析 Figma file key')
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
