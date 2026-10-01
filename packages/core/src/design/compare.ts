/**
 * Deterministic visual comparison engine.
 *
 * Matches design nodes (the expected, from Figma/Lanhu) to implementation
 * nodes (the actual, from Android XML/UIKit), then compares their normalised
 * numeric / color / typography properties with per-property tolerances.
 *
 * No model and no running app are involved. Values that could not be resolved
 * statically produce a `needsReview` diff rather than a false failure.
 */
import type {
  ComparedValue,
  DesignDoc,
  DesignDiff,
  DesignFill,
  DesignGradient,
  DesignNode,
  DesignShadow,
  DiffSeverity,
  UnmatchedNode,
  UnresolvedValue,
  VisualCompareResult,
  VisualProperty,
} from './types.js'

/** Absolute tolerance (logical units) for numeric length comparisons. */
const NUMERIC_TOLERANCE = 0.6

/** Per-channel tolerance (0..255) for color comparisons. */
const COLOR_CHANNEL_TOLERANCE = 3

const LENGTH_PROPERTIES: VisualProperty[] = [
  'width',
  'height',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'gap',
  'rowGap',
  'columnGap',
  'flexGrow',
  'flexShrink',
  'order',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'textAdvanceWidth',
  'textBlockHeight',
  'cornerRadius',
  'borderWidth',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'elevation',
  'innerShadow',
  'blur',
  'backdropBlur',
  'rotation',
  'scaleX',
  'scaleY',
  'skewX',
  'skewY',
  'perspective',
  'rotateX',
  'rotateY',
  'zIndex',
  'aspectRatio',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'paragraphSpacing',
  'wordSpacing',
  'textIndent',
  'maxLines',
]

const COLOR_PROPERTIES: VisualProperty[] = [
  'backgroundColor',
  'color',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
]

const STRING_PROPERTIES: VisualProperty[] = ['fontFamily']

/** Exact-match visual enums / tokens already normalised by adapters. */
const ENUM_PROPERTIES: VisualProperty[] = [
  'textAlign',
  'textAlignVertical',
  'fontStyle',
  'textDecoration',
  'textTransform',
  'textOverflow',
  'overflow',
  'clipPath',
  'flexDirection',
  'alignItems',
  'justifyContent',
  'flexWrap',
  'alignContent',
  'alignSelf',
  'sizingHorizontal',
  'sizingVertical',
  'borderStyle',
  'strokeDashArray',
  'strokeCap',
  'strokeJoin',
  'position',
  'transformOrigin',
  'visibility',
  'display',
  'whiteSpace',
  'wordBreak',
  'gridTemplate',
  'direction',
  'writingMode',
  'filter',
  'outline',
  'imageFit',
  'imagePosition',
  'blendMode',
  'strokeAlign',
]

/** High-impact properties drive the top severity for a node mismatch. */
const HIGH_PROPERTIES = new Set<VisualProperty>([
  'backgroundColor',
  'color',
  'fontSize',
  'imageFit',
  'gradient',
])

function serializeCornerRadii(radii: [number, number, number, number]): string {
  return radii.map((n) => Math.round(n * 100) / 100).join(',')
}

function serializeGradient(gradient: DesignGradient): string {
  const stops = gradient.stops
    .map((s) => `${s.color.toLowerCase()}@${Math.round(s.position * 1000) / 1000}`)
    .join(',')
  return `${gradient.type}:${Math.round(gradient.cssAngle * 100) / 100}:${stops}`
}

/** Fingerprint for L1 shadow compare: ox,oy,blur,spread,color[,inset]. */
export function serializeShadow(shadow: DesignShadow): string {
  const ox = Math.round(shadow.offsetX * 100) / 100
  const oy = Math.round(shadow.offsetY * 100) / 100
  const blur = Math.round(shadow.blur * 100) / 100
  const spread =
    shadow.spread !== undefined ? Math.round(shadow.spread * 100) / 100 : 0
  const color = (shadow.color ?? '').toLowerCase()
  const inset = shadow.inset ? 'i' : 'o'
  return `${ox},${oy},${blur},${spread},${color},${inset}`
}

/** Ordered stack fingerprint; empty → undefined. */
export function serializeShadows(shadows: DesignShadow[]): string | undefined {
  if (!shadows.length) return undefined
  return shadows.map(serializeShadow).join('|')
}

/** Fingerprint for a fill stack (type + key visual token). */
export function serializeFills(fills: DesignFill[]): string | undefined {
  if (!fills.length) return undefined
  return fills
    .map((f) => {
      if (f.type === 'solid') return `solid:${(f.color ?? '').toLowerCase()}`
      if (f.type === 'gradient' && f.gradient) return `gradient:${serializeGradient(f.gradient)}`
      if (f.type === 'image') return `image:${f.imageRef ?? ''}:${f.imageFit ?? ''}`
      return f.type
    })
    .join('|')
}

function shadowClose(expected: string, actual: string): boolean {
  const parseOne = (s: string) => {
    const a = s.split(',')
    return {
      nums: a.slice(0, 4).map(Number),
      color: (a[4] ?? '').toLowerCase(),
      inset: (a[5] ?? 'o').toLowerCase(),
    }
  }
  // Multi-shadow stacks use `|`.
  const expParts = expected.split('|')
  const actParts = actual.split('|')
  if (expParts.length !== actParts.length) return false
  for (let i = 0; i < expParts.length; i++) {
    const a = parseOne(expParts[i]!)
    const b = parseOne(actParts[i]!)
    if (a.nums.length < 4 || b.nums.length < 4) return false
    for (let j = 0; j < 4; j++) {
      if (!Number.isFinite(a.nums[j]) || !Number.isFinite(b.nums[j])) return false
      if (Math.abs(a.nums[j]! - b.nums[j]!) > NUMERIC_TOLERANCE) return false
    }
    if (a.inset !== b.inset) return false
    if (a.color && b.color && !colorsEqual(a.color, b.color)) return false
  }
  return true
}

function cornerRadiiClose(expected: string, actual: string): boolean {
  const a = expected.split(',').map(Number)
  const b = actual.split(',').map(Number)
  if (a.length !== 4 || b.length !== 4) return expected === actual
  for (let i = 0; i < 4; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return false
    if (Math.abs(a[i]! - b[i]!) > NUMERIC_TOLERANCE) return false
  }
  return true
}

/** Raw tokens that mean "size is dynamic / device-driven", not a fixed artboard px. */
const DYNAMIC_SIZE_RAW =
  /^(match_parent|fill_parent|wrap_content|matchparent|fillparent|wrapcontent|match|wrap|0dp|0\.0?dp|fill|flex|flex[-_]?1|1fr|100%|stretch|auto|content)$/i

/** Relative tolerance for width/height: artboard vs device is expected to vary. */
const SIZE_RELATIVE_TOLERANCE = 0.35

function isDynamicSizeValue(v: ComparedValue | undefined): boolean {
  if (!v) return false
  const raw = isUnresolved(v) ? String(v.raw || '').trim() : String(v).trim()
  if (!raw) return false
  return DYNAMIC_SIZE_RAW.test(raw)
}

function flatten(node: DesignNode, out: DesignNode[] = []): DesignNode[] {
  out.push(node)
  for (const child of node.children) flatten(child, out)
  return out
}

function normalizeText(value?: string): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim()
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\-\s]+/g, '')
    .replace(/(btn|button|lbl|label|view|tv|iv)$/, '')
    .trim()
}

function boxCenter(n: DesignNode): { x: number; y: number } | undefined {
  const { x, y, width, height } = n.box
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return undefined
  }
  return { x: x + width / 2, y: y + height / 2 }
}

function spatialDistance(a: DesignNode, b: DesignNode): number {
  const ca = boxCenter(a)
  const cb = boxCenter(b)
  if (!ca || !cb) return Number.POSITIVE_INFINITY
  return Math.hypot(ca.x - cb.x, ca.y - cb.y)
}

/**
 * Greedy multi-key matching. A node may be matched only once; the strongest
 * signal (equal text) wins, then name, then spatial proximity.
 */
function boxSize(n: DesignNode): { width: number; height: number } | undefined {
  const { width, height } = n.box
  if (typeof width !== 'number' || typeof height !== 'number') return undefined
  return { width, height }
}

/** 0..1 similarity of node sizes (helps disambiguate when code lacks x/y). */
function sizeSimilarity(a: DesignNode, b: DesignNode): number {
  const sa = boxSize(a)
  const sb = boxSize(b)
  if (!sa || !sb) return 0
  const dw = Math.abs(sa.width - sb.width)
  const dh = Math.abs(sa.height - sb.height)
  const scale = Math.max(sa.width, sb.width, sa.height, sb.height, 1)
  return Math.max(0, 1 - (dw + dh) / (2 * scale))
}

function decorativeChildren(control: DesignNode): DesignNode[] {
  const parentSize = boxSize(control)
  if (!parentSize) return []
  return control.children.filter((ch) => {
    if (ch.kind !== 'shape') return false
    const cs = boxSize(ch)
    if (!cs) return false
    return (
      Math.abs(cs.width - parentSize.width) <= Math.max(2, parentSize.width * 0.15) &&
      Math.abs(cs.height - parentSize.height) <= Math.max(2, parentSize.height * 0.15)
    )
  })
}

/** A design leaf text whose parent is a control (button/pill). */
function enclosingControl(node: DesignNode, all: DesignNode[]): DesignNode | undefined {
  const parent = all.find((n) => n.children.includes(node))
  if (!parent) return undefined
  const parentSize = boxSize(parent)
  // Background/shape children are decorative when they (nearly) fill the frame.
  const isDecorative = (ch: DesignNode) => {
    if (ch.kind === 'icon') return true
    const cs = boxSize(ch)
    if (!parentSize || !cs) return false
    return (
      Math.abs(cs.width - parentSize.width) <= Math.max(2, parentSize.width * 0.15) &&
      Math.abs(cs.height - parentSize.height) <= Math.max(2, parentSize.height * 0.15)
    )
  }
  const otherChildren = parent.children.filter((ch) => ch !== node)
  const hasText = parent.children.some((ch) => ch.kind === 'text')
  if (
    parent.kind !== 'text' &&
    hasText &&
    parentSize &&
    otherChildren.every((ch) => ch.kind === 'icon' || isDecorative(ch))
  ) {
    return parent
  }
  return undefined
}

function matchNodes(
  designNodes: DesignNode[],
  codeNodes: DesignNode[],
): Array<{ design: DesignNode; code: DesignNode; merged: boolean }> {
  const pairs: Array<{
    score: number
    design: DesignNode
    code: DesignNode
    merged: boolean
  }> = []
  const codeByIndex = new Map(codeNodes.map((n, i) => [n, i]))

  for (const d0 of designNodes) {
    // A code control should pair with the design control frame (label merged),
    // not with the frame's inner text leaf.
    const control = enclosingControl(d0, designNodes)
    const d = control ?? d0
    // Only a merged control borrows its inner label's text; other containers
    // must not match on descendant text.
    const effectiveText = control
      ? (control.text ?? control.children.find((ch) => ch.kind === 'text')?.text)
      : d0.text
    for (const c of codeNodes) {
      let score = 0
      const dt = normalizeText(effectiveText)
      const ct = normalizeText(c.text)
      if (dt && ct && dt === ct) score += 100
      const dn = normalizeName(d.name)
      const cn = normalizeName(c.name)
      if (dn && cn && dn === cn) score += 40
      const dist = spatialDistance(d, c)
      if (Number.isFinite(dist) && dist <= 12) score += Math.max(0, 20 - dist)
      const sizeScore = sizeSimilarity(d, c)
      score += sizeScore * 30
      // Text and image kinds should match.
      if (d.kind === c.kind) score += 4
      if (score > 0) {
        // Tie-break toward list proximity (stable ordering).
        pairs.push({
          score: score + (codeByIndex.get(c)! / (codeNodes.length + 1)) / 100,
          design: d,
          code: c,
          merged: Boolean(control),
        })
      }
    }
  }

  // Collapse duplicate (design, code) pairs created by the label+frame merge.
  const byKey = new Map<string, (typeof pairs)[number]>()
  for (const p of pairs) {
    const key = `${p.design.id} ${p.code.id}`
    const existing = byKey.get(key)
    if (!existing || (!existing.merged && p.merged)) byKey.set(key, p)
  }
  const uniquePairs = [...byKey.values()]
  uniquePairs.sort((a, b) => b.score - a.score)
  const usedDesign = new Set<string>()
  const usedCode = new Set<string>()
  const result: Array<{ design: DesignNode; code: DesignNode; merged: boolean }> = []
  for (const pair of uniquePairs) {
    if (usedDesign.has(pair.design.id) || usedCode.has(pair.code.id)) continue
    usedDesign.add(pair.design.id)
    usedCode.add(pair.code.id)
    result.push({ design: pair.design, code: pair.code, merged: pair.merged })
  }
  return result
}

function parseHex(hex: string): { r: number; g: number; b: number; a: number } | undefined {
  let h = hex.trim().toLowerCase()
  if (!h.startsWith('#')) return undefined
  h = h.slice(1)
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length === 6) h += 'ff'
  if (h.length !== 8) return undefined
  const num = parseInt(h, 16)
  if (Number.isNaN(num)) return undefined
  return {
    r: (num >> 24) & 255,
    g: (num >> 16) & 255,
    b: (num >> 8) & 255,
    a: num & 255,
  }
}

function isUnresolved(v: ComparedValue | undefined): v is UnresolvedValue {
  return !!v && typeof v === 'object' && 'unresolved' in v
}

function colorsEqual(expected: string, actual: string): boolean {
  const a = parseHex(expected)
  const b = parseHex(actual)
  if (!a || !b) return expected.toLowerCase() === actual.toLowerCase()
  return (
    Math.abs(a.r - b.r) <= COLOR_CHANNEL_TOLERANCE &&
    Math.abs(a.g - b.g) <= COLOR_CHANNEL_TOLERANCE &&
    Math.abs(a.b - b.b) <= COLOR_CHANNEL_TOLERANCE &&
    Math.abs(a.a - b.a) <= COLOR_CHANNEL_TOLERANCE
  )
}

/** Bake node-level opacity into a hex colour's alpha channel. */
function colorWithOpacity(color: string, opacity: number | undefined): string {
  if (opacity === undefined || !(opacity < 1)) return color
  const p = parseHex(color)
  if (!p) return color
  const a = Math.max(0, Math.min(255, Math.round(p.a * opacity)))
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hex(p.r)}${hex(p.g)}${hex(p.b)}${hex(a)}`
}

function nodeOpacity(node: DesignNode): number | undefined {
  return typeof node.style.opacity === 'number' ? node.style.opacity : undefined
}

function severityFor(property: VisualProperty, delta: number): DiffSeverity {
  if (HIGH_PROPERTIES.has(property) && delta >= 4) return 'high'
  if (delta >= 8) return 'high'
  if (HIGH_PROPERTIES.has(property) || delta >= 2) return 'medium'
  return 'low'
}

/** Typography that platforms legitimately default; absence is review, not failure. */
const DEFAULTABLE_TYPOGRAPHY = new Set<VisualProperty>([
  'lineHeight',
  'letterSpacing',
  'paragraphSpacing',
  'fontFamily',
  'fontWeight',
])

/** Relative tolerance for line-height (platform metrics differ: px vs multiplier). */
const LINE_HEIGHT_RELATIVE_TOLERANCE = 0.2

function isDefaultLetterSpacing(v: ComparedValue): boolean {
  return typeof v === 'number' && Math.abs(v) <= NUMERIC_TOLERANCE
}

/** Design line-height that looks like an AUTO / platform default for the font size. */
function isDefaultishLineHeight(lineHeight: number, fontSize: number | undefined): boolean {
  if (fontSize === undefined || !(fontSize > 0)) return false
  const ratio = lineHeight / fontSize
  // AUTO (~1.0) through common body defaults (~1.2–1.5).
  return ratio >= 0.95 && ratio <= 1.55
}

function nestedText(node: DesignNode): DesignNode | undefined {
  return node.children.find((ch) => ch.kind === 'text')
}

const TYPO_FROM_LEAF: VisualProperty[] = [
  'color',
  'fontFamily',
  'fontWeight',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'textDecoration',
  'textTransform',
]

function leafTypography(node: DesignNode, property: VisualProperty): ComparedValue | undefined {
  const leaf = nestedText(node)
  if (!leaf) return undefined
  const v =
    property === 'color' ? leaf.style.color
    : property === 'fontFamily' ? leaf.style.fontFamily
    : property === 'fontWeight' ? leaf.style.fontWeight
    : property === 'fontSize' ? leaf.style.fontSize
    : property === 'lineHeight' ? leaf.style.lineHeight
    : property === 'textDecoration' ? leaf.style.textDecoration
    : property === 'textTransform' ? leaf.style.textTransform
    : leaf.style.letterSpacing
  return v === undefined ? undefined : (v as ComparedValue)
}

function getNodeValue(
  node: DesignNode,
  property: VisualProperty,
  borrowLeafTypography = false,
): ComparedValue | undefined {
  if (property === 'text') return node.text
  if (property === 'controlCount') return undefined
  if (property === 'width' || property === 'height') {
    const v = node.box[property]
    return typeof v === 'number' ? v : undefined
  }
  if (property === 'cornerRadii') {
    const radii = node.style.cornerRadii
    return radii ? serializeCornerRadii(radii) : undefined
  }
  if (property === 'gradient') {
    return node.style.gradient ? serializeGradient(node.style.gradient) : undefined
  }
  if (property === 'shadow') {
    return node.style.shadow ? serializeShadow(node.style.shadow) : undefined
  }
  if (property === 'textShadow') {
    return node.style.textShadow ? serializeShadow(node.style.textShadow) : undefined
  }
  if (property === 'insetShadow') {
    return node.style.insetShadow ? serializeShadow(node.style.insetShadow) : undefined
  }
  if (property === 'shadows') {
    return node.style.shadows?.length
      ? serializeShadows(node.style.shadows)
      : undefined
  }
  if (property === 'fills') {
    return node.style.fills?.length ? serializeFills(node.style.fills) : undefined
  }
  // A merged design control keeps its label's typography on the inner text leaf.
  if (borrowLeafTypography && node.kind !== 'text' && TYPO_FROM_LEAF.includes(property)) {
    const borrowed = leafTypography(node, property)
    if (borrowed !== undefined) return borrowed
  }
  if (property === 'textAlign') {
    const leaf = borrowLeafTypography && node.kind !== 'text' ? nestedText(node) : undefined
    const align = leaf?.style.textAlign ?? node.style.textAlign
    return align
  }
  return node.style[property as keyof typeof node.style] as ComparedValue | undefined
}

function comparePair(design: DesignNode, code: DesignNode, merged: boolean): DesignDiff[] {
  const diffs: DesignDiff[] = []
  const allProperties: VisualProperty[] = [
    ...LENGTH_PROPERTIES,
    ...COLOR_PROPERTIES,
    ...STRING_PROPERTIES,
    ...ENUM_PROPERTIES,
    'fontWeight',
    'opacity',
    'cornerRadii',
    'gradient',
    'shadow',
    'insetShadow',
    'shadows',
    'textShadow',
    'fills',
  ]

  for (const property of allProperties) {
    const expected = getNodeValue(design, property, merged)
    const actual = getNodeValue(code, property, false)
    if (expected === undefined && actual === undefined) continue
    if (isUnresolved(expected) || isUnresolved(actual)) {
      // Dynamic layout sizes vs fixed artboard sizes are expected on real devices.
      if (
        (property === 'width' || property === 'height') &&
        (isDynamicSizeValue(expected) || isDynamicSizeValue(actual))
      ) {
        continue
      }
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected: expected ?? { unresolved: true, raw: '' },
        actual,
        severity: 'low',
        needsReview: true,
      })
      continue
    }
    if (expected === undefined) {
      // Design omits it but code defines it: usually not a visual regression.
      continue
    }
    if (actual === undefined) {
      if (DEFAULTABLE_TYPOGRAPHY.has(property)) {
        // letterSpacing 0 is the platform default — missing code value is fine.
        if (property === 'letterSpacing' && isDefaultLetterSpacing(expected)) continue
        // AUTO / typical body line-height with no code override → skip noise.
        if (property === 'lineHeight' && typeof expected === 'number') {
          const fs = getNodeValue(design, 'fontSize', merged)
          if (typeof fs === 'number' && isDefaultishLineHeight(expected, fs)) continue
        }
        diffs.push({
          designNodeId: design.id,
          codeNodeId: code.id,
          nodeName: design.name,
          property,
          expected,
          actual,
          severity: 'low',
          needsReview: true,
        })
        continue
      }
      // Platform default: design tools emit left; code often omits gravity/align.
      if (property === 'textAlign' && String(expected).toLowerCase() === 'left') {
        continue
      }
      // Fully opaque is the default; code omitting opacity is fine.
      if (property === 'opacity' && Number(expected) >= 0.99) {
        continue
      }
      // Near-zero rotation is the default.
      if (property === 'rotation' && Math.abs(Number(expected)) <= 0.5) {
        continue
      }
      // Identity scale is the default.
      if (
        (property === 'scaleX' || property === 'scaleY') &&
        Math.abs(Number(expected) - 1) <= 0.02
      ) {
        continue
      }
      // Near-zero skew / default z-index.
      if (
        (property === 'skewX' || property === 'skewY') &&
        Math.abs(Number(expected)) <= 0.5
      ) {
        continue
      }
      if (property === 'zIndex' && Number(expected) === 0) {
        continue
      }
      // Center stroke is the common default.
      if (property === 'strokeAlign' && String(expected).toLowerCase() === 'center') {
        continue
      }
      // Default text decoration / transform / overflow.
      if (
        (property === 'textDecoration' || property === 'textTransform') &&
        String(expected).toLowerCase() === 'none'
      ) {
        continue
      }
      if (property === 'overflow' && String(expected).toLowerCase() === 'visible') {
        continue
      }
      if (property === 'textOverflow' && String(expected).toLowerCase() === 'clip') {
        continue
      }
      // Continuous stroke is the default; dashed/dotted are notable.
      if (property === 'borderStyle' && String(expected).toLowerCase() === 'solid') {
        continue
      }
      if (property === 'strokeCap' && String(expected).toLowerCase() === 'butt') {
        continue
      }
      if (property === 'strokeJoin' && String(expected).toLowerCase() === 'miter') {
        continue
      }
      // Fixed sizing is the common artboard default when code uses explicit dp.
      if (
        (property === 'sizingHorizontal' || property === 'sizingVertical') &&
        String(expected).toLowerCase() === 'fixed'
      ) {
        continue
      }
      // static/relative positioning is the common default.
      if (
        property === 'position' &&
        (String(expected).toLowerCase() === 'relative' ||
          String(expected).toLowerCase() === 'static')
      ) {
        continue
      }
      // nowrap is the flex default.
      if (property === 'flexWrap' && String(expected).toLowerCase() === 'nowrap') {
        continue
      }
      if (
        property === 'alignContent' &&
        (String(expected).toLowerCase() === 'stretch' ||
          String(expected).toLowerCase() === 'normal' ||
          String(expected).toLowerCase() === 'start')
      ) {
        continue
      }
      if (property === 'order' && Number(expected) === 0) {
        continue
      }
      if (property === 'visibility' && String(expected).toLowerCase() === 'visible') {
        continue
      }
      if (property === 'whiteSpace' && String(expected).toLowerCase() === 'normal') {
        continue
      }
      if (property === 'wordBreak' && String(expected).toLowerCase() === 'normal') {
        continue
      }
      if (
        (property === 'wordSpacing' || property === 'textIndent') &&
        Number(expected) === 0
      ) {
        continue
      }
      if (
        property === 'transformOrigin' &&
        /^(50%\s*50%|center)$/i.test(String(expected).trim())
      ) {
        continue
      }
      if (property === 'direction' && String(expected).toLowerCase() === 'ltr') {
        continue
      }
      if (
        property === 'writingMode' &&
        String(expected).toLowerCase() === 'horizontal-tb'
      ) {
        continue
      }
      // Gradients / full shadows / blend / rotation / fills / scale / clip often flatten in code; soft-review.
      if (
        property === 'gradient' ||
        property === 'imagePosition' ||
        property === 'shadow' ||
        property === 'insetShadow' ||
        property === 'shadows' ||
        property === 'textShadow' ||
        property === 'fills' ||
        property === 'blendMode' ||
        property === 'strokeAlign' ||
        property === 'rotation' ||
        property === 'scaleX' ||
        property === 'scaleY' ||
        property === 'skewX' ||
        property === 'skewY' ||
        property === 'perspective' ||
        property === 'rotateX' ||
        property === 'rotateY' ||
        property === 'zIndex' ||
        property === 'textDecoration' ||
        property === 'textTransform' ||
        property === 'overflow' ||
        property === 'clipPath' ||
        property === 'aspectRatio' ||
        property === 'textOverflow' ||
        property === 'maxLines' ||
        property === 'minWidth' ||
        property === 'maxWidth' ||
        property === 'minHeight' ||
        property === 'maxHeight' ||
        property === 'textAdvanceWidth' ||
        property === 'textBlockHeight' ||
        property === 'flexDirection' ||
        property === 'alignItems' ||
        property === 'justifyContent' ||
        property === 'flexWrap' ||
        property === 'alignContent' ||
        property === 'alignSelf' ||
        property === 'flexGrow' ||
        property === 'flexShrink' ||
        property === 'order' ||
        property === 'gridTemplate' ||
        property === 'transformOrigin' ||
        property === 'visibility' ||
        property === 'display' ||
        property === 'whiteSpace' ||
        property === 'wordBreak' ||
        property === 'wordSpacing' ||
        property === 'textIndent' ||
        property === 'direction' ||
        property === 'writingMode' ||
        property === 'filter' ||
        property === 'outline' ||
        property === 'fontStyle' ||
        property === 'textAlignVertical' ||
        property === 'borderStyle' ||
        property === 'strokeDashArray' ||
        property === 'strokeCap' ||
        property === 'strokeJoin' ||
        property === 'sizingHorizontal' ||
        property === 'sizingVertical' ||
        property === 'backdropBlur' ||
        property === 'position' ||
        property === 'rowGap' ||
        property === 'columnGap'
      ) {
        diffs.push({
          designNodeId: design.id,
          codeNodeId: code.id,
          nodeName: design.name,
          property,
          expected,
          actual,
          severity: 'low',
          needsReview: true,
        })
        continue
      }
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected,
        severity: HIGH_PROPERTIES.has(property) ? 'medium' : 'low',
      })
      continue
    }

    if (COLOR_PROPERTIES.includes(property)) {
      const expC = colorWithOpacity(String(expected), nodeOpacity(design))
      const actC = colorWithOpacity(String(actual), nodeOpacity(code))
      if (!colorsEqual(expC, actC)) {
        diffs.push({
          designNodeId: design.id,
          codeNodeId: code.id,
          nodeName: design.name,
          property,
          expected: expC,
          actual: actC,
          severity: HIGH_PROPERTIES.has(property) ? 'medium' : 'low',
        })
      }
      continue
    }

    if (property === 'cornerRadii') {
      if (!cornerRadiiClose(String(expected), String(actual))) {
        diffs.push({
          designNodeId: design.id,
          codeNodeId: code.id,
          nodeName: design.name,
          property,
          expected,
          actual,
          severity: 'medium',
        })
      }
      continue
    }

    if (property === 'gradient') {
      if (String(expected).toLowerCase() !== String(actual).toLowerCase()) {
        diffs.push({
          designNodeId: design.id,
          codeNodeId: code.id,
          nodeName: design.name,
          property,
          expected,
          actual,
          severity: 'medium',
        })
      }
      continue
    }

    if (property === 'shadow' || property === 'insetShadow' || property === 'shadows' || property === 'textShadow') {
      if (!shadowClose(String(expected), String(actual))) {
        diffs.push({
          designNodeId: design.id,
          codeNodeId: code.id,
          nodeName: design.name,
          property,
          expected,
          actual,
          severity: 'low',
          needsReview: true,
        })
      }
      continue
    }

    if (property === 'fills') {
      if (String(expected).toLowerCase() !== String(actual).toLowerCase()) {
        diffs.push({
          designNodeId: design.id,
          codeNodeId: code.id,
          nodeName: design.name,
          property,
          expected,
          actual,
          severity: 'low',
          needsReview: true,
        })
      }
      continue
    }

    // Rotation: near-zero is noise; soft relative otherwise.
    if (property === 'rotation' || property === 'rotateX' || property === 'rotateY') {
      const expN = Number(expected)
      const actN = Number(actual)
      const delta = Math.abs(expN - actN)
      if (delta <= 0.5) continue
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected,
        actual,
        severity: delta >= 5 ? 'medium' : 'low',
        needsReview: true,
      })
      continue
    }

    // perspective: soft relative.
    if (property === 'perspective') {
      const expN = Number(expected)
      const actN = Number(actual)
      const delta = Math.abs(expN - actN)
      if (delta <= 1) continue
      const scale = Math.max(Math.abs(expN), Math.abs(actN), 1)
      if (delta / scale <= 0.05) continue
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected,
        actual,
        severity: 'low',
        needsReview: true,
      })
      continue
    }

    // Scale: identity is noise; soft relative otherwise.
    if (property === 'scaleX' || property === 'scaleY') {
      const expN = Number(expected)
      const actN = Number(actual)
      const delta = Math.abs(expN - actN)
      if (delta <= 0.02) continue
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected,
        actual,
        severity: delta >= 0.15 ? 'medium' : 'low',
        needsReview: true,
      })
      continue
    }

    // Skew: near-zero noise; soft otherwise.
    if (property === 'skewX' || property === 'skewY') {
      const expN = Number(expected)
      const actN = Number(actual)
      const delta = Math.abs(expN - actN)
      if (delta <= 0.5) continue
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected,
        actual,
        severity: delta >= 5 ? 'medium' : 'low',
        needsReview: true,
      })
      continue
    }

    // zIndex: exact soft-review.
    if (property === 'zIndex') {
      if (Number(expected) === Number(actual)) continue
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected,
        actual,
        severity: 'low',
        needsReview: true,
      })
      continue
    }

    // aspectRatio: relative soft-review.
    if (property === 'aspectRatio') {
      const expN = Number(expected)
      const actN = Number(actual)
      if (!Number.isFinite(expN) || !Number.isFinite(actN) || expN <= 0 || actN <= 0) {
        diffs.push({
          designNodeId: design.id,
          codeNodeId: code.id,
          nodeName: design.name,
          property,
          expected,
          actual,
          severity: 'low',
          needsReview: true,
        })
        continue
      }
      const rel = Math.abs(expN - actN) / Math.max(expN, actN)
      if (rel <= 0.02) continue
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected,
        actual,
        severity: rel >= 0.15 ? 'medium' : 'low',
        needsReview: true,
      })
      continue
    }

    // textAdvanceWidth / textBlockHeight / min-max sizes: relative soft-review.
    if (
      property === 'textAdvanceWidth' ||
      property === 'textBlockHeight' ||
      property === 'minWidth' ||
      property === 'maxWidth' ||
      property === 'minHeight' ||
      property === 'maxHeight'
    ) {
      const expN = Number(expected)
      const actN = Number(actual)
      if (!Number.isFinite(expN) || !Number.isFinite(actN)) {
        diffs.push({
          designNodeId: design.id,
          codeNodeId: code.id,
          nodeName: design.name,
          property,
          expected,
          actual,
          severity: 'low',
          needsReview: true,
        })
        continue
      }
      const scale = Math.max(Math.abs(expN), Math.abs(actN), 1)
      const rel = Math.abs(expN - actN) / scale
      if (rel <= 0.08 || Math.abs(expN - actN) <= NUMERIC_TOLERANCE) continue
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected,
        actual,
        severity: rel >= 0.25 ? 'medium' : 'low',
        needsReview: true,
      })
      continue
    }

    // maxLines: exact integer soft-review.
    if (property === 'maxLines') {
      const expN = Number(expected)
      const actN = Number(actual)
      if (expN === actN) continue
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected,
        actual,
        severity: 'low',
        needsReview: true,
      })
      continue
    }

    // flexGrow / flexShrink: platforms map weight differently; soft exact.
    if (property === 'flexGrow' || property === 'flexShrink') {
      const expN = Number(expected)
      const actN = Number(actual)
      if (Math.abs(expN - actN) <= 0.01) continue
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected,
        actual,
        severity: 'low',
        needsReview: true,
      })
      continue
    }

    // order: exact integer soft-review (platforms often omit 0).
    if (property === 'order') {
      const expN = Number(expected)
      const actN = Number(actual)
      if (expN === actN) continue
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected,
        actual,
        severity: 'low',
        needsReview: true,
      })
      continue
    }

    // wordSpacing / textIndent: platforms approximate; soft relative.
    if (property === 'wordSpacing' || property === 'textIndent') {
      const expN = Number(expected)
      const actN = Number(actual)
      const delta = Math.abs(expN - actN)
      if (delta <= NUMERIC_TOLERANCE) continue
      const scale = Math.max(Math.abs(expN), Math.abs(actN), 1)
      if (delta / scale <= 0.05) continue
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected,
        actual,
        severity: 'low',
        needsReview: true,
      })
      continue
    }

    if (ENUM_PROPERTIES.includes(property)) {
      if (String(expected).toLowerCase() !== String(actual).toLowerCase()) {
        const soft =
          property === 'textDecoration' ||
          property === 'textTransform' ||
          property === 'textOverflow' ||
          property === 'overflow' ||
          property === 'clipPath' ||
          property === 'flexDirection' ||
          property === 'alignItems' ||
          property === 'justifyContent' ||
          property === 'flexWrap' ||
          property === 'alignContent' ||
          property === 'alignSelf' ||
          property === 'transformOrigin' ||
          property === 'visibility' ||
          property === 'display' ||
          property === 'whiteSpace' ||
          property === 'wordBreak' ||
          property === 'gridTemplate' ||
          property === 'direction' ||
          property === 'writingMode' ||
          property === 'filter' ||
          property === 'outline' ||
          property === 'fontStyle' ||
          property === 'textAlignVertical' ||
          property === 'borderStyle' ||
          property === 'strokeDashArray' ||
          property === 'strokeCap' ||
          property === 'strokeJoin' ||
          property === 'sizingHorizontal' ||
          property === 'sizingVertical' ||
          property === 'position' ||
          property === 'blendMode' ||
          property === 'strokeAlign' ||
          property === 'imagePosition'
        diffs.push({
          designNodeId: design.id,
          codeNodeId: code.id,
          nodeName: design.name,
          property,
          expected,
          actual,
          severity: HIGH_PROPERTIES.has(property) ? 'medium' : 'low',
          ...(soft ? { needsReview: true } : {}),
        })
      }
      continue
    }

    if (property === 'fontWeight' || property === 'opacity') {
      const expN = Number(expected)
      const actN = Number(actual)
      const tol = property === 'opacity' ? 0.02 : 0
      if (Math.abs(expN - actN) > tol) {
        diffs.push({
          designNodeId: design.id,
          codeNodeId: code.id,
          nodeName: design.name,
          property,
          expected,
          actual,
          severity: property === 'fontWeight' ? 'low' : 'medium',
        })
      }
      continue
    }

    if (STRING_PROPERTIES.includes(property)) {
      // Font family names vary by platform; flag only for human review.
      if (normalizeName(String(expected)) !== normalizeName(String(actual))) {
        diffs.push({
          designNodeId: design.id,
          codeNodeId: code.id,
          nodeName: design.name,
          property,
          expected,
          actual,
          severity: 'low',
          needsReview: true,
        })
      }
      continue
    }

    // Numeric length.
    const expN = Number(expected)
    const actN = Number(actual)
    const delta = Math.abs(expN - actN)
    if (delta <= NUMERIC_TOLERANCE) continue

    // Line-height: platforms measure differently (multiplier vs px); soft relative.
    if (property === 'lineHeight') {
      const scale = Math.max(Math.abs(expN), Math.abs(actN), 1)
      if (delta / scale <= LINE_HEIGHT_RELATIVE_TOLERANCE) continue
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected,
        actual,
        severity: 'low',
        needsReview: true,
      })
      continue
    }

    // Width / height: design artboards use fixed px; phones vary. Responsive
    // stretch is not a visual bug — skip within tolerance, else soft review only.
    if (property === 'width' || property === 'height') {
      const scale = Math.max(Math.abs(expN), Math.abs(actN), 1)
      const rel = delta / scale
      if (rel <= SIZE_RELATIVE_TOLERANCE) continue
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected,
        actual,
        severity: 'low',
        needsReview: true,
      })
      continue
    }

    if (delta > NUMERIC_TOLERANCE) {
      diffs.push({
        designNodeId: design.id,
        codeNodeId: code.id,
        nodeName: design.name,
        property,
        expected,
        actual,
        severity: severityFor(property, delta),
      })
    }
  }

  return diffs
}

export interface CompareOptions {
  /** Numeric tolerance override (logical units). */
  tolerance?: number
}

export function compareVisualDocs(
  design: DesignDoc,
  code: DesignDoc,
  options: CompareOptions = {},
): VisualCompareResult {
  void options.tolerance
  // Ignore non-rendered helper nodes from each side.
  const isComparable = (n: DesignNode) =>
    n.kind !== 'group' && !(n.kind === 'shape' && !n.children.length && n.name === '矩形' && n.box.width === undefined)

  const designNodes = flatten(design.root).filter(isComparable)
  const codeNodes = flatten(code.root).filter(isComparable)

  const matched = matchNodes(designNodes, codeNodes)
  const matchedDesign = new Set(matched.map((p) => p.design.id))
  const matchedCode = new Set(matched.map((p) => p.code.id))
  // Text leaves merged into a matched design control are accounted for.
  const absorbedDesign = new Set<string>()
  for (const node of designNodes) {
    const control = enclosingControl(node, designNodes)
    if (control && matchedDesign.has(control.id)) absorbedDesign.add(node.id)
  }
  // Full-frame background shapes of a matched control are its rendering, not
  // independent elements; absorb them (icons are kept).
  for (const controlId of matchedDesign) {
    const control = designNodes.find((n) => n.id === controlId)
    if (!control) continue
    for (const deco of decorativeChildren(control)) absorbedDesign.add(deco.id)
  }

  const diffs = matched.flatMap(({ design: d, code: c, merged }) => comparePair(d, c, merged))

  const unmatched: UnmatchedNode[] = [
    ...designNodes
      .filter(
        (n) =>
          n.id !== design.root.id &&
          !matchedDesign.has(n.id) &&
          !absorbedDesign.has(n.id),
      )
      .map((n) => ({ id: n.id, name: n.name, side: 'design' as const, text: n.text })),
    ...codeNodes
      .filter((n) => n.id !== code.root.id && !matchedCode.has(n.id))
      .map((n) => ({ id: n.id, name: n.name, side: 'code' as const, text: n.text })),
  ]

  return { diffs, unmatched, comparedPairs: matched.length }
}