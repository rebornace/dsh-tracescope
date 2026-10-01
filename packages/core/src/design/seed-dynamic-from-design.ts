/**
 * Static fill for dynamic list surfaces: replace preview/placeholder tile texts
 * with design-side copy so L1 compare and the HiFi board are closer to restore
 * without a running app or AI pass.
 */
import type { DesignDoc, DesignNode } from './types.js'
import { estimateTextAdvance, estimateTextBlock } from './text-metrics.js'

/** Design-time / template filler — safe to overwrite with design texts. */
export function isPreviewPlaceholderText(text: string | undefined): boolean {
  if (text == null) return true
  const t = text.trim()
  if (!t) return true
  if (/^tools:/i.test(t)) return true
  return /^(item|row|title|subtitle|label|text|placeholder|dummy|lorem|示例|占位|行标题|标题|正文|副标题|列表项)(\s*[#:\-]?\s*\d+)?$/i.test(
    t,
  )
}

function collectTextLeaves(node: DesignNode): DesignNode[] {
  const out: DesignNode[] = []
  const walk = (n: DesignNode): void => {
    if (n.kind === 'text' || (n.text !== undefined && n.text !== '')) {
      if (n.text !== undefined) out.push(n)
    }
    for (const c of n.children) walk(c)
  }
  walk(node)
  return out
}

function boxY(n: DesignNode): number {
  return typeof n.box.y === 'number' ? n.box.y : 0
}
function boxX(n: DesignNode): number {
  return typeof n.box.x === 'number' ? n.box.x : 0
}

/** Design text leaves in reading order (top→bottom, left→right). */
export function collectDesignTextsSorted(root: DesignNode): string[] {
  const leaves = collectTextLeaves(root).filter((n) => n.text?.trim())
  leaves.sort((a, b) => boxY(a) - boxY(b) || boxX(a) - boxX(b))
  return leaves.map((n) => n.text!.trim())
}

/**
 * Group sibling nodes that look like `tileListTemplate` output (`…-t0-…`, `…-t1-…`).
 * Each group is an ordered list of tile roots (or synthetic frames when a tile
 * spans multiple sibling nodes).
 */
export function findTiledGroups(root: DesignNode): DesignNode[][] {
  const groups: DesignNode[][] = []
  const walk = (n: DesignNode): void => {
    const byTile = new Map<number, DesignNode[]>()
    for (const c of n.children) {
      const m = /-t(\d+)(?:-|$)/.exec(c.id)
      if (!m) continue
      const idx = Number(m[1])
      const arr = byTile.get(idx) ?? []
      arr.push(c)
      byTile.set(idx, arr)
    }
    if (byTile.size >= 2) {
      const maxIdx = Math.max(...byTile.keys())
      const tiles: DesignNode[] = []
      for (let i = 0; i <= maxIdx; i++) {
        const parts = byTile.get(i)
        if (!parts?.length) continue
        if (parts.length === 1) tiles.push(parts[0]!)
        else {
          tiles.push({
            id: `${n.id || 'list'}-synth-t${i}`,
            name: 'tile',
            kind: 'frame',
            box: {},
            style: {},
            children: parts,
          })
        }
      }
      if (tiles.length >= 2) groups.push(tiles)
    }
    for (const c of n.children) walk(c)
  }
  walk(root)
  return groups
}

function slotTextAcrossTiles(tiles: DesignNode[], slot: number): Array<string | undefined> {
  return tiles.map((t) => collectTextLeaves(t)[slot]?.text)
}

function shouldOverrideTileText(
  text: string | undefined,
  tiles: DesignNode[],
  slot: number,
): boolean {
  if (isPreviewPlaceholderText(text)) return true
  const texts = slotTextAcrossTiles(tiles, slot)
  if (texts.length >= 2 && texts.every((t) => t === texts[0])) return true
  return false
}

function refreshTextMetrics(leaf: DesignNode, text: string): void {
  const fs = typeof leaf.style.fontSize === 'number' ? leaf.style.fontSize : 14
  const opts = {
    letterSpacing:
      typeof leaf.style.letterSpacing === 'number' ? leaf.style.letterSpacing : undefined,
    fontWeight: leaf.style.fontWeight,
  }
  leaf.style.textAdvanceWidth = estimateTextAdvance(text, fs, opts)
  const maxW =
    typeof leaf.style.maxWidth === 'number'
      ? leaf.style.maxWidth
      : typeof leaf.box.width === 'number'
        ? leaf.box.width
        : undefined
  const lh = typeof leaf.style.lineHeight === 'number' ? leaf.style.lineHeight : undefined
  const block = estimateTextBlock(text, fs, { ...opts, maxWidth: maxW, lineHeight: lh })
  let lines = block.lines
  if (typeof leaf.style.maxLines === 'number' && leaf.style.maxLines > 0) {
    lines = Math.min(lines, leaf.style.maxLines)
  }
  const lineH = lh ?? Math.round(fs * 1.2 * 100) / 100
  leaf.style.textBlockHeight = Math.round(lineH * lines * 100) / 100
}

/**
 * Apply design texts onto tiled list items (cyclic by tile × text-slot).
 * Only overwrites placeholders or texts identical across every tile.
 */
export function applyDesignTextsToTiles(tiles: DesignNode[], designTexts: string[]): number {
  if (!tiles.length || !designTexts.length) return 0
  const slotCount = Math.max(1, collectTextLeaves(tiles[0]!).length)
  let changed = 0
  for (let i = 0; i < tiles.length; i++) {
    const leaves = collectTextLeaves(tiles[i]!)
    if (!leaves.length) continue
    for (let s = 0; s < leaves.length; s++) {
      const leaf = leaves[s]!
      if (!shouldOverrideTileText(leaf.text, tiles, s)) continue
      const next = designTexts[(i * slotCount + s) % designTexts.length]!
      if (leaf.text === next) continue
      leaf.text = next
      refreshTextMetrics(leaf, next)
      changed += 1
    }
  }
  return changed
}

/**
 * Seed every detected list-tile group in `codeRoot` from `designRoot` texts.
 * Returns the number of text nodes updated.
 */
export function seedListTilesFromDesign(codeRoot: DesignNode, designRoot: DesignNode): number {
  const designTexts = collectDesignTextsSorted(designRoot)
  if (!designTexts.length) return 0
  let changed = 0
  for (const tiles of findTiledGroups(codeRoot)) {
    changed += applyDesignTextsToTiles(tiles, designTexts)
  }
  return changed
}

/** Convenience for full DesignDoc pairs (mutates `code`). */
export function seedDynamicFromDesign(code: DesignDoc, design: DesignDoc): number {
  return seedListTilesFromDesign(code.root, design.root)
}
