/**
 * Android XML platform adapter.
 *
 * Locates layout XML files under the Android `res/layout*` directories and
 * normalises them plus the referenced `dimen` / `color` resources into the
 * vendor-neutral model. Fully deterministic and supports property-level
 * comparison.
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  DesignDoc,
  DesignNode,
  HexColor,
  UnresolvedValue,
} from '../types.js'
import { parseXml, type XmlElement } from '../xml-lite.js'
import {
  tileListTemplate,
} from '../list-template-expand.js'
import { walkFiles } from '../fs-walk.js'
import { normalizeText, tokenizeName } from '../page-fingerprint.js'
import type {
  CodePage,
  PageFingerprint,
  PlatformAdapter,
} from './adapter-types.js'

export interface AndroidDrawableStyle {
  backgroundColor?: HexColor
  cornerRadius?: number
  strokeColor?: HexColor
  strokeWidth?: number
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  strokeDashArray?: string
  strokeCap?: 'butt' | 'round' | 'square'
  strokeJoin?: 'miter' | 'round' | 'bevel'
  /** From `<inset>` — applied as padding when used as background. */
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
}

export interface AndroidResources {
  /** name -> parsed dimension token, e.g. { value: 16, unit: 'dp' } */
  dimens: Record<string, { value: number; unit: string }>
  /** name -> normalized hex */
  colors: Record<string, HexColor>
  /** name -> string resource text */
  strings: Record<string, string>
  /**
   * Declared `<style>` items by style name (without `@style/`).
   * Values are raw attribute strings (`@color/…`, `16sp`, …) before layout resolve.
   */
  styles: Record<string, Record<string, string>>
  /** Optional parent style name for inheritance (`parent="…"`). */
  styleParents: Record<string, string>
  /**
   * Theme / style attr values resolved for `?attr/colorPrimary` etc.
   * Prefer hex when resolvable; otherwise keep `@color/…` raw for a late pass.
   */
  attrs: Record<string, string>
  /** Default-state shape drawable summary keyed by drawable name. */
  drawables: Record<string, AndroidDrawableStyle>
}

export const EMPTY_ANDROID_RESOURCES: AndroidResources = {
  dimens: {},
  colors: {},
  strings: {},
  styles: {},
  styleParents: {},
  attrs: {},
  drawables: {},
}

/**
 * Light-theme Material / platform attr fallbacks when the app theme does not
 * declare them. Approximates common DayNight defaults for L1 compare.
 */
export const ANDROID_FRAMEWORK_ATTR_DEFAULTS: Record<string, HexColor> = {
  colorPrimary: '#6200ee',
  colorPrimaryDark: '#3700b3',
  colorPrimaryVariant: '#3700b3',
  colorOnPrimary: '#ffffff',
  colorSecondary: '#03dac6',
  colorSecondaryVariant: '#018786',
  colorOnSecondary: '#000000',
  colorSurface: '#ffffff',
  colorOnSurface: '#000000',
  colorBackground: '#ffffff',
  colorOnBackground: '#000000',
  colorError: '#b00020',
  colorOnError: '#ffffff',
  colorAccent: '#03dac6',
  colorControlNormal: '#0000008a',
  colorControlActivated: '#6200ee',
  colorControlHighlight: '#0000001f',
  textColorPrimary: '#000000de',
  textColorSecondary: '#00000099',
  textColorTertiary: '#00000061',
  textColorHint: '#00000061',
  textColorPrimaryInverse: '#ffffff',
  windowBackground: '#ffffff',
  statusBarColor: '#000000',
  navigationBarColor: '#000000',
}

export interface DimensionToken {
  value: number
  unit: string
}

/** Parse `16dp`, `12sp`, `0.5pt`, `24px`, `@dimen/name`. */
export function parseAndroidDimension(
  raw: string,
  resources: AndroidResources,
): DimensionToken | UnresolvedValue | undefined {
  const input = raw.trim()
  if (!input) return undefined
  if (input.startsWith('@dimen/')) {
    const name = input.slice('@dimen/'.length)
    const hit = resources.dimens[name]
    return hit ?? { unresolved: true, raw: input }
  }
  const match = /^(-?\d+(?:\.\d+)?)(dp|dip|sp|pt|px|in|mm)?$/i.exec(input)
  if (!match) {
    if (/^(match_parent|wrap_content|fill_parent|0dp)$/.test(input) && input !== '0dp') {
      return { unresolved: true, raw: input }
    }
    return { unresolved: true, raw: input }
  }
  return { value: Number(match[1]), unit: (match[2] ?? 'px').toLowerCase() }
}

export function normalizeAndroidColor(
  raw: string | undefined,
  resources: AndroidResources,
): HexColor | UnresolvedValue | undefined {
  if (!raw) return undefined
  const input = raw.trim()
  if (!input) return undefined
  if (input.startsWith('@color/')) {
    const name = input.slice('@color/'.length)
    const hit = resources.colors[name]
    return hit ?? { unresolved: true, raw: input }
  }
  if (input.startsWith('?')) {
    const attrName = input
      .replace(/^\?android:attr\//, '')
      .replace(/^\?attr\//, '')
      .replace(/^\?android:/, '')
      .replace(/^\?/, '')
    const hit =
      resources.attrs[attrName] ??
      resources.attrs[`android:${attrName}`] ??
      resources.attrs[attrName.replace(/^android:/, '')]
    if (hit) {
      if (hit.startsWith('#')) return normalizeAndroidColor(hit, resources)
      if (hit.startsWith('@color/')) return normalizeAndroidColor(hit, resources)
      if (hit.startsWith('?') && hit !== input) return normalizeAndroidColor(hit, resources)
    }
    const fallback =
      ANDROID_FRAMEWORK_ATTR_DEFAULTS[attrName] ??
      ANDROID_FRAMEWORK_ATTR_DEFAULTS[attrName.replace(/^android:/, '')]
    if (fallback) return fallback
    return { unresolved: true, raw: input }
  }
  if (input.startsWith('#')) {
    let hex = input.toLowerCase()
    if (/^#([0-9a-f]){3}$/.test(hex)) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    }
    if (/^#[0-9a-f]{8}$/.test(hex)) {
      // Android #aarrggbb -> #rrggbbaa.
      hex = `#${hex.slice(3)}${hex.slice(1, 3)}`
    }
    return hex
  }
  if (input.startsWith('@drawable/')) {
    const name = input.slice('@drawable/'.length)
    const d = resources.drawables[name]
    if (d?.backgroundColor) return d.backgroundColor
    return { unresolved: true, raw: input }
  }
  return undefined
}

const TEXT_TAGS = /^(textview|button|edittext|androidx\.appcompat\.widget\.appcompattextview|androidx\.appcompat\.widget\.appcompatbutton|com\.google\.android\.material\.button\.materialbutton|togglebutton|checkbox|radiobutton)$/i
const IMAGE_TAGS = /^(imageview|androidx\.appcompat\.widget\.appcompatimageview|com\.facebook\.drawee\.view\.simpleDraweeView|glide\.widget|videoView)$/i
const CONTAINER_TAGS = /(layout|viewgroup|pager|recyclerview|listview|scrollview|framelayout|linearlayout|relativelayout|constraintlayout|coordinatorlayout|cardview|include|merge)/i

function simpleTag(tag: string): string {
  return tag.includes('.') ? tag.split('.').pop()! : tag
}

function mapAndroidKind(tag: string, el: XmlElement) {
  if (TEXT_TAGS.test(tag)) return 'text' as const
  if (IMAGE_TAGS.test(tag)) return 'image' as const
  if (/icon|img|avatar/i.test(el.attrs['android:id'] ?? '')) return 'image' as const
  if (CONTAINER_TAGS.test(tag)) return 'frame' as const
  return 'view' as const
}

function dimensionToLogical(token: DimensionToken): number {
  return token.value
}

function unwrapDim(
  target: Record<string, number | UnresolvedValue>,
  key: string,
  raw: string | undefined,
  resources: AndroidResources,
): void {
  if (raw === undefined) return
  const parsed = parseAndroidDimension(raw, resources)
  if (!parsed) return
  if ('unresolved' in parsed) {
    target[key] = parsed
  } else {
    target[key] = Math.round(dimensionToLogical(parsed) * 100) / 100
  }
}

/** Strip `@style/` / `@android:style/` prefix from a style reference. */
export function androidStyleName(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const t = raw.trim()
  if (!t) return undefined
  return t.replace(/^@\+?android:style\//, '').replace(/^@\+?style\//, '')
}

/**
 * Flatten a style + parent chain into a single attr map.
 * Local layout attrs still win over these when applied.
 */
export function resolveAndroidStyleAttrs(
  styleRef: string | undefined,
  resources: AndroidResources,
): Record<string, string> {
  const name = androidStyleName(styleRef)
  if (!name || !resources.styles) return {}
  const chain: string[] = []
  const seen = new Set<string>()
  let cur: string | undefined = name
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    chain.push(cur)
    const parentRaw: string | undefined = resources.styleParents[cur]
    const fromAt = androidStyleName(parentRaw)
    if (fromAt) {
      cur = fromAt
    } else if (parentRaw && !parentRaw.includes('/')) {
      cur = parentRaw
    } else {
      cur = undefined
    }
  }
  // Parents first, then child overrides.
  const merged: Record<string, string> = {}
  for (const key of chain.reverse()) {
    Object.assign(merged, resources.styles[key] ?? {})
  }
  return merged
}

export interface NormalizeAndroidLayoutOptions {
  /** Resolve `@layout/name` for `<include>` expansion. */
  resolveLayout?: (layoutName: string) => string | undefined
  /**
   * ConstraintLayout Guideline positions (`id` without `@+id/`).
   * Built automatically when converting a ConstraintLayout root.
   */
  guides?: Map<string, { x?: number; y?: number }>
  /** Assumed parent size for percent guidelines (dp). */
  parentSize?: { width: number; height: number }
}

function isParentConstraintTarget(raw: string | undefined): boolean {
  if (!raw) return false
  const t = raw.trim()
  return t === 'parent' || t === '@id/parent' || t === '@+id/parent'
}

function constraintTargetId(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const t = raw.trim()
  if (isParentConstraintTarget(t)) return undefined
  return t.replace(/^@\+?id\//, '') || undefined
}

/** Parse `W,16:9` / `H,1:1` / `16:9` / `1` into width:height ratio parts. */
export function parseConstraintDimensionRatio(
  raw: string | undefined,
): { width: number; height: number } | undefined {
  if (!raw) return undefined
  let s = raw.trim()
  s = s.replace(/^[WH],/i, '')
  if (/^[\d.]+$/.test(s)) {
    const n = Number(s)
    if (!Number.isFinite(n) || n <= 0) return undefined
    return { width: n, height: 1 }
  }
  const m = s.match(/^([\d.]+)\s*:\s*([\d.]+)$/)
  if (!m) return undefined
  const width = Number(m[1])
  const height = Number(m[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined
  return { width, height }
}

const DEFAULT_CONSTRAINT_PARENT = { width: 360, height: 640 }

function dimValue(
  raw: string | undefined,
  resources: AndroidResources,
): number | undefined {
  if (!raw) return undefined
  const parsed = parseAndroidDimension(raw, resources)
  return parsed && !('unresolved' in parsed) ? parsed.value : undefined
}

function estimateConstraintSeedBox(
  el: XmlElement,
  resources: AndroidResources,
  guides: Map<string, { x?: number; y?: number }>,
  parentSize: { width: number; height: number },
): { x?: number; y?: number; width?: number; height?: number } | undefined {
  const a = el.attrs
  const attr = (key: string) => a[key]
  const widthRaw = attr('android:layout_width')
  const heightRaw = attr('android:layout_height')
  const width = widthRaw && widthRaw !== '0dp' && widthRaw !== '0dip' && widthRaw !== 'match_parent' && widthRaw !== 'wrap_content'
    ? dimValue(widthRaw, resources)
    : undefined
  const height = heightRaw && heightRaw !== '0dp' && heightRaw !== '0dip' && heightRaw !== 'match_parent' && heightRaw !== 'wrap_content'
    ? dimValue(heightRaw, resources)
    : undefined

  const startTo =
    attr('app:layout_constraintStart_toStartOf') ?? attr('app:layout_constraintLeft_toLeftOf')
  const endTo =
    attr('app:layout_constraintEnd_toEndOf') ?? attr('app:layout_constraintRight_toRightOf')
  const topTo = attr('app:layout_constraintTop_toTopOf')
  const bottomTo = attr('app:layout_constraintBottom_toBottomOf')
  const ms =
    dimValue(attr('android:layout_marginStart') ?? attr('android:layout_marginLeft'), resources) ?? 0
  const me =
    dimValue(attr('android:layout_marginEnd') ?? attr('android:layout_marginRight'), resources) ?? 0
  const mt = dimValue(attr('android:layout_marginTop'), resources) ?? 0
  const mb = dimValue(attr('android:layout_marginBottom'), resources) ?? 0

  let x: number | undefined
  let y: number | undefined
  if (isParentConstraintTarget(startTo)) x = ms
  else {
    const gid = constraintTargetId(startTo)
    const g = gid ? guides.get(gid) : undefined
    if (g?.x !== undefined) x = g.x + ms
  }
  if (x === undefined && isParentConstraintTarget(endTo) && width !== undefined) {
    x = parentSize.width - me - width
  }
  if (isParentConstraintTarget(topTo)) y = mt
  else {
    const gid = constraintTargetId(topTo)
    const g = gid ? guides.get(gid) : undefined
    if (g?.y !== undefined) y = g.y + mt
  }
  if (y === undefined && isParentConstraintTarget(bottomTo) && height !== undefined) {
    y = parentSize.height - mb - height
  }

  if (x === undefined && y === undefined && width === undefined && height === undefined) return undefined
  return { x, y, width, height }
}

/**
 * Collect Guideline + Barrier positions under a ConstraintLayout.
 * Barriers use a coarse max/min of referenced siblings' seed boxes.
 */
export function collectConstraintGuides(
  container: XmlElement,
  resources: AndroidResources,
  parentSize: { width: number; height: number } = DEFAULT_CONSTRAINT_PARENT,
): Map<string, { x?: number; y?: number }> {
  const guides = new Map<string, { x?: number; y?: number }>()

  // Pass 1: Guidelines
  for (const child of container.children) {
    const tag = simpleTag(child.tag).toLowerCase()
    const idRaw = child.attrs['android:id'] ?? ''
    const id = idRaw.replace(/^@\+?id\//, '')
    if (!id || tag !== 'guideline') continue
    const orientation = (child.attrs['android:orientation'] ?? 'vertical').toLowerCase()
    const begin = child.attrs['app:layout_constraintGuide_begin']
    const end = child.attrs['app:layout_constraintGuide_end']
    const percent = child.attrs['app:layout_constraintGuide_percent']
    if (orientation === 'horizontal') {
      let y: number | undefined
      if (begin) y = dimValue(begin, resources)
      else if (end) {
        const e = dimValue(end, resources)
        if (e !== undefined) y = parentSize.height - e
      } else if (percent !== undefined) {
        const p = Number(percent)
        if (Number.isFinite(p)) y = Math.round(parentSize.height * p * 100) / 100
      }
      if (y !== undefined) guides.set(id, { y })
    } else {
      let x: number | undefined
      if (begin) x = dimValue(begin, resources)
      else if (end) {
        const e = dimValue(end, resources)
        if (e !== undefined) x = parentSize.width - e
      } else if (percent !== undefined) {
        const p = Number(percent)
        if (Number.isFinite(p)) x = Math.round(parentSize.width * p * 100) / 100
      }
      if (x !== undefined) guides.set(id, { x })
    }
  }

  // Pass 2: seed boxes for referenced views (parent / guideline anchored).
  const seeds = new Map<string, { x?: number; y?: number; width?: number; height?: number }>()
  for (const child of container.children) {
    const tag = simpleTag(child.tag).toLowerCase()
    if (tag === 'guideline' || tag === 'barrier') continue
    const id = (child.attrs['android:id'] ?? '').replace(/^@\+?id\//, '')
    if (!id) continue
    const seed = estimateConstraintSeedBox(child, resources, guides, parentSize)
    if (seed) seeds.set(id, seed)
  }

  // Pass 3: Barriers from referenced seed edges.
  for (const child of container.children) {
    const tag = simpleTag(child.tag).toLowerCase()
    if (tag !== 'barrier') continue
    const id = (child.attrs['android:id'] ?? '').replace(/^@\+?id\//, '')
    if (!id) continue
    const direction = (
      child.attrs['app:barrierDirection'] ??
      child.attrs['barrierDirection'] ??
      ''
    ).toLowerCase()
    const refsRaw =
      child.attrs['app:constraint_referenced_ids'] ??
      child.attrs['constraint_referenced_ids'] ??
      ''
    const refs = refsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!refs.length || !direction) continue

    const edges: number[] = []
    for (const ref of refs) {
      const seed = seeds.get(ref)
      if (!seed) continue
      if (direction === 'start' || direction === 'left') {
        if (seed.x !== undefined) edges.push(seed.x)
      } else if (direction === 'end' || direction === 'right') {
        if (seed.x !== undefined && seed.width !== undefined) edges.push(seed.x + seed.width)
        else if (seed.x !== undefined) edges.push(seed.x)
      } else if (direction === 'top') {
        if (seed.y !== undefined) edges.push(seed.y)
      } else if (direction === 'bottom') {
        if (seed.y !== undefined && seed.height !== undefined) edges.push(seed.y + seed.height)
        else if (seed.y !== undefined) edges.push(seed.y)
      }
    }
    if (!edges.length) continue
    if (direction === 'start' || direction === 'left') {
      guides.set(id, { x: Math.min(...edges) })
    } else if (direction === 'end' || direction === 'right') {
      guides.set(id, { x: Math.max(...edges) })
    } else if (direction === 'top') {
      guides.set(id, { y: Math.min(...edges) })
    } else if (direction === 'bottom') {
      guides.set(id, { y: Math.max(...edges) })
    }
  }

  return guides
}

/**
 * Coarse horizontal/vertical chain weight distribution for `0dp` match_constraint
 * members. Spreads remaining parent space by `layout_constraintHorizontal_weight`
 * / `layout_constraintVertical_weight` (default 1 when omitted on 0dp).
 */
export function applyConstraintChainWeights(
  rawChildren: XmlElement[],
  nodes: DesignNode[],
  parentSize: { width: number; height: number },
  resources: AndroidResources,
): void {
  const byId = new Map<string, { raw: XmlElement; node: DesignNode }>()
  for (let i = 0; i < rawChildren.length; i += 1) {
    const raw = rawChildren[i]!
    const tag = simpleTag(raw.tag).toLowerCase()
    if (tag === 'guideline' || tag === 'barrier') continue
    const id = (raw.attrs['android:id'] ?? '').replace(/^@\+?id\//, '')
    if (!id) continue
    const node = nodes.find((n) => n.id === id)
    if (node) byId.set(id, { raw, node })
  }

  const nextHorizontal = (id: string): string | undefined => {
    const entry = byId.get(id)
    if (!entry) return undefined
    for (const [otherId, other] of byId) {
      if (otherId === id) continue
      const startTo =
        other.raw.attrs['app:layout_constraintStart_toEndOf'] ??
        other.raw.attrs['app:layout_constraintLeft_toRightOf']
      if (constraintTargetId(startTo) === id) return otherId
    }
    // Also: this view's end points to other's start
    const endTo =
      entry.raw.attrs['app:layout_constraintEnd_toStartOf'] ??
      entry.raw.attrs['app:layout_constraintRight_toLeftOf']
    return constraintTargetId(endTo)
  }

  const nextVertical = (id: string): string | undefined => {
    const entry = byId.get(id)
    if (!entry) return undefined
    for (const [otherId, other] of byId) {
      if (otherId === id) continue
      const topTo = other.raw.attrs['app:layout_constraintTop_toBottomOf']
      if (constraintTargetId(topTo) === id) return otherId
    }
    const bottomTo = entry.raw.attrs['app:layout_constraintBottom_toTopOf']
    return constraintTargetId(bottomTo)
  }

  const distribute = (
    orderedIds: string[],
    axis: 'horizontal' | 'vertical',
  ): void => {
    if (orderedIds.length < 2) return
    const weightKey =
      axis === 'horizontal'
        ? 'app:layout_constraintHorizontal_weight'
        : 'app:layout_constraintVertical_weight'
    const sizeKey = axis === 'horizontal' ? 'width' : 'height'
    const parentSpan = axis === 'horizontal' ? parentSize.width : parentSize.height

    const members = orderedIds
      .map((id) => byId.get(id)!)
      .filter(Boolean)
    const weighted = members.filter((m) => {
      const raw =
        m.raw.attrs[`android:layout_${sizeKey}` as 'android:layout_width'] ??
        m.raw.attrs[sizeKey === 'width' ? 'android:layout_width' : 'android:layout_height']
      return raw === '0dp' || raw === '0dip'
    })
    if (weighted.length < 2) return

    let fixed = 0
    for (const m of members) {
      if (weighted.includes(m)) continue
      const v = m.node.box[sizeKey]
      if (typeof v === 'number') fixed += v
    }
    // Margins along the chain (coarse: sum start/end or top/bottom margins).
    for (const m of members) {
      if (axis === 'horizontal') {
        fixed += dimValue(m.raw.attrs['android:layout_marginStart'] ?? m.raw.attrs['android:layout_marginLeft'], resources) ?? 0
        fixed += dimValue(m.raw.attrs['android:layout_marginEnd'] ?? m.raw.attrs['android:layout_marginRight'], resources) ?? 0
      } else {
        fixed += dimValue(m.raw.attrs['android:layout_marginTop'], resources) ?? 0
        fixed += dimValue(m.raw.attrs['android:layout_marginBottom'], resources) ?? 0
      }
    }

    const remaining = Math.max(0, parentSpan - fixed)
    const weights = weighted.map((m) => {
      const w = Number(m.raw.attrs[weightKey] ?? '1')
      return Number.isFinite(w) && w > 0 ? w : 1
    })
    const sum = weights.reduce((a, b) => a + b, 0)
    if (sum <= 0) return
    weighted.forEach((m, i) => {
      const span = Math.round((remaining * (weights[i]! / sum)) * 100) / 100
      m.node.box[sizeKey] = span
    })
  }

  // Build horizontal chains from heads (start constrained to parent / guideline).
  const seenH = new Set<string>()
  for (const id of byId.keys()) {
    if (seenH.has(id)) continue
    const entry = byId.get(id)!
    const startTo =
      entry.raw.attrs['app:layout_constraintStart_toStartOf'] ??
      entry.raw.attrs['app:layout_constraintLeft_toLeftOf']
    const startId = constraintTargetId(startTo)
    const headOk =
      isParentConstraintTarget(startTo) ||
      (startId !== undefined && !byId.has(startId))
    if (!headOk) continue

    const chain = [id]
    seenH.add(id)
    let cur = id
    for (let hop = 0; hop < 20; hop += 1) {
      const nxt = nextHorizontal(cur)
      if (!nxt || seenH.has(nxt) || !byId.has(nxt)) break
      chain.push(nxt)
      seenH.add(nxt)
      cur = nxt
    }
    if (chain.length >= 2) distribute(chain, 'horizontal')
  }

  const seenV = new Set<string>()
  for (const id of byId.keys()) {
    if (seenV.has(id)) continue
    const entry = byId.get(id)!
    const topTo = entry.raw.attrs['app:layout_constraintTop_toTopOf']
    const topId = constraintTargetId(topTo)
    const headOk =
      isParentConstraintTarget(topTo) || (topId !== undefined && !byId.has(topId))
    if (!headOk) continue
    const chain = [id]
    seenV.add(id)
    let cur = id
    for (let hop = 0; hop < 20; hop += 1) {
      const nxt = nextVertical(cur)
      if (!nxt || seenV.has(nxt) || !byId.has(nxt)) break
      chain.push(nxt)
      seenV.add(nxt)
      cur = nxt
    }
    if (chain.length >= 2) distribute(chain, 'vertical')
  }
}

/**
 * Coarse ConstraintLayout Flow helper: wrap referenced ids left-to-right using
 * known/default child sizes and flow_horizontalGap / flow_verticalGap /
 * flow_maxElementsWrap.
 */
export function applyConstraintFlowLayout(
  rawChildren: XmlElement[],
  nodes: DesignNode[],
  parentSize: { width: number; height: number },
  resources: AndroidResources,
  guides?: Map<string, { x?: number; y?: number }>,
): void {
  for (const raw of rawChildren) {
    const tag = simpleTag(raw.tag).toLowerCase()
    if (tag !== 'flow') continue
    const refsRaw =
      raw.attrs['app:constraint_referenced_ids'] ?? raw.attrs['constraint_referenced_ids'] ?? ''
    const refs = refsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!refs.length) continue

    const hGap = dimValue(raw.attrs['app:flow_horizontalGap'], resources) ?? 0
    const vGap = dimValue(raw.attrs['app:flow_verticalGap'], resources) ?? 0
    const maxWrap = Number(raw.attrs['app:flow_maxElementsWrap'] ?? '0')
    const wrapLimit = Number.isFinite(maxWrap) && maxWrap > 0 ? maxWrap : Number.POSITIVE_INFINITY

    // Flow origin: parent/guide anchored start+top (same coarse rules as views).
    const startTo =
      raw.attrs['app:layout_constraintStart_toStartOf'] ??
      raw.attrs['app:layout_constraintLeft_toLeftOf']
    const topTo = raw.attrs['app:layout_constraintTop_toTopOf']
    const ms =
      dimValue(
        raw.attrs['android:layout_marginStart'] ?? raw.attrs['android:layout_marginLeft'],
        resources,
      ) ?? 0
    const mt = dimValue(raw.attrs['android:layout_marginTop'], resources) ?? 0
    let originX = 0
    let originY = 0
    if (isParentConstraintTarget(startTo)) originX = ms
    else {
      const gid = constraintTargetId(startTo)
      const g = gid ? guides?.get(gid) : undefined
      if (g?.x !== undefined) originX = g.x + ms
    }
    if (isParentConstraintTarget(topTo)) originY = mt
    else {
      const gid = constraintTargetId(topTo)
      const g = gid ? guides?.get(gid) : undefined
      if (g?.y !== undefined) originY = g.y + mt
    }

    const endTo =
      raw.attrs['app:layout_constraintEnd_toEndOf'] ??
      raw.attrs['app:layout_constraintRight_toRightOf']
    let contentWidth = parentSize.width - originX
    if (isParentConstraintTarget(endTo)) {
      const me =
        dimValue(
          raw.attrs['android:layout_marginEnd'] ?? raw.attrs['android:layout_marginRight'],
          resources,
        ) ?? 0
      contentWidth = Math.max(0, parentSize.width - originX - me)
    }

    let cursorX = originX
    let cursorY = originY
    let rowHeight = 0
    let inRow = 0

    for (const ref of refs) {
      const node = nodes.find((n) => n.id === ref)
      if (!node) continue
      const w = typeof node.box.width === 'number' ? node.box.width : 80
      const h = typeof node.box.height === 'number' ? node.box.height : 40
      if (typeof node.box.width !== 'number') node.box.width = w
      if (typeof node.box.height !== 'number') node.box.height = h

      const wouldWrap =
        inRow >= wrapLimit || (inRow > 0 && cursorX + w > originX + contentWidth + 0.5)
      if (wouldWrap) {
        cursorX = originX
        cursorY += rowHeight + vGap
        rowHeight = 0
        inRow = 0
      }

      node.box.x = Math.round(cursorX * 100) / 100
      node.box.y = Math.round(cursorY * 100) / 100
      cursorX += w + hGap
      rowHeight = Math.max(rowHeight, h)
      inRow += 1
    }
  }
}

/**
 * Coarse ConstraintLayout hints for L1:
 * - `0dp` + constraints → unresolved match_constraint
 * - parent / Guideline-anchored start/top → approximate x/y from margins
 * - dimensionRatio → fill missing width/height when the other is known
 */
function applyConstraintLayoutHints(
  a: Record<string, string>,
  attr: (key: string) => string | undefined,
  box: DesignNode['box'],
  style: DesignNode['style'],
  resources: AndroidResources,
  guides?: Map<string, { x?: number; y?: number }>,
): void {
  const hasConstraint = Object.keys(a).some(
    (k) => k.includes('layout_constraint') || k.startsWith('app:layout_constraint'),
  )
  if (!hasConstraint) return

  const widthRaw = attr('android:layout_width')
  const heightRaw = attr('android:layout_height')
  if (widthRaw === '0dp' || widthRaw === '0dip') {
    box.width = { unresolved: true, raw: widthRaw }
  }
  if (heightRaw === '0dp' || heightRaw === '0dip') {
    box.height = { unresolved: true, raw: heightRaw }
  }

  const startTo =
    attr('app:layout_constraintStart_toStartOf') ?? attr('app:layout_constraintLeft_toLeftOf')
  const topTo = attr('app:layout_constraintTop_toTopOf')
  const marginStartRaw =
    attr('android:layout_marginStart') ??
    attr('android:layout_marginLeft') ??
    attr('app:layout_goneMarginStart')
  const marginTopRaw = attr('android:layout_marginTop') ?? attr('app:layout_goneMarginTop')
  const marginStart = marginStartRaw
    ? parseAndroidDimension(marginStartRaw, resources)
    : undefined
  const marginTop = marginTopRaw ? parseAndroidDimension(marginTopRaw, resources) : undefined
  const ms =
    marginStart && !('unresolved' in marginStart) ? marginStart.value : marginStartRaw ? undefined : 0
  const mt =
    marginTop && !('unresolved' in marginTop) ? marginTop.value : marginTopRaw ? undefined : 0

  if (isParentConstraintTarget(startTo)) {
    if (ms !== undefined) box.x = Math.round(ms * 100) / 100
  } else {
    const gid = constraintTargetId(startTo)
    const g = gid ? guides?.get(gid) : undefined
    if (g?.x !== undefined && ms !== undefined) {
      box.x = Math.round((g.x + ms) * 100) / 100
    }
  }
  if (isParentConstraintTarget(topTo)) {
    if (mt !== undefined) box.y = Math.round(mt * 100) / 100
  } else {
    const gid = constraintTargetId(topTo)
    const g = gid ? guides?.get(gid) : undefined
    if (g?.y !== undefined && mt !== undefined) {
      box.y = Math.round((g.y + mt) * 100) / 100
    }
  }

  void style

  const ratio = parseConstraintDimensionRatio(attr('app:layout_constraintDimensionRatio'))
  if (ratio) {
    const w = typeof box.width === 'number' ? box.width : undefined
    const h = typeof box.height === 'number' ? box.height : undefined
    const heightUnresolved =
      box.height !== undefined && typeof box.height === 'object' && 'unresolved' in box.height
    const widthUnresolved =
      box.width !== undefined && typeof box.width === 'object' && 'unresolved' in box.width
    if (w !== undefined && (h === undefined || heightUnresolved)) {
      box.height = Math.round(((w * ratio.height) / ratio.width) * 100) / 100
    } else if (h !== undefined && (w === undefined || widthUnresolved)) {
      box.width = Math.round(((h * ratio.width) / ratio.height) * 100) / 100
    }
  }
}

function resolveAndroidText(
  raw: string | undefined,
  resources: AndroidResources,
): string | undefined {
  if (!raw) return undefined
  if (raw.startsWith('@string/')) {
    return resources.strings[raw.slice('@string/'.length)]
  }
  if (raw.startsWith('@')) return undefined
  return raw
}

function convertElement(
  el: XmlElement,
  resources: AndroidResources,
  indexPath: string,
  options?: NormalizeAndroidLayoutOptions,
): DesignNode {
  const tag = simpleTag(el.tag)

  // <include layout="@layout/foo" /> — inline the referenced layout root.
  if (tag.toLowerCase() === 'include') {
    const layoutRef = el.attrs.layout ?? el.attrs['android:layout'] ?? ''
    const layoutName = layoutRef.replace(/^@layout\//, '')
    const xml = layoutName ? options?.resolveLayout?.(layoutName) : undefined
    if (xml) {
      try {
        const included = parseXml(xml)
        const overrideAttrs = { ...el.attrs }
        delete overrideAttrs.layout
        delete overrideAttrs['android:layout']
        const merged: XmlElement = {
          ...included,
          attrs: { ...included.attrs, ...overrideAttrs },
        }
        return convertElement(merged, resources, indexPath, options)
      } catch {
        /* fall through to empty include stub */
      }
    }
    return {
      id: `include-${indexPath}`,
      name: layoutName || 'include',
      kind: 'frame',
      box: {},
      style: {},
      children: [],
    }
  }

  // <merge> — promote children.
  if (tag.toLowerCase() === 'merge') {
    const children = el.children.map((c, i) =>
      convertElement(c, resources, `${indexPath}.${i}`, options),
    )
    return {
      id: `merge-${indexPath}`,
      name: 'merge',
      kind: 'frame',
      box: {},
      style: {},
      children,
    }
  }

  // Guideline / Barrier / Flow are helpers — skip as visual nodes.
  if (/^(guideline|barrier|flow)$/i.test(tag)) {
    return {
      id: (el.attrs['android:id'] ?? `guide-${indexPath}`).replace(/^@\+?id\//, ''),
      name: tag.toLowerCase(),
      kind: 'view',
      box: { width: 0, height: 0 },
      style: {},
      children: [],
    }
  }

  const a = el.attrs
  const inherited = resolveAndroidStyleAttrs(a.style ?? a['android:style'], resources)
  const attr = (key: string): string | undefined => a[key] ?? inherited[key]
  const style: DesignNode['style'] = {}
  const box: DesignNode['box'] = {}

  unwrapDim(box as Record<string, number | UnresolvedValue>, 'width', attr('android:layout_width'), resources)
  unwrapDim(box as Record<string, number | UnresolvedValue>, 'height', attr('android:layout_height'), resources)
  const lw = (attr('android:layout_width') ?? '').trim().toLowerCase()
  const lh = (attr('android:layout_height') ?? '').trim().toLowerCase()
  if (lw === 'match_parent' || lw === 'fill_parent') style.sizingHorizontal = 'fill'
  else if (lw === 'wrap_content') style.sizingHorizontal = 'hug'
  else if (lw) style.sizingHorizontal = 'fixed'
  if (lh === 'match_parent' || lh === 'fill_parent') style.sizingVertical = 'fill'
  else if (lh === 'wrap_content') style.sizingVertical = 'hug'
  else if (lh) style.sizingVertical = 'fixed'

  const marginAttrs: Array<[string, string]> = [
    ['marginTop', 'android:layout_marginTop'],
    ['marginRight', 'android:layout_marginRight'],
    ['marginBottom', 'android:layout_marginBottom'],
    ['marginLeft', 'android:layout_marginLeft'],
  ]
  for (const [key, androidKey] of marginAttrs) {
    unwrapDim(style as Record<string, number | UnresolvedValue>, key, attr(androidKey), resources)
  }
  // Start/end margins (ConstraintLayout / RTL-friendly).
  const marginStart = attr('android:layout_marginStart') ?? attr('app:layout_marginStart')
  const marginEnd = attr('android:layout_marginEnd') ?? attr('app:layout_marginEnd')
  if (marginStart && style.marginLeft === undefined) {
    unwrapDim(style as Record<string, number | UnresolvedValue>, 'marginLeft', marginStart, resources)
  }
  if (marginEnd && style.marginRight === undefined) {
    unwrapDim(style as Record<string, number | UnresolvedValue>, 'marginRight', marginEnd, resources)
  }

  applyConstraintLayoutHints(a, attr, box, style, resources, options?.guides)

  const paddingAttrs: Array<[string, string]> = [
    ['paddingTop', 'android:paddingTop'],
    ['paddingRight', 'android:paddingRight'],
    ['paddingBottom', 'android:paddingBottom'],
    ['paddingLeft', 'android:paddingLeft'],
  ]
  for (const [key, androidKey] of paddingAttrs) {
    unwrapDim(style as Record<string, number | UnresolvedValue>, key, attr(androidKey), resources)
  }

  const bgRaw = attr('android:background')
  if (bgRaw?.startsWith('@drawable/')) {
    const d = resources.drawables[bgRaw.slice('@drawable/'.length)]
    if (d?.backgroundColor) style.backgroundColor = d.backgroundColor
    if (d?.cornerRadius !== undefined) style.cornerRadius = d.cornerRadius
    if (d?.strokeColor) style.borderColor = d.strokeColor
    if (d?.strokeWidth !== undefined) style.borderWidth = d.strokeWidth
    if (d?.borderStyle) style.borderStyle = d.borderStyle
    if (d?.strokeDashArray) style.strokeDashArray = d.strokeDashArray
    if (d?.strokeCap) style.strokeCap = d.strokeCap
    if (d?.strokeJoin) style.strokeJoin = d.strokeJoin
    if (d?.paddingTop !== undefined && style.paddingTop === undefined) style.paddingTop = d.paddingTop
    if (d?.paddingRight !== undefined && style.paddingRight === undefined) {
      style.paddingRight = d.paddingRight
    }
    if (d?.paddingBottom !== undefined && style.paddingBottom === undefined) {
      style.paddingBottom = d.paddingBottom
    }
    if (d?.paddingLeft !== undefined && style.paddingLeft === undefined) style.paddingLeft = d.paddingLeft
  } else {
    const bg = normalizeAndroidColor(bgRaw, resources)
    if (bg) style.backgroundColor = bg
  }
  const textColor = normalizeAndroidColor(attr('android:textColor'), resources)
  if (textColor) style.color = textColor

  const tint = normalizeAndroidColor(
    attr('android:tint') ?? attr('app:tint'),
    resources,
  )
  if (tint && typeof tint === 'string') {
    // Image/icon tint → color; also used when vector lacks its own tint.
    if (style.color === undefined) style.color = tint
    if (style.backgroundColor === undefined && IMAGE_TAGS.test(tag)) {
      style.backgroundColor = tint
    }
  }

  const scaleType = (attr('android:scaleType') ?? '').toLowerCase()
  if (scaleType === 'centercrop') style.imageFit = 'cover'
  else if (scaleType === 'fitcenter' || scaleType === 'fitstart' || scaleType === 'fitend' || scaleType === 'centerinside') {
    style.imageFit = 'contain'
  } else if (scaleType === 'fitxy') style.imageFit = 'fill'

  // Material CardView / MaterialCardView
  const cardBg = normalizeAndroidColor(
    attr('app:cardBackgroundColor') ?? attr('cardBackgroundColor'),
    resources,
  )
  if (cardBg && typeof cardBg === 'string' && style.backgroundColor === undefined) {
    style.backgroundColor = cardBg
  }
  const cardRadius = attr('app:cardCornerRadius') ?? attr('cardCornerRadius')
  if (cardRadius && style.cornerRadius === undefined) {
    unwrapDim(style as Record<string, number | UnresolvedValue>, 'cornerRadius', cardRadius, resources)
  }
  const elevRaw =
    attr('android:elevation') ??
    attr('app:cardElevation') ??
    attr('cardElevation') ??
    attr('app:elevation')
  if (elevRaw && style.elevation === undefined) {
    unwrapDim(style as Record<string, number | UnresolvedValue>, 'elevation', elevRaw, resources)
  }
  const contentPad = attr('app:contentPadding') ?? attr('contentPadding')
  if (contentPad) {
    const dim = parseAndroidDimension(contentPad, resources)
    if (dim && !('unresolved' in dim)) {
      if (style.paddingTop === undefined) style.paddingTop = dim.value
      if (style.paddingRight === undefined) style.paddingRight = dim.value
      if (style.paddingBottom === undefined) style.paddingBottom = dim.value
      if (style.paddingLeft === undefined) style.paddingLeft = dim.value
    }
  }
  for (const [key, names] of [
    ['paddingTop', ['app:contentPaddingTop', 'contentPaddingTop']],
    ['paddingRight', ['app:contentPaddingRight', 'contentPaddingRight', 'app:contentPaddingEnd', 'contentPaddingEnd']],
    ['paddingBottom', ['app:contentPaddingBottom', 'contentPaddingBottom']],
    ['paddingLeft', ['app:contentPaddingLeft', 'contentPaddingLeft', 'app:contentPaddingStart', 'contentPaddingStart']],
  ] as const) {
    if ((style as Record<string, unknown>)[key] !== undefined) continue
    for (const name of names) {
      const raw = attr(name)
      if (!raw) continue
      unwrapDim(style as Record<string, number | UnresolvedValue>, key, raw, resources)
      break
    }
  }

  unwrapDim(style as Record<string, number | UnresolvedValue>, 'fontSize', attr('android:textSize'), resources)
  unwrapDim(style as Record<string, number | UnresolvedValue>, 'lineHeight', attr('android:lineHeight'), resources)
  unwrapDim(style as Record<string, number | UnresolvedValue>, 'minWidth', attr('android:minWidth'), resources)
  unwrapDim(style as Record<string, number | UnresolvedValue>, 'minHeight', attr('android:minHeight'), resources)
  unwrapDim(style as Record<string, number | UnresolvedValue>, 'maxWidth', attr('android:maxWidth'), resources)
  unwrapDim(style as Record<string, number | UnresolvedValue>, 'maxHeight', attr('android:maxHeight'), resources)

  // android:letterSpacing is in em (fraction of textSize), not dp/sp.
  const letterSpacingRaw = attr('android:letterSpacing')
  if (letterSpacingRaw !== undefined) {
    const em = Number(letterSpacingRaw.trim())
    if (Number.isFinite(em)) {
      const fs = typeof style.fontSize === 'number' ? style.fontSize : 14
      style.letterSpacing = Math.round(em * fs * 100) / 100
    }
  }

  const alphaRaw = attr('android:alpha')
  if (alphaRaw !== undefined) {
    const alpha = Number(alphaRaw.trim())
    if (Number.isFinite(alpha) && alpha < 1) {
      style.opacity = Math.round(alpha * 100) / 100
    }
  }

  const rotationRaw = attr('android:rotation')
  if (rotationRaw !== undefined) {
    const rot = Number(rotationRaw.trim())
    if (Number.isFinite(rot) && Math.abs(rot) > 0.5) {
      style.rotation = Math.round(rot * 100) / 100
    }
  }

  const scaleXRaw = attr('android:scaleX')
  if (scaleXRaw !== undefined) {
    const sx = Number(scaleXRaw.trim())
    if (Number.isFinite(sx) && Math.abs(sx - 1) > 0.02) {
      style.scaleX = Math.round(sx * 1000) / 1000
    }
  }
  const scaleYRaw = attr('android:scaleY')
  if (scaleYRaw !== undefined) {
    const sy = Number(scaleYRaw.trim())
    if (Number.isFinite(sy) && Math.abs(sy - 1) > 0.02) {
      style.scaleY = Math.round(sy * 1000) / 1000
    }
  }

  // translationZ ≈ stacking nudge when elevation is absent.
  const tzRaw = attr('android:translationZ') ?? attr('app:translationZ')
  if (tzRaw !== undefined && style.zIndex === undefined) {
    const dim = parseAndroidDimension(tzRaw, resources)
    if (dim && !('unresolved' in dim) && dim.value !== 0) {
      style.zIndex = Math.round(dim.value)
    }
  }

  const allCaps = attr('android:textAllCaps')
  if (allCaps !== undefined && /^(true|1)$/i.test(allCaps.trim())) {
    style.textTransform = 'uppercase'
  }

  const clipChildren = attr('android:clipChildren')
  const clipToPadding = attr('android:clipToPadding')
  const clipToOutline = attr('android:clipToOutline')
  if (
    (clipChildren !== undefined && /^(true|1)$/i.test(clipChildren.trim())) ||
    (clipToPadding !== undefined && /^(true|1)$/i.test(clipToPadding.trim())) ||
    (clipToOutline !== undefined && /^(true|1)$/i.test(clipToOutline.trim()))
  ) {
    style.overflow = 'hidden'
    if (clipToOutline !== undefined && /^(true|1)$/i.test(clipToOutline.trim())) {
      style.clipPath = style.clipPath ?? 'outline'
    }
  }

  // ConstraintLayout dimensionRatio → aspectRatio
  const dimRatio =
    attr('app:layout_constraintDimensionRatio') ?? attr('layout_constraintDimensionRatio')
  if (dimRatio && style.aspectRatio === undefined) {
    const parsed = parseConstraintDimensionRatio(dimRatio)
    if (parsed) {
      style.aspectRatio = Math.round((parsed.width / parsed.height) * 1000) / 1000
    }
  }

  const maxLinesRaw = attr('android:maxLines')
  if (maxLinesRaw !== undefined) {
    const n = Number(maxLinesRaw.trim())
    if (Number.isFinite(n) && n > 0) {
      style.maxLines = Math.round(n)
      style.textOverflow = 'ellipsis'
    }
  }
  const ellipsize = (attr('android:ellipsize') ?? '').toLowerCase()
  if (ellipsize && ellipsize !== 'none') {
    style.textOverflow = ellipsize === 'clip' ? 'clip' : 'ellipsis'
    if (style.maxLines === undefined) style.maxLines = 1
  }
  const singleLine = attr('android:singleLine')
  if (singleLine !== undefined && /^(true|1)$/i.test(singleLine.trim())) {
    style.maxLines = 1
    if (!style.textOverflow) style.textOverflow = 'ellipsis'
  }

  const fontFamily = attr('android:fontFamily')
  if (fontFamily) style.fontFamily = fontFamily
  const textStyleRaw = attr('android:textStyle') ?? ''
  if (/\bbold\b/i.test(textStyleRaw)) style.fontWeight = 700
  if (/\bitalic\b/i.test(textStyleRaw)) style.fontStyle = 'italic'

  // LinearLayout / FlexboxLayout orientation → flexDirection.
  if (/linearlayout|flexboxlayout/i.test(tag)) {
    const orientation = (attr('android:orientation') ?? 'vertical').toLowerCase()
    style.flexDirection = orientation === 'horizontal' ? 'row' : 'column'
  }
  // FlexboxLayout / Flow wrap.
  if (/flexboxlayout/i.test(tag) || /flowlayout/i.test(tag)) {
    const wrap = (attr('app:flexWrap') ?? attr('android:flexWrap') ?? '').toLowerCase()
    if (wrap === 'wrap' || wrap === 'wrap_reverse') style.flexWrap = 'wrap'
    const alignContent = (
      attr('app:alignContent') ??
      attr('android:alignContent') ??
      ''
    ).toLowerCase()
    if (alignContent === 'center' || alignContent === 'flex_center') style.alignContent = 'center'
    else if (alignContent === 'flex_end' || alignContent === 'end') style.alignContent = 'end'
    else if (alignContent === 'flex_start' || alignContent === 'start') style.alignContent = 'start'
    else if (alignContent === 'stretch') style.alignContent = 'stretch'
    else if (alignContent === 'space_between' || alignContent === 'space-between') {
      style.alignContent = 'space-between'
    } else if (alignContent === 'space_around' || alignContent === 'space-around') {
      style.alignContent = 'space-around'
    } else if (alignContent === 'space_evenly' || alignContent === 'space-evenly') {
      style.alignContent = 'space-evenly'
    }
  }
  const layoutOrder = attr('android:layout_order') ?? attr('app:layout_order')
  if (layoutOrder) {
    const n = Number.parseInt(layoutOrder, 10)
    if (Number.isFinite(n) && n !== 0) style.order = n
  }
  const layoutWeight = attr('android:layout_weight') ?? attr('app:layout_flexGrow')
  if (layoutWeight) {
    const n = Number.parseFloat(layoutWeight)
    if (Number.isFinite(n) && n > 0) style.flexGrow = Math.round(n * 1000) / 1000
  }
  const layoutGravity = (attr('android:layout_gravity') ?? '').toLowerCase()
  if (layoutGravity) {
    if (/\bcenter\b/.test(layoutGravity) && !/\bcenter_horizontal\b|\bcenter_vertical\b/.test(layoutGravity)) {
      style.alignSelf = 'center'
    } else if (/\bcenter_horizontal\b|\bcenter_vertical\b/.test(layoutGravity)) {
      style.alignSelf = 'center'
    } else if (/\bend\b|\bright\b|\bbottom\b/.test(layoutGravity)) {
      style.alignSelf = 'end'
    } else if (/\bstart\b|\bleft\b|\btop\b/.test(layoutGravity)) {
      style.alignSelf = 'start'
    } else if (/\bfill\b|\bclip_horizontal\b|\bclip_vertical\b/.test(layoutGravity)) {
      style.alignSelf = 'stretch'
    }
  }
  const visibility = (attr('android:visibility') ?? '').toLowerCase()
  if (visibility === 'gone') {
    style.visibility = 'hidden'
    style.display = 'none'
  } else if (visibility === 'invisible') {
    style.visibility = 'hidden'
  } else if (visibility === 'visible') {
    style.visibility = 'visible'
  }
  const pivotX = attr('android:transformPivotX')
  const pivotY = attr('android:transformPivotY')
  if (pivotX || pivotY) {
    const toPct = (raw: string | undefined, axis: 'x' | 'y'): number => {
      if (!raw) return 50
      const n = Number.parseFloat(raw)
      if (!Number.isFinite(n)) return 50
      // Absolute px pivot relative to box when size known; else treat % as-is.
      if (/%$/.test(raw.trim())) return n
      const size =
        axis === 'x'
          ? typeof box.width === 'number'
            ? box.width
            : undefined
          : typeof box.height === 'number'
            ? box.height
            : undefined
      if (size && size > 0) return Math.round((n / size) * 1000) / 10
      return 50
    }
    style.transformOrigin = `${toPct(pivotX, 'x')}% ${toPct(pivotY, 'y')}%`
  } else if (
    (style.rotation !== undefined || style.scaleX !== undefined || style.scaleY !== undefined) &&
    !style.transformOrigin
  ) {
    style.transformOrigin = '50% 50%'
  }
  if (style.maxLines === 1 || /^(true|1)$/i.test(attr('android:singleLine') ?? '')) {
    style.whiteSpace = style.whiteSpace ?? 'nowrap'
  }
  const breakStrategy = (attr('android:breakStrategy') ?? '').toLowerCase()
  if (breakStrategy === 'simple') style.wordBreak = 'keep-all'
  else if (breakStrategy === 'high_quality' || breakStrategy === 'balanced') {
    style.wordBreak = 'normal'
  }
  const gravity = (attr('android:gravity') ?? '').toLowerCase()
  if (gravity) {
    if (/\bcenter_horizontal\b|\bcenter\b/.test(gravity)) style.textAlign = 'center'
    else if (/\bright\b|\bend\b/.test(gravity)) style.textAlign = 'right'
    else if (/\bleft\b|\bstart\b/.test(gravity)) style.textAlign = 'left'
    if (/\bcenter_vertical\b|\bcenter\b/.test(gravity)) style.textAlignVertical = 'center'
    else if (/\bbottom\b/.test(gravity)) style.textAlignVertical = 'bottom'
    else if (/\btop\b/.test(gravity)) style.textAlignVertical = 'top'
    if (style.flexDirection) {
      if (/\bcenter\b/.test(gravity)) {
        style.alignItems = 'center'
        style.justifyContent = 'center'
      } else {
        if (/\bcenter_horizontal\b/.test(gravity)) {
          if (style.flexDirection === 'row') style.justifyContent = 'center'
          else style.alignItems = 'center'
        }
        if (/\bcenter_vertical\b/.test(gravity)) {
          if (style.flexDirection === 'column') style.justifyContent = 'center'
          else style.alignItems = 'center'
        }
        if (/\bend\b|\bright\b|\bbottom\b/.test(gravity)) {
          if (style.flexDirection === 'row' && /\bright\b|\bend\b/.test(gravity)) {
            style.justifyContent = 'end'
          }
          if (style.flexDirection === 'column' && /\bbottom\b/.test(gravity)) {
            style.justifyContent = 'end'
          }
        }
      }
    }
  }

  const rawId = a['android:id'] ?? ''
  const id = rawId ? rawId.replace(/^@\+?id\//, '') : `${tag}-${indexPath}`
  const name = a['android:tag'] ?? (a['android:id'] ? simpleTag(id) : tag)
  const text = resolveAndroidText(attr('android:text'), resources)

  let childOptions = options
  let children: DesignNode[]
  if (/constraintlayout/i.test(tag)) {
    const parentSize = {
      width:
        typeof box.width === 'number'
          ? box.width
          : (options?.parentSize?.width ?? DEFAULT_CONSTRAINT_PARENT.width),
      height:
        typeof box.height === 'number'
          ? box.height
          : (options?.parentSize?.height ?? DEFAULT_CONSTRAINT_PARENT.height),
    }
    const guides = collectConstraintGuides(el, resources, parentSize)
    childOptions = { ...options, guides, parentSize }
    children = el.children
      .map((c, i) => convertElement(c, resources, `${indexPath}.${i}`, childOptions))
      .filter((n) => n.name !== 'guideline' && n.name !== 'barrier' && n.name !== 'flow')
    applyConstraintChainWeights(el.children, children, parentSize, resources)
    applyConstraintFlowLayout(el.children, children, parentSize, resources, childOptions?.guides)
  } else {
    children = el.children.map((c, i) =>
      convertElement(c, resources, `${indexPath}.${i}`, childOptions),
    )
  }

  // RecyclerView / ListView / GridView: expand tools:listitem into preview tiles.
  if (
    /^(recyclerview|listview|gridview)$/i.test(tag) &&
    (!children.length || children.every((c) => !c.children.length && !c.text))
  ) {
    const listitem =
      attr('tools:listitem') ??
      a['tools:listitem'] ??
      attr('app:listitem') ??
      a['app:listitem']
    const layoutName = listitem?.replace(/^@layout\//, '')
    const xml = layoutName ? options?.resolveLayout?.(layoutName) : undefined
    const itemCountRaw =
      attr('tools:itemCount') ?? a['tools:itemCount'] ?? attr('tools:listitemCount')
    const itemCount = itemCountRaw !== undefined ? Number(itemCountRaw) : undefined
    if (xml) {
      try {
        const itemEl = parseXml(xml)
        const itemNode = convertElement(itemEl, resources, `${indexPath}.item`, options)
        children = tileListTemplate([itemNode], {
          idPrefix: `${id}-item`,
          count: itemCount,
          direction: /horizontal/i.test(attr('android:orientation') ?? '') ? 'row' : 'column',
          gap: 8,
        })
      } catch {
        /* keep empty children */
      }
    }
  }

  return {
    id,
    name,
    kind: mapAndroidKind(tag, el),
    text,
    box,
    style,
    children,
  }
}

export function normalizeAndroidLayout(
  layoutXml: string,
  resources: AndroidResources = EMPTY_ANDROID_RESOURCES,
  options?: NormalizeAndroidLayoutOptions,
): DesignDoc {
  const root = parseXml(layoutXml)
  const normalized = convertElement(root, resources, '0', options)
  return { root: normalized, scale: 1, source: 'android-xml' }
}

/**
 * Pull a default solid colour out of a `res/color/*.xml` ColorStateList /
 * selector / single `<color android:color="…"/>` document.
 */
function extractColorResourceDefault(content: string): string | undefined {
  let root: XmlElement
  try {
    root = parseXml(content)
  } catch {
    return undefined
  }
  const tag = root.tag.toLowerCase()
  if (tag === 'color') {
    return root.attrs['android:color'] ?? root.attrs.color ?? (root.text.trim() || undefined)
  }
  if (tag === 'selector' || tag === 'ripple') {
    // Prefer the item without state flags (default), else first with android:color.
    const items = root.children.filter((c) => c.tag === 'item')
    const plain = items.find((c) => {
      const keys = Object.keys(c.attrs).filter((k) => k.startsWith('android:state_'))
      return keys.length === 0 && (c.attrs['android:color'] || c.attrs.color)
    })
    const hit = plain ?? items.find((c) => c.attrs['android:color'] || c.attrs.color)
    return hit?.attrs['android:color'] ?? hit?.attrs.color
  }
  return undefined
}

/** Parse one or more `dimens.xml` / `colors.xml` / `styles.xml` contents into a resource table. */
export function buildAndroidResources(...fileContents: string[]): AndroidResources {
  const resources: AndroidResources = {
    dimens: {},
    colors: {},
    strings: {},
    styles: {},
    styleParents: {},
    attrs: {},
    drawables: {},
  }
  const pendingColors: Array<{ name: string; value: string }> = []
  const pendingDimens: Array<{ name: string; value: string }> = []
  /** Attr declarations collected from styles; theme-like styles applied last. */
  const attrFromStyles: Array<{ styleName: string; items: Record<string, string> }> = []

  for (const content of fileContents) {
    let root: XmlElement
    try {
      root = parseXml(content)
    } catch {
      continue
    }
    // Standalone res/color/*.xml documents (selector / color root).
    if (/^(color|selector|ripple)$/i.test(root.tag) && !root.children.some((c) => c.tag === 'color' && c.attrs.name)) {
      // Handled by loadAndroidResources via filename; skip here unless tagged.
      continue
    }
    for (const el of root.children) {
      if (el.tag === 'dimen') {
        const name = el.attrs.name
        if (name) pendingDimens.push({ name, value: el.text })
      } else if (el.tag === 'color') {
        const name = el.attrs.name
        if (name) pendingColors.push({ name, value: el.text })
      } else if (el.tag === 'string') {
        const name = el.attrs.name
        if (name) resources.strings[name] = el.text
      } else if (el.tag === 'item' && el.attrs.type === 'color') {
        const name = el.attrs.name
        if (name) pendingColors.push({ name, value: el.text })
      } else if (el.tag === 'style') {
        const name = el.attrs.name
        if (!name) continue
        if (el.attrs.parent) resources.styleParents[name] = el.attrs.parent
        const items: Record<string, string> = { ...(resources.styles[name] ?? {}) }
        for (const item of el.children) {
          if (item.tag !== 'item') continue
          const itemName = item.attrs.name
          if (!itemName) continue
          const value = (item.text || item.attrs.value || '').trim()
          if (value) items[itemName] = value
        }
        resources.styles[name] = items
        attrFromStyles.push({ styleName: name, items })
      }
    }
  }

  // Settle @dimen / @color alias chains (same approach as android-resources.ts).
  let dimenQueue = pendingDimens
  for (let pass = 0; pass < 4 && dimenQueue.length; pass += 1) {
    const rest: typeof pendingDimens = []
    for (const { name, value } of dimenQueue) {
      const parsed = parseAndroidDimension(value, resources)
      if (parsed && !('unresolved' in parsed)) {
        resources.dimens[name] = parsed
      } else if (value.startsWith('@dimen/')) {
        rest.push({ name, value })
      }
    }
    dimenQueue = rest
  }

  let colorQueue = pendingColors
  for (let pass = 0; pass < 4 && colorQueue.length; pass += 1) {
    const rest: typeof pendingColors = []
    for (const { name, value } of colorQueue) {
      const resolved = normalizeAndroidColor(value, resources)
      if (resolved && typeof resolved === 'string') {
        resources.colors[name] = resolved
      } else if (value.startsWith('@color/')) {
        rest.push({ name, value })
      }
    }
    colorQueue = rest
  }

  // Theme attrs: non-theme styles first, Theme*/AppTheme* last so they win.
  const ranked = [...attrFromStyles].sort((a, b) => {
    const score = (n: string) => (/theme|apptheme/i.test(n) ? 1 : 0)
    return score(a.styleName) - score(b.styleName)
  })
  for (const { items } of ranked) {
    for (const [itemName, value] of Object.entries(items)) {
      if (!/color|background|tint/i.test(itemName) && !value.startsWith('#') && !value.startsWith('@color/') && !value.startsWith('?')) {
        continue
      }
      const short = itemName.replace(/^android:/, '')
      resources.attrs[itemName] = value
      resources.attrs[short] = value
    }
  }
  // Resolve attr values to hex where possible.
  for (const key of Object.keys(resources.attrs)) {
    const raw = resources.attrs[key]!
    const resolved = normalizeAndroidColor(raw, resources)
    if (resolved && typeof resolved === 'string') resources.attrs[key] = resolved
  }

  return resources
}

/** Register a colour from a `res/color/<name>.xml` file (selector / solid). */
export function registerAndroidColorFile(
  resources: AndroidResources,
  colorName: string,
  fileContents: string,
): void {
  const raw = extractColorResourceDefault(fileContents)
  if (!raw) return
  const resolved = normalizeAndroidColor(raw, resources)
  if (resolved && typeof resolved === 'string') {
    resources.colors[colorName] = resolved
  } else if (raw.startsWith('@color/')) {
    // Keep as pending: retry after full values table is built.
    const target = raw.slice('@color/'.length)
    const hit = resources.colors[target]
    if (hit) resources.colors[colorName] = hit
  }
}

/** Parse a `<shape>` element body into L1-friendly fill / radius / stroke. */
function parseAndroidShapeElement(
  root: XmlElement,
  resources: AndroidResources,
): AndroidDrawableStyle | undefined {
  const out: AndroidDrawableStyle = {}
  const solid = root.children.find((c) => c.tag === 'solid')
  if (solid) {
    const resolved = normalizeAndroidColor(solid.attrs['android:color'], resources)
    if (resolved && typeof resolved === 'string') out.backgroundColor = resolved
  }
  const corners = root.children.find((c) => c.tag === 'corners')
  if (corners?.attrs['android:radius']) {
    const dim = parseAndroidDimension(corners.attrs['android:radius'], resources)
    if (dim && !('unresolved' in dim)) out.cornerRadius = dim.value
  }
  const stroke = root.children.find((c) => c.tag === 'stroke')
  if (stroke) {
    const sc = normalizeAndroidColor(stroke.attrs['android:color'], resources)
    if (sc && typeof sc === 'string') out.strokeColor = sc
    if (stroke.attrs['android:width']) {
      const dim = parseAndroidDimension(stroke.attrs['android:width'], resources)
      if (dim && !('unresolved' in dim)) out.strokeWidth = dim.value
    }
    const dashW = stroke.attrs['android:dashWidth']
    if (dashW) {
      const dim = parseAndroidDimension(dashW, resources)
      const gap = stroke.attrs['android:dashGap']
        ? parseAndroidDimension(stroke.attrs['android:dashGap'], resources)
        : undefined
      if (dim && !('unresolved' in dim) && dim.value > 0) {
        const gapV =
          gap && !('unresolved' in gap) ? gap.value : dim.value
        out.borderStyle =
          dim.value <= 2 && gapV <= 2 ? 'dotted' : 'dashed'
        out.strokeDashArray = `${dim.value},${gapV}`
      }
    }
    const lineCap = (stroke.attrs['android:strokeLineCap'] ?? '').toLowerCase()
    if (lineCap === 'round' || lineCap === 'square' || lineCap === 'butt') {
      out.strokeCap = lineCap
    }
    const lineJoin = (stroke.attrs['android:strokeLineJoin'] ?? '').toLowerCase()
    if (lineJoin === 'round' || lineJoin === 'bevel' || lineJoin === 'miter') {
      out.strokeJoin = lineJoin
    }
  }
  return out.backgroundColor || out.cornerRadius !== undefined || out.strokeWidth !== undefined
    ? out
    : undefined
}

/** Resolve one `<item>` inside selector / ripple / layer-list. */
function parseAndroidDrawableItem(
  item: XmlElement,
  resources: AndroidResources,
): AndroidDrawableStyle | undefined {
  const drawable = item.attrs['android:drawable']
  if (drawable?.startsWith('@drawable/')) {
    const nested = resources.drawables[drawable.slice('@drawable/'.length)]
    if (nested) return { ...nested }
  }
  const c = item.attrs['android:color']
  if (c) {
    const resolved = normalizeAndroidColor(c, resources)
    if (resolved && typeof resolved === 'string') return { backgroundColor: resolved }
  }
  for (const child of item.children) {
    if (child.tag === 'shape') {
      const parsed = parseAndroidShapeElement(child, resources)
      if (parsed) return parsed
    }
    if (child.tag === 'layer-list') {
      const parsed = parseAndroidLayerList(child, resources)
      if (parsed) return parsed
    }
    if (child.tag === 'level-list') {
      const parsed = parseAndroidLevelList(child, resources)
      if (parsed) return parsed
    }
    if (child.tag === 'inset') {
      const parsed = parseAndroidInsetDrawable(child, resources)
      if (parsed) return parsed
    }
    if (child.tag === 'clip' || child.tag === 'scale' || child.tag === 'rotate') {
      const parsed = parseAndroidWrapDrawable(child, resources)
      if (parsed) return parsed
    }
  }
  return undefined
}

/**
 * Flatten `<inset>`: keep nested fill/radius and map inset* → padding for L1.
 */
function parseAndroidInsetDrawable(
  root: XmlElement,
  resources: AndroidResources,
): AndroidDrawableStyle | undefined {
  const out: AndroidDrawableStyle = {}
  const drawable = root.attrs['android:drawable']
  if (drawable?.startsWith('@drawable/')) {
    const nested = resources.drawables[drawable.slice('@drawable/'.length)]
    if (nested) Object.assign(out, nested)
  }
  for (const child of root.children) {
    if (child.tag === 'shape') {
      const parsed = parseAndroidShapeElement(child, resources)
      if (parsed) Object.assign(out, parsed)
    } else if (child.tag === 'layer-list') {
      const parsed = parseAndroidLayerList(child, resources)
      if (parsed) Object.assign(out, parsed)
    } else if (child.tag === 'level-list') {
      const parsed = parseAndroidLevelList(child, resources)
      if (parsed) Object.assign(out, parsed)
    } else if (child.tag === 'inset') {
      const parsed = parseAndroidInsetDrawable(child, resources)
      if (parsed) Object.assign(out, parsed)
    } else if (child.tag === 'clip' || child.tag === 'scale' || child.tag === 'rotate') {
      const parsed = parseAndroidWrapDrawable(child, resources)
      if (parsed) Object.assign(out, parsed)
    }
  }
  const applyInset = (key: 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft', raw?: string) => {
    if (!raw) return
    const dim = parseAndroidDimension(raw, resources)
    if (dim && !('unresolved' in dim)) out[key] = dim.value
  }
  const insetAll = root.attrs['android:inset']
  if (insetAll) {
    const dim = parseAndroidDimension(insetAll, resources)
    if (dim && !('unresolved' in dim)) {
      out.paddingTop = out.paddingRight = out.paddingBottom = out.paddingLeft = dim.value
    }
  }
  applyInset('paddingLeft', root.attrs['android:insetLeft'])
  applyInset('paddingTop', root.attrs['android:insetTop'])
  applyInset('paddingRight', root.attrs['android:insetRight'])
  applyInset('paddingBottom', root.attrs['android:insetBottom'])
  return out.backgroundColor ||
    out.cornerRadius !== undefined ||
    out.paddingTop !== undefined ||
    out.paddingLeft !== undefined ||
    out.paddingRight !== undefined ||
    out.paddingBottom !== undefined
    ? out
    : undefined
}

/**
 * Flatten `<layer-list>`: later (topmost) layers overwrite fill for L1 paint;
 * corner / stroke keep the last non-empty value.
 */
function parseAndroidLayerList(
  root: XmlElement,
  resources: AndroidResources,
): AndroidDrawableStyle | undefined {
  const out: AndroidDrawableStyle = {}
  for (const item of root.children) {
    if (item.tag !== 'item') continue
    const layer = parseAndroidDrawableItem(item, resources)
    if (!layer) continue
    if (layer.backgroundColor) out.backgroundColor = layer.backgroundColor
    if (layer.cornerRadius !== undefined) out.cornerRadius = layer.cornerRadius
    if (layer.strokeColor) out.strokeColor = layer.strokeColor
    if (layer.strokeWidth !== undefined) out.strokeWidth = layer.strokeWidth
  }
  return out.backgroundColor || out.cornerRadius !== undefined ? out : undefined
}

/**
 * Flatten `<level-list>`: pick the item with the highest `android:maxLevel`
 * (typical "full" state for battery / progress icons).
 */
function parseAndroidLevelList(
  root: XmlElement,
  resources: AndroidResources,
): AndroidDrawableStyle | undefined {
  let best: AndroidDrawableStyle | undefined
  let bestLevel = -Infinity
  for (const item of root.children) {
    if (item.tag !== 'item') continue
    const raw = item.attrs['android:maxLevel'] ?? item.attrs['android:minLevel']
    const level = raw !== undefined && Number.isFinite(Number(raw)) ? Number(raw) : 0
    const layer = parseAndroidDrawableItem(item, resources)
    if (!layer) continue
    if (level >= bestLevel) {
      bestLevel = level
      best = layer
    }
  }
  return best
}

/**
 * Unwrap `<clip>` / `<scale>` / `<rotate>`: L1 ignores transform and takes nested fill.
 */
function parseAndroidWrapDrawable(
  root: XmlElement,
  resources: AndroidResources,
): AndroidDrawableStyle | undefined {
  const drawable = root.attrs['android:drawable']
  if (drawable?.startsWith('@drawable/')) {
    const nested = resources.drawables[drawable.slice('@drawable/'.length)]
    if (nested) return { ...nested }
  }
  for (const child of root.children) {
    if (child.tag === 'shape') {
      const parsed = parseAndroidShapeElement(child, resources)
      if (parsed) return parsed
    }
    if (child.tag === 'layer-list') {
      const parsed = parseAndroidLayerList(child, resources)
      if (parsed) return parsed
    }
    if (child.tag === 'level-list') {
      const parsed = parseAndroidLevelList(child, resources)
      if (parsed) return parsed
    }
    if (child.tag === 'inset') {
      const parsed = parseAndroidInsetDrawable(child, resources)
      if (parsed) return parsed
    }
    if (child.tag === 'clip' || child.tag === 'scale' || child.tag === 'rotate') {
      const parsed = parseAndroidWrapDrawable(child, resources)
      if (parsed) return parsed
    }
  }
  return undefined
}

/** Parse shape / layer-list / level-list / inset / clip / scale / rotate / selector drawable into L1 style. */
export function parseAndroidShapeDrawable(
  xml: string,
  resources: AndroidResources,
): AndroidDrawableStyle | undefined {
  let root: XmlElement
  try {
    root = parseXml(xml)
  } catch {
    return undefined
  }
  if (root.tag === 'shape') return parseAndroidShapeElement(root, resources)
  if (root.tag === 'layer-list') return parseAndroidLayerList(root, resources)
  if (root.tag === 'level-list') return parseAndroidLevelList(root, resources)
  if (root.tag === 'inset') return parseAndroidInsetDrawable(root, resources)
  if (root.tag === 'clip' || root.tag === 'scale' || root.tag === 'rotate') {
    return parseAndroidWrapDrawable(root, resources)
  }
  if (root.tag === 'ripple') return parseAndroidRippleDrawable(root, resources)
  if (root.tag === 'vector') return parseAndroidVectorDrawable(root, resources)
  if (root.tag === 'adaptive-icon') return parseAndroidAdaptiveIcon(root, resources)
  // transition / animation-list / selector: first usable item
  if (
    root.tag === 'transition' ||
    root.tag === 'animation-list' ||
    root.tag === 'animated-selector' ||
    root.tag === 'selector'
  ) {
    for (const item of root.children) {
      if (item.tag !== 'item') continue
      const hit = parseAndroidDrawableItem(item, resources)
      if (hit) return hit
    }
  }
  return undefined
}

/** Resolve `@drawable` / `@mipmap` / `@color` / nested shape|vector for adaptive layers. */
function resolveAndroidDrawableRef(
  raw: string | undefined,
  resources: AndroidResources,
  el?: XmlElement,
): AndroidDrawableStyle | undefined {
  if (raw?.startsWith('@drawable/') || raw?.startsWith('@mipmap/')) {
    const name = raw.replace(/^@(?:drawable|mipmap)\//, '')
    const nested = resources.drawables[name]
    if (nested) return { ...nested }
  }
  if (raw && (raw.startsWith('@color/') || raw.startsWith('#') || raw.startsWith('?'))) {
    const c = normalizeAndroidColor(raw, resources)
    if (c && typeof c === 'string') return { backgroundColor: c }
  }
  if (el) {
    for (const child of el.children) {
      if (child.tag === 'shape') {
        const parsed = parseAndroidShapeElement(child, resources)
        if (parsed) return parsed
      }
      if (child.tag === 'vector') {
        const parsed = parseAndroidVectorDrawable(child, resources)
        if (parsed) return parsed
      }
    }
  }
  return undefined
}

/**
 * `<adaptive-icon>`: background fill preferred; foreground tint as fallback.
 */
function parseAndroidAdaptiveIcon(
  root: XmlElement,
  resources: AndroidResources,
): AndroidDrawableStyle | undefined {
  let background: AndroidDrawableStyle | undefined
  let foreground: AndroidDrawableStyle | undefined
  for (const child of root.children) {
    if (child.tag === 'background') {
      background = resolveAndroidDrawableRef(child.attrs['android:drawable'], resources, child)
    } else if (child.tag === 'foreground') {
      foreground = resolveAndroidDrawableRef(child.attrs['android:drawable'], resources, child)
    }
  }
  const out: AndroidDrawableStyle = {}
  if (background?.backgroundColor) out.backgroundColor = background.backgroundColor
  else if (foreground?.backgroundColor) out.backgroundColor = foreground.backgroundColor
  if (background?.cornerRadius !== undefined) out.cornerRadius = background.cornerRadius
  else if (foreground?.cornerRadius !== undefined) out.cornerRadius = foreground.cornerRadius
  // Adaptive icons are typically squircle-cropped; mild L1 hint.
  if (out.backgroundColor && out.cornerRadius === undefined) out.cornerRadius = 18
  return out.backgroundColor || out.cornerRadius !== undefined ? out : undefined
}

/**
 * `<vector>`: prefer `android:tint`, else first path `android:fillColor`.
 */
function parseAndroidVectorDrawable(
  root: XmlElement,
  resources: AndroidResources,
): AndroidDrawableStyle | undefined {
  const tint = normalizeAndroidColor(root.attrs['android:tint'], resources)
  if (tint && typeof tint === 'string') return { backgroundColor: tint }

  const walk = (el: XmlElement): AndroidDrawableStyle | undefined => {
    if (el.tag === 'path') {
      const fill = normalizeAndroidColor(el.attrs['android:fillColor'], resources)
      if (fill && typeof fill === 'string') return { backgroundColor: fill }
    }
    for (const child of el.children) {
      const hit = walk(child)
      if (hit) return hit
    }
    return undefined
  }
  return walk(root)
}

/**
 * `<ripple>`: prefer non-mask content fill; mask supplies cornerRadius;
 * `android:color` used as fill only when there is no content item.
 */
function parseAndroidRippleDrawable(
  root: XmlElement,
  resources: AndroidResources,
): AndroidDrawableStyle | undefined {
  const out: AndroidDrawableStyle = {}
  const rippleRaw = root.attrs['android:color']
  const rippleColor = rippleRaw ? normalizeAndroidColor(rippleRaw, resources) : undefined

  let content: AndroidDrawableStyle | undefined
  let mask: AndroidDrawableStyle | undefined
  for (const item of root.children) {
    if (item.tag !== 'item') continue
    const id = item.attrs['android:id'] ?? ''
    const parsed = parseAndroidDrawableItem(item, resources)
    if (!parsed) continue
    if (/mask/i.test(id)) mask = parsed
    else if (!content) content = parsed
  }
  if (content) {
    if (content.backgroundColor) out.backgroundColor = content.backgroundColor
    if (content.cornerRadius !== undefined) out.cornerRadius = content.cornerRadius
    if (content.strokeColor) out.strokeColor = content.strokeColor
    if (content.strokeWidth !== undefined) out.strokeWidth = content.strokeWidth
  }
  if (mask?.cornerRadius !== undefined && out.cornerRadius === undefined) {
    out.cornerRadius = mask.cornerRadius
  }
  if (
    !out.backgroundColor &&
    rippleColor &&
    typeof rippleColor === 'string'
  ) {
    out.backgroundColor = rippleColor
  }
  return out.backgroundColor || out.cornerRadius !== undefined ? out : undefined
}

// ---------------------------------------------------------------------------
// Resource discovery
// ---------------------------------------------------------------------------

/** Walk up from a layout file to find the Android module res root. */
async function findAndroidResRoot(layoutPath: string): Promise<string | undefined> {
  let dir = path.dirname(layoutPath)
  for (let i = 0; i < 8; i++) {
    const resDir = path.join(dir, 'src', 'main', 'res')
    try {
      const entries = await readdir(resDir)
      if (entries.length) return path.join(dir, 'src', 'main')
    } catch {
      /* not here */
    }
    if (path.basename(dir) === 'res') return path.dirname(dir)
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

export type AndroidUiMode = 'light' | 'dark'

/**
 * Prefer resources for the requested UI mode when merging.
 * Higher score = loaded later = wins on name conflicts.
 */
export function androidResourceDirRank(
  dirName: string,
  uiMode: AndroidUiMode = 'light',
): number {
  let score = 0
  const isBase =
    /^values$/.test(dirName) ||
    /^drawable$/.test(dirName) ||
    /^color$/.test(dirName) ||
    /^layout$/.test(dirName)
  if (isBase) score += uiMode === 'dark' ? 40 : 100
  if (/-night\b/.test(dirName) || /-night-/.test(dirName)) {
    score += uiMode === 'dark' ? 100 : -80
  }
  if (/-notnight\b/.test(dirName)) score += uiMode === 'dark' ? -40 : 20
  if (/-land\b/.test(dirName)) score -= 15
  if (/-port\b/.test(dirName)) score += 5
  if (/-hdpi|-xhdpi|-xxhdpi|-xxxhdpi|-mdpi/.test(dirName)) score -= 5
  return score
}

export interface LoadAndroidXmlResourcesOptions {
  uiMode?: AndroidUiMode
}

/** Read every values* / color* / drawable* XML under an Android res root. */
export async function loadAndroidXmlResources(
  layoutPath: string,
  options: LoadAndroidXmlResourcesOptions = {},
): Promise<AndroidResources> {
  const uiMode = options.uiMode ?? 'light'
  const resRoot = await findAndroidResRoot(layoutPath)
  if (!resRoot) return EMPTY_ANDROID_RESOURCES
  const resDir = path.join(resRoot, 'res')
  let dirs: string[] = []
  try {
    dirs = (await readdir(resDir, { withFileTypes: true }))
      .filter(
        (d) =>
          d.isDirectory() &&
          (/^values/.test(d.name) ||
            /^color/.test(d.name) ||
            /^drawable/.test(d.name) ||
            /^mipmap/.test(d.name)),
      )
      .map((d) => path.join(resDir, d.name))
  } catch {
    return EMPTY_ANDROID_RESOURCES
  }
  dirs.sort(
    (a, b) =>
      androidResourceDirRank(path.basename(a), uiMode) -
      androidResourceDirRank(path.basename(b), uiMode),
  )
  const valueXmls: string[] = []
  const colorFiles: Array<{ name: string; content: string; rank: number }> = []
  const drawableFiles: Array<{ name: string; content: string; rank: number }> = []
  for (const dir of dirs) {
    const base = path.basename(dir)
    const rank = androidResourceDirRank(base, uiMode)
    let entries: string[] = []
    try {
      entries = await readdir(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (!name.endsWith('.xml')) continue
      const content = await readFile(path.join(dir, name), 'utf8')
      if (/^color/.test(base)) {
        colorFiles.push({ name: name.replace(/\.xml$/i, ''), content, rank })
      } else if (/^drawable/.test(base) || /^mipmap/.test(base)) {
        drawableFiles.push({ name: name.replace(/\.xml$/i, ''), content, rank })
      } else {
        valueXmls.push(content)
      }
    }
  }
  const resources = buildAndroidResources(...valueXmls)
  colorFiles.sort((a, b) => a.rank - b.rank)
  for (const { name, content } of colorFiles) {
    registerAndroidColorFile(resources, name, content)
  }
  drawableFiles.sort((a, b) => a.rank - b.rank)
  for (const { name, content } of drawableFiles) {
    if (/<(shape|layer-list|level-list|inset|clip|scale|rotate|transition|animation-list|animated-selector|ripple|vector|adaptive-icon)[\s>]/i.test(content)) {
      const parsed = parseAndroidShapeDrawable(content, resources)
      if (parsed) resources.drawables[name] = parsed
    }
  }
  for (const { name, content } of drawableFiles) {
    if (resources.drawables[name]) continue
    const parsed = parseAndroidShapeDrawable(content, resources)
    if (parsed) resources.drawables[name] = parsed
  }
  for (const key of Object.keys(resources.attrs)) {
    const raw = resources.attrs[key]!
    if (raw.startsWith('#')) continue
    const resolved = normalizeAndroidColor(raw, resources)
    if (resolved && typeof resolved === 'string') resources.attrs[key] = resolved
  }
  return resources
}

async function loadAndroidResources(
  layoutPath: string,
  options?: LoadAndroidXmlResourcesOptions,
): Promise<AndroidResources> {
  return loadAndroidXmlResources(layoutPath, options)
}

/** Prefetch layout XML so include expansion can stay sync during convert. */
async function prefetchLayouts(
  layoutPath: string,
  uiMode: AndroidUiMode = 'light',
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const resRoot = await findAndroidResRoot(layoutPath)
  if (!resRoot) return map
  const resDir = path.join(resRoot, 'res')
  let layoutDirs: string[] = []
  try {
    layoutDirs = (await readdir(resDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && /^layout/.test(d.name))
      .map((d) => path.join(resDir, d.name))
      .sort(
        (a, b) =>
          androidResourceDirRank(path.basename(a), uiMode) -
          androidResourceDirRank(path.basename(b), uiMode),
      )
  } catch {
    return map
  }
  for (const dir of layoutDirs) {
    let entries: string[] = []
    try {
      entries = await readdir(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (!name.endsWith('.xml')) continue
      const key = name.replace(/\.xml$/i, '')
      try {
        map.set(key, await readFile(path.join(dir, name), 'utf8'))
      } catch {
        /* ignore */
      }
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

function isAndroidLayoutFile(relativePath: string): boolean {
  const dir = path.dirname(relativePath.split('/').join(path.sep))
  const base = path.basename(dir)
  const parentBase = path.basename(path.dirname(dir))
  return parentBase === 'res' && /^layout/.test(base)
}

/** Lightweight fingerprint directly from layout XML (resources not needed). */
function fingerprintFromXml(xml: string, fileBase: string): PageFingerprint {
  const texts = new Set<string>()
  let controlCount = 0
  let root: XmlElement
  try {
    root = parseXml(xml)
  } catch {
    return { texts: [], nameTokens: tokenizeName(fileBase), controlCount: 0 }
  }
  const walk = (el: XmlElement) => {
    controlCount += 1
    const t = el.attrs['android:text']
    if (t && !t.startsWith('@')) {
      const nt = normalizeText(t)
      if (nt) texts.add(nt)
    }
    for (const c of el.children) walk(c)
  }
  walk(root)
  return {
    texts: [...texts],
    nameTokens: tokenizeName(fileBase.replace(/\.xml$/i, '')),
    controlCount,
  }
}

export const androidXmlAdapter: PlatformAdapter = {
  id: 'android-xml',
  platform: 'android',
  kindLabel: 'Android XML',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!file.name.endsWith('.xml')) return
      if (!isAndroidLayoutFile(file.relativePath)) return
      let xml = ''
      try {
        xml = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      pages.push({
        adapterId: 'android-xml',
        platform: 'android',
        kindLabel: 'Android XML',
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
        precise: true,
        fingerprint: fingerprintFromXml(xml, file.name),
      })
    })
    return pages
  },

  async toDesignDoc(page: CodePage): Promise<DesignDoc> {
    const xml = await readFile(page.absolutePath, 'utf8')
    const envMode = process.env.TRACESCOPE_ANDROID_UI_MODE
    const uiMode =
      page.hints?.uiMode ??
      (envMode === 'dark' || envMode === 'light' ? envMode : 'light')
    const resources = await loadAndroidResources(page.absolutePath, { uiMode })
    const layouts = await prefetchLayouts(page.absolutePath, uiMode)
    return normalizeAndroidLayout(xml, resources, {
      resolveLayout: (name) => layouts.get(name),
    })
  },
}
