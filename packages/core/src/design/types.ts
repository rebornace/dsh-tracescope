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

/**
 * One drop / inset shadow, normalised across Figma, CSS, and native APIs.
 * Lengths are logical px; {@link color} is #RRGGBB(AA).
 */
export interface DesignShadow {
  offsetX: number
  offsetY: number
  blur: number
  spread?: number
  color?: HexColor
  /** True for inset / INNER_SHADOW. */
  inset?: boolean
}

/**
 * One paint layer in a fill stack (solid / gradient / image).
 * Ordered bottom→top as authored (Figma paints[0] is topmost visually —
 * we store top→bottom for compare readability matching CSS background order).
 */
export interface DesignFill {
  type: 'solid' | 'gradient' | 'image'
  color?: HexColor
  gradient?: DesignGradient
  imageRef?: string
  imageFit?: 'fill' | 'contain' | 'cover'
  /** Paint opacity 0–1 when distinct from colour alpha. */
  opacity?: number
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
  /** Flex / grid gap (uniform). */
  gap?: number | UnresolvedValue
  /** Minimum / maximum box constraints (CSS min/max-*, Android minWidth, …). */
  minWidth?: number | UnresolvedValue
  maxWidth?: number | UnresolvedValue
  minHeight?: number | UnresolvedValue
  maxHeight?: number | UnresolvedValue
  /**
   * Approximate single-line text advance width (logical px) from characters × fontSize.
   * Heuristic only — used for soft L1 restore review, not exact shaping.
   */
  textAdvanceWidth?: number
  /**
   * Approximate wrapped text block height (logical px).
   * Uses {@link textAdvanceWidth} heuristics + lineHeight / maxWidth / maxLines.
   */
  textBlockHeight?: number
  /**
   * Flex / stack main axis (CSS flex-direction / Figma layoutMode / Column|Row).
   */
  flexDirection?: 'row' | 'column'
  /** Cross-axis alignment (CSS align-items / Figma counterAxisAlignItems). */
  alignItems?: 'start' | 'center' | 'end' | 'stretch'
  /** Main-axis distribution (CSS justify-content / Figma primaryAxisAlignItems). */
  justifyContent?:
    | 'start'
    | 'center'
    | 'end'
    | 'space-between'
    | 'space-around'
    | 'space-evenly'
  /**
   * Auto-layout / flex child sizing along each axis.
   * Figma `layoutSizingHorizontal|Vertical` / CSS width/height keywords /
   * Android `match_parent`/`wrap_content` / Compose `fillMax*`.
   */
  sizingHorizontal?: 'fixed' | 'hug' | 'fill'
  sizingVertical?: 'fixed' | 'hug' | 'fill'
  // Appearance
  backgroundColor?: HexColor | UnresolvedValue
  /** Gradient paint; takes precedence over {@link backgroundColor} when set. */
  gradient?: DesignGradient
  /**
   * Full fill stack (solid / gradient / image), top→bottom.
   * Primary {@link backgroundColor} / {@link gradient} / {@link imageRef} still
   * mirror the topmost paint of each kind for soft compare.
   */
  fills?: DesignFill[]
  borderWidth?: number | UnresolvedValue
  borderColor?: HexColor | UnresolvedValue
  /** Per-side border widths (override {@link borderWidth} when set). */
  borderTopWidth?: number | UnresolvedValue
  borderRightWidth?: number | UnresolvedValue
  borderBottomWidth?: number | UnresolvedValue
  borderLeftWidth?: number | UnresolvedValue
  /** Per-side border colours (override {@link borderColor} when set). */
  borderTopColor?: HexColor | UnresolvedValue
  borderRightColor?: HexColor | UnresolvedValue
  borderBottomColor?: HexColor | UnresolvedValue
  borderLeftColor?: HexColor | UnresolvedValue
  /**
   * Stroke alignment relative to the path.
   * Figma strokeAlign / CSS box-sizing heuristic (`inside` ≈ border-box).
   */
  strokeAlign?: 'inside' | 'outside' | 'center'
  /**
   * Border / stroke line style.
   * Figma `strokeDashes` / CSS `border-style` / Android shape `dashWidth`.
   * `solid` (default) is omitted when authoring is continuous.
   */
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  /**
   * Exact dash pattern fingerprint `on,off[,…]` in logical px
   * (Figma `strokeDashes` / CSS `stroke-dasharray` / Android `dashWidth,dashGap`).
   */
  strokeDashArray?: string
  /**
   * Stroke end cap (Figma `strokeCap` / CSS `stroke-linecap`).
   * `butt` (default) is omitted.
   */
  strokeCap?: 'butt' | 'round' | 'square'
  /**
   * Stroke corner join (Figma `strokeJoin` / CSS `stroke-linejoin`).
   * `miter` (default) is omitted.
   */
  strokeJoin?: 'miter' | 'round' | 'bevel'
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
  /** CSS object-position (normalized, e.g. `50% 50%`). */
  imagePosition?: string
  opacity?: number
  /**
   * Clockwise rotation in degrees. `0` / near-zero is omitted.
   * Figma `rotation` / CSS `rotate()` / native `.rotate`.
   */
  rotation?: number
  /**
   * Non-uniform scale factors from transform matrices / CSS `scale()`.
   * Identity (`1`) is omitted. Figma `relativeTransform` column lengths.
   */
  scaleX?: number
  scaleY?: number
  /**
   * Skew angles in degrees (CSS `skewX`/`skewY` / matrix shear).
   * Near-zero is omitted.
   */
  skewX?: number
  skewY?: number
  /**
   * Stacking order (CSS `z-index` / Compose `zIndex` / RN `zIndex`).
   * Default auto/0 is omitted.
   */
  zIndex?: number
  /**
   * Approximate elevation / outer shadow blur in logical px (Material elevation,
   * CSS box-shadow blur, SwiftUI shadow radius, Figma DROP_SHADOW, etc.).
   * Prefer {@link shadow}.blur when the full shadow is available; kept for
   * Material elevation and soft compare.
   */
  elevation?: number | UnresolvedValue
  /**
   * Primary outer / drop shadow (offset + blur + optional spread/colour).
   * When set, {@link elevation} mirrors {@link DesignShadow.blur}.
   * Prefer {@link shadows} when multiple layers matter.
   */
  shadow?: DesignShadow
  /**
   * Approximate inner / inset shadow blur in logical px
   * (Figma INNER_SHADOW, CSS `box-shadow: inset …`).
   */
  innerShadow?: number | UnresolvedValue
  /**
   * Primary inset shadow. When set, {@link innerShadow} mirrors blur.
   */
  insetShadow?: DesignShadow
  /**
   * Full shadow stack (outer + inset), ordered as authored.
   * {@link shadow} / {@link insetShadow} remain the largest-blur primary of each kind.
   */
  shadows?: DesignShadow[]
  /**
   * Layer blur radius in logical px
   * (Figma LAYER_BLUR, CSS `filter: blur()`, SwiftUI `.blur`).
   */
  blur?: number | UnresolvedValue
  /**
   * Backdrop / background blur radius in logical px
   * (Figma BACKGROUND_BLUR, CSS `backdrop-filter: blur()`).
   */
  backdropBlur?: number | UnresolvedValue
  /**
   * CSS `position` / Figma `layoutPositioning`.
   * `static` (default) is omitted.
   */
  position?: 'absolute' | 'relative' | 'fixed' | 'sticky'
  /**
   * Flex / grid row-gap when distinct from {@link gap}.
   */
  rowGap?: number | UnresolvedValue
  /**
   * Flex / grid column-gap when distinct from {@link gap}.
   */
  columnGap?: number | UnresolvedValue
  /**
   * Flex wrap (CSS `flex-wrap` / Figma `layoutWrap` / FlowRow|Wrap).
   * `nowrap` (default) is omitted.
   */
  flexWrap?: 'nowrap' | 'wrap'
  /**
   * Multi-line flex / grid packed-lines alignment (CSS `align-content`).
   * Figma `counterAxisAlignContent` when wrapping. Default `stretch`/`normal` omitted.
   */
  alignContent?: 'start' | 'center' | 'end' | 'stretch' | 'space-between' | 'space-around' | 'space-evenly'
  /**
   * Flex / grid item order (CSS `order`). Default `0` is omitted.
   */
  order?: number
  /**
   * CSS Grid track fingerprint: `cols:…` and optional `|rows:…`.
   * Tracks normalised (`1fr`, `px`, `auto`, `repeat(n,…)`, `%`).
   */
  gridTemplate?: string
  /**
   * Cross-axis self alignment for a flex/auto-layout child.
   * CSS `align-self` / Figma `layoutAlign` / RN `alignSelf`.
   * `auto` / inherit is omitted.
   */
  alignSelf?: 'start' | 'center' | 'end' | 'stretch'
  /**
   * Flex grow factor (CSS `flex-grow` / Figma `layoutGrow` / Compose `weight` /
   * Flutter `Expanded`/`Flexible` / Android `layout_weight`).
   * `0` (default) is omitted.
   */
  flexGrow?: number
  /**
   * Flex shrink factor (CSS `flex-shrink` / RN `flexShrink`).
   * CSS default `1` is kept when authored explicitly as non-default; omit when unset.
   */
  flexShrink?: number
  /**
   * Transform origin fingerprint (CSS `transform-origin` / Android pivot).
   * Normalised to `X% Y%` (e.g. `50% 50%`) or keyword `center`/`left`/`top`…
   * Default center is omitted unless rotation/scale is present and origin is non-center.
   */
  transformOrigin?: string
  /**
   * CSS `visibility` / Android `android:visibility`.
   * `visible` (default) is omitted; `gone` maps to `hidden` + display none intent.
   */
  visibility?: 'visible' | 'hidden' | 'collapse'
  /**
   * CSS `display`. Only non-default / notable values are kept:
   * `none` (hidden), `flex`, `inline-flex`, `grid`, `block`, `inline`.
   */
  display?: 'none' | 'flex' | 'inline-flex' | 'grid' | 'block' | 'inline'
  /**
   * CSS `white-space` / text wrap mode.
   * `normal` (default) is omitted; `nowrap` is common for single-line chips.
   */
  whiteSpace?: 'normal' | 'nowrap' | 'pre' | 'pre-wrap' | 'pre-line'
  /**
   * CSS `word-break` / soft wrap strategy.
   * `normal` (default) is omitted; `break-all` / `keep-all` / `break-word` kept.
   */
  wordBreak?: 'normal' | 'break-all' | 'keep-all' | 'break-word'
  /**
   * Extra space between words in logical px (CSS `word-spacing`).
   * `0` / normal omitted.
   */
  wordSpacing?: number | UnresolvedValue
  /**
   * First-line indent in logical px (CSS `text-indent` / Figma paragraph indent).
   * `0` omitted.
   */
  textIndent?: number | UnresolvedValue
  /**
   * CSS `mix-blend-mode` / Figma `blendMode` (lowercase, e.g. `multiply`).
   * `normal` / `pass-through` are omitted.
   */
  blendMode?: string
  /**
   * Overflow / clip behaviour.
   * Figma `clipsContent` → `hidden`; CSS `overflow`; Android `clipChildren`.
   * `visible` (default) is omitted.
   */
  overflow?: 'visible' | 'hidden' | 'scroll'
  /**
   * Shape / mask clip fingerprint for L1 compare.
   * CSS `clip-path` → `circle` / `ellipse` / `inset` / `polygon:N` / `path` / `url`;
   * Figma `isMask` → `mask` / `mask:alpha` / `mask:luminance`;
   * Compose/SwiftUI `Circle` clip → `circle`.
   */
  clipPath?: string
  /**
   * Width÷height when authored as a ratio (CSS `aspect-ratio`, Compose `aspectRatio`).
   * Near-square noise is kept; omit when unset.
   */
  aspectRatio?: number
  /**
   * CSS `perspective` distance in logical px (3D). Near-zero omitted.
   */
  perspective?: number
  /**
   * 3D rotation about X / Y in degrees (CSS `rotateX`/`rotateY` / `rotate3d`).
   * Near-zero omitted.
   */
  rotateX?: number
  rotateY?: number
  /**
   * Text shadow (CSS `text-shadow`). Same shape as {@link DesignShadow}.
   */
  textShadow?: DesignShadow
  /**
   * Writing direction (CSS `direction` / HTML `dir`).
   * `ltr` (default) is omitted.
   */
  direction?: 'ltr' | 'rtl'
  /**
   * CSS `writing-mode`. Horizontal default omitted.
   */
  writingMode?: 'horizontal-tb' | 'vertical-rl' | 'vertical-lr'
  /**
   * Non-blur CSS `filter` fingerprint (sorted `fn:value|…`).
   * Layer {@link blur} stays separate; this covers brightness/contrast/…
   */
  filter?: string
  /**
   * Outline fingerprint `width,style,color` (CSS `outline` / `outline-*`).
   */
  outline?: string
  // Typography
  fontFamily?: string
  fontSize?: number | UnresolvedValue
  fontWeight?: number
  lineHeight?: number | UnresolvedValue
  letterSpacing?: number | UnresolvedValue
  /**
   * Extra space between paragraphs (Figma `paragraphSpacing` / CSS margin on
   * block text). Soft-reviewed — platforms often collapse this into lineHeight.
   */
  paragraphSpacing?: number | UnresolvedValue
  color?: HexColor | UnresolvedValue
  /** Horizontal text alignment. */
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  /** Vertical text alignment inside the text box. */
  textAlignVertical?: 'top' | 'center' | 'bottom'
  /** Italic / oblique font style. `normal` omitted. */
  fontStyle?: 'normal' | 'italic'
  /**
   * Text decoration line (underline / line-through).
   * Figma `textDecoration` / CSS `text-decoration-line`.
   */
  textDecoration?: 'none' | 'underline' | 'line-through' | 'underline line-through'
  /**
   * Text case transform.
   * Figma `textCase` / CSS `text-transform`.
   */
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  /**
   * Maximum visible lines before truncation (1 = single-line ellipsis common case).
   * Figma `maxLines` / CSS `-webkit-line-clamp` / Android `maxLines`.
   */
  maxLines?: number
  /**
   * How overflowed text is clipped.
   * Figma `textTruncation: ENDING` → `ellipsis`; CSS `text-overflow`.
   */
  textOverflow?: 'clip' | 'ellipsis'
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
  | 'gap'
  | 'rowGap'
  | 'columnGap'
  | 'minWidth'
  | 'maxWidth'
  | 'minHeight'
  | 'maxHeight'
  | 'textAdvanceWidth'
  | 'textBlockHeight'
  | 'flexDirection'
  | 'alignItems'
  | 'justifyContent'
  | 'flexWrap'
  | 'alignContent'
  | 'order'
  | 'gridTemplate'
  | 'alignSelf'
  | 'flexGrow'
  | 'flexShrink'
  | 'transformOrigin'
  | 'visibility'
  | 'display'
  | 'whiteSpace'
  | 'wordBreak'
  | 'wordSpacing'
  | 'textIndent'
  | 'sizingHorizontal'
  | 'sizingVertical'
  | 'backgroundColor'
  | 'borderWidth'
  | 'borderColor'
  | 'borderTopWidth'
  | 'borderRightWidth'
  | 'borderBottomWidth'
  | 'borderLeftWidth'
  | 'borderTopColor'
  | 'borderRightColor'
  | 'borderBottomColor'
  | 'borderLeftColor'
  | 'borderStyle'
  | 'strokeDashArray'
  | 'strokeCap'
  | 'strokeJoin'
  | 'cornerRadius'
  /** Per-corner radii serialized as `tl,tr,br,bl`. */
  | 'cornerRadii'
  | 'opacity'
  | 'rotation'
  | 'scaleX'
  | 'scaleY'
  | 'skewX'
  | 'skewY'
  | 'perspective'
  | 'rotateX'
  | 'rotateY'
  | 'zIndex'
  | 'elevation'
  | 'shadow'
  | 'innerShadow'
  | 'insetShadow'
  | 'shadows'
  | 'textShadow'
  | 'blur'
  | 'backdropBlur'
  | 'position'
  | 'blendMode'
  | 'fills'
  | 'strokeAlign'
  | 'overflow'
  | 'clipPath'
  | 'aspectRatio'
  | 'direction'
  | 'writingMode'
  | 'filter'
  | 'outline'
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'lineHeight'
  | 'letterSpacing'
  | 'paragraphSpacing'
  | 'color'
  | 'textAlign'
  | 'textAlignVertical'
  | 'fontStyle'
  | 'textDecoration'
  | 'textTransform'
  | 'maxLines'
  | 'textOverflow'
  | 'imageFit'
  | 'imagePosition'
  /** Gradient fingerprint `type:angle:color@pos,...`. */
  | 'gradient'
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
