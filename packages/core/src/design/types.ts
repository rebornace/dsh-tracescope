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

/** One gradient colour stop. */
export interface GradientStop {
  color: HexColor
  /** Position along the gradient axis, 0..1. */
  position: number
}

/**
 * A linear or radial gradient, normalised from a design fill or an Android
 * drawable. {@link cssAngle} is the standard CSS angle in degrees
 * (0deg = bottom→top, 90deg = left→right).
 */
export interface DesignGradient {
  type: 'linear' | 'radial'
  cssAngle: number
  stops: GradientStop[]
}

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
  /** Gradient paint; takes precedence over {@link backgroundColor} when set. */
  gradient?: DesignGradient
  borderWidth?: number | UnresolvedValue
  borderColor?: HexColor | UnresolvedValue
  cornerRadius?: number | UnresolvedValue
  /**
   * Per-corner radii [topLeft, topRight, bottomRight, bottomLeft] for mixed
   * rounded rectangles (Figma `rectangleCornerRadii`). Takes precedence over
   * the uniform {@link cornerRadius} when present.
   */
  cornerRadii?: [number, number, number, number]
  /**
   * Asset id of an IMAGE fill (Figma). Resolved to a usable URL by the source
   * adapter before rendering; retained here so image content is not dropped.
   */
  imageRef?: string
  /** How an image fill is fitted into its box ('fill' stretches). */
  imageFit?: 'fill' | 'contain' | 'cover'
  opacity?: number
  // Typography
  fontFamily?: string
  fontSize?: number | UnresolvedValue
  fontWeight?: number
  lineHeight?: number | UnresolvedValue
  letterSpacing?: number | UnresolvedValue
  color?: HexColor | UnresolvedValue
  /** Horizontal text alignment. */
  textAlign?: 'left' | 'center' | 'right' | 'justify'
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
  source: 'figma' | 'lanhu' | 'android-xml' | 'uikit' | 'web' | 'manual'
}

// ---------------------------------------------------------------------------
// Visual review findings (write-back)
// ---------------------------------------------------------------------------

/** Severity of a single visual review finding. */
export type VisualFindingSeverity = 'high' | 'medium' | 'low'

/**
 * One structured UI review finding written back by the model (mirrors the
 * hand-test write-back). `location` ties it to a node/region so the panel can
 * show it against the corresponding page.
 */
export interface VisualFinding {
  /** Short title, e.g. "列表卡片封面圆角偏小". */
  title: string
  severity: VisualFindingSeverity
  /**
   * Which area: a normalized node id when known, otherwise a free-form
   * description ("底部按钮", "搜索行").
   */
  nodeId?: string
  location?: string
  /** What the design specifies. */
  expected?: string
  /** What the code actually renders. */
  actual?: string
  /** Code-level source (file / attribute / resource). */
  codeSource?: string
  /** Actionable fix suggestion. */
  suggestion?: string
}

/**
 * One node the model infers for a runtime-populated / poorly-rendered code
 * region. Coordinates (`rx`/`ry`) are relative to the patched target's
 * top-left, matching the static engine's {@link HifiRenderNode} content.
 */
export interface VisualRenderNodePatch {
  kind?: 'text' | 'image' | 'view' | 'frame' | 'icon'
  text?: string
  imageUrl?: string
  rx: number
  ry: number
  width: number
  height: number
  style?: {
    backgroundColor?: string
    color?: string
    fontSize?: number
    fontWeight?: number
    borderRadius?: number
    borderWidth?: number
    borderColor?: string
    textAlign?: 'left' | 'center' | 'right'
    imageFit?: 'fill' | 'contain' | 'cover'
  }
}

/**
 * A visual patch: inferred content for one code-side node (typically a dynamic
 * RecyclerView/ViewPager, but any sparse node). Applying it mutates the code
 * high-fidelity tree so the rendered code screen actually reflects what the
 * code builds at runtime — not just a textual findings list.
 */
export interface VisualRenderPatch {
  /** Code node id to fill (e.g. the view id "recycler"). */
  targetNodeId: string
  /** Human label used to match when the id is uncertain. */
  targetLabel?: string
  nodes: VisualRenderNodePatch[]
}

/** Persisted AI write-back for one page (design node ↔ code file). */
export interface VisualFindingsReport {
  repoInput: string
  /** Figma file key. */
  fileKey: string
  /** Design node id (REST form, e.g. "0:444"). */
  designId: string
  adapterId: string
  relativePath: string
  designName?: string
  findings: VisualFinding[]
  /**
   * Optional visual reconstruction: nodes that populate the code render (esp.
   * runtime dynamic regions). Applied client-side to the code high-fidelity
   * tree. Marked as AI-inferred and shown for human confirmation.
   */
  renderPatch?: VisualRenderPatch[]
  /** Free-form overall summary the model may include. */
  summary?: string
  source: 'model' | 'manual'
  savedAt: string
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
  /** Heuristic / content presence (e.g. design text missing from source). */
  | 'text'
  /** Heuristic control-count or structure-scale signal. */
  | 'controlCount'

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
