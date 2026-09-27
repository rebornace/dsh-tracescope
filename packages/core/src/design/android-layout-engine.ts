/**
 * Android high-fidelity static layout engine.
 *
 * Measures and lays out a layout XML using the *design frame's* size as the
 * viewport, so produced coordinates align 1:1 with the design image. Supports
 * the containers that dominate real apps — LinearLayout, RelativeLayout,
 * FrameLayout and Scroll views — plus basic single-anchor ConstraintLayout.
 * Dynamic surfaces (RecyclerView/ViewPager) and unsupported custom views become
 * clearly marked placeholders instead of being silently dropped.
 *
 * No device or model is required; output is a render tree with absolute boxes
 * and resolved styles/images the client paints with HTML/CSS.
 */
import { parseXml, type XmlElement } from './xml-lite.js'
import type {
  ParsedDrawable,
  ParsedDrawableBitmap,
  ParsedDrawableShape,
} from './android-resources.js'

export interface AndroidRenderContext {
  colors: Record<string, string>
  dimens: Record<string, number>
  strings: Record<string, string>
  drawables: Record<string, ParsedDrawable>
  /** layout name -> parsed XML text (for <include>). */
  layouts: Record<string, string>
}

export type HifiNodeKind = 'frame' | 'text' | 'image' | 'view' | 'dynamic'

export interface HifiRenderNode {
  id: string
  name: string
  kind: HifiNodeKind
  /** Absolute position inside the viewport. */
  x: number
  y: number
  width: number
  height: number
  text?: string
  imageUrl?: string
  /** Resolved paint style (subset the client maps to CSS). */
  style: {
    backgroundColor?: string
    color?: string
    fontSize?: number
    fontWeight?: number
    borderRadius?: number
    borderWidth?: number
    borderColor?: string
    gradient?: ParsedDrawableShape['gradient']
    opacity?: number
    textAlign?: string
  }
  /** True for a surface populated at runtime (list/pager/web). */
  dynamic?: boolean
  /** True when content was produced by an AI best-effort inference. */
  aiInferred?: boolean
  children: HifiRenderNode[]
}

export interface HifiLayoutResult {
  width: number
  height: number
  root: HifiRenderNode
}

type SizeSpec = number | 'match' | 'wrap'

const DYNAMIC_TAGS =
  /recyclerview|viewpager|webview|listview|gridview|adapterview|surfaceview|textureview|mapview|videoview/i

// Containers we lay out explicitly.
function simpleTag(tag: string): string {
  const parts = tag.split('.')
  return parts[parts.length - 1] ?? tag
}

function isScrollContainer(tag: string): boolean {
  return /^(nestedscrollview|scrollview|horizontalscrollview)$/i.test(tag)
}

// ---------------------------------------------------------------------------
// Resource resolution
// ---------------------------------------------------------------------------

const UNIT_DIMENSION = /^(-?\d+(?:\.\d+)?)(dp|dip|px|sp|pt|in|mm)?$/i

function resolveSize(raw: string | undefined, ctx: AndroidRenderContext): SizeSpec | null {
  if (raw === undefined) return null
  const v = raw.trim()
  if (v === 'match_parent' || v === 'fill_parent') return 'match'
  if (v === 'wrap_content') return 'wrap'
  const dimen = v.match(/^@dimen\/(.+)$/)
  if (dimen) {
    const hit = ctx.dimens[dimen[1] ?? '']
    return hit ?? 'wrap'
  }
  // Strip the unit: everything is in logical units here (dp/sp/px all map to
  // the design's logical coordinate system).
  const unitValue = v.match(UNIT_DIMENSION)
  if (unitValue) return Number(unitValue[1])
  return null
}

function resolveColor(raw: string | undefined, ctx: AndroidRenderContext): string | undefined {
  if (!raw) return undefined
  const v = raw.trim()
  const ref = v.match(/^@color\/(.+)$/)
  if (ref) return ctx.colors[ref[1] ?? '']
  if (v.startsWith('#')) {
    let hex = v.toLowerCase()
    if (/^#([0-9a-f]){3}$/.test(hex)) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    }
    if (/^#[0-9a-f]{8}$/.test(hex)) {
      // Android #aarrggbb -> #rrggbbaa.
      hex = `#${hex.slice(3)}${hex.slice(1, 3)}`
    }
    return hex
  }
  return undefined
}

function resolveText(el: XmlElement, ctx: AndroidRenderContext): string | undefined {
  const a = el.attrs
  const direct = a['android:text']
  if (direct !== undefined && !direct.startsWith('@')) return direct
  const strRef = direct?.match(/^@string\/(.+)$/)
  if (strRef && ctx.strings[strRef[1] ?? ''] !== undefined) {
    return ctx.strings[strRef[1] ?? '']
  }
  // Design-time preview hint used by Android Studio.
  const hint = a['tools:text']
  if (hint !== undefined && !hint.startsWith('@')) return hint
  if (hint?.startsWith('@string/')) {
    return ctx.strings[hint.slice('@string/'.length)]
  }
  return undefined
}

function resolveDrawableName(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const m = raw.match(/^@drawable\/(.+)$/)
  return m ? m[1] : undefined
}

function bitmapLogicalSize(
  bmp: ParsedDrawableBitmap,
): { w: number; h: number } {
  const density = bmp.density || 1
  const w = bmp.pixelWidth !== undefined ? bmp.pixelWidth / density : 24
  const h = bmp.pixelHeight !== undefined ? bmp.pixelHeight / density : 24
  return { w, h }
}

// ---------------------------------------------------------------------------
// Text measurement
// ---------------------------------------------------------------------------

function isWideChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  // CJK / full-width advance ~1em.
  return code >= 0x1100 && (
    code <= 0x115f ||
    code === 0x2329 || code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  )
}

function textAdvance(text: string, fontSize: number): number {
  let w = 0
  for (const ch of text) {
    if (ch === ' ') w += fontSize * 0.32
    else if (isWideChar(ch)) w += fontSize * 1.02
    else w += fontSize * 0.54
  }
  return w
}

interface MeasuredText {
  width: number
  height: number
}

/** Measure text, wrapping to maxWidth when constrained. */
function measureText(
  text: string,
  fontSize: number,
  maxWidth: number | null,
  lineSpacing: number,
): MeasuredText {
  const lineHeight = fontSize * lineSpacing
  if (maxWidth === null || textAdvance(text, fontSize) <= maxWidth) {
    return { width: textAdvance(text, fontSize), height: lineHeight }
  }
  // Greedy wrap by character (handles CJK) and word runs (latin).
  const lines: string[] = []
  let current = ''
  let currentW = 0
  for (const ch of text) {
    const adv = ch === ' ' ? fontSize * 0.32 : isWideChar(ch) ? fontSize * 1.02 : fontSize * 0.54
    if (currentW + adv > maxWidth && current) {
      lines.push(current)
      current = ch === ' ' ? '' : ch
      currentW = ch === ' ' ? 0 : adv
    } else {
      current += ch
      currentW += adv
    }
  }
  if (current) lines.push(current)
  const maxLine = Math.max(...lines.map((l) => textAdvance(l, fontSize)))
  return { width: maxLine, height: lineHeight * lines.length }
}

// ---------------------------------------------------------------------------
// Intermediate node (pre-layout)
// ---------------------------------------------------------------------------

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

interface EngineNode {
  el: XmlElement
  tag: string
  id: string
  name: string
  widthSpec: SizeSpec
  heightSpec: SizeSpec
  margins: Box
  padding: Box
  gravity?: string
  weight: number
  style: HifiRenderNode['style']
  srcDrawable?: ParsedDrawable
  text?: string
  dynamic: boolean
  children: EngineNode[]
  // resolved after measure
  measuredWidth: number
  measuredHeight: number
}

let idCounter = 0
function uniqueId(prefix: string): string {
  idCounter += 1
  return `${prefix}_${idCounter}`
}

function boxFromAttrs(
  el: XmlElement,
  prefix: 'layout_' | '',
  ctx: AndroidRenderContext,
): Box {
  const a = el.attrs
  const get = (side: string) => {
    const all = a[`android:${prefix}margin`]
    const one = a[`android:${prefix}margin${side}`]
    const raw = one ?? all
    const n = raw ? resolveSize(raw, ctx) : null
    return typeof n === 'number' ? n : 0
  }
  return {
    left: get('Left'),
    top: get('Top'),
    right: get('Right'),
    bottom: get('Bottom'),
  }
}

function paddingFromAttrs(el: XmlElement, ctx: AndroidRenderContext): Box {
  const a = el.attrs
  const get = (side: string) => {
    const raw = a[`android:padding${side}`] ?? a['android:padding']
    const n = raw ? resolveSize(raw, ctx) : null
    return typeof n === 'number' ? n : 0
  }
  return {
    left: get('Left'),
    top: get('Top'),
    right: get('Right'),
    bottom: get('Bottom'),
  }
}

function applyBackground(
  el: XmlElement,
  ctx: AndroidRenderContext,
  style: HifiRenderNode['style'],
): ParsedDrawable | undefined {
  const bgRaw = el.attrs['android:background']
  const drawableName = resolveDrawableName(bgRaw)
  if (drawableName) {
    const d = ctx.drawables[drawableName]
    if (d) {
      if (d.kind === 'shape') {
        style.backgroundColor = d.backgroundColor
        style.borderRadius = d.cornerRadius
        if (d.stroke) {
          style.borderWidth = d.stroke.width
          style.borderColor = d.stroke.color
        }
        if (d.gradient) style.gradient = d.gradient
      } else if (d.kind === 'bitmap') {
        return d
      }
    }
    return undefined
  }
  const color = resolveColor(bgRaw, ctx)
  if (color) style.backgroundColor = color
  return undefined
}

export function nodeKindOf(tag: string, el: XmlElement, dynamic: boolean): HifiNodeKind {
  const t = simpleTag(tag)
  if (dynamic) return 'dynamic'
  if (/textview|button|edittext|checkbox|radiobutton|togglebutton|switchbutton|switch$/i.test(t)) return 'text'
  if (/imageview|imagebutton|^image$|ratioimageview|autoimageview/i.test(t)) return 'image'
  if (CONTAINER_KINDS.has(t.toLowerCase())) return 'frame'
  return 'view'
}

const CONTAINER_KINDS = new Set([
  'linearlayout',
  'relativelayout',
  'framelayout',
  'constraintlayout',
  'coordinatorlayout',
  'appbarlayout',
  'collapsingtoolbarlayout',
  'nestedscrollview',
  'scrollview',
  'horizontalscrollview',
  'smartrefreshlayout',
  'flexboxlayout',
  'merge',
])

/** Build an engine node from an XML element (recurses into children). */
async function buildNode(
  el: XmlElement,
  ctx: AndroidRenderContext,
  resolveLayout: (name: string) => Promise<string | undefined>,
): Promise<EngineNode> {
  const tag = el.tag
  const simple = simpleTag(tag)
  const dynamic = DYNAMIC_TAGS.test(simple)

  // <include layout="@layout/x" .../> pulls in another layout file. Layout
  // params can be overridden on the include tag.
  if (simple === 'include') {
    const layoutName = el.attrs.layout?.match(/^@layout\/(.+)$/)?.[1]
    const includedXml = layoutName ? await resolveLayout(layoutName) : undefined
    if (includedXml) {
      let includedRoot: XmlElement
      try {
        includedRoot = parseXml(includedXml)
      } catch {
        includedRoot = { tag: 'view', attrs: {}, children: [], text: '' }
      }
      // Merge include-provided layout params onto the included root.
      const merged: XmlElement = {
        ...includedRoot,
        attrs: { ...includedRoot.attrs, ...el.attrs },
      }
      return buildNode(merged, ctx, resolveLayout)
    }
  }

  const a = el.attrs
  const style: HifiRenderNode['style'] = {}
  const bgDrawable = applyBackground(el, ctx, style)
  if (a['android:textColor']) style.color = resolveColor(a['android:textColor'], ctx)
  const fontSizeRaw = a['android:textSize']
  if (fontSizeRaw) {
    const dimen = fontSizeRaw.match(/^@dimen\/(.+)$/)?.[1]
    const n = dimen ? ctx.dimens[dimen] : Number(fontSizeRaw)
    if (Number.isFinite(n)) style.fontSize = n
  }
  if (/\bbold\b/i.test(a['android:textStyle'] ?? '')) style.fontWeight = 700
  const alpha = Number(a['android:alpha'])
  if (Number.isFinite(alpha)) style.opacity = alpha
  const gravity = a['android:gravity']
  if (gravity) {
    if (/center/.test(gravity)) style.textAlign = 'center'
    else if (/right|end/.test(gravity)) style.textAlign = 'right'
  }

  const rawId = (a['android:id'] ?? '').replace(/^@\+?id\//, '')
  const id = rawId || uniqueId(simple.toLowerCase())

  let srcDrawable: ParsedDrawable | undefined
  if (nodeKindOf(tag, el, dynamic) === 'image') {
    const srcName = resolveDrawableName(a['android:src'])
    if (srcName) srcDrawable = ctx.drawables[srcName]
    // A background bitmap is also the painted image.
    if (!srcDrawable && bgDrawable) srcDrawable = bgDrawable
  }

  const weight = Number(a['android:layout_weight'] ?? 0)

  const node: EngineNode = {
    el,
    tag,
    id,
    name: rawId ? simpleTag(rawId) : simple.toLowerCase(),
    widthSpec: resolveSize(a['android:layout_width'], ctx) ?? 'wrap',
    heightSpec: resolveSize(a['android:layout_height'], ctx) ?? 'wrap',
    margins: boxFromAttrs(el, 'layout_', ctx),
    padding: paddingFromAttrs(el, ctx),
    gravity,
    weight: Number.isFinite(weight) ? weight : 0,
    style,
    srcDrawable,
    text: resolveText(el, ctx),
    dynamic,
    children: [],
    measuredWidth: 0,
    measuredHeight: 0,
  }

  // Only treat as a laid-out container when we understand its layout.
  const understoodContainer =
    /^(linearlayout|relativelayout|framelayout|nestedscrollview|scrollview|horizontalscrollview|coordinatorlayout|smartrefreshlayout|constraintlayout)$/i.test(
      simple,
    )
  if (understoodContainer) {
    node.children = await Promise.all(
      el.children
        .filter((c) => c.tag)
        // <merge>/<requestFocus>/<tag> helpers are skipped.
        .filter((c) => !/^(requestfocus|tag)$/.test(simpleTag(c.tag)))
        .map((c) => buildNode(c, ctx, resolveLayout)),
    )
  }

  return node
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

const DEFAULT_TEXT_SIZE = 14
const LINE_SPACING = 1.3

function intrinsicContent(node: EngineNode): { w: number; h: number } {
  if (node.dynamic) return { w: 0, h: 160 }
  const kind = nodeKindOf(node.tag, node.el, node.dynamic)
  if (kind === 'text') {
    const fontSize = node.style.fontSize ?? DEFAULT_TEXT_SIZE
    const m = measureText(node.text ?? '', fontSize, null, LINE_SPACING)
    return { w: m.width, h: m.height }
  }
  if (kind === 'image') {
    if (node.srcDrawable?.kind === 'bitmap') {
      const s = bitmapLogicalSize(node.srcDrawable)
      return s
    }
    return { w: 24, h: 24 }
  }
  return { w: 0, h: 0 }
}

type SpecOverride = Partial<Pick<EngineNode, 'widthSpec' | 'heightSpec'>>

/** Measure a node given the parent content area. Returns its outer size. */
function measureNode(
  node: EngineNode,
  availWidth: number,
  availHeight: number,
  override: SpecOverride = {},
): { width: number; height: number } {
  const widthSpec = override.widthSpec ?? node.widthSpec
  const heightSpec = override.heightSpec ?? node.heightSpec
  const kind = nodeKindOf(node.tag, node.el, node.dynamic)
  const paddingH = node.padding.left + node.padding.right
  const paddingV = node.padding.top + node.padding.bottom

  // ----- resolve width -----
  let width: number
  if (widthSpec === 'match') width = Number.isFinite(availWidth) ? availWidth : 0
  else if (widthSpec === 'wrap') width = 0 // filled below
  else width = Number.isFinite(availWidth) ? Math.min(widthSpec, availWidth) : widthSpec

  // ----- resolve height -----
  let height: number
  if (heightSpec === 'match') height = Number.isFinite(availHeight) ? availHeight : 0
  else if (heightSpec === 'wrap') height = 0
  else height = Number.isFinite(availHeight) ? Math.min(heightSpec, availHeight) : heightSpec

  const simple = simpleTag(node.tag)
  const isVerticalLinear = /linearlayout/i.test(simple) && !/horizontal/.test(node.el.attrs['android:orientation'] ?? '')
  const isHorizontalLinear = /linearlayout/i.test(simple) && /horizontal/.test(node.el.attrs['android:orientation'] ?? '')
  const isFrameLike = /^(framelayout|coordinatorlayout|smartrefreshlayout)$/i.test(simple)
  const isScrollV = /^(nestedscrollview|scrollview)$/i.test(simple)
  const isScrollH = /^horizontalscrollview$/i.test(simple)

  // LinearLayout: lay children along the main axis; weight shares the leftover.
  if (isVerticalLinear || isHorizontalLinear) {
    const innerW = node.widthSpec === 'wrap' ? Number.POSITIVE_INFINITY : width - paddingH
    const innerH = node.heightSpec === 'wrap' ? Number.POSITIVE_INFINITY : height - paddingV
    measureLinearLayout(
      node,
      innerW,
      innerH,
      paddingH,
      paddingV,
      isVerticalLinear,
    )
    const size = linearContentSize(node, paddingH, paddingV, isVerticalLinear)
    if (node.widthSpec === 'wrap') {
      width = Math.min(availWidth, size.crossSize)
    }
    if (node.heightSpec === 'wrap') {
      height = isVerticalLinear
        ? Math.min(availHeight, size.mainSize)
        : clampWrapHeight(node, paddingV, availHeight)
    }
  } else if (isFrameLike) {
    // FrameLayout/Coordinator: children are stacked; size = largest child.
    let maxW = 0
    let maxH = 0
    for (const child of node.children) {
      const childAvailW = child.widthSpec === 'match' ? width - paddingH : width - paddingH
      const m = measureChild(child, childAvailW, height - paddingV || availHeight - paddingV)
      maxW = Math.max(maxW, m.width)
      maxH = Math.max(maxH, m.height)
    }
    if (node.widthSpec === 'wrap') width = Math.min(availWidth, maxW + paddingH)
    if (node.heightSpec === 'wrap') height = Math.min(availHeight, maxH + paddingV)
  } else if (isScrollV) {
    // Vertical scroll: width bound, height of content can exceed viewport.
    const child = node.children[0]
    if (child) {
      const m = measureChild(child, width - paddingH, Number.POSITIVE_INFINITY)
      if (node.heightSpec === 'wrap') height = Math.min(availHeight, m.height + paddingV)
    }
  } else if (isScrollH) {
    const child = node.children[0]
    if (child) {
      const m = measureChild(child, Number.POSITIVE_INFINITY, height - paddingV)
      if (node.widthSpec === 'wrap') width = Math.min(availWidth, m.width + paddingH)
    }
  } else if (node.children.length) {
    // RelativeLayout / ConstraintLayout fallback: treat as block stack for
    // measurement (precise anchors applied in the placement pass).
    let maxW = 0
    let maxH = 0
    for (const child of node.children) {
      const m = measureChild(child, width - paddingH || availWidth - paddingH, height - paddingV || availHeight - paddingV)
      maxW = Math.max(maxW, m.width)
      maxH = Math.max(maxH, m.height)
    }
    if (node.widthSpec === 'wrap') width = Math.min(availWidth, maxW + paddingH)
    if (node.heightSpec === 'wrap') height = Math.min(availHeight, maxH + paddingV)
  } else if (node.widthSpec === 'wrap' || node.heightSpec === 'wrap') {
    const intrinsic = intrinsicContent(node)
    if (node.widthSpec === 'wrap') width = Math.min(availWidth, intrinsic.w + paddingH)
    if (node.heightSpec === 'wrap') height = Math.min(availHeight, intrinsic.h + paddingV)
  }

  node.measuredWidth = width
  node.measuredHeight = height
  return { width, height }
}

const UNBOUNDED = 4096

function measureChild(
  child: EngineNode,
  availWidth: number,
  availHeight: number,
): { width: number; height: number } {
  // Preserve the unbounded signal: a match_parent child in an unbounded axis
  // cannot fill a real size, so it degrades to wrap_content rather than being
  // clamped to an arbitrary 4096 and over-sizing.
  const wAvail = Number.isFinite(availWidth) ? Math.max(0, availWidth) : Number.POSITIVE_INFINITY
  const hAvail = Number.isFinite(availHeight) ? Math.max(0, availHeight) : Number.POSITIVE_INFINITY
  const widthSpec = child.widthSpec === 'match' && !Number.isFinite(wAvail) ? 'wrap' : child.widthSpec
  const heightSpec = child.heightSpec === 'match' && !Number.isFinite(hAvail) ? 'wrap' : child.heightSpec
  const override = { widthSpec, heightSpec }
  return measureNode(child, wAvail, hAvail, override)
}

function measureLinearLayout(
  node: EngineNode,
  innerW: number,
  innerH: number,
  paddingH: number,
  paddingV: number,
  vertical: boolean,
): void {
  const weighted = node.children.filter((c) => c.weight > 0)
  // First measure non-weighted children. The node's measured size is assigned
  // only after this pass, so derive the bound main axis from the resolved
  // inner size passed in (Infinity means the container is wrap_content).
  let usedMain = 0
  const innerMain = vertical ? innerH : innerW
  const boundMain = Number.isFinite(innerMain)
    ? innerMain + (vertical ? paddingV : paddingH)
    : 0
  for (const child of node.children) {
    if (child.weight > 0) continue
    const cw = vertical ? innerW : Number.POSITIVE_INFINITY
    const ch = vertical ? innerH : node.measuredHeight - paddingV
    const m = measureChild(child, cw, ch)
    usedMain += vertical ? m.height : m.width
  }
  // Distribute leftover main-axis space by weight when the container is bound.
  const totalWeight = weighted.reduce((sum, c) => sum + c.weight, 0)
  const usedInner = boundMain ? usedMain : 0
  const leftover = Math.max(0, boundMain - (vertical ? paddingV : paddingH) - usedInner)
  for (const child of weighted) {
    const share = boundMain ? (leftover * child.weight) / totalWeight : 0
    if (vertical) {
      const m = measureChild(child, innerW, Math.max(0, share))
      child.measuredHeight = boundMain ? Math.max(m.height, share) : m.height
    } else {
      const m = measureChild(child, Math.max(0, share), innerH)
      child.measuredWidth = boundMain ? Math.max(m.width, share) : m.width
    }
  }
}

/** For a wrap_content horizontal LinearLayout, height = tallest child. */
function clampWrapHeight(node: EngineNode, paddingV: number, availHeight: number): number {
  let cross = 0
  for (const child of node.children) cross = Math.max(cross, child.measuredHeight)
  return Math.min(availHeight, cross + paddingV)
}

function linearContentSize(
  node: EngineNode,
  paddingH: number,
  paddingV: number,
  vertical: boolean,
): { mainSize: number; crossSize: number } {
  let main = 0
  let cross = 0
  for (const child of node.children) {
    const marginsMain = vertical
      ? child.margins.top + child.margins.bottom
      : child.margins.left + child.margins.right
    const marginsCross = vertical
      ? child.margins.left + child.margins.right
      : child.margins.top + child.margins.bottom
    main += (vertical ? child.measuredHeight : child.measuredWidth) + marginsMain
    cross = Math.max(
      cross,
      (vertical ? child.measuredWidth : child.measuredHeight) + marginsCross,
    )
  }
  return {
    mainSize: main + (vertical ? paddingV : paddingH),
    crossSize: cross + (vertical ? paddingH : paddingV),
  }
}

function clampWrapWidth(node: EngineNode, paddingH: number, availWidth: number): number {
  let cross = 0
  for (const child of node.children) cross = Math.max(cross, child.measuredWidth)
  return Math.min(availWidth, cross + paddingH)
}

// ---------------------------------------------------------------------------
// Placement: convert measured boxes into absolute coordinates
// ---------------------------------------------------------------------------

function gravityAlign(
  gravity: string | undefined,
  child: EngineNode,
  contentW: number,
  contentH: number,
): { x: number; y: number } {
  let x = 0
  let y = 0
  if (gravity) {
    if (/center_horizontal|center(?!_vertical)/.test(gravity) || /center\b/.test(gravity)) {
      x = (contentW - child.measuredWidth) / 2
    } else if (/right|end/.test(gravity)) {
      x = contentW - child.measuredWidth
    }
    if (/center_vertical/.test(gravity) || /center\b/.test(gravity)) {
      y = (contentH - child.measuredHeight) / 2
    } else if (/bottom/.test(gravity)) {
      y = contentH - child.measuredHeight
    }
  }
  return { x, y }
}

/** Place all children of a node, returning a child id -> absolute offset map. */
function placeChildren(
  node: EngineNode,
  originX: number,
  originY: number,
): Map<string, { x: number; y: number }> {
  const offsets = new Map<string, { x: number; y: number }>()
  const simple = simpleTag(node.tag)
  const contentW = node.measuredWidth - node.padding.left - node.padding.right
  const contentH = node.measuredHeight - node.padding.top - node.padding.bottom

  const isVerticalLinear = /linearlayout/i.test(simple) && !/horizontal/.test(node.el.attrs['android:orientation'] ?? '')
  const isHorizontalLinear = /linearlayout/i.test(simple) && /horizontal/.test(node.el.attrs['android:orientation'] ?? '')

  if (isVerticalLinear) {
    let cursor = 0
    for (const child of node.children) {
      let x = 0
      const g = child.el.attrs['android:layout_gravity']
      if (/center/.test(g ?? '')) x = (contentW - child.measuredWidth) / 2
      else if (/right|end/.test(g ?? '')) x = contentW - child.measuredWidth
      // Offsets are content origins relative to the padding box and already
      // include the leading margin; the cursor advances with both margins so
      // the next child clears this one's bottom margin.
      x += child.margins.left
      offsets.set(child.id, { x, y: cursor + child.margins.top })
      cursor += child.margins.top + child.measuredHeight + child.margins.bottom
    }
  } else if (isHorizontalLinear) {
    let cursor = 0
    for (const child of node.children) {
      let y = 0
      const g = child.el.attrs['android:layout_gravity']
      if (/center/.test(g ?? '')) y = (contentH - child.measuredHeight) / 2
      else if (/bottom/.test(g ?? '')) y = contentH - child.measuredHeight
      y += child.margins.top
      offsets.set(child.id, { x: cursor + child.margins.left, y })
      cursor += child.margins.left + child.measuredWidth + child.margins.right
    }
  } else if (/relativelayout/i.test(simple)) {
    placeRelative(node, contentW, contentH, offsets)
  } else if (/constraintlayout/i.test(simple)) {
    placeConstraint(node, contentW, contentH, offsets)
  } else {
    // FrameLayout / Coordinator / scroll containers: stack at origin, honour
    // each child's layout_gravity.
    for (const child of node.children) {
      const g = child.el.attrs['android:layout_gravity']
      offsets.set(child.id, gravityAlign(g, child, contentW, contentH))
    }
  }
  return offsets
}

function placeRelative(
  node: EngineNode,
  contentW: number,
  contentH: number,
  offsets: Map<string, { x: number; y: number }>,
): void {
  const byId = new Map(node.children.map((c) => [c.id, c]))
  for (const child of node.children) {
    const a = child.el.attrs
    let x = 0
    let y = 0
    const alignParent = /true/.test(a['android:layout_alignParentTop'] ?? '')
    if (/true/.test(a['android:layout_alignParentBottom'] ?? '')) y = contentH - child.measuredHeight
    if (/true/.test(a['android:layout_alignParentRight'] ?? '') || /true/.test(a['android:layout_alignParentEnd'] ?? '')) {
      x = contentW - child.measuredWidth
    }
    if (/true/.test(a['android:layout_centerHorizontal'] ?? '')) x = (contentW - child.measuredWidth) / 2
    if (/true/.test(a['android:layout_centerVertical'] ?? '')) y = (contentH - child.measuredHeight) / 2
    if (/true/.test(a['android:layout_centerInParent'] ?? '')) {
      x = (contentW - child.measuredWidth) / 2
      y = (contentH - child.measuredHeight) / 2
    }
    // Align relative to another sibling (resolve sibling offset first).
    const above = (a['android:layout_above'] ?? '').replace(/^@id\//, '')
    const below = (a['android:layout_below'] ?? '').replace(/^@id\//, '')
    const toRight = (a['android:layout_toRightOf'] ?? a['android:layout_toEndOf'] ?? '').replace(/^@id\//, '')
    const anchorTop = (a['android:layout_alignTop'] ?? '').replace(/^@id\//, '')
    const anchorLeft = (a['android:layout_alignLeft'] ?? a['android:layout_alignStart'] ?? '').replace(/^@id\//, '')
    const sibAbove = above ? byId.get(above) : undefined
    const sibBelow = below ? byId.get(below) : undefined
    const sibRight = toRight ? byId.get(toRight) : undefined
    if (sibAbove) y = (offsets.get(sibAbove.id)?.y ?? 0) - child.measuredHeight
    else if (sibBelow) y = (offsets.get(sibBelow.id)?.y ?? 0) + sibBelow.measuredHeight
    if (sibRight) x = (offsets.get(sibRight.id)?.x ?? 0) + sibRight.measuredWidth
    if (anchorTop) y = offsets.get(anchorTop)?.y ?? y
    if (anchorLeft) x = offsets.get(anchorLeft)?.x ?? x
    void alignParent
    offsets.set(child.id, { x, y })
  }
}

/** Basic ConstraintLayout support: resolve single parent/sibling anchors. */
// ---------------------------------------------------------------------------
// Public entry + render-tree emission
// ---------------------------------------------------------------------------

function imageUrlOf(node: EngineNode): string | undefined {
  if (node.srcDrawable?.kind === 'bitmap') return node.srcDrawable.dataUrl
  return undefined
}

/** Convert a measured + placed engine subtree into output render nodes. */
function emitNode(
  node: EngineNode,
  absX: number,
  absY: number,
  offsets: Map<string, { x: number; y: number }>,
): HifiRenderNode {
  const kind = nodeKindOf(node.tag, node.el, node.dynamic)
  const out: HifiRenderNode = {
    id: node.id,
    name: node.name,
    kind,
    x: Math.round(absX * 100) / 100,
    y: Math.round(absY * 100) / 100,
    width: Math.round(node.measuredWidth * 100) / 100,
    height: Math.round(node.measuredHeight * 100) / 100,
    style: node.style,
    dynamic: node.dynamic || undefined,
    children: [],
  }
  if (kind === 'text' && node.text !== undefined) out.text = node.text
  const img = imageUrlOf(node)
  if (kind === 'image' && img) out.imageUrl = img
  if (node.children.length) {
    const childOffsets = placeChildren(node, absX, absY)
    for (const child of node.children) {
      const offset = childOffsets.get(child.id) ?? offsets.get(child.id) ?? { x: 0, y: 0 }
      // Offsets already include the child's leading margins.
      const childX = absX + node.padding.left + offset.x
      const childY = absY + node.padding.top + offset.y
      out.children.push(emitNode(child, childX, childY, offsets))
    }
  }
  return out
}

export interface RenderAndroidLayoutInput {
  layoutXml: string
  width: number
  height: number
  context: AndroidRenderContext
  /** Resolve another layout file by name (for <include>). */
  resolveLayout?: (name: string) => Promise<string | undefined>
}

/**
 * Render one Android layout to an absolutely positioned high-fidelity tree
 * using the design frame size as the viewport.
 */
export async function renderAndroidLayout(
  input: RenderAndroidLayoutInput,
): Promise<HifiLayoutResult> {
  const resolveLayout =
    input.resolveLayout ?? ((name: string) => Promise.resolve(input.context.layouts[name]))
  const xmlRoot = parseXml(input.layoutXml)
  const root = await buildNode(xmlRoot, input.context, resolveLayout)
  measureNode(root, input.width, input.height)
  const rendered = emitNode(root, 0, 0, new Map())
  return { width: input.width, height: input.height, root: rendered }
}

function placeConstraint(
  node: EngineNode,
  contentW: number,
  contentH: number,
  offsets: Map<string, { x: number; y: number }>,
): void {
  for (const child of node.children) {
    const a = child.el.attrs
    const idOf = (raw: string) => (raw === 'parent' ? '__parent__' : raw.replace(/^@\+?id\//, ''))
    const topTo = idOf(a['app:layout_constraintTop_toTopOf'] ?? '')
    const bottomTo = idOf(a['app:layout_constraintBottom_toTopOf'] ?? '')
    const startTo = idOf(a['app:layout_constraintStart_toStartOf'] ?? '')
    const endTo = idOf(a['app:layout_constraintEnd_toStartOf'] ?? '')

    let x = 0
    let y = 0
    if (startTo === '__parent__') x = 0
    if (topTo === '__parent__') y = 0
    if (a['app:layout_constraintTop_toBottomOf']) {
      const anchor = idOf(a['app:layout_constraintTop_toBottomOf'])
      const sibling = node.children.find((c) => c.id === anchor)
      if (sibling) y = (offsets.get(sibling.id)?.y ?? 0) + sibling.measuredHeight
    }
    if (a['app:layout_constraintStart_toEndOf']) {
      const anchor = idOf(a['app:layout_constraintStart_toEndOf'])
      const sibling = node.children.find((c) => c.id === anchor)
      if (sibling) x = (offsets.get(sibling.id)?.x ?? 0) + sibling.measuredWidth
    }
    void bottomTo
    void endTo
    offsets.set(child.id, { x, y })
  }
}
