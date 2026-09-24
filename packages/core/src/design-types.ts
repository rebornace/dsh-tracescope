/**
 * Vendor-neutral design annotation model.
 *
 * Both design tools (Figma, Lanhu) and code implementations (Android XML,
 * UIKit, ...) are normalised into this tree so they can be compared without a
 * running app or an LLM.
 *
 * All length values are expressed in a shared *logical* unit (Figma px @1x,
 * Android dp, iOS pt). The original value/unit are retained for display.
 */

export type DesignNodeKind =
  | 'frame'
  | 'view'
  | 'text'
  | 'image'
  | 'icon'
  | 'shape'
  | 'group'

/** 8-digit #RRGGBBAA or #RGB / #RRGGBB. Always lowercase. */
export type HexColor = string

export interface DesignBox {
  /** Width in logical units. */
  width?: number | UnresolvedValue
  height?: number | UnresolvedValue
  /** Offset from the root canvas top-left, in logical units. */
  x?: number
  y?: number
}

export interface Edges {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export interface DesignStyle {
  // Layout
  marginTop?: number | UnresolvedValue
  marginRight?: number | UnresolvedValue
  marginBottom?: number | UnresolvedValue
  marginLeft?: number | UnresolvedValue
  paddingTop?: number | UnresolvedValue
  paddingRight?: number | UnresolvedValue
  paddingBottom?: number | UnresolvedValue
  paddingLeft?: number | UnresolvedValue
  // Appearance
  backgroundColor?: HexColor | UnresolvedValue
  borderWidth?: number | UnresolvedValue
  borderColor?: HexColor | UnresolvedValue
  cornerRadius?: number | UnresolvedValue
  opacity?: number
  // Typography
  fontFamily?: string
  fontSize?: number | UnresolvedValue
  fontWeight?: number
  lineHeight?: number | UnresolvedValue
  letterSpacing?: number | UnresolvedValue
  color?: HexColor | UnresolvedValue
}

export interface DesignNode {
  /** Vendor / generator unique id. */
  id: string
  name: string
  kind: DesignNodeKind
  /** Text content for text nodes (trimmed, may be truncated by the source). */
  text?: string
  box: DesignBox
  style: DesignStyle
  children: DesignNode[]
}

export interface DesignDoc {
  /** Root frame / screen. */
  root: DesignNode
  /** Logical-unit scale that was applied to raw values (e.g. Figma px -> dp). */
  scale: number
  source: 'figma' | 'lanhu' | 'android-xml' | 'uikit' | 'manual'
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export type VisualProperty =
  | 'width'
  | 'height'
  | 'marginTop'
  | 'marginRight'
  | 'marginBottom'
  | 'marginLeft'
  | 'paddingTop'
  | 'paddingRight'
  | 'paddingBottom'
  | 'paddingLeft'
  | 'backgroundColor'
  | 'borderWidth'
  | 'borderColor'
  | 'cornerRadius'
  | 'opacity'
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'lineHeight'
  | 'letterSpacing'
  | 'color'

export type DiffSeverity = 'high' | 'medium' | 'low'

/** A value that could not be resolved statically (theme var, cascade, ...). */
export interface UnresolvedValue {
  unresolved: true
  /** Raw token as found in source, e.g. "@color/brand" or "var(--primary)". */
  raw: string
}

export type ComparedValue = number | string | UnresolvedValue

export interface DesignDiff {
  /** Id of the design node (expected side). */
  designNodeId: string
  /** Id of the implementation node when a match was found. */
  codeNodeId?: string
  nodeName: string
  property: VisualProperty
  /** Design-tool value (the expected). */
  expected: ComparedValue
  /** Implementation value (the actual). */
  actual?: ComparedValue
  severity: DiffSeverity
  /** True when at least one side could not be resolved statically. */
  needsReview?: boolean
}

export interface UnmatchedNode {
  id: string
  name: string
  side: 'design' | 'code'
  text?: string
}

export interface VisualCompareResult {
  diffs: DesignDiff[]
  unmatched: UnmatchedNode[]
  /** Number of node pairs that were compared. */
  comparedPairs: number
}
