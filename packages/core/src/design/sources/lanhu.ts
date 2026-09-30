/**
 * Lanhu (蓝湖) source: fetch design annotations over the web API and normalise
 * them into the vendor-neutral {@link DesignDoc}.
 *
 * Auth uses a browser Cookie (and optional Authorization header) — lanhu has no
 * public personal-access-token like Figma. Users copy Cookie from DevTools.
 */
import type {
  DesignDoc,
  DesignGradient,
  DesignNode,
  DesignNodeKind,
  DesignStyle,
  HexColor,
} from '../types.js'

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
  fills?: Array<Record<string, unknown>>
  borders?: Array<Record<string, unknown>>
  text?: { text?: string }
  style?: Record<string, unknown>
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

function mapKind(raw: RawLayer): DesignNodeKind {
  if (raw.text?.text !== undefined) return 'text'
  if (raw.style?.fontSize && !/^(矩形|圆形|椭圆|路径|形状|编组|蒙版)/.test(raw.name || '')) {
    return 'text'
  }
  if (raw.ddsType === 'artboard-group') return 'frame'
  if (raw.fills?.some((f) => f.type === 'image')) return 'image'
  if (raw.layers?.length) return 'group'
  if (raw.symbolID) return 'frame'
  if (raw.points || raw.shapeType) return 'shape'
  if (/^(矩形|圆形|椭圆|路径|形状|Vector|Rectangle)/.test(raw.name || '')) return 'shape'
  return 'view'
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

  if (kind === 'text') {
    const typo = raw.style || {}
    if (typo.textColor) style.color = parseColor(typo.textColor)
    else if (solid?.color) style.color = parseColor(solid.color)
    if (typeof typo.fontFamily === 'string') style.fontFamily = typo.fontFamily
    if (typeof typo.fontSize === 'number') style.fontSize = round(to1x(typo.fontSize, scale))
    if (typeof typo.fontWeight === 'number') style.fontWeight = typo.fontWeight
    if (typeof typo.lineHeight === 'number') style.lineHeight = round(to1x(typo.lineHeight, scale))
    if (typeof typo.letterSpacing === 'number' || typeof typo.kerning === 'number') {
      style.letterSpacing = round(to1x(Number(typo.letterSpacing ?? typo.kerning ?? 0), scale))
    }
    const align = String(typo.textAlign || 'left')
    if (align === 'center' || align === 'right' || align === 'justify') style.textAlign = align
    else style.textAlign = 'left'
  } else {
    const gradient = gradientFill ? parseGradient(gradientFill) : undefined
    if (gradient) style.gradient = gradient
    else if (solid?.color) style.backgroundColor = parseColor(solid.color)
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
  }

  const opacity = typeof raw.opacity === 'number' ? raw.opacity : Number(raw.style?.opacity)
  if (Number.isFinite(opacity) && opacity < 1) style.opacity = Math.round(opacity * 100) / 100

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

  const relX = to1x(raw.left ?? raw.position_x ?? 0, scale)
  const relY = to1x(raw.top ?? raw.position_y ?? 0, scale)
  const absX = parentAbsX + relX
  const absY = parentAbsY + relY
  const kind = mapKind(raw)
  const id = resolveLayerId(raw, path)
  const children = (raw.layers ?? [])
    .map((child, i) => convertLayer(child, scale, `${path}_${i}`, absX, absY))
    .filter((n): n is DesignNode => !!n)

  const width = round(to1x(raw.width || 0, scale))
  const height = round(to1x(raw.height || 0, scale))
  const text =
    kind === 'text'
      ? String(raw.text?.text ?? raw.style?.text ?? raw.name ?? '').trim() || undefined
      : undefined

  // Prefer DDS export image as imageRef when present.
  const style = convertStyle(raw, scale, kind)
  const dds = raw.ddsImage || raw.image
  if (dds?.imageUrl && !style.imageRef) {
    style.imageRef = dds.imageUrl
    if (!style.imageFit) style.imageFit = 'cover'
  }

  return {
    id,
    name: raw.name || id,
    kind,
    text,
    box: { x: round(absX), y: round(absY), width, height },
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
  const info = Array.isArray(raw.info) ? (raw.info as RawLayer[]) : []
  if (!info.length) throw new Error('蓝湖标注数据为空（无画板）')

  // Prefer the largest artboard as the screen root (common multi-board dumps).
  const boards = info
    .map((ab, i) => ({ ab, i, area: (ab.width || 0) * (ab.height || 0) }))
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

/** Cover / preview image URL for a design. */
export async function fetchLanhuPreviewUrl(
  urlOrParts: string | LanhuUrlParts,
  options: LanhuClientOptions,
): Promise<string> {
  const parts = typeof urlOrParts === 'string' ? parseLanhuUrl(urlOrParts) : urlOrParts
  const detail = await getDesignDetail(parts, options)
  const url = typeof detail.url === 'string' ? detail.url : ''
  if (!url) throw new Error('蓝湖设计稿没有预览图')
  return url
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
    const previewUrl =
      typeof row.url === 'string'
        ? row.url
        : typeof row.cover === 'string'
          ? row.cover
          : typeof (row.dds as { url?: string } | undefined)?.url === 'string'
            ? (row.dds as { url: string }).url
            : undefined
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
      // skip missing previews
    }
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
