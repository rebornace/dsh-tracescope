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
  type DesignPageMapping,
  type FigmaCanvasSummary,
} from '@rebornace/tracescope-core'
import type {
  DesignNode,
  VisualCompareResult,
} from '@rebornace/tracescope-core'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { resolveRequestGitAuth } from './request-auth.js'

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

/** Fetch the design doc from the Figma link/token. */
export async function loadDesign(body: Record<string, unknown>): Promise<DesignDoc> {
  const figmaUrl = String(body.figmaUrl ?? '').trim()
  const figmaToken = String(body.figmaToken ?? '').trim()
  if (!figmaUrl || !figmaToken) throw new Error('需要设计稿链接和访问 Token')
  return await fetchFigmaDoc(figmaUrl, undefined, { token: figmaToken })
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
  reason?: string
  result?: VisualCompareResult
  /** Temporary Figma render of the design frame (precise comparisons only). */
  designImageUrl?: string
  /** Absolute frame box, used to convert node coords for image overlay. */
  frameBox?: { x: number; y: number; width: number; height: number }
  /** Design tree (absolute coords) keyed for diff -> box lookup. */
  designTree?: WireNode
  /** Code tree rendered as blocks on the right side. */
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

  // Locator-only implementations (Compose/SwiftUI) report why instead of
  // producing a misleading diff; nothing to render.
  if (!page.precise) {
    return {
      page: pageMeta,
      precise: false,
      reason: `${page.kindLabel} 页面已定位，但该实现以代码方式构建界面，当前版本暂不支持属性级对比。`,
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
    const rendered = await renderFigmaNode(String(body.figmaUrl ?? '').trim(), undefined, {
      token: String(body.figmaToken ?? '').trim(),
      scale: 2,
    })
    designImageUrl = rendered.url
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
  }>
  totals: { pages: number; matched: number; weak: number; none: number }
}

/**
 * Scan the whole Figma file, classify every design page and code page, and
 * return the design-page -> code-file mapping overview grouped by canvas.
 * The client lets the user confirm or change each suggestion.
 */
export async function matchAllDesignPages(
  body: Record<string, unknown>,
): Promise<MatchAllResult> {
  const repoInput = String(body.repoPath ?? body.repo ?? '').trim()
  const figmaUrl = String(body.figmaUrl ?? '').trim()
  const figmaToken = String(body.figmaToken ?? '').trim()
  if (!repoInput) throw new Error('缺少 repoPath')
  if (!figmaUrl || !figmaToken) throw new Error('需要设计稿链接和访问 Token')

  const ctx = await resolveVisualRepo(repoInput, body)
  const inventory = await fetchFigmaFileInventory(figmaUrl, { token: figmaToken })

  // Batch fetch every page doc (one request keeps this fast).
  const ids = inventory.pages.map((p) => p.id)
  const docs = await fetchFigmaDocsBatch(inventory.fileKey, ids, { token: figmaToken })

  const codePages = await discoverAllPages(ctx.checkoutPath)
  const pageInput = inventory.pages
    .filter((s) => docs.has(s.id))
    .map((summary) => ({ summary, doc: docs.get(summary.id)! }))
  const mappings = mapInventoryPages(pageInput, codePages)

  // Map design id -> canvas for grouping.
  const canvasOf = new Map<string, FigmaCanvasSummary>()
  for (const canvas of inventory.canvases) {
    for (const p of canvas.pages) canvasOf.set(p.id, canvas)
  }

  const totals = { pages: mappings.length, matched: 0, weak: 0, none: 0 }
  const pages = mappings.map((m) => {
    totals[m.status] += 1
    const canvas = canvasOf.get(m.designId)
    return {
      canvasId: canvas?.id ?? '',
      canvasName: canvas?.name ?? '',
      mapping: {
        designId: m.designId,
        designName: m.designName,
        kind: m.kind,
        status: m.status,
        candidates: m.candidates,
      },
    }
  })

  return {
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
  }
}
