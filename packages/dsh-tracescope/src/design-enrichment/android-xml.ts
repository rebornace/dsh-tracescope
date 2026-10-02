/**
 * Android XML enrichment for design-static compare.
 *
 * Uses the layout engine + adapter-binding expand so RecyclerView regions get
 * real item tiles. Registered into the enrichment registry; the main compare
 * path stays adapter-agnostic.
 */
import {
  loadAndroidProjectResources,
  buildAndroidRenderContext,
  renderAndroidLayout,
  renderAndroidItemLayout,
  layoutTreeToDesignDoc,
  analyzeLayoutDependencies,
  relatedFromAndroidManifest,
  relatedFilesAbsolute,
  analyzeAdapterBindings,
  walkFiles,
  parseXml,
  isPreviewPlaceholderText,
  type DesignDoc,
  type DesignNode,
  type LayoutRenderNode,
  type AdapterBindings,
  type AndroidRenderContext,
  type RelatedSourceFile,
  type XmlElement,
} from '@rebornace/tracescope-core'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { registerDesignEnrichment } from './registry.js'
import type { DesignCompareEnrichment } from './types.js'
import { serializeLayoutTree } from './wire.js'

async function readFileSafe(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8')
  } catch {
    throw new Error(`无法读取布局文件：${file}`)
  }
}

interface FlatBox {
  x: number
  y: number
  width: number
  height: number
}

function flattenLayout(root: LayoutRenderNode): LayoutRenderNode[] {
  const out: LayoutRenderNode[] = []
  const walk = (node: LayoutRenderNode): void => {
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
function offsetNode(node: LayoutRenderNode, dx: number, dy: number): LayoutRenderNode {
  const clone: LayoutRenderNode = {
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
  codeRoot: LayoutRenderNode,
  entryLayout: string,
  deps: Omit<ExpandDeps, 'bindings'> & { bindings: AdapterBindings },
): Promise<number> {
  const regions = flattenLayout(codeRoot).filter((n) => n.dynamic)
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
  region: LayoutRenderNode,
  deps: ExpandDeps,
  guard: { depth: number; budget: number },
): Promise<LayoutRenderNode[]> {
  if (guard.depth > 6) return []
  const itemLayoutName = deps.bindings.layouts[containingLayout]?.[region.id]
  if (!itemLayoutName) return []
  const itemEntry = await deps.resolveLayoutEntry(itemLayoutName)
  const containingEntry = await deps.resolveLayoutEntry(containingLayout)
  if (!itemEntry || !containingEntry) return []

  const dir = regionOrientation(containingEntry.content, region.id)

  const tiles: LayoutRenderNode[] = []
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
    const flat: LayoutRenderNode[] = []
    const collect = async (node: LayoutRenderNode): Promise<void> => {
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
  region: LayoutRenderNode,
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
 * After item-layout expand: overwrite tools:text / identical-template texts in
 * each dynamic region's inferredChildren with design copy that falls inside
 * the region (deterministic static fill — no AI).
 */
function seedDynamicTextsFromDesign(
  codeRoot: LayoutRenderNode,
  design: DesignDoc,
): number {
  const regions = flattenLayout(codeRoot).filter(
    (n) => n.dynamic && n.itemRendered && n.inferredChildren?.length,
  )
  if (!regions.length) return 0
  const paint = collectDesignPaintItems(design)
  let changed = 0
  for (const region of regions) {
    const designTexts = paint
      .filter((t) => t.kind === 'text' && t.text?.trim() && isInsideRegion(t, region))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((t) => t.text!.replace(/\s+/g, ' ').trim())
    if (!designTexts.length) continue

    const textNodes = region.inferredChildren!.filter(
      (n) => n.kind === 'text' || n.text !== undefined,
    )
    if (!textNodes.length) continue

    // Treat as template clones when every text slot repeats the same value,
    // or when the value looks like tools:text / preview filler.
    const textValues = textNodes.map((n) => n.text)
    const allSame =
      textValues.length >= 2 && textValues.every((t) => t === textValues[0])
    let di = 0
    for (const node of textNodes) {
      if (!allSame && !isPreviewPlaceholderText(node.text)) continue
      const next = designTexts[di % designTexts.length]!
      di += 1
      if (node.text === next) continue
      node.text = next
      changed += 1
    }
  }
  return changed
}

/**
 * Stage 1 (always, deterministic): project the real design content that falls
 * inside each runtime region into {@link LayoutRenderNode.inferredChildren}.
 * Projects the FULL geometry — card background rectangles, image placeholders,
 * icons and text with their real styles and positions — not just bare text, so
 * the code-side list visually reconstructs the cards. Returns filled regions.
 */
function projectRuntimeRegions(
  codeRoot: LayoutRenderNode,
  design: DesignDoc,
  fillUrls: Map<string, string>,
): number {
  // FALLBACK ONLY: skip regions already populated (e.g. real item rows from
  // adapter bindings) so they are not overwritten by projected design content.
  const regions = flattenLayout(codeRoot).filter(
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
      const node: LayoutRenderNode = {
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

async function collectRelatedAndFingerprint(
  checkoutPath: string,
  relativePath: string,
) {
  const resources = await loadAndroidProjectResources(checkoutPath)
  const built = await buildAndroidRenderContext(checkoutPath, resources)
  const entryLayoutName = path.basename(relativePath, path.extname(relativePath))
  const depManifest = await analyzeLayoutDependencies(entryLayoutName, built, resources)
  let related = relatedFromAndroidManifest(checkoutPath, relativePath, depManifest)
  try {
    const sourceFiles = await collectAdapterSourceFiles(checkoutPath, entryLayoutName)
    if (sourceFiles.length && related) {
      const seen = new Set(related.files.map((f) => f.relativePath))
      const extra: RelatedSourceFile[] = []
      for (const sf of sourceFiles) {
        const rel = path.relative(checkoutPath, sf.path).replace(/\\/g, '/')
        if (!rel || rel.startsWith('..') || seen.has(rel)) continue
        seen.add(rel)
        extra.push({
          relativePath: rel,
          role: 'import',
          reason: '引用入口 layout 的 Activity/Fragment/Adapter',
        })
      }
      if (extra.length) {
        related = { entry: related.entry, files: [...related.files, ...extra] }
      }
    }
  } catch {
    /* optional */
  }
  const fingerprintFiles = [
    depManifest.entryLayout,
    ...depManifest.layouts,
    ...depManifest.drawables,
    ...depManifest.colorFiles,
    ...depManifest.dimenFiles,
    ...depManifest.stringFiles,
    ...depManifest.styleFiles,
    ...relatedFilesAbsolute(checkoutPath, related).filter((p) => /\.(kt|java)$/i.test(p)),
  ]
  return { related, fingerprintFiles }
}

export const androidXmlEnrichment: DesignCompareEnrichment = {
  adapterId: 'android-xml',

  async resolveRelated({ checkoutPath, relativePath }) {
    try {
      return await collectRelatedAndFingerprint(checkoutPath, relativePath)
    } catch {
      return null
    }
  },

  async buildCodeCompare({ checkoutPath, relativePath, design, viewport, fillUrls }) {
    const resources = await loadAndroidProjectResources(checkoutPath)
    const built = await buildAndroidRenderContext(checkoutPath, resources)
    const entryLayoutName = path.basename(relativePath, path.extname(relativePath))
    const layoutFile = path.join(checkoutPath, relativePath)
    const layoutXml = await readFileSafe(layoutFile)
    const codeLayout = await renderAndroidLayout({
      layoutXml,
      width: viewport.width,
      height: viewport.height,
      context: built.context,
      resolveLayout: built.resolveLayout,
    })

    const sourceFiles = await collectAdapterSourceFiles(checkoutPath, entryLayoutName)
    const bindings = analyzeAdapterBindings(entryLayoutName, sourceFiles)
    const itemRegions = await expandAllDynamicRegions(codeLayout.root, entryLayoutName, {
      bindings,
      resolveLayoutEntry: built.resolveLayoutEntry,
      context: built.context,
      resolveLayout: built.resolveLayout,
    })
    const seededTexts = seedDynamicTextsFromDesign(codeLayout.root, design)
    const projectedRegions = projectRuntimeRegions(codeLayout.root, design, fillUrls)
    const codeDoc = layoutTreeToDesignDoc(codeLayout.root)

    const totalRegions = flattenLayout(codeLayout.root).filter((n) => n.dynamic).length
    let note: string
    if (itemRegions > 0) {
      note =
        projectedRegions > 0
          ? `已按代码自身的 item 布局还原 ${itemRegions} 个列表` +
            (seededTexts > 0 ? `（静态填入 ${seededTexts} 处文案）` : '') +
            `，另有 ${projectedRegions} 个区域未找到 item 布局、暂以设计稿内容示意`
          : `已按代码自身的 item 布局还原 ${itemRegions} 个运行时列表（共 ${totalRegions} 个动态区域）` +
            (seededTexts > 0 ? `，静态填入 ${seededTexts} 处设计文案` : '')
    } else if (projectedRegions > 0) {
      note = `未从代码解析到 item 布局，已用设计稿内容示意 ${projectedRegions} 个区域（可在聊天中让 AI 协助）。`
    } else {
      note = '未识别到可填充的运行时区域。'
    }

    return {
      codeDoc,
      codeTree: serializeLayoutTree(codeLayout.root),
      note,
      kindLabel: 'Android XML',
    }
  },
}

registerDesignEnrichment(androidXmlEnrichment)
