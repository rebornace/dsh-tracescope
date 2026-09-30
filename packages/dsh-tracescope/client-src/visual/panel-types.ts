/**
 * Shared visual-panel types. Kept in their own module so leaf components
 * (FindingsSection, HifiCompareBoard) can import them without pulling in the
 * VisualComparePanel module (which would create a circular import).
 */

/** One inferred node for a runtime/sparse code region (mirrors core). */
export interface RenderNodePatch {
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

/** Inferred content for one code-side node (mirrors core's VisualRenderPatch). */
export interface RenderPatch {
  targetNodeId: string
  targetLabel?: string
  nodes: RenderNodePatch[]
}

/** AI write-back findings for one page (mirrors core's VisualFindingsReport). */
export interface PageFindings {
  findings: Array<{
    title: string
    severity: 'high' | 'medium' | 'low'
    /** Normalised Figma node id (REST form, e.g. "0:444") when known. */
    nodeId?: string
    location?: string
    expected?: string
    actual?: string
    codeSource?: string
    suggestion?: string
  }>
  /** AI reconstruction of the code render (runtime/sparse regions). */
  renderPatch?: RenderPatch[]
  summary?: string
  savedAt: string
}
