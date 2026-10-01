import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
} from '../src/design/adapters/android-xml.js'
import {
  applyDesignTextsToTiles,
  isPreviewPlaceholderText,
  seedDynamicFromDesign,
  seedListTilesFromDesign,
} from '../src/design/seed-dynamic-from-design.js'
import {
  clampListTileCount,
  DEFAULT_LIST_TILE_COUNT,
  MAX_LIST_TILE_COUNT,
  tileListTemplate,
} from '../src/design/list-template-expand.js'
import {
  charAdvanceUnit,
  estimateTextAdvance,
  estimateTextBlock,
} from '../src/design/text-metrics.js'
import { normalizeFigmaTree } from '../src/design/sources/figma.js'
import { hifiTreeToDesignDoc } from '../src/design/hifi-to-design-doc.js'
import type { HifiRenderNode } from '../src/design/android-layout-engine.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

describe('② text-metrics deepen', () => {
  it('uses class-based Latin advances + letterSpacing + weight', () => {
    expect(charAdvanceUnit('中')).toBeCloseTo(1.02, 5)
    expect(charAdvanceUnit('A')).toBeCloseTo(0.66, 5)
    expect(charAdvanceUnit('i')).toBeCloseTo(0.34, 5)
    expect(estimateTextAdvance('AB', 20)).toBeCloseTo(20 * 0.66 * 2, 1)
    const tracked = estimateTextAdvance('AB', 20, { letterSpacing: 2 })
    expect(tracked).toBeCloseTo(20 * 0.66 * 2 + 2, 1)
    const bold = estimateTextAdvance('AB', 20, { fontWeight: 700 })
    expect(bold).toBeGreaterThan(estimateTextAdvance('AB', 20))
  })

  it('wraps Latin on word boundaries', () => {
    const block = estimateTextBlock('Hello World', 16, {
      maxWidth: 50,
      lineHeight: 20,
    })
    expect(block.lines).toBeGreaterThanOrEqual(2)
    expect(block.height).toBeGreaterThanOrEqual(40)
  })

  it('figma textAdvanceWidth respects letterSpacing', () => {
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'T',
      type: 'TEXT',
      characters: 'AB',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 24 },
      style: { fontSize: 20, fontWeight: 400, letterSpacing: 3 },
      fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0, a: 1 } }],
    })
    expect(doc.root.style.textAdvanceWidth).toBe(
      estimateTextAdvance('AB', 20, { letterSpacing: 3, fontWeight: 400 }),
    )
  })
})

describe('③ dynamic static fill', () => {
  it('detects preview placeholders', () => {
    expect(isPreviewPlaceholderText('行标题')).toBe(true)
    expect(isPreviewPlaceholderText('Title')).toBe(true)
    expect(isPreviewPlaceholderText('会员中心')).toBe(false)
  })

  it('tileListTemplate respects count clamp + seedTexts', () => {
    expect(clampListTileCount(99)).toBe(MAX_LIST_TILE_COUNT)
    expect(clampListTileCount(undefined)).toBe(DEFAULT_LIST_TILE_COUNT)
    const item: DesignNode = {
      id: 'item',
      name: 'item',
      kind: 'text',
      text: 'Title',
      box: { height: 24, width: 120 },
      style: { fontSize: 14 },
      children: [],
    }
    const tiles = tileListTemplate([item], {
      idPrefix: 'list',
      count: 4,
      seedTexts: ['甲', '乙', '丙', '丁'],
    })
    expect(tiles).toHaveLength(4)
    expect(tiles.map((t) => t.text)).toEqual(['甲', '乙', '丙', '丁'])
  })

  it('seedListTilesFromDesign fills identical template texts', () => {
    const item: DesignNode = {
      id: 'row',
      name: 'row',
      kind: 'text',
      text: 'Title',
      box: { height: 20, width: 100 },
      style: { fontSize: 14 },
      children: [],
    }
    const code: DesignDoc = {
      root: {
        id: 'root',
        name: 'root',
        kind: 'frame',
        box: {},
        style: {},
        children: tileListTemplate([item], { idPrefix: 'rv-item' }),
      },
      scale: 1,
      source: 'android-xml',
    }
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'd',
        kind: 'frame',
        box: {},
        style: {},
        children: [
          {
            id: 'd1',
            name: 'a',
            kind: 'text',
            text: '一号',
            box: { x: 0, y: 0 },
            style: {},
            children: [],
          },
          {
            id: 'd2',
            name: 'b',
            kind: 'text',
            text: '二号',
            box: { x: 0, y: 40 },
            style: {},
            children: [],
          },
          {
            id: 'd3',
            name: 'c',
            kind: 'text',
            text: '三号',
            box: { x: 0, y: 80 },
            style: {},
            children: [],
          },
        ],
      },
      scale: 1,
      source: 'figma',
    }
    const n = seedDynamicFromDesign(code, design)
    expect(n).toBe(DEFAULT_LIST_TILE_COUNT)
    expect(code.root.children.map((c) => c.text)).toEqual(['一号', '二号', '三号'])
  })

  it('android tools:itemCount expands list tiles', () => {
    const resources = buildAndroidResources(`<resources></resources>`)
    const layouts = new Map<string, string>([
      [
        'item_row',
        `<TextView xmlns:android="http://schemas.android.com/apk/res/android"
          xmlns:tools="http://schemas.android.com/tools"
          android:layout_width="match_parent"
          android:layout_height="40dp"
          tools:text="Title"
          android:textSize="16sp" />`,
      ],
    ])
    const doc = normalizeAndroidLayout(
      `<RecyclerView xmlns:android="http://schemas.android.com/apk/res/android"
        xmlns:tools="http://schemas.android.com/tools"
        android:id="@+id/list"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        tools:listitem="@layout/item_row"
        tools:itemCount="5" />`,
      resources,
      { resolveLayout: (name) => layouts.get(name) },
    )
    expect(doc.root.children.length).toBe(5)
  })

  it('hifiTreeToDesignDoc folds inferredChildren into compare tree', () => {
    const root: HifiRenderNode = {
      id: 'rv',
      name: 'list',
      kind: 'dynamic',
      x: 0,
      y: 0,
      width: 100,
      height: 200,
      style: {},
      dynamic: true,
      itemRendered: true,
      children: [],
      inferredChildren: [
        {
          id: 't0',
          name: 'row',
          kind: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          text: '一号',
          style: { fontSize: 14 },
          children: [],
        },
      ],
    }
    const doc = hifiTreeToDesignDoc(root)
    expect(doc.root.children).toHaveLength(1)
    expect(doc.root.children[0]!.text).toBe('一号')
  })

  it('applyDesignTextsToTiles skips unique non-placeholder copy', () => {
    const tiles: DesignNode[] = [
      {
        id: 'a-t0-0',
        name: 'a',
        kind: 'text',
        text: '真实文案A',
        box: {},
        style: {},
        children: [],
      },
      {
        id: 'a-t1-0',
        name: 'b',
        kind: 'text',
        text: '真实文案B',
        box: {},
        style: {},
        children: [],
      },
    ]
    expect(applyDesignTextsToTiles(tiles, ['X', 'Y'])).toBe(0)
    expect(seedListTilesFromDesign(
      { id: 'r', name: 'r', kind: 'frame', box: {}, style: {}, children: tiles },
      { id: 'd', name: 'd', kind: 'frame', box: {}, style: {}, children: [] },
    )).toBe(0)
  })
})
