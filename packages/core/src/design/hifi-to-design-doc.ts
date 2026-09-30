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
  }
  if (node.style.gradient) {
    style.gradient = node.style.gradient
    // Give the property diff a representative colour so gradient-vs-solid
    // mismatches are still surfaced in the readable list.
    if (!style.backgroundColor) style.backgroundColor = gradientApproxColor(node.style.gradient)
  }
  if (node.style.lineHeight) style.lineHeight = node.style.lineHeight
  if (node.style.imageFit) style.imageFit = node.style.imageFit

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
    children: node.children.map(convertNode),
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
