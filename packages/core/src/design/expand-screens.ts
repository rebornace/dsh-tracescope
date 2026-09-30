/**
 * When a focused Figma node is a Section / parent Frame that contains several
 * real screens, explode them into one DesignDoc per screen so the plugin
 * shows separate cards instead of one combined image.
 */
import type { DesignDoc, DesignNode, DesignNodeKind } from './types.js'
import type { FigmaPageSummary } from './sources/figma.js'

const SCREEN_KINDS = new Set<DesignNodeKind>(['frame', 'group', 'view'])
/** Ignore helper/placeholder elements smaller than this on both edges. */
const MIN_PAGE_EDGE = 120
/** Prefer phone/tablet-sized surfaces (or rich nested UI). */
const MIN_SCREEN_EDGE = 200
const MIN_NESTED_NODES = 8

function countNodes(node: DesignNode): number {
  let n = 1
  for (const child of node.children) n += countNodes(child)
  return n
}

/** True when a child looks like a selectable app screen / board frame. */
export function looksLikeScreenFrame(node: DesignNode): boolean {
  if (!SCREEN_KINDS.has(node.kind)) return false
  const w = Number(node.box.width) || 0
  const h = Number(node.box.height) || 0
  if (w < MIN_PAGE_EDGE && h < MIN_PAGE_EDGE) return false
  if (w * h < MIN_PAGE_EDGE * MIN_PAGE_EDGE) return false
  if (w >= MIN_SCREEN_EDGE && h >= MIN_SCREEN_EDGE) return true
  return countNodes(node) >= MIN_NESTED_NODES
}

function cloneNode(node: DesignNode): DesignNode {
  return JSON.parse(JSON.stringify(node)) as DesignNode
}

/** Shift a cloned tree so the root starts at (0,0) for isolated rendering. */
function rebaseToOrigin(root: DesignNode): void {
  const originX = typeof root.box.x === 'number' ? root.box.x : 0
  const originY = typeof root.box.y === 'number' ? root.box.y : 0
  if (originX === 0 && originY === 0) return
  const shift = (n: DesignNode): void => {
    if (typeof n.box.x === 'number') n.box.x -= originX
    if (typeof n.box.y === 'number') n.box.y -= originY
    for (const child of n.children) shift(child)
  }
  shift(root)
}

function toSummary(node: DesignNode): FigmaPageSummary {
  return {
    id: node.id,
    name: node.name || node.id,
    type: 'FRAME',
    box: {
      x: Number(node.box.x) || 0,
      y: Number(node.box.y) || 0,
      width: Number(node.box.width) || 390,
      height: Number(node.box.height) || 844,
    },
  }
}

function wrapAsDoc(parent: DesignDoc, node: DesignNode): DesignDoc {
  const root = cloneNode(node)
  rebaseToOrigin(root)
  return { root, scale: parent.scale, source: parent.source }
}

function collectScreenChildren(root: DesignNode): DesignNode[] {
  const direct = root.children.filter(looksLikeScreenFrame)
  if (direct.length >= 2) return direct
  // One nesting level: Section → folder/group → frames
  const nested: DesignNode[] = []
  for (const child of root.children) {
    for (const gc of child.children) {
      if (looksLikeScreenFrame(gc)) nested.push(gc)
    }
  }
  if (nested.length >= 2) return nested
  return direct.length === 1 ? direct : []
}

/**
 * Expand a focused design node into one or more page docs.
 * Returns a single entry (the root) when it is already one screen.
 */
export function expandFocusedDesignPages(
  design: DesignDoc,
): Array<{ summary: FigmaPageSummary; doc: DesignDoc }> {
  const screens = collectScreenChildren(design.root)
  if (screens.length >= 2) {
    return screens.map((child) => ({
      summary: toSummary(child),
      doc: wrapAsDoc(design, child),
    }))
  }
  if (screens.length === 1) {
    const only = screens[0]!
    // Prefer the sole screen child when the selected node is an empty shell /
    // section wrapper around one real frame.
    const rootW = Number(design.root.box.width) || 0
    const rootH = Number(design.root.box.height) || 0
    const childW = Number(only.box.width) || 0
    const childH = Number(only.box.height) || 0
    const rootIsShell =
      !looksLikeScreenFrame(design.root) ||
      rootW * rootH > childW * childH * 1.4 ||
      design.root.kind === 'group'
    if (rootIsShell && only.id !== design.root.id) {
      return [{ summary: toSummary(only), doc: wrapAsDoc(design, only) }]
    }
  }
  return [{ summary: toSummary(design.root), doc: design }]
}
