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
  DesignNode,
  DiffSeverity,
  UnmatchedNode,
  UnresolvedValue,
  VisualCompareResult,
  VisualProperty,
} from './design-types.js'

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
  'cornerRadius',
  'borderWidth',
  'fontSize',
  'lineHeight',
  'letterSpacing',
]

const COLOR_PROPERTIES: VisualProperty[] = [
  'backgroundColor',
  'color',
  'borderColor',
]

const STRING_PROPERTIES: VisualProperty[] = ['fontFamily']

/** High-impact properties drive the top severity for a node mismatch. */
const HIGH_PROPERTIES = new Set<VisualProperty>([
  'width',
  'height',
  'backgroundColor',
  'color',
  'fontSize',
])

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
  'fontFamily',
  'fontWeight',
])

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
    : leaf.style.letterSpacing
  return v === undefined ? undefined : (v as ComparedValue)
}

function getNodeValue(
  node: DesignNode,
  property: VisualProperty,
  borrowLeafTypography = false,
): ComparedValue | undefined {
  if (property === 'width' || property === 'height') {
    const v = node.box[property]
    return typeof v === 'number' ? v : undefined
  }
  // A merged design control keeps its label's typography on the inner text leaf.
  if (borrowLeafTypography && node.kind !== 'text' && TYPO_FROM_LEAF.includes(property)) {
    const borrowed = leafTypography(node, property)
    if (borrowed !== undefined) return borrowed
  }
  return node.style[property] as ComparedValue | undefined
}

function comparePair(design: DesignNode, code: DesignNode, merged: boolean): DesignDiff[] {
  const diffs: DesignDiff[] = []
  const allProperties: VisualProperty[] = [
    ...LENGTH_PROPERTIES,
    ...COLOR_PROPERTIES,
    ...STRING_PROPERTIES,
    'fontWeight',
    'opacity',
  ]

  for (const property of allProperties) {
    const expected = getNodeValue(design, property, merged)
    const actual = getNodeValue(code, property, false)
    if (expected === undefined && actual === undefined) continue
    if (isUnresolved(expected) || isUnresolved(actual)) {
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
      if (!colorsEqual(String(expected), String(actual))) {
        diffs.push({
          designNodeId: design.id,
          codeNodeId: code.id,
          nodeName: design.name,
          property,
          expected,
          actual,
          severity: HIGH_PROPERTIES.has(property) ? 'medium' : 'low',
        })
      }
      continue
    }

    if (property === 'fontWeight' || property === 'opacity') {
      if (Number(expected) !== Number(actual)) {
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
    const delta = Math.abs(Number(expected) - Number(actual))
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