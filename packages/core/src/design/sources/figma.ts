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

export interface FigmaClientOptions {
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

  const fetchImpl = options.fetchImpl ?? fetch
  const url = `${FIGMA_API}/files/${fileKey}/nodes?ids=${encodeURIComponent(resolvedNodeId)}`
  const response = await fetchImpl(url, {
    headers: { 'X-Figma-Token': options.token },
  })
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
