/**
 * Adapt a high-fidelity {@link HifiRenderNode} tree back into the common
 * {@link DesignDoc} model so the existing deterministic compare engine can run
 * over it. Geometry, styles, text and images are preserved; dynamic surfaces
 * become a clearly-labelled frame.
 */
import type { DesignDoc, DesignGradient, DesignNode, DesignNodeKind } from './types.js'
import type { HifiRenderNode } from './android-layout-engine.js'

function convertKind(node: HifiRenderNode): DesignNodeKind {
  switch (node.kind) {
    case 'frame':
      return 'frame'
    case 'text':
      return 'text'
    case 'image':
      return 'image'
    case 'dynamic':
      return 'frame'
    case 'view':
      return 'view'
    default: {
      const exhaustive: never = node.kind
      return exhaustive as DesignNodeKind
    }
  }
}

/** Flatten a gradient to its first stop for the deterministic property diff. */
function gradientApproxColor(gradient: DesignGradient): string | undefined {
  return gradient.stops[0]?.color
}

function convertNode(node: HifiRenderNode): DesignNode {
  const style: DesignNode['style'] = {
    backgroundColor: node.style.backgroundColor,
    color: node.style.color,
    fontSize: node.style.fontSize,
    fontWeight: node.style.fontWeight,
    cornerRadius: node.style.borderRadius,
    borderWidth: node.style.borderWidth,
    borderColor: node.style.borderColor,
    opacity: node.style.opacity,
    elevation: node.style.elevation,
    innerShadow: node.style.innerShadow,
    blur: node.style.blur,
    shadow: node.style.shadow,
    insetShadow: node.style.insetShadow,
    shadows: node.style.shadows,
    blendMode: node.style.blendMode,
  }
  if (node.style.gradient) {
    style.gradient = node.style.gradient
    // Give the property diff a representative colour so gradient-vs-solid
    // mismatches are still surfaced in the readable list.
    if (!style.backgroundColor) style.backgroundColor = gradientApproxColor(node.style.gradient)
  }
  if (node.style.lineHeight) style.lineHeight = node.style.lineHeight
  if (node.style.imageFit) style.imageFit = node.style.imageFit
  if (typeof node.style.minWidth === 'number') style.minWidth = node.style.minWidth
  if (typeof node.style.maxWidth === 'number') style.maxWidth = node.style.maxWidth
  if (typeof node.style.minHeight === 'number') style.minHeight = node.style.minHeight
  if (typeof node.style.maxHeight === 'number') style.maxHeight = node.style.maxHeight
  if (typeof node.style.textAdvanceWidth === 'number') {
    style.textAdvanceWidth = node.style.textAdvanceWidth
  }
  if (typeof node.style.textBlockHeight === 'number') {
    style.textBlockHeight = node.style.textBlockHeight
  }
  if (node.style.flexDirection) style.flexDirection = node.style.flexDirection
  if (node.style.alignItems) style.alignItems = node.style.alignItems
  if (node.style.justifyContent) style.justifyContent = node.style.justifyContent
  if (node.style.fontStyle) style.fontStyle = node.style.fontStyle
  if (node.style.textAlignVertical) style.textAlignVertical = node.style.textAlignVertical
  if (node.style.borderStyle) style.borderStyle = node.style.borderStyle
  if (node.style.strokeDashArray) style.strokeDashArray = node.style.strokeDashArray
  if (node.style.strokeCap) style.strokeCap = node.style.strokeCap
  if (node.style.strokeJoin) style.strokeJoin = node.style.strokeJoin
  if (typeof node.style.paragraphSpacing === 'number') {
    style.paragraphSpacing = node.style.paragraphSpacing
  }
  if (node.style.sizingHorizontal) style.sizingHorizontal = node.style.sizingHorizontal
  if (node.style.sizingVertical) style.sizingVertical = node.style.sizingVertical
  if (typeof node.style.backdropBlur === 'number') style.backdropBlur = node.style.backdropBlur
  if (node.style.position) style.position = node.style.position
  if (typeof node.style.rowGap === 'number') style.rowGap = node.style.rowGap
  if (typeof node.style.columnGap === 'number') style.columnGap = node.style.columnGap
  if (node.style.flexWrap) style.flexWrap = node.style.flexWrap
  if (node.style.alignContent) style.alignContent = node.style.alignContent
  if (typeof node.style.order === 'number') style.order = node.style.order
  if (node.style.gridTemplate) style.gridTemplate = node.style.gridTemplate
  if (node.style.alignSelf) style.alignSelf = node.style.alignSelf
  if (typeof node.style.flexGrow === 'number') style.flexGrow = node.style.flexGrow
  if (typeof node.style.flexShrink === 'number') style.flexShrink = node.style.flexShrink
  if (node.style.transformOrigin) style.transformOrigin = node.style.transformOrigin
  if (node.style.visibility) style.visibility = node.style.visibility
  if (node.style.display) style.display = node.style.display
  if (node.style.whiteSpace) style.whiteSpace = node.style.whiteSpace
  if (node.style.wordBreak) style.wordBreak = node.style.wordBreak
  if (typeof node.style.wordSpacing === 'number') style.wordSpacing = node.style.wordSpacing
  if (typeof node.style.textIndent === 'number') style.textIndent = node.style.textIndent
  if (typeof node.style.perspective === 'number') style.perspective = node.style.perspective
  if (typeof node.style.rotateX === 'number') style.rotateX = node.style.rotateX
  if (typeof node.style.rotateY === 'number') style.rotateY = node.style.rotateY
  if (node.style.textShadow) style.textShadow = node.style.textShadow
  if (node.style.direction) style.direction = node.style.direction
  if (node.style.writingMode) style.writingMode = node.style.writingMode
  if (node.style.filter) style.filter = node.style.filter
  if (node.style.outline) style.outline = node.style.outline

  const out: DesignNode = {
    id: node.id,
    name: node.name,
    kind: convertKind(node),
    box: {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    },
    style,
    // Fold inferred (item-rendered / projected) tiles into the comparable tree
    // so L1 soft-review sees list content, not an empty dynamic frame.
    children: [
      ...node.children.map(convertNode),
      ...(node.inferredChildren ?? []).map(convertNode),
    ],
  }
  if (node.text !== undefined) out.text = node.text
  if (node.dynamic) {
    // Annotate the name so the diff board can show it as a runtime surface.
    out.name = node.name
  }
  return out
}

/** Convert a rendered high-fidelity tree into a comparable DesignDoc. */
export function hifiTreeToDesignDoc(
  root: HifiRenderNode,
  source: DesignDoc['source'] = 'android-xml',
): DesignDoc {
  return { root: convertNode(root), scale: 1, source }
}
