/**
 * Visual (design-driven) workflow service.
 *
 * Resolves the repository to a readable checkout, fetches the design doc and
 * either locates the matching code pages or compares a chosen page. This is
 * where the new "design screen -> find the page -> compare" flow lives.
 */
import {
  ensureReadableCheckout,
  fetchFigmaDoc,
  isGitRemoteUrl,
  locatePagesForDesign,
  parseGitAuth,
  resolveGitRepo,
  type DesignDoc,
  discoverAllPages,
  designFingerprint,
  renderFigmaNode,
  getPlatformAdapter,
  compareVisualDocs,
  fetchFigmaFileInventory,
  fetchFigmaDocsBatch,
  mapInventoryPages,
  loadAndroidProjectResources,
  buildAndroidRenderContext,
  renderAndroidLayout,
  renderAndroidItemLayout,
  hifiTreeToDesignDoc,
  type DesignPageMapping,
  type FigmaCanvasSummary,
  type HifiRenderNode,
  buildVisualChatPrompt,
  buildCodeVisualPrompt,
  buildPageRematchPrompt,
  formatStaticDiffSummary,
  compareDesignWithPage,
  type VisualChatDiff,
  analyzeLayoutDependencies,
  formatDependencyManifest,
  parseFigmaFileKey,
  parseFigmaUrl,
  expandFocusedDesignPages,
  renderFigmaNodesBatch,
  fetchFigmaImageFills,
  isLanhuUrl,
  parseLanhuUrl,
  buildLanhuImageUrl,
  fetchLanhuDoc,
  fetchLanhuPreviewUrl,
  fetchLanhuPreviewDataUrls,
  fetchLanhuProjectInventory,
  visualScanKey,
  visualHifiKey,
  visualRematchKey,
  loadVisualScan,
  saveVisualScan,
  loadVisualHifi,
  saveVisualHifi,
  loadVisualFindings,
  loadVisualRematch,
  visualFindingsKey,
  fingerprintFiles,
  gitExec,
  pruneDesignerAnnotations,
  analyzeAdapterBindings,
  walkFiles,
  parseXml,
  isDesignerAnnotationText,
  isDesignerAnnotationNode,
  heuristicCompare,
} from '@rebornace/tracescope-core'
import type {
  DesignNode,
  VisualCompareResult,
  AdapterBindings,
  AndroidRenderContext,
  RenderedAndroidItem,
  CodePage,
} from '@rebornace/tracescope-core'
import type { XmlElement } from '@rebornace/tracescope-core'
import type { Context } from '../dsh-shims.js'
import { completeWithHostLlm, extractJsonBlock } from './llm-helper.js'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { resolveRequestGitAuth } from './request-auth.js'
import { createVisualJob } from '../visual-jobs.js'

export interface VisualRepoContext {
  repoInput: string
  checkoutPath: string
}

/**
 * Resolve the code location to a readable directory.
 *
 * Design match/compare only reads source files, so:
 *  - an existing local folder is used directly, even without a Git checkout
 *    (e.g. an exported source snapshot);
 *  - a remote URL goes through Git resolution, which clones/fetches and attaches
 *    a worktree to bare clones;
 *  - a local path that does NOT exist is a hard, explicit error — we must not
 *    fall back to spawning git (which may be missing in the packaged app,
 *    producing a misleading "spawn git ENOENT").
 */
export async function resolveVisualRepo(
  repoInput: string,
  body: Record<string, unknown>,
): Promise<VisualRepoContext> {
  const trimmed = repoInput.trim()
  const direct = path.resolve(trimmed)

  let st: Awaited<ReturnType<typeof stat>> | null = null
  let statCode: string | undefined
  try {
    st = await stat(direct)
  } catch (error) {
    statCode = (error as { code?: string }).code
  }

  // Existing local directory -> read directly (no Git needed).
  if (st) {
    if (!st.isDirectory()) {
      throw new Error(`路径不是文件夹：${direct}（请点「浏览…」选择代码文件夹）`)
    }
    return { repoInput: trimmed, checkoutPath: direct }
  }

  // Local path missing -> only clone via Git when it is actually a remote URL.
  if (!isGitRemoteUrl(trimmed)) {
    const suffix = statCode === 'ENOENT' ? '本地文件夹不存在：' : '无法访问本地路径：'
    throw new Error(`${suffix}${direct}（请点「浏览…」重新选择代码文件夹）`)
  }

  const auth = await resolveRequestGitAuth(parseGitAuth(body.auth), repoInput)
  const resolved = await resolveGitRepo(trimmed, { fetch: true, auth })
  const checkout = await ensureReadableCheckout(resolved.repoPath, auth)
  return { repoInput: trimmed, checkoutPath: checkout.checkoutPath }
}

/** Resolve design URL + credential from the request body (Figma or Lanhu). */
function designConnection(body: Record<string, unknown>): {
  url: string
  credential: string
  authorization?: string
  source: 'figma' | 'lanhu'
} {
  const url = String(body.figmaUrl ?? body.designUrl ?? body.lanhuUrl ?? '').trim()
  const credential = String(
    body.figmaToken ?? body.designToken ?? body.lanhuCookie ?? body.cookie ?? '',
  ).trim()
  const authorization = String(body.lanhuAuthorization ?? body.authorization ?? '').trim()
  if (!url || !credential) throw new Error('需要设计稿链接和访问凭证（Figma Token 或蓝湖 Cookie）')
  if (isLanhuUrl(url)) {
    return { url, credential, authorization: authorization || undefined, source: 'lanhu' }
  }
  return { url, credential, source: 'figma' }
}

/** Fetch the design doc from Figma or Lanhu. */
export async function loadDesign(body: Record<string, unknown>): Promise<DesignDoc> {
  const conn = designConnection(body)
  if (conn.source === 'lanhu') {
    return await fetchLanhuDoc(conn.url, {
      cookie: conn.credential,
      authorization: conn.authorization,
    })
  }
  return await fetchFigmaDoc(conn.url, undefined, { token: conn.credential })
}

/** Stable cache key for a design connection (Figma file key or lanhu:projectId). */
function designCacheFileKey(url: string): string {
  if (isLanhuUrl(url)) {
    try {
      return `lanhu:${parseLanhuUrl(url).projectId}`
    } catch {
      return `lanhu:${url.slice(0, 80)}`
    }
  }
  return parseFigmaFileKey(url)
}

/** Point a design URL at a specific page/image id. */
function designUrlForNode(url: string, nodeId: string): string {
  if (isLanhuUrl(url)) return buildLanhuImageUrl(url, nodeId)
  try {
    const u = new URL(url)
    u.searchParams.set('node-id', nodeId.replace(/:/g, '-'))
    return u.toString()
  } catch {
    return url
  }
}

/** Official design raster (Figma render or Lanhu cover). */
async function renderDesignRaster(
  body: Record<string, unknown>,
  nodeId?: string,
): Promise<{ url: string } | undefined> {
  try {
    const conn = designConnection(body)
    if (conn.source === 'lanhu') {
      const parts = parseLanhuUrl(conn.url)
      const imageId = (nodeId || parts.imageId || '').trim()
      if (!imageId) return undefined
      const url = await fetchLanhuPreviewUrl(
        { ...parts, imageId },
        { cookie: conn.credential, authorization: conn.authorization },
      )
      return { url }
    }
    return await renderFigmaNode(conn.url, nodeId, {
      token: conn.credential,
      scale: 2,
    })
  } catch {
    return undefined
  }
}

/**
 * A design node carries no locatable content when it has neither text nor any
 * child controls (e.g. the user copied a link to a bare rectangle/shape layer
 * instead of the actual screen frame). Matching such a node can only ever
 * produce structural-coincidence noise, so we flag it up front.
 */
function describeEmptyDesign(design: DesignDoc): { empty: boolean; nodeName: string } {
  const fp = designFingerprint(design)
  return { empty: fp.texts.length === 0 && fp.controlCount === 0, nodeName: design.root.name }
}

export interface MatchDesignResult {
  candidates: Array<{
    adapterId: string
    platform: string
    kindLabel: string
    relativePath: string
    precise: boolean
    score: number
    reasons: string[]
  }>
  /** True when the linked node has no texts/controls (e.g. a shape layer). */
  designEmpty?: boolean
  /** Name of the linked design node, shown when it is empty. */
  designNodeName?: string
}

/** Locate candidate code pages for the design screen, best first. */
export async function matchDesignToRepo(
  body: Record<string, unknown>,
): Promise<MatchDesignResult> {
  const repoInput = String(body.repoPath ?? body.repo ?? '').trim()
  if (!repoInput) throw new Error('缺少 repoPath')
  const ctx = await resolveVisualRepo(repoInput, body)
  const design = await loadDesign(body)
  const { empty, nodeName } = describeEmptyDesign(design)

  // An empty node (shape/rectangle) can never match a real screen. Skip the
  // noisy scoring pass and report the precise cause so the user picks the
  // actual frame instead of being told "no page found in the repository".
  if (empty) {
    return { candidates: [], designEmpty: true, designNodeName: nodeName }
  }

  const matches = await locatePagesForDesign(design, ctx.checkoutPath)
  return {
    candidates: matches.map((m) => ({
      adapterId: m.page.adapterId,
      platform: m.page.platform,
      kindLabel: m.page.kindLabel,
      relativePath: m.page.relativePath,
      precise: m.page.precise,
      score: m.score,
      reasons: m.reasons,
    })),
  }
}

/** JSON-safe node carrying only what the visual renderer needs. */
export interface WireNode {
  id: string
  name: string
  kind: string
  text?: string
  box: { x?: number; y?: number; width?: number; height?: number }
  style: {
    backgroundColor?: string
    color?: string
    fontSize?: number
    fontWeight?: number
    cornerRadius?: number
  }
  children: WireNode[]
}

function serializeNode(node: DesignNode): WireNode {
  const { backgroundColor, color, fontSize, fontWeight, cornerRadius } = node.style
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    text: node.text,
    box: {
      x: typeof node.box.x === 'number' ? node.box.x : undefined,
      y: typeof node.box.y === 'number' ? node.box.y : undefined,
      width: typeof node.box.width === 'number' ? node.box.width : undefined,
      height: typeof node.box.height === 'number' ? node.box.height : undefined,
    },
    style: {
      backgroundColor: typeof backgroundColor === 'string' ? backgroundColor : undefined,
      color: typeof color === 'string' ? color : undefined,
      fontSize: typeof fontSize === 'number' ? fontSize : undefined,
      fontWeight: typeof fontWeight === 'number' ? fontWeight : undefined,
      cornerRadius: typeof cornerRadius === 'number' ? cornerRadius : undefined,
    },
    children: node.children.map(serializeNode),
  }
}

export interface CompareOutcome {
  page: {
    adapterId: string
    kindLabel: string
    relativePath: string
    precise: boolean
  }
  precise: boolean
  /** exact when toDesignDoc ran; heuristic for locator-only adapters. */
  compareMode?: 'exact' | 'heuristic'
  reason?: string
  result?: VisualCompareResult
  /** Temporary Figma render of the design frame. */
  designImageUrl?: string
  /** Absolute frame box, used to convert node coords for image overlay. */
  frameBox?: { x: number; y: number; width: number; height: number }
  /** Design tree (absolute coords) keyed for diff -> box lookup. */
  designTree?: WireNode
  /** Code tree when an exact compare produced one. */
  codeTree?: WireNode
}

/** Compare the design against a specific matched page. */
export async function compareDesignAgainstPage(
  body: Record<string, unknown>,
): Promise<CompareOutcome> {
  const repoInput = String(body.repoPath ?? body.repo ?? '').trim()
  const adapterId = String(body.adapterId ?? '')
  const relativePath = String(body.relativePath ?? '')
  if (!repoInput || !adapterId || !relativePath) {
    throw new Error('需要 repoPath、adapterId、relativePath')
  }
  const ctx = await resolveVisualRepo(repoInput, body)
  const design = await loadDesign(body)

  // Re-discover pages to obtain the selected page object.
  const pages = await discoverAllPages(ctx.checkoutPath)
  const page = pages.find(
    (p) => p.adapterId === adapterId && p.relativePath === relativePath,
  )
  if (!page) throw new Error('所选页面已不存在，请重新匹配')

  const pageMeta = {
    adapterId: page.adapterId,
    kindLabel: page.kindLabel,
    relativePath: page.relativePath,
    precise: page.precise,
  }

  // Locator-only implementations get L2 heuristic diffs instead of a hard stop.
  if (!page.precise || !getPlatformAdapter(adapterId)?.toDesignDoc) {
    const heuristic = await heuristicCompare(design, page)
    let designImageUrl: string | undefined
    try {
      designImageUrl = (await renderDesignRaster(body))?.url
    } catch {
      designImageUrl = undefined
    }
    const { x, y, width, height } = design.root.box
    const frameBox =
      typeof x === 'number' &&
      typeof y === 'number' &&
      typeof width === 'number' &&
      typeof height === 'number'
        ? { x, y, width, height }
        : undefined
    return {
      page: pageMeta,
      precise: false,
      compareMode: 'heuristic' as const,
      result: heuristic,
      designImageUrl,
      frameBox,
      designTree: serializeNode(design.root),
      reason: `${page.kindLabel} 已完成启发式静态对比；属性级几何对比可后续加深。`,
    }
  }

  // Build the code-side normalized tree and run the deterministic diff once.
  const adapter = getPlatformAdapter(adapterId)
  if (!adapter?.toDesignDoc) {
    return { page: pageMeta, precise: false, reason: '该页面缺少可用的对比适配器。' }
  }
  const codeDoc = await adapter.toDesignDoc(page)
  const result = compareVisualDocs(design, codeDoc)

  // Render the design frame to a real image so differences can be overlaid on
  // the exact visual. Best effort: a render failure should not discard the
  // structural diff, the panel falls back to the block view.
  let designImageUrl: string | undefined
  try {
    designImageUrl = (await renderDesignRaster(body))?.url
  } catch {
    designImageUrl = undefined
  }

  const { x, y, width, height } = design.root.box
  const frameBox =
    typeof x === 'number' &&
    typeof y === 'number' &&
    typeof width === 'number' &&
    typeof height === 'number'
      ? { x, y, width, height }
      : undefined

  return {
    page: pageMeta,
    precise: true,
    result,
    designImageUrl,
    frameBox,
    designTree: serializeNode(design.root),
    codeTree: serializeNode(codeDoc.root),
  }
}

// ---------------------------------------------------------------------------
// Whole-file page mapping overview
// ---------------------------------------------------------------------------

export interface MatchAllResult {
  /** All code layout files, for manual search when auto match is weak/none. */
  codeFiles: Array<{
    adapterId: string
    kindLabel: string
    relativePath: string
    precise: boolean
  }>
  canvases: Array<{
    id: string
    name: string
    componentLibrary: boolean
  }>
  pages: Array<{
    canvasId: string
    canvasName: string
    mapping: {
      designId: string
      designName: string
      kind: string
      status: DesignPageMapping['status']
      candidates: DesignPageMapping['candidates']
    }
    /** Temporary Figma-rendered thumbnail of the design page. */
    thumbnailUrl?: string
    /** Design page aspect (width/height), used to size the thumbnail. */
    aspect: number
  }>
  totals: { pages: number; matched: number; weak: number; none: number }
  /** True when this overview was loaded from the on-disk cache (not rescanned). */
  fromCache?: boolean
  /** ISO time the result was (re)generated, shown so the user knows its age. */
  savedAt?: string
  /**
   * `node` = URL 含 node-id，只定位该页（原高级单节点）；
   * `file` = 扫描整个设计文件。
   */
  scope?: 'node' | 'file'
  /** When scope is node, the focused design id. */
  focusNodeId?: string
}

/**
 * On-demand design-page thumbnail. Renders a single frame via Figma / Lanhu and
 * returns its temporary image URL. Called lazily per card (one frame each), so
 * thumbnail loading never blocks or stalls the whole-file scan.
 */
export async function getDesignPageThumbnail(body: Record<string, unknown>): Promise<{ url?: string }> {
  const nodeId = String(body.nodeId ?? '').trim()
  if (!nodeId) throw new Error('需要 nodeId')
  const batch = await getDesignPageThumbnails({
    ...body,
    nodeIds: [nodeId],
  })
  const normalized = nodeId.replace(/-/g, ':')
  return { url: batch.urls[nodeId] || batch.urls[normalized] }
}

/** In-memory cache of design CDN thumbnail URLs (valid for hours–days). */
const thumbUrlCache = new Map<string, { url: string; at: number }>()
const THUMB_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const THUMB_BATCH_CHUNK = 20
const THUMB_SCALE = 0.5
const THUMB_FORMAT: 'jpg' = 'jpg'

function thumbCacheKey(fileKey: string, nodeId: string): string {
  return `${fileKey}|${nodeId}|${THUMB_FORMAT}|${THUMB_SCALE}`
}

function readThumbCache(fileKey: string, nodeId: string): string | undefined {
  const key = thumbCacheKey(fileKey, nodeId)
  const hit = thumbUrlCache.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > THUMB_CACHE_TTL_MS) {
    thumbUrlCache.delete(key)
    return undefined
  }
  return hit.url
}

function writeThumbCache(fileKey: string, nodeId: string, url: string): void {
  thumbUrlCache.set(thumbCacheKey(fileKey, nodeId), { url, at: Date.now() })
}

/**
 * Batch-render design-page thumbnails (Figma `/images` or Lanhu cover URLs).
 * Uses low-scale JPG + server memory cache so a grid of cards is far faster
 * than one render request per card.
 */
export async function getDesignPageThumbnails(
  body: Record<string, unknown>,
): Promise<{ urls: Record<string, string> }> {
  const conn = designConnection(body)
  const rawIds = Array.isArray(body.nodeIds)
    ? body.nodeIds
    : typeof body.nodeId === 'string'
      ? [body.nodeId]
      : []
  const nodeIds = [...new Set(rawIds.map((id) => String(id ?? '').trim()).filter(Boolean))]
  if (nodeIds.length === 0) throw new Error('需要 nodeIds')

  if (conn.source === 'lanhu') {
    const parts = parseLanhuUrl(conn.url)
    const fileKey = `lanhu:${parts.projectId}`
    const urls: Record<string, string> = {}
    const missing: string[] = []
    for (const id of nodeIds) {
      const cached = readThumbCache(fileKey, id)
      if (cached) urls[id] = cached
      else missing.push(id)
    }
    if (missing.length) {
      const map = await fetchLanhuPreviewDataUrls(parts, missing, {
        cookie: conn.credential,
        authorization: conn.authorization,
      })
      for (const [id, url] of Object.entries(map)) {
        writeThumbCache(fileKey, id, url)
        urls[id] = url
      }
    }
    return { urls }
  }

  const figmaIds = [
    ...new Set(nodeIds.map((id) => id.replace(/-/g, ':'))),
  ]
  const fileKey = parseFigmaFileKey(conn.url)
  const urls: Record<string, string> = {}
  const missing: string[] = []
  for (const id of figmaIds) {
    const cached = readThumbCache(fileKey, id)
    if (cached) urls[id] = cached
    else missing.push(id)
  }

  for (let i = 0; i < missing.length; i += THUMB_BATCH_CHUNK) {
    const chunk = missing.slice(i, i + THUMB_BATCH_CHUNK)
    const map = await renderFigmaNodesBatch(fileKey, chunk, {
      token: conn.credential,
      scale: THUMB_SCALE,
      format: THUMB_FORMAT,
      timeoutMs: 45000,
      attempts: 5,
    })
    for (const [id, url] of map) {
      const normalized = id.replace(/-/g, ':')
      writeThumbCache(fileKey, normalized, url)
      urls[normalized] = url
      urls[id] = url
    }
  }

  return { urls }
}

/** Persisted AI rematch payload (matches publish-page-rematch-tool). */
interface PersistedRematchReport {
  designId?: string
  picks?: Array<{
    adapterId?: string
    relativePath?: string
    kindLabel?: string
    score?: number
    reason?: string
  }>
  note?: string
}

/**
 * Overlay persisted AI rematch picks onto a scan result so restart / cache hits
 * still show the recommended files without re-chatting.
 */
async function enrichMatchAllWithRematch(
  result: MatchAllResult,
  repoInput: string,
  fileKey: string,
): Promise<MatchAllResult> {
  const known = new Map(
    result.codeFiles.map((f) => [f.adapterId + '::' + f.relativePath, f] as const),
  )
  const extras: MatchAllResult['codeFiles'] = []
  let matched = 0
  let weak = 0
  let none = 0

  const pages = await Promise.all(
    result.pages.map(async (page) => {
      const designId = page.mapping.designId
      let rematch: PersistedRematchReport | null = null
      try {
        const stored = await loadVisualRematch<PersistedRematchReport>(
          visualRematchKey(repoInput, fileKey, designId),
        )
        rematch = stored?.payload ?? null
      } catch {
        rematch = null
      }

      const picks = (rematch?.picks ?? [])
        .map((p) => {
          const relativePath = String(p.relativePath ?? '')
            .trim()
            .replace(/\\/g, '/')
          if (!relativePath) return null
          const adapterId = String(p.adapterId ?? 'android-xml').trim() || 'android-xml'
          const knownFile = known.get(adapterId + '::' + relativePath)
          const score =
            typeof p.score === 'number' && Number.isFinite(p.score)
              ? Math.max(0, Math.min(1, p.score))
              : 0.85
          return {
            adapterId,
            relativePath,
            kindLabel: p.kindLabel || knownFile?.kindLabel || adapterId,
            precise: knownFile?.precise ?? false,
            score,
            reasons: p.reason ? [`AI：${p.reason}`] : (['AI 推荐'] as string[]),
          }
        })
        .filter((c): c is NonNullable<typeof c> => !!c)

      if (!picks.length) {
        const status = page.mapping.status
        if (status === 'matched') matched += 1
        else if (status === 'weak') weak += 1
        else none += 1
        return page
      }

      for (const pick of picks) {
        const key = pick.adapterId + '::' + pick.relativePath
        if (known.has(key)) continue
        const file = {
          adapterId: pick.adapterId,
          kindLabel: pick.kindLabel,
          relativePath: pick.relativePath,
          precise: pick.precise,
        }
        known.set(key, file)
        extras.push(file)
      }

      const topScore = picks[0]?.score ?? 0
      const status: DesignPageMapping['status'] =
        topScore >= 0.45 ? 'matched' : picks.length ? 'weak' : 'none'
      if (status === 'matched') matched += 1
      else if (status === 'weak') weak += 1
      else none += 1

      return {
        ...page,
        mapping: {
          ...page.mapping,
          status,
          candidates: picks,
        },
      }
    }),
  )

  return {
    ...result,
    codeFiles: extras.length ? [...result.codeFiles, ...extras] : result.codeFiles,
    pages,
    totals: { pages: pages.length, matched, weak, none },
  }
}

/**
 * Scan design pages and map them to code files.
 * - Figma：URL 带 node-id（默认 / scope=node）只定位该页；否则扫整个文件
 * - 蓝湖：URL 带 image_id 只定位该稿；否则扫整个项目设计稿列表
 */
export async function matchAllDesignPages(
  body: Record<string, unknown>,
): Promise<MatchAllResult> {
  const repoInput = String(body.repoPath ?? body.repo ?? '').trim()
  const force = body.force === true
  if (!repoInput) throw new Error('缺少 repoPath')
  const conn = designConnection(body)

  if (conn.source === 'lanhu') {
    return await matchAllLanhuPages(body, repoInput, conn, force)
  }

  const figmaUrl = conn.url
  const figmaToken = conn.credential
  if (!/figma\.com/i.test(figmaUrl)) {
    throw new Error(
      '无法识别的设计稿链接。请粘贴 Figma（figma.com）或蓝湖（lanhuapp.com）链接；蓝湖需填 Cookie，不是 Figma Token。',
    )
  }
  const scopeRaw = String(body.scope ?? body.scanScope ?? 'auto').trim().toLowerCase()
  let focusNodeId = ''
  try {
    focusNodeId = parseFigmaUrl(figmaUrl).nodeId
  } catch {
    focusNodeId = ''
  }
  let scope: 'node' | 'file' = 'file'
  if (scopeRaw === 'file') {
    scope = 'file'
    focusNodeId = ''
  } else if (scopeRaw === 'node') {
    if (!focusNodeId) throw new Error('单页扫描需要链接中包含 node-id')
    scope = 'node'
  } else if (focusNodeId) {
    scope = 'node'
  }

  const fileKey = parseFigmaFileKey(figmaUrl)
  // screens-v1: node scope may expand a container into multiple page cards.
  const scanKey = visualScanKey(
    repoInput,
    fileKey,
    focusNodeId ? `${focusNodeId}:screens-v1` : '',
  )

  if (!force) {
    const cached = await loadVisualScan<MatchAllResult>(scanKey)
    if (cached?.payload) {
      const enriched = await enrichMatchAllWithRematch(
        {
          ...cached.payload,
          fromCache: true,
          savedAt: cached.savedAt,
          scope,
          focusNodeId: focusNodeId || undefined,
        },
        repoInput,
        fileKey,
      )
      return enriched
    }
  }

  if (scope === 'node') {
    const ctx = await resolveVisualRepo(repoInput, body)
    const design = await loadDesign(body)
    const { empty, nodeName } = describeEmptyDesign(design)
    if (empty) {
      throw new Error(
        `当前链接指向的节点「${nodeName || focusNodeId}」是空白图层（不含文案或控件）。请在 Figma 中选中真正的画板 / 界面 Frame 后复制链接。`,
      )
    }

    const codePages = await discoverAllPages(ctx.checkoutPath)
    // Section / parent Frame 可能一次带出多块画板：拆成多页，避免拼在一张图里。
    const pageInput = expandFocusedDesignPages(design)
    const mappings = mapInventoryPages(pageInput, codePages)
    const boxOf = new Map(pageInput.map((p) => [p.summary.id, p.summary.box]))
    const totals = { pages: mappings.length, matched: 0, weak: 0, none: 0 }
    const pages = mappings.map((m) => {
      totals[m.status] += 1
      const box = boxOf.get(m.designId)
      const aspect = box && box.height > 0 ? box.width / box.height : 390 / 844
      return {
        canvasId: 'focused',
        canvasName:
          pageInput.length > 1
            ? design.root.name || nodeName || '当前链接节点'
            : '当前链接节点',
        aspect,
        mapping: {
          designId: m.designId,
          designName: m.designName,
          kind: m.kind,
          status: m.status,
          candidates: m.candidates,
        },
      }
    })
    const result: MatchAllResult = {
      codeFiles: codePages.map((p) => ({
        adapterId: p.adapterId,
        kindLabel: p.kindLabel,
        relativePath: p.relativePath,
        precise: p.precise,
      })),
      canvases: [
        {
          id: 'focused',
          name: design.root.name || nodeName || '当前链接节点',
          componentLibrary: false,
        },
      ],
      pages,
      totals,
      fromCache: false,
      scope: 'node',
      focusNodeId,
      savedAt: new Date().toISOString(),
    }
    try {
      await saveVisualScan(scanKey, result)
    } catch {
      /* ignore */
    }
    return await enrichMatchAllWithRematch(result, repoInput, fileKey)
  }

  const ctx = await resolveVisualRepo(repoInput, body)
  const inventory = await fetchFigmaFileInventory(figmaUrl, { token: figmaToken })

  const ids = inventory.pages.map((p) => p.id)
  const docs = await fetchFigmaDocsBatch(inventory.fileKey, ids, { token: figmaToken })

  const codePages = await discoverAllPages(ctx.checkoutPath)
  const pageInput = inventory.pages
    .filter((s) => docs.has(s.id))
    .map((summary) => ({ summary, doc: docs.get(summary.id)! }))
  const mappings = mapInventoryPages(pageInput, codePages)

  const canvasOf = new Map<string, FigmaCanvasSummary>()
  for (const canvas of inventory.canvases) {
    for (const p of canvas.pages) canvasOf.set(p.id, canvas)
  }

  const totals = { pages: mappings.length, matched: 0, weak: 0, none: 0 }
  const boxOf = new Map(inventory.pages.map((p) => [p.id, p.box]))

  const pages = mappings.map((m) => {
    totals[m.status] += 1
    const canvas = canvasOf.get(m.designId)
    const box = boxOf.get(m.designId)
    const aspect = box && box.height > 0 ? box.width / box.height : 390 / 844
    return {
      canvasId: canvas?.id ?? '',
      canvasName: canvas?.name ?? '',
      aspect,
      mapping: {
        designId: m.designId,
        designName: m.designName,
        kind: m.kind,
        status: m.status,
        candidates: m.candidates,
      },
    }
  })

  const result: MatchAllResult = {
    codeFiles: codePages.map((p) => ({
      adapterId: p.adapterId,
      kindLabel: p.kindLabel,
      relativePath: p.relativePath,
      precise: p.precise,
    })),
    canvases: inventory.canvases.map((c) => ({
      id: c.id,
      name: c.name,
      componentLibrary: c.componentLibrary,
    })),
    pages,
    totals,
    fromCache: false,
    scope: 'file',
    savedAt: new Date().toISOString(),
  }

  try {
    await saveVisualScan(scanKey, result)
  } catch {
    /* cache write failure must not discard the result */
  }
  return await enrichMatchAllWithRematch(result, repoInput, fileKey)
}

async function matchAllLanhuPages(
  body: Record<string, unknown>,
  repoInput: string,
  conn: { url: string; credential: string; authorization?: string },
  force: boolean,
): Promise<MatchAllResult> {
  const parts = parseLanhuUrl(conn.url)
  const scopeRaw = String(body.scope ?? body.scanScope ?? 'auto').trim().toLowerCase()
  let focusImageId = parts.imageId
  let scope: 'node' | 'file' = 'file'
  if (scopeRaw === 'file') {
    scope = 'file'
    focusImageId = ''
  } else if (scopeRaw === 'node') {
    if (!focusImageId) throw new Error('单页扫描需要蓝湖链接中包含 image_id')
    scope = 'node'
  } else if (focusImageId) {
    scope = 'node'
  }

  const fileKey = `lanhu:${parts.projectId}`
  const scanKey = visualScanKey(
    repoInput,
    fileKey,
    focusImageId ? `${focusImageId}:screens-v1` : '',
  )

  if (!force) {
    const cached = await loadVisualScan<MatchAllResult>(scanKey)
    if (cached?.payload) {
      return await enrichMatchAllWithRematch(
        {
          ...cached.payload,
          fromCache: true,
          savedAt: cached.savedAt,
          scope,
          focusNodeId: focusImageId || undefined,
        },
        repoInput,
        fileKey,
      )
    }
  }

  const lanhuOpts = { cookie: conn.credential, authorization: conn.authorization }

  if (scope === 'node') {
    const ctx = await resolveVisualRepo(repoInput, body)
    const design = await loadDesign(body)
    const { empty, nodeName } = describeEmptyDesign(design)
    if (empty) {
      throw new Error(
        `当前蓝湖设计稿「${nodeName || focusImageId}」是空白图层（不含文案或控件）。请打开真正的界面画板后复制链接。`,
      )
    }
    const codePages = await discoverAllPages(ctx.checkoutPath)
    const pageInput = expandFocusedDesignPages(design)
    const mappings = mapInventoryPages(pageInput, codePages)
    const boxOf = new Map(pageInput.map((p) => [p.summary.id, p.summary.box]))
    const totals = { pages: mappings.length, matched: 0, weak: 0, none: 0 }
    const pages = mappings.map((m) => {
      totals[m.status] += 1
      const box = boxOf.get(m.designId)
      const aspect = box && box.height > 0 ? box.width / box.height : 390 / 844
      return {
        canvasId: 'focused',
        canvasName:
          pageInput.length > 1
            ? design.root.name || nodeName || '当前蓝湖设计稿'
            : '当前蓝湖设计稿',
        aspect,
        mapping: {
          designId: m.designId,
          designName: m.designName,
          kind: m.kind,
          status: m.status,
          candidates: m.candidates,
        },
      }
    })
    const result: MatchAllResult = {
      codeFiles: codePages.map((p) => ({
        adapterId: p.adapterId,
        kindLabel: p.kindLabel,
        relativePath: p.relativePath,
        precise: p.precise,
      })),
      canvases: [
        {
          id: 'focused',
          name: design.root.name || nodeName || '当前蓝湖设计稿',
          componentLibrary: false,
        },
      ],
      pages,
      totals,
      fromCache: false,
      scope: 'node',
      focusNodeId: focusImageId,
      savedAt: new Date().toISOString(),
    }
    try {
      await saveVisualScan(scanKey, result)
    } catch {
      /* ignore */
    }
    return await enrichMatchAllWithRematch(result, repoInput, fileKey)
  }

  const ctx = await resolveVisualRepo(repoInput, body)
  const inventory = await fetchLanhuProjectInventory(parts, lanhuOpts)
  if (!inventory.pages.length) {
    throw new Error('该蓝湖项目下没有可扫描的设计稿')
  }

  // Cap concurrent annotation fetches so a large project does not stampede the API.
  const docs = new Map<string, DesignDoc>()
  const CONCURRENCY = 4
  for (let i = 0; i < inventory.pages.length; i += CONCURRENCY) {
    const chunk = inventory.pages.slice(i, i + CONCURRENCY)
    await Promise.all(
      chunk.map(async (page) => {
        try {
          const doc = await fetchLanhuDoc(
            { ...parts, imageId: page.id },
            lanhuOpts,
          )
          docs.set(page.id, doc)
        } catch {
          /* skip pages without annotations */
        }
      }),
    )
  }

  const codePages = await discoverAllPages(ctx.checkoutPath)
  const pageInput = inventory.pages
    .filter((s) => docs.has(s.id))
    .map((summary) => ({
      summary: {
        id: summary.id,
        name: summary.name,
        type: summary.type,
        box: summary.box,
      },
      doc: docs.get(summary.id)!,
    }))
  if (!pageInput.length) {
    throw new Error('未能解析任何蓝湖设计稿标注（请确认 Cookie 有效且稿件已生成标注）')
  }
  const mappings = mapInventoryPages(pageInput, codePages)
  const totals = { pages: mappings.length, matched: 0, weak: 0, none: 0 }
  const boxOf = new Map(inventory.pages.map((p) => [p.id, p.box]))

  const pages = mappings.map((m) => {
    totals[m.status] += 1
    const box = boxOf.get(m.designId)
    const aspect = box && box.height > 0 ? box.width / box.height : 390 / 844
    return {
      canvasId: parts.projectId,
      canvasName: '蓝湖项目',
      aspect,
      mapping: {
        designId: m.designId,
        designName: m.designName,
        kind: m.kind,
        status: m.status,
        candidates: m.candidates,
      },
    }
  })

  const result: MatchAllResult = {
    codeFiles: codePages.map((p) => ({
      adapterId: p.adapterId,
      kindLabel: p.kindLabel,
      relativePath: p.relativePath,
      precise: p.precise,
    })),
    canvases: [{ id: parts.projectId, name: '蓝湖项目', componentLibrary: false }],
    pages,
    totals,
    fromCache: false,
    scope: 'file',
    savedAt: new Date().toISOString(),
  }
  try {
    await saveVisualScan(scanKey, result)
  } catch {
    /* ignore */
  }
  return await enrichMatchAllWithRematch(result, repoInput, fileKey)
}

// ---------------------------------------------------------------------------
// High-fidelity comparison
// ---------------------------------------------------------------------------

interface HifiWireNode {
  id: string
  name: string
  kind: string
  text?: string
  imageUrl?: string
  x: number
  y: number
  width: number
  height: number
  dynamic?: boolean
  aiInferred?: boolean
  /** Human-readable AI summary for a runtime surface (best effort). */
  aiNote?: string
  /** AI-inferred content nodes for a runtime surface (absolute coords). */
  inferredChildren?: HifiWireNode[]
  style: HifiRenderNode['style']
  children: HifiWireNode[]
}

function serializeHifi(node: HifiRenderNode): HifiWireNode {
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    text: node.text,
    imageUrl: node.imageUrl,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    dynamic: node.dynamic,
    aiInferred: node.aiInferred,
    aiNote: (node as unknown as { aiNote?: string }).aiNote,
    inferredChildren: node.inferredChildren?.map(serializeHifi),
    style: node.style,
    children: node.children.map(serializeHifi),
  }
}

export interface HifiCompareResult {
  page: { adapterId: string; kindLabel: string; relativePath: string }
  /** Common viewport (design frame size) used for annotation coordinates. */
  viewport: { width: number; height: number }
  /** Design frame name (page title) for context. */
  designName: string
  designImageUrl?: string
  /** High-fidelity trees — design side drives annotation boxes. */
  designHifiTree: HifiWireNode
  codeHifiTree: HifiWireNode
  /** Status message when runtime-region fill notes apply. */
  aiInferenceNote?: string
  /**
   * Ready-to-send starter prompt for this page's "AI 协助分析". The sidebar
   * drops it into the session composer so the user can edit / continue.
   */
  chatPrompt: string
  /** exact = property-level; heuristic = L2 static checks. */
  compareMode: 'exact' | 'heuristic'
  /** Deterministic diff computed over the aligned trees / heuristics. */
  result: {
    diffs: Array<Record<string, unknown>>
    unmatched: Array<Record<string, unknown>>
    comparedPairs: number
  }
  /**
   * Placeholder notes that live INSIDE the frame (and therefore also appear in
   * the official raster). Each carries its box and the enclosing background
   * colour, so the raster view can paint an in-colour mask over the note.
   */
  designNoteMasks?: Array<{
    text: string
    nodeId?: string
    x: number
    y: number
    width: number
    height: number
    maskColor: string
  }>
  /** True when loaded from the on-disk cache (not regenerated). */
  fromCache?: boolean
  /** ISO time the result was generated, so the user knows its age. */
  savedAt?: string
}

/**
 * Collect placeholder notes that live INSIDE the design frame, with each
 * note's box and the nearest enclosing background colour. Run BEFORE pruning
 * (the nodes are removed afterwards) so the official-raster view can mask the
 * notes out of the PNG using the correct underlying colour.
 */
function collectNoteMasks(design: DesignDoc): NonNullable<HifiCompareResult['designNoteMasks']> {
  const masks: NonNullable<HifiCompareResult['designNoteMasks']> = []
  const visit = (node: DesignNode, inheritedBg: string | null): void => {
    const ownBg =
      typeof node.style.backgroundColor === 'string' && node.style.backgroundColor.trim()
        ? node.style.backgroundColor.trim()
        : null
    const bg = ownBg ?? inheritedBg
    if (isDesignerAnnotationNode(node)) {
      masks.push({
        text: node.text || node.name || '备注',
        nodeId: node.id,
        x: Number(node.box.x ?? 0),
        y: Number(node.box.y ?? 0),
        width: Number(node.box.width ?? 0),
        height: Number(node.box.height ?? 0),
        // Only paint an opaque cover when the design tree has a real parent fill.
        // Defaulting to white used to blot out UI behind floating notes.
        maskColor: bg || 'transparent',
      })
      return
    }
    for (const child of node.children) visit(child, bg)
  }
  visit(design.root, null)
  return masks
}

/**
 * Design-only high-fidelity compare: Figma raster + layered static diffs.
 * Android XML uses the layout engine; other precise adapters use toDesignDoc;
 * locator-only adapters fall back to L2 heuristic. No native render.
 */
export async function compareHighFidelity(
  body: Record<string, unknown>,
  hostCtx: Context,
): Promise<HifiCompareResult> {
  void hostCtx
  const repoInput = String(body.repoPath ?? body.repo ?? '').trim()
  const adapterId = String(body.adapterId ?? '').trim()
  const relativePath = String(body.relativePath ?? '').trim()
  const force = body.force === true
  if (!repoInput || !adapterId || !relativePath) {
    throw new Error('缺少 repoPath / adapterId / relativePath')
  }

  const figmaUrlRaw = String(body.figmaUrl ?? body.designUrl ?? '').trim()
  const fileKey = designCacheFileKey(figmaUrlRaw)
  const nodeIdForCache = (() => {
    try {
      if (isLanhuUrl(figmaUrlRaw)) return parseLanhuUrl(figmaUrlRaw).imageId || ''
      return new URL(figmaUrlRaw).searchParams.get('node-id') ?? ''
    } catch {
      return ''
    }
  })()

  const ctx = await resolveVisualRepo(repoInput, body)
  const adapter = getPlatformAdapter(adapterId)
  if (!adapter) throw new Error(`未知适配器：${adapterId}`)

  // Fingerprint source for cache invalidation (layout closure for XML; file itself otherwise).
  let sourceFingerprint = ''
  try {
    if (adapterId === 'android-xml') {
      const resources = await loadAndroidProjectResources(ctx.checkoutPath)
      const built = await buildAndroidRenderContext(ctx.checkoutPath, resources)
      const entryLayoutName = path.basename(relativePath, path.extname(relativePath))
      const depManifest = await analyzeLayoutDependencies(entryLayoutName, built, resources)
      sourceFingerprint = await fingerprintFiles([
        depManifest.entryLayout,
        ...depManifest.layouts,
        ...depManifest.drawables,
        ...depManifest.colorFiles,
        ...depManifest.dimenFiles,
        ...depManifest.stringFiles,
        ...depManifest.styleFiles,
      ])
    } else {
      sourceFingerprint = await fingerprintFiles([path.join(ctx.checkoutPath, relativePath)])
    }
  } catch {
    sourceFingerprint = ''
  }

  const hifiKey = visualHifiKey(
    repoInput,
    fileKey,
    nodeIdForCache,
    relativePath,
    sourceFingerprint,
  )
  if (!force) {
    const cached = await loadVisualHifi<HifiCompareResult>(hifiKey)
    if (cached?.payload) {
      return { ...cached.payload, fromCache: true, savedAt: cached.savedAt }
    }
  }

  const design = await loadDesign(body)
  const designNoteMasks = collectNoteMasks(design)
  pruneDesignerAnnotations(design)

  const db = design.root.box
  const viewportWidth = typeof db.width === 'number' ? db.width : 390
  const viewportHeight = typeof db.height === 'number' ? db.height : 844

  const iconEnrich = await enrichDesignIcons(design, body)
  const fillUrls = await enrichDesignImageFills(design, body)
  const designHifi = designDocToHifi(design, iconEnrich, fillUrls)

  let compareMode: 'exact' | 'heuristic' = 'exact'
  let result: VisualCompareResult
  let codeHifiTree: HifiWireNode
  let aiInferenceNote: string | undefined
  let kindLabel = adapter.kindLabel

  if (adapterId === 'android-xml') {
    const resources = await loadAndroidProjectResources(ctx.checkoutPath)
    const built = await buildAndroidRenderContext(ctx.checkoutPath, resources)
    const entryLayoutName = path.basename(relativePath, path.extname(relativePath))
    const layoutFile = path.join(ctx.checkoutPath, relativePath)
    const layoutXml = await readFileSafe(layoutFile)
    const codeHifi = await renderAndroidLayout({
      layoutXml,
      width: viewportWidth,
      height: viewportHeight,
      context: built.context,
      resolveLayout: built.resolveLayout,
    })
    const codeDoc = hifiTreeToDesignDoc(codeHifi.root)
    result = compareVisualDocs(design, codeDoc)

    const sourceFiles = await collectAdapterSourceFiles(ctx.checkoutPath, entryLayoutName)
    const bindings = analyzeAdapterBindings(entryLayoutName, sourceFiles)
    const itemRegions = await expandAllDynamicRegions(codeHifi.root, entryLayoutName, {
      bindings,
      resolveLayoutEntry: built.resolveLayoutEntry,
      context: built.context,
      resolveLayout: built.resolveLayout,
    })
    const projectedRegions = projectRuntimeRegions(codeHifi.root, design, fillUrls)
    const totalRegions = flattenHifi(codeHifi.root).filter((n) => n.dynamic).length
    if (itemRegions > 0) {
      aiInferenceNote =
        projectedRegions > 0
          ? `已按代码自身的 item 布局还原 ${itemRegions} 个列表，另有 ${projectedRegions} 个区域未找到 item 布局、暂以设计稿内容示意`
          : `已按代码自身的 item 布局还原 ${itemRegions} 个运行时列表（共 ${totalRegions} 个动态区域）`
    } else if (projectedRegions > 0) {
      aiInferenceNote = `未从代码解析到 item 布局，已用设计稿内容示意 ${projectedRegions} 个区域（可在聊天中让 AI 协助）。`
    } else {
      aiInferenceNote = '未识别到可填充的运行时区域。'
    }
    codeHifiTree = serializeHifi(codeHifi.root)
    compareMode = 'exact'
    kindLabel = 'Android XML'
  } else if (adapter.precise && adapter.toDesignDoc) {
    const page = {
      adapterId: adapter.id,
      platform: adapter.platform,
      kindLabel: adapter.kindLabel,
      relativePath,
      absolutePath: path.join(ctx.checkoutPath, relativePath),
      precise: true as const,
      fingerprint: { texts: [], nameTokens: [], controlCount: 0 },
    }
    const codeDoc = await adapter.toDesignDoc(page)
    result = compareVisualDocs(design, codeDoc)
    codeHifiTree = designDocToHifiSimple(codeDoc)
    compareMode = 'exact'
    kindLabel = adapter.kindLabel
    aiInferenceNote = `${kindLabel} 属性级静态对比（无运行时渲染）。`
  } else {
    let page: CodePage = {
      adapterId: adapter.id,
      platform: adapter.platform,
      kindLabel: adapter.kindLabel,
      relativePath,
      absolutePath: path.join(ctx.checkoutPath, relativePath),
      precise: false,
      fingerprint: { texts: [], nameTokens: [], controlCount: 0 },
    }
    // Prefer fingerprint from discovery when available.
    try {
      const pages = await discoverAllPages(ctx.checkoutPath)
      const hit = pages.find(
        (p) => p.adapterId === adapterId && p.relativePath === relativePath,
      )
      if (hit) page = hit
    } catch {
      /* keep defaults */
    }
    result = await heuristicCompare(design, page)
    codeHifiTree = emptyCodeHifi(viewportWidth, viewportHeight)
    compareMode = 'heuristic'
    kindLabel = adapter.kindLabel
    aiInferenceNote = `${kindLabel} 已做启发式静态对比（文案/控件规模）；属性级几何对比尚未覆盖的部分可用「AI 协助分析」。`
  }

  const designName = design.root.name || relativePath
  const chatPrompt = buildVisualChatPrompt({
    designName,
    codeRelativePath: relativePath,
    platformLabel: kindLabel,
    viewport: { width: viewportWidth, height: viewportHeight },
    diffs: (result.diffs as unknown as VisualChatDiff[]).map((d) => ({
      nodeName: String(d.nodeName ?? ''),
      property: String(d.property ?? ''),
      severity: d.severity,
      expected: d.expected,
      actual: d.actual,
    })),
  })

  let designImageUrl: string | undefined
  try {
    designImageUrl = (await renderDesignRaster(body))?.url
  } catch {
    designImageUrl = undefined
  }

  const hifiResult: HifiCompareResult = {
    page: { adapterId, kindLabel, relativePath },
    viewport: { width: viewportWidth, height: viewportHeight },
    designName,
    designImageUrl,
    designHifiTree: designHifi,
    codeHifiTree,
    aiInferenceNote,
    designNoteMasks,
    chatPrompt,
    compareMode,
    result: {
      diffs: result.diffs as unknown as Array<Record<string, unknown>>,
      unmatched: result.unmatched as unknown as Array<Record<string, unknown>>,
      comparedPairs: result.comparedPairs,
    },
    fromCache: false,
  }
  hifiResult.savedAt = new Date().toISOString()

  try {
    await saveVisualHifi(hifiKey, hifiResult)
  } catch {
    /* cache write failure must not discard the result */
  }
  return hifiResult
}

/** Minimal code-side tree when there is no layout engine output. */
function emptyCodeHifi(width: number, height: number): HifiWireNode {
  return {
    id: 'code-root',
    name: 'code',
    kind: 'frame',
    x: 0,
    y: 0,
    width,
    height,
    style: {},
    children: [],
  }
}

/** Convert a DesignDoc to hifi wire without icon enrichment (code / xib side). */
function designDocToHifiSimple(doc: DesignDoc): HifiWireNode {
  return designDocToHifi(
    doc,
    { groupUrls: new Map(), iconUrls: new Map(), suppressed: new Set() },
    undefined,
  )
}

// ---------------------------------------------------------------------------
// Runtime-region high-fidelity fill (geometric projection + AI layout)
// ---------------------------------------------------------------------------

interface FlatBox {
  x: number
  y: number
  width: number
  height: number
}

function flattenHifi(root: HifiRenderNode): HifiRenderNode[] {
  const out: HifiRenderNode[] = []
  const walk = (node: HifiRenderNode): void => {
    out.push(node)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return out
}

/**
 * Collect Java/Kotlin source files that may define the screen's adapters.
 * Bounded and name/keyword filtered: we only read files that mention the
 * entry layout or that look like an Adapter, so a large project stays fast.
 */
async function collectAdapterSourceFiles(
  checkoutPath: string,
  entryLayout: string,
): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = []
  const seenPaths = new Set<string>()
  await walkFiles(
    checkoutPath,
    async (file) => {
      if (file.depth > 14) return
      if (!/\.(java|kt)$/i.test(file.name)) return
      // Loose name pre-filter: the screen class is an Activity/Fragment and may
      // NOT share the layout file's name (e.g. FirstRecommendTagActivity vs
      // act_first_recommend_tag). Adapters are included too. The exact filter
      // below reads content and keeps only files referencing the entry layout.
      const looksRelevant =
        /(adapter|activity|fragment)/i.test(file.name) ||
        entryLayout.toLowerCase().includes(
          file.name.toLowerCase().replace(/\.(java|kt)$/, ''),
        )
      if (!looksRelevant) return
      try {
        const content = await readFile(file.absolutePath, 'utf8')
        // Must actually reference the entry layout OR inflate some layout.
        if (!content.includes(entryLayout) && !/R\.layout\.\w+/.test(content)) return
        const key = file.absolutePath.toLowerCase()
        if (seenPaths.has(key)) return
        seenPaths.add(key)
        files.push({ path: file.absolutePath, content })
      } catch {
        /* unreadable: skip */
      }
    },
    { maxFiles: 20_000 },
  )
  return files
}

/** Recursively deep-offset a render subtree into shared absolute coordinates. */
function offsetNode(node: HifiRenderNode, dx: number, dy: number): HifiRenderNode {
  const clone: HifiRenderNode = {
    ...node,
    x: Math.round((node.x + dx) * 100) / 100,
    y: Math.round((node.y + dy) * 100) / 100,
    style: node.style,
    children: node.children.map((c) => offsetNode(c, dx, dy)),
  }
  if (node.inferredChildren?.length) {
    clone.inferredChildren = node.inferredChildren.map((c) => offsetNode(c, dx, dy))
  }
  return clone
}

interface ExpandDeps {
  bindings: AdapterBindings
  resolveLayoutEntry: (name: string) => Promise<{ file: string; content: string } | undefined>
  context: AndroidRenderContext
  resolveLayout: (name: string) => Promise<string | undefined>
}

/** Orientation of a dynamic region read from its containing layout XML. */
function regionOrientation(
  layoutContent: string,
  regionId: string,
): 'vertical' | 'horizontal' {
  try {
    const root = parseXml(layoutContent)
    let found: XmlElement | undefined
    const visit = (el: XmlElement): void => {
      if (found) return
      const id = (el.attrs['android:id'] ?? '').replace(/^@\+?id\//, '')
      if (id === regionId) {
        found = el
        return
      }
      for (const c of el.children) visit(c)
    }
    visit(root)
    const o = found?.attrs['android:orientation'] ?? ''
    return /horizontal/.test(o) ? 'horizontal' : 'vertical'
  } catch {
    return 'vertical'
  }
}

/**
 * Expand every top-level dynamic region of the code screen using the code's
 * own item layouts. Tiles are attached to each region as `inferredChildren`
 * (shared absolute coordinates) and the region is marked `itemRendered`.
 * Returns the number of regions that got real rows.
 */
async function expandAllDynamicRegions(
  codeRoot: HifiRenderNode,
  entryLayout: string,
  deps: Omit<ExpandDeps, 'bindings'> & { bindings: AdapterBindings },
): Promise<number> {
  const regions = flattenHifi(codeRoot).filter((n) => n.dynamic)
  if (!regions.length) return 0
  let filled = 0
  for (const region of regions) {
    const tiles = await expandRegionTiles(entryLayout, region, deps, {
      depth: 0,
      budget: 4000,
    })
    if (!tiles.length) continue
    region.inferredChildren = tiles
    region.itemRendered = true
    filled += 1
  }
  return filled
}

/**
 * Expand a dynamic region by rendering the CODE's own item layout (recovered
 * from adapter bindings) and tiling the real rows. The region orientation is
 * read from the containing layout. Nested dynamic regions in an item are
 * expanded recursively. Returns painted nodes in document order (card
 * backgrounds beneath their text), in shared absolute coordinates.
 */
async function expandRegionTiles(
  containingLayout: string,
  region: HifiRenderNode,
  deps: ExpandDeps,
  guard: { depth: number; budget: number },
): Promise<HifiRenderNode[]> {
  if (guard.depth > 6) return []
  const itemLayoutName = deps.bindings.layouts[containingLayout]?.[region.id]
  if (!itemLayoutName) return []
  const itemEntry = await deps.resolveLayoutEntry(itemLayoutName)
  const containingEntry = await deps.resolveLayoutEntry(containingLayout)
  if (!itemEntry || !containingEntry) return []

  const dir = regionOrientation(containingEntry.content, region.id)

  const tiles: HifiRenderNode[] = []
  let cursor = 0
  const maxTiles = 40
  let tileIndex = 0
  while (tileIndex < maxTiles && guard.budget > 0) {
    const item = await renderAndroidItemLayout({
      layoutXml: itemEntry.content,
      // Vertical list: rows constrained to region width. Horizontal list: omit
      // width so each item keeps its intrinsic width.
      width: dir === 'vertical' ? region.width : undefined,
      context: deps.context,
      resolveLayout: deps.resolveLayout,
    })
    const step = dir === 'horizontal' ? item.width : item.height
    if (!Number.isFinite(step) || step <= 0) break

    const originX = dir === 'horizontal' ? region.x + cursor : region.x
    const originY = dir === 'horizontal' ? region.y : region.y + cursor

    // Flatten the item tree in document order; nested dynamic regions (which
    // live inside THIS item layout) are expanded recursively.
    const flat: HifiRenderNode[] = []
    const collect = async (node: HifiRenderNode): Promise<void> => {
      if (node.dynamic) {
        const nested = await expandRegionTiles(
          itemLayoutName,
          { ...node, x: node.x + originX, y: node.y + originY },
          deps,
          { depth: guard.depth + 1, budget: guard.budget },
        )
        for (const n of nested) {
          flat.push(n)
          guard.budget -= 1
        }
        return
      }
      flat.push(offsetNode(node, originX, originY))
      guard.budget -= 1
      for (const c of node.children) await collect(c)
    }
    await collect(item.root)
    for (const n of flat) tiles.push(n)

    tileIndex += 1
    cursor += step
    // Stop once the region is filled along its scrolling axis.
    if (dir === 'horizontal' && cursor >= region.width) break
    if (dir === 'vertical' && cursor >= region.height) break
  }
  return tiles
}

/** A real paint-bearing leaf node in the shared coordinate space. */
type DesignPaintKind = 'text' | 'shape' | 'image' | 'icon'
interface DesignPaintItem extends FlatBox {
  kind: DesignPaintKind
  text?: string
  imageRef?: string
  style: DesignNode['style']
}

/**
 * Collect leaf nodes that actually paint — text, rectangle/shape, image, icon.
 * Container kinds (frame/group/view) are skipped: projecting their bounding
 * boxes would paint a rectangle for every layout wrapper. Annotations are
 * already pruned before this runs.
 */
function collectDesignPaintItems(design: DesignDoc): DesignPaintItem[] {
  const out: DesignPaintItem[] = []
  const PAINT_KINDS: DesignPaintKind[] = ['text', 'shape', 'image', 'icon']
  const visit = (n: DesignNode): void => {
    if (PAINT_KINDS.includes(n.kind as DesignPaintKind)) {
      out.push({
        kind: n.kind as DesignPaintKind,
        text: n.text,
        imageRef: typeof n.style.imageRef === 'string' ? n.style.imageRef : undefined,
        x: Number(n.box.x ?? 0),
        y: Number(n.box.y ?? 0),
        width: Number(n.box.width ?? 0),
        height: Number(n.box.height ?? 0),
        style: n.style,
      })
    }
    for (const child of n.children) visit(child)
  }
  visit(design.root)
  return out
}

function isInsideRegion(t: FlatBox, region: FlatBox, pad = 6): boolean {
  return (
    t.x >= region.x - pad &&
    t.y >= region.y - pad &&
    t.x + t.width <= region.x + region.width + pad &&
    t.y + t.height <= region.y + region.height + pad
  )
}

interface ProjectedPaint {
  kind: DesignPaintKind
  text?: string
  imageUrl?: string
  rx: number
  ry: number
  rw: number
  rh: number
  style: DesignNode['style']
}

function regionProjectedItems(
  region: HifiRenderNode,
  items: DesignPaintItem[],
  fillUrls: Map<string, string>,
): ProjectedPaint[] {
  return items
    .filter((t) => isInsideRegion(t, region))
    .map((t) => {
      const projected: ProjectedPaint = {
        kind: t.kind,
        text: t.text?.replace(/\s+/g, ' ').trim(),
        rx: Math.round(t.x - region.x),
        ry: Math.round(t.y - region.y),
        rw: Math.round(t.width),
        rh: Math.round(t.height),
        style: t.style,
      }
      if (t.kind === 'image' && t.imageRef) {
        projected.imageUrl = fillUrls.get(t.imageRef)
      }
      return projected
    })
    .filter((t) => {
      if (t.kind === 'text') return !!t.text
      return t.rw > 0 && t.rh > 0
    })
}

/**
 * Stage 1 (always, deterministic): project the real design content that falls
 * inside each runtime region into {@link HifiRenderNode.inferredChildren}.
 * Projects the FULL geometry — card background rectangles, image placeholders,
 * icons and text with their real styles and positions — not just bare text, so
 * the code-side list visually reconstructs the cards. Returns filled regions.
 */
function projectRuntimeRegions(
  codeRoot: HifiRenderNode,
  design: DesignDoc,
  fillUrls: Map<string, string>,
): number {
  // FALLBACK ONLY: skip regions already populated (e.g. real item rows from
  // adapter bindings) so they are not overwritten by projected design content.
  const regions = flattenHifi(codeRoot).filter(
    (n) => n.dynamic && !(n.inferredChildren?.length),
  )
  if (!regions.length) return 0
  const items = collectDesignPaintItems(design)

  let filled = 0
  let seq = 0
  for (const region of regions) {
    const projected = regionProjectedItems(region, items, fillUrls)
    if (!projected.length) continue
    region.inferredChildren = projected.map((it) => {
      seq += 1
      const node: HifiRenderNode = {
        id: `proj_${seq}`,
        name: 'projected',
        kind: it.kind === 'shape' ? 'view' : it.kind === 'icon' ? 'image' : it.kind,
        x: region.x + it.rx,
        y: region.y + it.ry,
        width: Math.max(1, it.rw),
        height: Math.max(1, it.rh),
        style: {
          backgroundColor:
            typeof it.style.backgroundColor === 'string'
              ? it.style.backgroundColor
              : undefined,
          gradient: it.style.gradient,
          color: typeof it.style.color === 'string' ? it.style.color : undefined,
          fontSize:
            typeof it.style.fontSize === 'number' ? it.style.fontSize : undefined,
          fontWeight: it.style.fontWeight,
          borderRadius:
            typeof it.style.cornerRadius === 'number'
              ? it.style.cornerRadius
              : undefined,
          borderRadii: Array.isArray(it.style.cornerRadii)
            ? it.style.cornerRadii
            : undefined,
          borderWidth:
            typeof it.style.borderWidth === 'number'
              ? it.style.borderWidth
              : undefined,
          borderColor:
            typeof it.style.borderColor === 'string'
              ? it.style.borderColor
              : undefined,
          textAlign: it.style.textAlign,
          imageFit: it.style.imageFit,
        },
        text: it.kind === 'text' ? it.text : undefined,
        imageUrl: it.kind === 'image' ? it.imageUrl : undefined,
        children: [],
      }
      return node
    })
    filled += 1
  }
  return filled
}

/**
 * Stage 2 (optional, AI only): de-duplicate / clean the stage-1 projected copy
 * and replace each region's inferred children with the refined set. Real-copy
 * guard rejects any text not present in the projection. Returns refined region
 * count. Throws when the model output cannot be parsed.
 */
async function refineRuntimeRegionsWithAI(
  hostCtx: Context,
  codeRoot: HifiRenderNode,
  design: DesignDoc,
): Promise<number> {
  const regions = flattenHifi(codeRoot).filter(
    (n) => n.dynamic && n.inferredChildren?.length,
  )
  if (!regions.length) return 0

  const regionInputs = regions.map((region, index) => ({
    index,
    id: region.id,
    name: region.name,
    width: Math.round(region.width),
    height: Math.round(region.height),
    items: region.inferredChildren!.map((c) => ({
      text: String(c.text ?? ''),
      rx: Math.round(c.x - region.x),
      ry: Math.round(c.y - region.y),
      rw: Math.round(c.width),
      rh: Math.round(c.height),
    })),
  }))

  const system =
    '你是资深 Android UI 工程师，正在根据设计稿静态还原一个由运行时数据填充的界面区域（RecyclerView/ViewPager/WebView）。' +
    '已用几何方式把设计稿中落入该区域的真实文字连同其相对坐标提取出来。你的任务：去重、合并明显重复或被截断的同一条文案、修正排版，' +
    '然后输出该区域应显示的文字节点。严格要求：只能使用或精简给定文案，禁止编造用户名、数字、标题；坐标必须在给定基础上合理排布，不得超出区域。'
  const user =
    `区域（width/height 与落入其中的真实文字 items：text/rx/ry/rw/rh，坐标相对区域左上角）：\n${JSON.stringify(
      regionInputs.map((r) => ({ ...r, items: r.items.slice(0, 40) })),
      null,
      1,
    )}\n\n` +
    '只输出 JSON：{"regions":[{"index":0,"nodes":[{"text":"...","rx":0,"ry":0,"rw":100,"rh":18}]}]}。'

  const raw = await completeWithHostLlm(hostCtx, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])

  let refinedCount = 0
  try {
    const parsed = JSON.parse(extractJsonBlock(raw)) as {
      regions?: Array<{
        index?: number
        nodes?: Array<{
          text?: string
          rx?: number
          ry?: number
          rw?: number
          rh?: number
        }>
      }>
    }
    let inferSeq = 0
    for (const regionResult of parsed.regions ?? []) {
      const idx = Number(regionResult.index)
      const region = regions[idx]
      const input = regionInputs[idx]
      if (!region || !input) continue
      const allowed = new Set(input.items.map((i) => i.text))
      const refined: HifiRenderNode[] = []
      for (const n of regionResult.nodes ?? []) {
        const text = String(n.text ?? '').trim()
        if (!text) continue
        // Defence: keep only text present in (or overlapping) the real copy.
        const anchored =
          allowed.has(text) ||
          [...allowed].some((a) => a.includes(text) || text.includes(a))
        if (!anchored) continue
        inferSeq += 1
        refined.push({
          id: `ai_${inferSeq}`,
          name: 'ai-inferred',
          kind: 'text',
          x: region.x + Number(n.rx ?? 0),
          y: region.y + Number(n.ry ?? 0),
          width: Math.max(8, Number(n.rw ?? text.length * 8)),
          height: Math.max(12, Number(n.rh ?? 16)),
          aiInferred: true,
          style: { fontSize: 12 },
          text,
          children: [],
        })
      }
      if (refined.length) {
        region.aiInferred = true
        region.inferredChildren = refined
        refinedCount += 1
      }
    }
  } catch {
    throw new Error('无法解析 AI 返回的区域内容')
  }
  return refinedCount
}

async function readFileSafe(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8')
  } catch {
    throw new Error(`无法读取布局文件：${file}`)
  }
}

/** Convert a normalized design doc into the hifi wire shape. */
function designDocToHifi(
  design: DesignDoc,
  iconEnrich: {
    groupUrls: Map<string, string>
    iconUrls: Map<string, string>
    suppressed: Set<string>
  },
  imageUrls?: Map<string, string>,
): HifiWireNode {
  const { groupUrls, iconUrls, suppressed } = iconEnrich
  function convert(n: DesignNode): HifiWireNode {
    const style: HifiWireNode['style'] = {}
    if (typeof n.style.backgroundColor === 'string') {
      style.backgroundColor = n.style.backgroundColor
    }
    if (n.style.gradient) style.gradient = n.style.gradient
    if (typeof n.style.color === 'string') style.color = n.style.color
    if (typeof n.style.fontSize === 'number') style.fontSize = n.style.fontSize
    if (typeof n.style.fontWeight === 'number') style.fontWeight = n.style.fontWeight
    if (n.style.fontFamily) style.fontFamily = n.style.fontFamily
    if (n.style.textAlign) style.textAlign = n.style.textAlign
    if (typeof n.style.cornerRadius === 'number') style.borderRadius = n.style.cornerRadius
    if (Array.isArray(n.style.cornerRadii)) style.borderRadii = n.style.cornerRadii
    if (typeof n.style.lineHeight === 'number') style.lineHeight = n.style.lineHeight
    if (n.style.imageFit) style.imageFit = n.style.imageFit
    if (typeof n.style.opacity === 'number') style.opacity = n.style.opacity
    if (typeof n.style.borderWidth === 'number') style.borderWidth = n.style.borderWidth
    if (typeof n.style.borderColor === 'string') style.borderColor = n.style.borderColor
    // A composite icon container is rendered to one image; it becomes an
    // 'icon' node and its whole subtree is dropped (the image already contains
    // the boolean/mask/layer-built glyph).
    const groupImageUrl = groupUrls.get(n.id)
    // Standalone vector rendered to an image (group takes precedence).
    const iconImageUrl = groupImageUrl ?? iconUrls.get(n.id)
    // IMAGE-paint content (avatars/photos) resolved from its fill asset ref.
    const fillImageUrl =
      !iconImageUrl && n.style.imageRef ? imageUrls?.get(n.style.imageRef) : undefined
    const isAbsorbed = suppressed.has(n.id)
    return {
      id: n.id,
      name: n.name,
      kind: groupImageUrl ? 'icon' : n.kind,
      text: n.text,
      imageUrl: iconImageUrl ?? fillImageUrl,
      x: typeof n.box.x === 'number' ? n.box.x : 0,
      y: typeof n.box.y === 'number' ? n.box.y : 0,
      width: typeof n.box.width === 'number' ? n.box.width : 0,
      height: typeof n.box.height === 'number' ? n.box.height : 0,
      style,
      // Nodes absorbed into a composite icon image are not painted again.
      children: isAbsorbed ? [] : n.children.map(convert),
    }
  }
  return convert(design.root)
}

/**
 * Maximum logical-pixel box for a container to be treated as one composite
 * icon (rather than a structural region). Avatars/photos are IMAGE nodes and
 * are excluded regardless of size.
 */
const ICON_GROUP_MAX = 80

interface SubtreeSummary {
  hasIcon: boolean
  hasText: boolean
  hasImage: boolean
}

function summarizeSubtree(n: DesignNode): SubtreeSummary {
  let hasIcon = n.kind === 'icon'
  let hasText = n.kind === 'text'
  let hasImage = n.kind === 'image'
  for (const c of n.children) {
    const s = summarizeSubtree(c)
    hasIcon = hasIcon || s.hasIcon
    hasText = hasText || s.hasText
    hasImage = hasImage || s.hasImage
  }
  return { hasIcon, hasText, hasImage }
}

/**
 * A node qualifies as a composite-icon container when it is a structural node
 * (not itself a vector/text/image), its subtree contains vector glyphs but no
 * text or raster images, and its box is icon-sized. Such icons are often built
 * from boolean operations / masks / multiple layers that can't be reconstructed
 * by painting each path, so the whole container is rendered to one image.
 */
function isIconGroup(n: DesignNode): boolean {
  if (n.kind === 'icon' || n.kind === 'text' || n.kind === 'image') return false
  const { width, height } = n.box
  if (typeof width !== 'number' || typeof height !== 'number') return false
  if (width <= 0 || height <= 0 || width > ICON_GROUP_MAX || height > ICON_GROUP_MAX) return false
  const s = summarizeSubtree(n)
  return s.hasIcon && !s.hasText && !s.hasImage
}

/**
 * Collect the OUTERMOST composite-icon containers. Descendants of a selected
 * group are pruned (rendered as part of that one image), so they are never
 * returned as further groups.
 */
function collectIconGroups(design: DesignDoc): DesignNode[] {
  const groups: DesignNode[] = []
  const walk = (n: DesignNode): void => {
    if (isIconGroup(n)) {
      groups.push(n)
      return
    }
    for (const c of n.children) walk(c)
  }
  walk(design.root)
  return groups
}

/**
 * Collect every standalone vector-icon node id — i.e. icon nodes NOT inside a
 * composite-icon container (those are rendered together with their container).
 * These are the VECTOR / STAR / LINE / BOOLEAN / ELLIPSE layers whose paths are
 * otherwise dropped in normalization, so they have to be server-rendered.
 */
function collectIconIds(design: DesignDoc, suppressed: Set<string>): string[] {
  const ids: string[] = []
  const visit = (n: DesignNode): void => {
    if (suppressed.has(n.id)) return
    // Icon nodes with a real, non-tiny box are worth rendering; sub-6px marks
    // are usually accents and just add noise/requests.
    if (
      n.kind === 'icon' &&
      typeof n.box.width === 'number' &&
      typeof n.box.height === 'number' &&
      n.box.width >= 6 &&
      n.box.height >= 6
    ) {
      ids.push(n.id)
    }
    for (const child of n.children) visit(child)
  }
  visit(design.root)
  return ids
}

/** All ids inside a composite-icon container's subtree (excluding the root). */
function descendantIds(root: DesignNode): Set<string> {
  const ids = new Set<string>()
  const walk = (n: DesignNode): void => {
    for (const c of n.children) {
      ids.add(c.id)
      walk(c)
    }
  }
  walk(root)
  return ids
}

/**
 * Resolve design icon images in two forms and return both, plus the set of node
 * ids absorbed into a composite icon:
 *  - groupUrls: outermost icon-bearing container -> one rendered image;
 *  - iconUrls:  standalone vector -> rendered image.
 * Icons are tiny but a screen can carry dozens, so requests are chunked. Any
 * chunk failure degrades gracefully (those icons simply stay blank) rather than
 * failing the whole compare.
 */
async function enrichDesignIcons(
  design: DesignDoc,
  body: Record<string, unknown>,
): Promise<{ groupUrls: Map<string, string>; iconUrls: Map<string, string>; suppressed: Set<string> }> {
  const groupUrls = new Map<string, string>()
  const iconUrls = new Map<string, string>()
  const suppressed = new Set<string>()

  const designUrl = String(body.figmaUrl ?? body.designUrl ?? '').trim()
  // Lanhu cover is whole-artboard only — no per-vector Figma-style renders.
  if (isLanhuUrl(designUrl)) return { groupUrls, iconUrls, suppressed }

  const token = String(body.figmaToken ?? body.designToken ?? body.lanhuCookie ?? '').trim()
  if (!token) return { groupUrls, iconUrls, suppressed }
  const fileKey = parseFigmaFileKey(designUrl)

  const renderBatch = async (ids: string[]): Promise<Map<string, string>> => {
    const out = new Map<string, string>()
    const ICON_CHUNK = 30
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += ICON_CHUNK) {
      chunks.push(ids.slice(i, i + ICON_CHUNK))
    }
    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const map = await renderFigmaNodesBatch(fileKey, chunk, {
            token,
            scale: 2,
            format: 'png',
            timeoutMs: 30000,
            attempts: 3,
          })
          for (const [id, url] of map) out.set(id, url)
        } catch {
          /* this chunk failed: leave those icons blank, keep comparing */
        }
      }),
    )
    return out
  }

  // Composite icon containers first; mark their subtree absorbed.
  const groups = collectIconGroups(design)
  for (const g of groups) {
    for (const id of descendantIds(g)) suppressed.add(id)
  }
  if (groups.length) {
    const resolved = await renderBatch(groups.map((g) => g.id))
    for (const g of groups) {
      const url = resolved.get(g.id)
      // Only suppress the subtree when the container actually rendered,
      // otherwise fall back to per-vector rendering for its glyphs.
      if (url) groupUrls.set(g.id, url)
      else for (const id of descendantIds(g)) suppressed.delete(id)
    }
  }

  // Standalone vectors outside a successfully-rendered composite container.
  const iconIds = collectIconIds(design, suppressed)
  if (iconIds.length) {
    const resolved = await renderBatch(iconIds)
    for (const [id, url] of resolved) iconUrls.set(id, url)
  }

  return { groupUrls, iconUrls, suppressed }
}

/**
 * Collect distinct IMAGE-pill asset refs (avatars/photos) and resolve them all
 * in one request, returning imageRef -> URL. Best effort; a failure leaves the
 * placeholders to their background colour rather than failing the compare.
 */
async function enrichDesignImageFills(
  design: DesignDoc,
  body: Record<string, unknown>,
): Promise<Map<string, string>> {
  const refs = new Set<string>()
  const visit = (n: DesignNode): void => {
    if (n.kind === 'image' && typeof n.style.imageRef === 'string') refs.add(n.style.imageRef)
    for (const child of n.children) visit(child)
  }
  visit(design.root)

  const result = new Map<string, string>()
  if (!refs.size) return result
  const designUrl = String(body.figmaUrl ?? body.designUrl ?? '').trim()
  // Lanhu imageRef values are already absolute CDN URLs.
  if (isLanhuUrl(designUrl)) {
    for (const ref of refs) {
      if (/^https?:\/\//i.test(ref)) result.set(ref, ref)
    }
    return result
  }
  const token = String(body.figmaToken ?? body.designToken ?? '').trim()
  if (!token) return result
  const fileKey = parseFigmaFileKey(designUrl)
  try {
    const map = await fetchFigmaImageFills(fileKey, [...refs], {
      token,
      timeoutMs: 30000,
      attempts: 3,
    })
    for (const [ref, url] of map) result.set(ref, url)
  } catch {
    /* image fills could not be resolved: keep placeholders */
  }
  return result
}

/**
 * Best-effort git context (branch / HEAD / working-tree status / recent change
 * to the entry file) for folders that are git repositories. Returns '' for
 * non-git folders (UI 走查 also supports plain local code).
 */
async function summarizeGitContext(
  checkoutPath: string,
  relativePath: string,
): Promise<string> {
  try {
    const lines: string[] = []
    const branch = await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: checkoutPath })
    lines.push(`当前分支：${branch.stdout.trim()}`)
    const head = await gitExec(['rev-parse', 'HEAD'], { cwd: checkoutPath })
    lines.push(`HEAD：${head.stdout.trim()}`)
    try {
      const changed = await gitExec(['status', '--porcelain'], { cwd: checkoutPath })
      const list = changed.stdout.trim()
      lines.push(list ? `工作区改动（前若干）：\n${list.split('\n').slice(0, 20).join('\n')}` : '工作区干净，无未提交改动。')
    } catch {
      /* status optional */
    }
    try {
      const last = await gitExec(
        ['log', '-1', '--pretty=%h %ad %s', '--date=short', '--', relativePath],
        { cwd: checkoutPath },
      )
      if (last.stdout.trim()) lines.push(`该入口文件最近一次提交：${last.stdout.trim()}`)
    } catch {
      /* log optional */
    }
    return lines.join('\n')
  } catch {
    return ''
  }
}

/**
 * Entry page + same-basename siblings (styles / scripts / configs) for non-XML stacks.
 */
async function formatSourceFileManifest(
  checkoutPath: string,
  relativePath: string,
): Promise<string> {
  const relPosix = relativePath.replace(/\\/g, '/')
  const abs = path.join(checkoutPath, relativePath)
  const dir = path.dirname(abs)
  const entryName = path.basename(abs)
  const base = entryName.replace(/\.[^.]+$/i, '')
  const lines: string[] = [`入口源文件：${relPosix}`]
  try {
    const entries = await readdir(dir)
    const siblings = entries
      .filter((name) => name !== entryName && name.toLowerCase().startsWith(base.toLowerCase() + '.'))
      .sort()
    if (siblings.length > 0) {
      lines.push('同目录关联文件：')
      const dirRel = path.dirname(relPosix)
      for (const name of siblings) {
        const siblingRel = dirRel === '.' ? name : `${dirRel}/${name}`
        lines.push(`- ${siblingRel}`)
      }
    }
  } catch {
    /* directory listing optional */
  }
  lines.push('')
  lines.push('说明：请从入口文件出发，按 import / 组件引用 / 路由配置继续读取相关源文件。')
  return lines.join('\n')
}

/**
 * Build the "AI 协助分析" starter prompt from the developer's REAL code.
 * Android XML gets a full layout dependency closure; other adapters get the
 * entry page plus co-located siblings. The agent reads those files itself.
 */
export async function buildCodeVisualAnalysis(
  body: Record<string, unknown>,
): Promise<{ prompt: string; designImageUrl?: string; jobId: string }> {
  const repoInput = String(body.repoPath ?? body.repo ?? '').trim()
  const adapterId = String(body.adapterId ?? '').trim()
  const relativePath = String(body.relativePath ?? '').trim()
  if (!repoInput || !adapterId || !relativePath) {
    throw new Error('缺少 repoPath / adapterId / relativePath')
  }
  const ctx = await resolveVisualRepo(repoInput, body)
  const design = await loadDesign(body)
  const adapter = getPlatformAdapter(adapterId)
  const platformLabel = adapter?.kindLabel ?? adapterId
  const isAndroidXml = adapterId === 'android-xml'

  let dependencyManifest: string
  let manifestMode: 'android-xml' | 'source-files'
  if (isAndroidXml) {
    const resources = await loadAndroidProjectResources(ctx.checkoutPath)
    const built = await buildAndroidRenderContext(ctx.checkoutPath, resources)
    const entryLayoutName = path.basename(relativePath, path.extname(relativePath))
    const manifest = await analyzeLayoutDependencies(entryLayoutName, built, resources)
    dependencyManifest = formatDependencyManifest(manifest, ctx.checkoutPath)
    manifestMode = 'android-xml'
  } else {
    dependencyManifest = await formatSourceFileManifest(ctx.checkoutPath, relativePath)
    manifestMode = 'source-files'
  }

  // Best-effort design raster so multimodal models can see the design.
  let designImageUrl: string | undefined
  try {
    designImageUrl = (await renderDesignRaster(body))?.url
  } catch {
    designImageUrl = undefined
  }

  // Node-specific design link kept only as a reference (do not ask the model to fetch).
  const rawFigmaUrl = String(body.figmaUrl ?? body.designUrl ?? '').trim()
  const nodeIdRest = String(design.root.id ?? '')
  const nodeFigmaUrl = nodeIdRest ? designUrlForNode(rawFigmaUrl, nodeIdRest) : rawFigmaUrl

  let figmaFileKey = ''
  try {
    figmaFileKey = designCacheFileKey(rawFigmaUrl)
  } catch {
    figmaFileKey = ''
  }

  // Best-effort static diffs already computed by the same engine the board uses.
  let staticDiffSummary: string | undefined
  try {
    const pages = await discoverAllPages(ctx.checkoutPath)
    const page = pages.find(
      (p) => p.adapterId === adapterId && p.relativePath === relativePath,
    )
    if (page) {
      const cmp = await compareDesignWithPage(design, page)
      if (cmp.result?.diffs) {
        staticDiffSummary = formatStaticDiffSummary(cmp.result.diffs, { max: 40 })
      }
    }
  } catch {
    staticDiffSummary = undefined
  }

  const gitSummary = await summarizeGitContext(ctx.checkoutPath, relativePath)

  // Create a visual review job so the model can write findings back and pull
  // design structure on demand via tracescope_get_design_snapshot(jobId).
  const visualJob = createVisualJob({
    repoInput,
    fileKey: figmaFileKey,
    designId: nodeIdRest,
    adapterId,
    relativePath,
    designName: design.root.name || relativePath,
    designDoc: design,
  })

  const prompt = buildCodeVisualPrompt({
    designName: design.root.name || relativePath,
    figmaUrl: nodeFigmaUrl,
    designImageUrl,
    staticDiffSummary,
    repoPath: ctx.checkoutPath,
    platformLabel,
    codeRelativePath: relativePath,
    dependencyManifest,
    manifestMode,
    gitSummary: gitSummary || undefined,
    jobId: visualJob.id,
  })
  return { prompt, designImageUrl, jobId: visualJob.id }
}

/**
 * Load persisted AI review findings for one page (used after the plugin
 * reopens, when the in-memory job is gone but the on-disk report remains).
 * Returns `{ found:false }` when nothing is saved yet.
 */
export async function loadPageFindings(
  body: Record<string, unknown>,
): Promise<{ found: boolean; savedAt?: string; report?: unknown }> {
  const repoInput = String(body.repoPath ?? body.repo ?? '').trim()
  const figmaUrlRaw = String(body.figmaUrl ?? body.designUrl ?? '').trim()
  const nodeId = String(body.designId ?? '').trim()
  const adapterId = String(body.adapterId ?? '').trim()
  const relativePath = String(body.relativePath ?? '').trim()
  if (!repoInput || !figmaUrlRaw || !nodeId || !relativePath) {
    throw new Error('缺少 repoPath / figmaUrl / designId / relativePath')
  }
  const fileKey = designCacheFileKey(figmaUrlRaw)
  const key = visualFindingsKey(repoInput, fileKey, nodeId, relativePath)
  const stored = await loadVisualFindings<unknown>(key)
  if (!stored?.payload) return { found: false }
  return { found: true, savedAt: stored.savedAt, report: stored.payload }
}

export interface AiRematchCandidate {
  adapterId: string
  kindLabel: string
  relativePath: string
  precise: boolean
  score: number
  reasons: string[]
}

/**
 * Build a composer prompt for "重新推荐文件".
 * Does NOT call the host LLM — the user reviews the prompt in chat, sends it,
 * and can continue the conversation to correct bad recommendations.
 */
export async function buildPageRematchAnalysis(
  body: Record<string, unknown>,
): Promise<{ prompt: string; candidateCount: number; jobId: string }> {
  const repoInput = String(body.repoPath ?? body.repo ?? '').trim()
  const designId = String(body.designId ?? '').trim()
  if (!repoInput || !designId) throw new Error('缺少 repoPath / designId')

  const figmaUrl = String(body.figmaUrl ?? body.designUrl ?? '').trim()
  const nodeUrl = designUrlForNode(figmaUrl, designId)

  const design = await loadDesign({ ...body, figmaUrl: nodeUrl })
  const ctx = await resolveVisualRepo(repoInput, body)

  let deterministic: Awaited<ReturnType<typeof locatePagesForDesign>> = []
  try {
    deterministic = await locatePagesForDesign(design, ctx.checkoutPath)
  } catch (err) {
    throw new Error(`静态匹配失败：${(err as Error).message}`)
  }

  const pool = deterministic.slice(0, 20)
  const fp = designFingerprint(design)
  const sampleTexts = fp.texts.slice(0, 24)

  const currentAdapterId = String(body.adapterId ?? '').trim()
  const currentRelativePath = String(body.relativePath ?? '').trim()
  const currentSelection =
    currentAdapterId && currentRelativePath
      ? { adapterId: currentAdapterId, relativePath: currentRelativePath }
      : undefined

  let figmaFileKey = ''
  try {
    figmaFileKey = designCacheFileKey(figmaUrl)
  } catch {
    figmaFileKey = ''
  }

  const rematchJob = createVisualJob({
    kind: 'rematch',
    repoInput,
    fileKey: figmaFileKey,
    designId,
    adapterId: currentAdapterId,
    relativePath: currentRelativePath,
    designName: design.root.name || designId,
  })

  const prompt = buildPageRematchPrompt({
    designName: design.root.name || designId,
    designId,
    figmaUrl: nodeUrl || figmaUrl,
    repoPath: ctx.checkoutPath,
    sampleTexts,
    currentSelection,
    jobId: rematchJob.id,
    candidates: pool.map((m) => ({
      adapterId: m.page.adapterId,
      kindLabel: m.page.kindLabel,
      relativePath: m.page.relativePath,
      score: m.score,
      reasons: m.reasons,
      codeTexts: m.page.fingerprint.texts.slice(0, 12),
    })),
  })

  return { prompt, candidateCount: pool.length, jobId: rematchJob.id }
}

/**
 * Re-rank code page candidates for one design screen with the host LLM.
 * Deterministic matchPages runs first; AI only reorders / picks among the
 * top pool using design name + sample texts (already loaded locally).
 *
 * @deprecated Prefer {@link buildPageRematchAnalysis} + chat composer so the
 * user can review/continue the conversation. Kept for compatibility.
 */
export async function aiRematchDesignPage(
  body: Record<string, unknown>,
  hostCtx: Context,
): Promise<{
  candidates: AiRematchCandidate[]
  aiNote?: string
  usedAi: boolean
}> {
  const repoInput = String(body.repoPath ?? body.repo ?? '').trim()
  const designId = String(body.designId ?? '').trim()
  if (!repoInput || !designId) throw new Error('缺少 repoPath / designId')

  // Point the design URL at this node so loadDesign fetches the right frame.
  const figmaUrl = String(body.figmaUrl ?? body.designUrl ?? '').trim()
  const nodeUrl = designUrlForNode(figmaUrl, designId)
  const design = await loadDesign({ ...body, figmaUrl: nodeUrl })
  const ctx = await resolveVisualRepo(repoInput, body)
  let deterministic
  try {
    deterministic = await locatePagesForDesign(design, ctx.checkoutPath)
  } catch (err) {
    throw new Error(`静态匹配失败：${(err as Error).message}`)
  }

  const pool = deterministic.slice(0, 20)
  if (!pool.length) {
    return {
      candidates: [],
      usedAi: false,
      aiNote: '静态匹配未找到候选；请手动搜索代码文件。',
    }
  }

  const fp = designFingerprint(design)
  const sampleTexts = fp.texts.slice(0, 24)
  const catalog = pool.map((m, i) => ({
    index: i,
    adapterId: m.page.adapterId,
    kindLabel: m.page.kindLabel,
    relativePath: m.page.relativePath,
    score: m.score,
    reasons: m.reasons,
    codeTexts: m.page.fingerprint.texts.slice(0, 12),
  }))

  try {
    const raw = await completeWithHostLlm(
      hostCtx,
      [
        {
          role: 'system',
          content:
            '你是 UI 走查助手。根据设计稿页面名称与文案，从候选代码文件中选出最可能实现该页面的文件。只输出 JSON，不要 markdown。',
        },
        {
          role: 'user',
          content: [
            `设计页名称：${design.root.name}`,
            `设计文案样本：${JSON.stringify(sampleTexts)}`,
            '候选列表（index 从 0 开始）：',
            JSON.stringify(catalog, null, 2),
            '',
            '请返回 JSON：{"picks":[{"index":0,"confidence":0.0到1.0,"reason":"简短中文理由"}],"note":"可选说明"}',
            'picks 按匹配优先排序，最多 5 项；index 必须来自候选列表。',
          ].join('\n'),
        },
      ],
      { temperature: 0.1, maxTokens: 1200 },
    )
    const jsonText = extractJsonBlock(raw)
    const parsed = JSON.parse(jsonText) as {
      picks?: Array<{ index?: number; confidence?: number; reason?: string }>
      note?: string
    }
    const picks = Array.isArray(parsed.picks) ? parsed.picks : []
    const remapped: AiRematchCandidate[] = []
    const seen = new Set<string>()
    for (const pick of picks) {
      const idx = Number(pick.index)
      if (!Number.isFinite(idx) || idx < 0 || idx >= pool.length) continue
      const m = pool[idx]!
      const key = m.page.adapterId + '::' + m.page.relativePath
      if (seen.has(key)) continue
      seen.add(key)
      const conf =
        typeof pick.confidence === 'number' && pick.confidence >= 0 && pick.confidence <= 1
          ? pick.confidence
          : Math.min(1, m.score + 0.15)
      remapped.push({
        adapterId: m.page.adapterId,
        kindLabel: m.page.kindLabel,
        relativePath: m.page.relativePath,
        precise: m.page.precise,
        score: Math.round(conf * 1000) / 1000,
        reasons: [
          pick.reason ? `AI：${pick.reason}` : 'AI 推荐',
          ...m.reasons,
        ],
      })
    }
    // Append remaining deterministic candidates not picked by AI.
    for (const m of pool) {
      const key = m.page.adapterId + '::' + m.page.relativePath
      if (seen.has(key)) continue
      remapped.push({
        adapterId: m.page.adapterId,
        kindLabel: m.page.kindLabel,
        relativePath: m.page.relativePath,
        precise: m.page.precise,
        score: m.score,
        reasons: m.reasons,
      })
    }
    return {
      candidates: remapped,
      usedAi: true,
      aiNote: parsed.note || '已用 AI 重排候选；请确认后点「界面对比」。',
    }
  } catch (err) {
    return {
      candidates: pool.map((m) => ({
        adapterId: m.page.adapterId,
        kindLabel: m.page.kindLabel,
        relativePath: m.page.relativePath,
        precise: m.page.precise,
        score: m.score,
        reasons: m.reasons,
      })),
      usedAi: false,
      aiNote: `AI 重排不可用（${(err as Error).message}），已回退到静态匹配结果。`,
    }
  }
}

