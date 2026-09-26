/**
 * Sub-page detection for list / board screens.
 *
 * A design node may describe a scrollable list or an annotated board that
 * shows several variants of the same item on one canvas. Matching such a
 * container against a single whole-page layout under-scores the correct
 * *item* layout. This module extracts meaningful "item" subtrees so the
 * matcher can locate item layouts as well as whole screens.
 *
 * Two strategies:
 *  - repeated children that share a structural shape (a real list/grid)
 *  - distinct card-like subtrees that carry their own texts (a variant board)
 *
 * Pure and deterministic; no model or running app.
 */
import type { DesignDoc, DesignNode } from './types.js'

/** Structural signature: node kinds in preorder, ignoring names/values. */
function structuralSignature(node: DesignNode): string {
  let s = node.kind
  for (const child of node.children) s += '(' + structuralSignature(child) + ')'
  return s
}

function countAllNodes(node: DesignNode): number {
  let n = 1
  for (const child of node.children) n += countAllNodes(child)
  return n
}

function collectTexts(node: DesignNode, acc: string[] = []): string[] {
  if (node.kind === 'text' && node.text) acc.push(node.text)
  for (const child of node.children) collectTexts(child, acc)
  return acc
}

export interface SubPage {
  /** Label describing the extracted item, e.g. the card name. */
  label: string
  root: DesignNode
  /** Why this subtree was extracted. */
  reason: 'repeated-item' | 'card-variant'
}

/** Minimum nodes for a subtree to count as a standalone item. */
const MIN_ITEM_NODES = 5
/** A repeated list row needs at least this many texts. */
const MIN_REPEAT_TEXTS = 1
/** A distinct card variant needs more evidence so a lone button is not treated as a card. */
const MIN_CARD_TEXTS = 2

/**
 * Extract item subtrees from a screen. Returns an empty array when the node
 * looks like a single screen rather than a container of items.
 */
export function detectSubPages(doc: DesignDoc): SubPage[] {
  const children = doc.root.children
  if (children.length < 2) return []

  const groups = new Map<string, DesignNode[]>()
  for (const child of children) {
    if (countAllNodes(child) < MIN_ITEM_NODES) continue
    const sig = structuralSignature(child)
    const bucket = groups.get(sig)
    if (bucket) bucket.push(child)
    else groups.set(sig, [child])
  }

  const subPages: SubPage[] = []
  const seenRoots = new Set<DesignNode>()

  // Repeated structural items: the classic list/grid row.
  for (const bucket of groups.values()) {
    if (bucket.length >= 2) {
      const exemplar = bucket[0]!
      // Every member is part of the repeated row; exclude all from variants.
      for (const member of bucket) seenRoots.add(member)
      if (collectTexts(exemplar).length >= MIN_REPEAT_TEXTS) {
        subPages.push({
          label: exemplar.name,
          root: exemplar,
          reason: 'repeated-item',
        })
      }
    }
  }

  // Distinct card-like variants: an annotated board showing several variants.
  // Only treat them as items when the container is clearly composite, i.e. it
  // mixes several card subtrees, so we don't split ordinary single screens.
  const distinctCards: DesignNode[] = []
  for (const child of children) {
    if (countAllNodes(child) < MIN_ITEM_NODES) continue
    if (seenRoots.has(child)) continue
    if (collectTexts(child).length >= MIN_CARD_TEXTS) distinctCards.push(child)
  }
  if (distinctCards.length >= 2) {
    for (const card of distinctCards) {
      subPages.push({ label: card.name, root: card, reason: 'card-variant' })
    }
  }

  return subPages
}

/** Wrap an extracted item subtree in a standalone doc for fingerprinting. */
export function subPageAsDoc(doc: DesignDoc, subPage: SubPage): DesignDoc {
  return {
    root: subPage.root,
    scale: doc.scale,
    source: doc.source,
  }
}
