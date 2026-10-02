/**
 * Wire shape shared by design-static compare responses and the panel board.
 */
import type { DesignDoc, DesignNode, LayoutRenderNode } from '@rebornace/tracescope-core'

export interface DesignWireNode {
  id: string
  name: string
  kind: string
  text?: string
  imageUrl?: string
  x: number
  y: number
  width: number
  height: number
  dynamic?: boolean
  aiInferred?: boolean
  aiNote?: string
  itemRendered?: boolean
  inferredChildren?: DesignWireNode[]
  style: LayoutRenderNode['style']
  children: DesignWireNode[]
}

export function serializeLayoutTree(node: LayoutRenderNode): DesignWireNode {
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    text: node.text,
    imageUrl: node.imageUrl,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    dynamic: node.dynamic,
    aiInferred: node.aiInferred,
    aiNote: (node as unknown as { aiNote?: string }).aiNote,
    itemRendered: node.itemRendered,
    inferredChildren: node.inferredChildren?.map(serializeLayoutTree),
    style: node.style,
    children: node.children.map(serializeLayoutTree),
  }
}

export function emptyCodeWire(width: number, height: number): DesignWireNode {
  return {
    id: 'code-root',
    name: 'code',
    kind: 'frame',
    x: 0,
    y: 0,
    width,
    height,
    style: {},
    children: [],
  }
}

export function designDocToWireSimple(doc: DesignDoc): DesignWireNode {
  return designDocToWire(
    doc,
    { groupUrls: new Map(), iconUrls: new Map(), suppressed: new Set() },
    undefined,
  )
}

export function designDocToWire(
  design: DesignDoc,
  iconEnrich: {
    groupUrls: Map<string, string>
    iconUrls: Map<string, string>
    suppressed: Set<string>
  },
  imageUrls?: Map<string, string>,
): DesignWireNode {
  const { groupUrls, iconUrls, suppressed } = iconEnrich
  function convert(n: DesignNode): DesignWireNode {
    const style: DesignWireNode['style'] = {}
    if (typeof n.style.backgroundColor === 'string') {
      style.backgroundColor = n.style.backgroundColor
    }
    if (n.style.gradient) style.gradient = n.style.gradient
    if (typeof n.style.color === 'string') style.color = n.style.color
    if (typeof n.style.fontSize === 'number') style.fontSize = n.style.fontSize
    if (typeof n.style.fontWeight === 'number') style.fontWeight = n.style.fontWeight
    if (n.style.fontFamily) style.fontFamily = n.style.fontFamily
    if (n.style.textAlign) style.textAlign = n.style.textAlign
    if (typeof n.style.cornerRadius === 'number') style.borderRadius = n.style.cornerRadius
    if (Array.isArray(n.style.cornerRadii)) style.borderRadii = n.style.cornerRadii
    if (typeof n.style.lineHeight === 'number') style.lineHeight = n.style.lineHeight
    if (n.style.imageFit) style.imageFit = n.style.imageFit
    if (typeof n.style.opacity === 'number') style.opacity = n.style.opacity
    if (typeof n.style.elevation === 'number') style.elevation = n.style.elevation
    if (typeof n.style.innerShadow === 'number') style.innerShadow = n.style.innerShadow
    if (typeof n.style.blur === 'number') style.blur = n.style.blur
    if (n.style.shadow) style.shadow = n.style.shadow
    if (n.style.insetShadow) style.insetShadow = n.style.insetShadow
    if (n.style.shadows) style.shadows = n.style.shadows
    if (n.style.blendMode) style.blendMode = n.style.blendMode
    if (typeof n.style.rotation === 'number') style.rotation = n.style.rotation
    if (typeof n.style.scaleX === 'number') style.scaleX = n.style.scaleX
    if (typeof n.style.scaleY === 'number') style.scaleY = n.style.scaleY
    if (typeof n.style.skewX === 'number') style.skewX = n.style.skewX
    if (typeof n.style.skewY === 'number') style.skewY = n.style.skewY
    if (typeof n.style.zIndex === 'number') style.zIndex = n.style.zIndex
    if (n.style.strokeAlign) style.strokeAlign = n.style.strokeAlign
    if (n.style.fills?.length) style.fills = n.style.fills
    if (n.style.textDecoration) style.textDecoration = n.style.textDecoration
    if (n.style.textTransform) style.textTransform = n.style.textTransform
    if (n.style.overflow) style.overflow = n.style.overflow
    if (n.style.clipPath) style.clipPath = n.style.clipPath
    if (typeof n.style.aspectRatio === 'number') style.aspectRatio = n.style.aspectRatio
    if (typeof n.style.maxLines === 'number') style.maxLines = n.style.maxLines
    if (n.style.textOverflow) style.textOverflow = n.style.textOverflow
    if (typeof n.style.minWidth === 'number') style.minWidth = n.style.minWidth
    if (typeof n.style.maxWidth === 'number') style.maxWidth = n.style.maxWidth
    if (typeof n.style.minHeight === 'number') style.minHeight = n.style.minHeight
    if (typeof n.style.maxHeight === 'number') style.maxHeight = n.style.maxHeight
    if (typeof n.style.textAdvanceWidth === 'number') style.textAdvanceWidth = n.style.textAdvanceWidth
    if (typeof n.style.textBlockHeight === 'number') style.textBlockHeight = n.style.textBlockHeight
    if (n.style.flexDirection) style.flexDirection = n.style.flexDirection
    if (n.style.alignItems) style.alignItems = n.style.alignItems
    if (n.style.justifyContent) style.justifyContent = n.style.justifyContent
    if (n.style.fontStyle) style.fontStyle = n.style.fontStyle
    if (n.style.textAlignVertical) style.textAlignVertical = n.style.textAlignVertical
    if (n.style.borderStyle) style.borderStyle = n.style.borderStyle
    if (n.style.strokeDashArray) style.strokeDashArray = n.style.strokeDashArray
    if (n.style.strokeCap) style.strokeCap = n.style.strokeCap
    if (n.style.strokeJoin) style.strokeJoin = n.style.strokeJoin
    if (typeof n.style.paragraphSpacing === 'number') style.paragraphSpacing = n.style.paragraphSpacing
    if (n.style.sizingHorizontal) style.sizingHorizontal = n.style.sizingHorizontal
    if (n.style.sizingVertical) style.sizingVertical = n.style.sizingVertical
    if (typeof n.style.backdropBlur === 'number') style.backdropBlur = n.style.backdropBlur
    if (n.style.position) style.position = n.style.position
    if (typeof n.style.rowGap === 'number') style.rowGap = n.style.rowGap
    if (typeof n.style.columnGap === 'number') style.columnGap = n.style.columnGap
    if (n.style.flexWrap) style.flexWrap = n.style.flexWrap
    if (n.style.alignContent) style.alignContent = n.style.alignContent
    if (typeof n.style.order === 'number') style.order = n.style.order
    if (n.style.gridTemplate) style.gridTemplate = n.style.gridTemplate
    if (n.style.alignSelf) style.alignSelf = n.style.alignSelf
    if (typeof n.style.flexGrow === 'number') style.flexGrow = n.style.flexGrow
    if (typeof n.style.flexShrink === 'number') style.flexShrink = n.style.flexShrink
    if (n.style.transformOrigin) style.transformOrigin = n.style.transformOrigin
    if (n.style.visibility) style.visibility = n.style.visibility
    if (n.style.display) style.display = n.style.display
    if (n.style.whiteSpace) style.whiteSpace = n.style.whiteSpace
    if (n.style.wordBreak) style.wordBreak = n.style.wordBreak
    if (typeof n.style.wordSpacing === 'number') style.wordSpacing = n.style.wordSpacing
    if (typeof n.style.textIndent === 'number') style.textIndent = n.style.textIndent
    if (typeof n.style.perspective === 'number') style.perspective = n.style.perspective
    if (typeof n.style.rotateX === 'number') style.rotateX = n.style.rotateX
    if (typeof n.style.rotateY === 'number') style.rotateY = n.style.rotateY
    if (n.style.textShadow) style.textShadow = n.style.textShadow
    if (n.style.direction) style.direction = n.style.direction
    if (n.style.writingMode) style.writingMode = n.style.writingMode
    if (n.style.filter) style.filter = n.style.filter
    if (n.style.outline) style.outline = n.style.outline
    if (typeof n.style.borderWidth === 'number') style.borderWidth = n.style.borderWidth
    if (typeof n.style.borderColor === 'string') style.borderColor = n.style.borderColor
    if (typeof n.style.borderTopWidth === 'number') style.borderTopWidth = n.style.borderTopWidth
    if (typeof n.style.borderRightWidth === 'number') style.borderRightWidth = n.style.borderRightWidth
    if (typeof n.style.borderBottomWidth === 'number') {
      style.borderBottomWidth = n.style.borderBottomWidth
    }
    if (typeof n.style.borderLeftWidth === 'number') style.borderLeftWidth = n.style.borderLeftWidth
    if (typeof n.style.borderTopColor === 'string') style.borderTopColor = n.style.borderTopColor
    if (typeof n.style.borderRightColor === 'string') style.borderRightColor = n.style.borderRightColor
    if (typeof n.style.borderBottomColor === 'string') {
      style.borderBottomColor = n.style.borderBottomColor
    }
    if (typeof n.style.borderLeftColor === 'string') style.borderLeftColor = n.style.borderLeftColor
    // A composite icon container is rendered to one image; it becomes an
    // 'icon' node and its whole subtree is dropped (the image already contains
    // the boolean/mask/layer-built glyph).
    const groupImageUrl = groupUrls.get(n.id)
    // Standalone vector rendered to an image (group takes precedence).
    const iconImageUrl = groupImageUrl ?? iconUrls.get(n.id)
    // IMAGE-paint content (avatars/photos) resolved from its fill asset ref.
    const fillImageUrl =
      !iconImageUrl && n.style.imageRef ? imageUrls?.get(n.style.imageRef) : undefined
    const isAbsorbed = suppressed.has(n.id)
    return {
      id: n.id,
      name: n.name,
      kind: groupImageUrl ? 'icon' : n.kind,
      text: n.text,
      imageUrl: iconImageUrl ?? fillImageUrl,
      x: typeof n.box.x === 'number' ? n.box.x : 0,
      y: typeof n.box.y === 'number' ? n.box.y : 0,
      width: typeof n.box.width === 'number' ? n.box.width : 0,
      height: typeof n.box.height === 'number' ? n.box.height : 0,
      style,
      // Nodes absorbed into a composite icon image are not painted again.
      children: isAbsorbed ? [] : n.children.map(convert),
    }
  }
  return convert(design.root)
}
