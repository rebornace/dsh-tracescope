/**
 * L1 helpers: tile a static list-item template into a few preview rows/columns
 * so dynamic surfaces (RecyclerView / LazyColumn / FlatList) are comparable
 * without a running app.
 */
import type { DesignNode, DesignStyle } from './types.js'
import { applyDocumentOrderStack, applyFlexGapLayout } from './adapters/web-css.js'
import { applyDesignTextsToTiles } from './seed-dynamic-from-design.js'

export const DEFAULT_LIST_TILE_COUNT = 3
/** Soft upper bound so tools:itemCount cannot explode the compare tree. */
export const MAX_LIST_TILE_COUNT = 12

export function cloneDesignNode(node: DesignNode, idPrefix: string): DesignNode {
  let seq = 0
  const walk = (n: DesignNode): DesignNode => {
    const id = `${idPrefix}-${seq++}`
    return {
      id,
      name: n.name,
      kind: n.kind,
      text: n.text,
      box: { ...n.box },
      style: { ...n.style },
      children: n.children.map(walk),
    }
  }
  return walk(node)
}

/** Clamp a requested tile count into the preview range. */
export function clampListTileCount(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return DEFAULT_LIST_TILE_COUNT
  return Math.min(MAX_LIST_TILE_COUNT, Math.max(1, Math.round(raw)))
}

function ensureSizes(nodes: DesignNode[], direction: 'row' | 'column'): void {
  for (const c of nodes) {
    if (direction === 'column' && typeof c.box.height !== 'number') {
      c.box.height = c.kind === 'text' || c.text ? 20 : 48
    }
    if (direction === 'row' && typeof c.box.width !== 'number') {
      c.box.width = c.text ? Math.min(360, Math.max(40, c.text.length * 12)) : 120
    }
    if (direction === 'row' && typeof c.box.height !== 'number') {
      c.box.height = c.kind === 'text' || c.text ? 20 : 48
    }
  }
}

/**
 * Repeat `template` `count` times and stack along the list axis.
 * Returns the tiled children (caller wraps them in a list frame).
 * Optional `seedTexts` cycles design-side copy into placeholder tile texts.
 */
export function tileListTemplate(
  template: DesignNode[],
  opts: {
    idPrefix: string
    count?: number
    direction?: 'row' | 'column'
    gap?: number
    seedTexts?: string[]
  },
): DesignNode[] {
  if (!template.length) return []
  const count = clampListTileCount(opts.count)
  const direction = opts.direction ?? 'column'
  const gap = opts.gap ?? 8
  const tiles: DesignNode[] = []
  for (let i = 0; i < count; i++) {
    for (const node of template) {
      tiles.push(cloneDesignNode(node, `${opts.idPrefix}-t${i}`))
    }
  }
  ensureSizes(tiles, direction)
  const align = 'flex-start'
  const css = `.axis{display:flex;flex-direction:${direction};gap:${gap}px;align-items:${align};justify-content:flex-start}`
  applyFlexGapLayout(tiles, css)
  if (!tiles.some((t) => typeof t.box.x === 'number' || typeof t.box.y === 'number')) {
    applyDocumentOrderStack(tiles, gap)
  }
  if (opts.seedTexts?.length) {
    // Group by tile index so multi-node templates still seed as whole rows.
    const byTile = new Map<number, DesignNode[]>()
    for (const t of tiles) {
      const m = /-t(\d+)(?:-|$)/.exec(t.id)
      const idx = m ? Number(m[1]) : 0
      const arr = byTile.get(idx) ?? []
      arr.push(t)
      byTile.set(idx, arr)
    }
    const tileRoots: DesignNode[] = []
    const maxIdx = Math.max(...byTile.keys(), -1)
    for (let i = 0; i <= maxIdx; i++) {
      const parts = byTile.get(i)
      if (!parts?.length) continue
      if (parts.length === 1) tileRoots.push(parts[0]!)
      else {
        tileRoots.push({
          id: `${opts.idPrefix}-seed-t${i}`,
          name: 'tile',
          kind: 'frame',
          box: {},
          style: {},
          children: parts,
        })
      }
    }
    applyDesignTextsToTiles(tileRoots, opts.seedTexts)
  }
  return tiles
}

/** Wrap tiled children in a named list frame. */
export function makeListFrame(
  id: string,
  name: string,
  tiles: DesignNode[],
  gap?: number,
): DesignNode {
  const style: DesignStyle = {}
  if (gap !== undefined && gap > 0) style.gap = gap
  return {
    id,
    name,
    kind: 'frame',
    box: {},
    style,
    children: tiles,
  }
}

/** Slice `{ ... }` body starting at open brace index. */
export function sliceBalancedBrace(src: string, openBraceIndex: number): string | undefined {
  if (src[openBraceIndex] !== '{') return undefined
  let depth = 0
  for (let i = openBraceIndex; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return src.slice(openBraceIndex + 1, i)
    }
  }
  return undefined
}

export function indexInRanges(index: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([a, b]) => index >= a && index < b)
}
