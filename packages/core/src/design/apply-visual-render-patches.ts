/**
 * Apply AI-published {@link VisualRenderPatch}es onto a high-fidelity code tree
 * so dynamic / sparse regions show design-anchored content in the preview.
 */
import type { VisualRenderPatch, VisualRenderNodePatch } from './types.js'

/** Minimal tree shape shared by server wire nodes and the client HifiScreen. */
export interface RenderPatchableNode {
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
  style?: Record<string, unknown>
  inferredChildren?: RenderPatchableNode[]
  children: RenderPatchableNode[]
}

function cloneNode<T extends RenderPatchableNode>(node: T): T {
  return {
    ...node,
    style: node.style ? { ...node.style } : node.style,
    children: node.children.map((c) => cloneNode(c)),
    inferredChildren: node.inferredChildren?.map((c) => cloneNode(c)),
  }
}

function findNode(
  root: RenderPatchableNode,
  id: string,
): RenderPatchableNode | undefined {
  if (root.id === id) return root
  for (const c of root.children) {
    const hit = findNode(c, id)
    if (hit) return hit
  }
  // Also search existing inferred children (target may already be filled).
  for (const c of root.inferredChildren ?? []) {
    const hit = findNode(c, id)
    if (hit) return hit
  }
  return undefined
}

function findByLabel(
  root: RenderPatchableNode,
  label: string,
): RenderPatchableNode | undefined {
  const needle = label.trim().toLowerCase()
  if (!needle) return undefined
  let best: RenderPatchableNode | undefined
  const walk = (n: RenderPatchableNode): void => {
    const hay = `${n.id} ${n.name}`.toLowerCase()
    if (hay.includes(needle)) {
      if (!best || (n.dynamic && !best.dynamic)) best = n
    }
    for (const c of n.children) walk(c)
    for (const c of n.inferredChildren ?? []) walk(c)
  }
  walk(root)
  return best
}

function patchKind(kind: VisualRenderNodePatch['kind'] | undefined): string {
  switch (kind) {
    case 'image':
      return 'image'
    case 'view':
    case 'frame':
    case 'icon':
      return kind === 'icon' ? 'image' : 'view'
    case 'text':
    default:
      return 'text'
  }
}

function toInferredChild(
  parent: RenderPatchableNode,
  patch: VisualRenderNodePatch,
  seq: number,
): RenderPatchableNode {
  const kind = patchKind(patch.kind)
  const style: Record<string, unknown> = { ...(patch.style ?? {}) }
  return {
    id: `ai_patch_${parent.id}_${seq}`,
    name: 'ai-fill',
    kind,
    text: patch.text,
    imageUrl: patch.imageUrl,
    x: parent.x + patch.rx,
    y: parent.y + patch.ry,
    width: Math.max(1, patch.width),
    height: Math.max(1, patch.height),
    aiInferred: true,
    style,
    children: [],
  }
}

export interface ApplyRenderPatchesResult<T extends RenderPatchableNode> {
  root: T
  /** Number of target regions that received at least one node. */
  applied: number
  /** targetNodeIds that could not be matched. */
  unmatched: string[]
}

/**
 * Deep-clone `root` and attach each patch as `inferredChildren` on the target
 * node (matched by id, then by label). Marks the region `aiInferred`.
 */
export function applyVisualRenderPatches<T extends RenderPatchableNode>(
  root: T,
  patches: VisualRenderPatch[] | undefined,
): ApplyRenderPatchesResult<T> {
  const cloned = cloneNode(root)
  if (!patches?.length) return { root: cloned, applied: 0, unmatched: [] }

  let applied = 0
  const unmatched: string[] = []
  let seq = 0

  for (const patch of patches) {
    const target =
      findNode(cloned, patch.targetNodeId) ??
      (patch.targetLabel ? findByLabel(cloned, patch.targetLabel) : undefined)
    if (!target) {
      unmatched.push(patch.targetNodeId)
      continue
    }
    if (!patch.nodes.length) continue
    const children = patch.nodes.map((n) => {
      seq += 1
      return toInferredChild(target, n, seq)
    })
    target.inferredChildren = children
    target.aiInferred = true
    target.aiNote = `AI 填模板 · ${children.length} 个节点`
    // Prefer showing AI fill even when static item tiles already exist.
    target.itemRendered = false
    applied += 1
  }

  return { root: cloned, applied, unmatched }
}

/** Collect dynamic / sparse regions useful for AI fill prompts. */
export function collectDynamicRegionCatalog(
  root: RenderPatchableNode,
): Array<{
  id: string
  name: string
  width: number
  height: number
  filled: boolean
  itemRendered: boolean
}> {
  const out: Array<{
    id: string
    name: string
    width: number
    height: number
    filled: boolean
    itemRendered: boolean
  }> = []
  const walk = (n: RenderPatchableNode): void => {
    if (n.dynamic || n.kind === 'dynamic') {
      out.push({
        id: n.id,
        name: n.name,
        width: Math.round(n.width),
        height: Math.round(n.height),
        filled: Boolean(n.inferredChildren?.length),
        itemRendered: Boolean(n.itemRendered),
      })
    }
    for (const c of n.children) walk(c)
  }
  walk(root)
  return out
}
