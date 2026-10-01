import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
} from '../src/design/adapters/android-xml.js'
import {
  arkuiSourceToDesignDoc,
  composeSourceToDesignDoc,
  flutterSourceToDesignDoc,
  reactNativeSourceToDesignDoc,
  swiftuiSourceToDesignDoc,
} from '../src/design/adapters/declarative-design-doc.js'
import { parseCssDeclarations } from '../src/design/adapters/web-css.js'
import { compareVisualDocs } from '../src/design/compare.js'
import { estimateTextAdvance } from '../src/design/text-metrics.js'
import { normalizeFigmaTree } from '../src/design/sources/figma.js'
import { normalizeLanhuAnnotation } from '../src/design/sources/lanhu.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

function leaf(doc: DesignDoc): DesignNode {
  const walk = (n: DesignNode): DesignNode =>
    n.children.length ? walk(n.children[0]!) : n
  return walk(doc.root)
}

describe('text-metrics estimateTextAdvance', () => {
  it('CJK ≈ em, Latin uses class widths', () => {
    expect(estimateTextAdvance('中文', 16)).toBeCloseTo(16 * 1.02 * 2, 1)
    expect(estimateTextAdvance('AB', 20)).toBeCloseTo(20 * 0.66 * 2, 1)
  })
})

describe('figma min/max + textAdvanceWidth', () => {
  it('maps size constraints and text advance', () => {
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'Title',
      type: 'TEXT',
      characters: 'Hello',
      minWidth: 80,
      maxWidth: 240,
      minHeight: 20,
      maxHeight: 60,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 24 },
      style: { fontSize: 16, fontWeight: 400 },
      fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0, a: 1 } }],
    })
    expect(doc.root.style.minWidth).toBe(80)
    expect(doc.root.style.maxWidth).toBe(240)
    expect(doc.root.style.minHeight).toBe(20)
    expect(doc.root.style.maxHeight).toBe(60)
    expect(doc.root.style.textAdvanceWidth).toBe(estimateTextAdvance('Hello', 16))
  })
})

describe('lanhu min/max + textAdvanceWidth', () => {
  it('maps min/max and estimates text advance', () => {
    const doc = normalizeLanhuAnnotation(
      {
        ArtboardScale: 1,
        info: [
          {
            id: 'board-1',
            name: '页',
            width: 375,
            height: 100,
            left: 0,
            top: 0,
            layers: [
              {
                id: 't1',
                name: 'label',
                type: 'text',
                width: 100,
                height: 20,
                left: 0,
                top: 0,
                content: 'Hi',
                style: { fontSize: 14 },
                minWidth: 40,
                maxWidth: 200,
                minHeight: 16,
                maxHeight: 48,
              },
            ],
          },
        ],
      },
      { name: 'page' },
    )
    const n = leaf(doc)
    expect(n.style.minWidth).toBe(40)
    expect(n.style.maxWidth).toBe(200)
    expect(n.style.minHeight).toBe(16)
    expect(n.style.maxHeight).toBe(48)
    expect(n.style.textAdvanceWidth).toBe(estimateTextAdvance('Hi', 14))
  })
})

describe('CSS min/max-*', () => {
  it('parses min-width / max-height', () => {
    const parsed = parseCssDeclarations(
      'min-width: 48px; max-width: 320px; min-height: 24px; max-height: 120px',
    )
    expect(parsed.style.minWidth).toBe(48)
    expect(parsed.style.maxWidth).toBe(320)
    expect(parsed.style.minHeight).toBe(24)
    expect(parsed.style.maxHeight).toBe(120)
  })
})

describe('native min/max constraints', () => {
  it('parses Android minWidth / maxHeight', () => {
    const resources = buildAndroidResources([])
    const doc = normalizeAndroidLayout(
      `<?xml version="1.0" encoding="utf-8"?>
      <TextView
         xmlns:android="http://schemas.android.com/apk/res/android"
         android:layout_width="wrap_content"
         android:layout_height="wrap_content"
         android:minWidth="48dp"
         android:maxWidth="200dp"
         android:minHeight="20dp"
         android:maxHeight="80dp"
         android:text="Hi"
         android:textSize="14sp" />`,
      resources,
    )
    const n = leaf(doc)
    expect(n.style.minWidth).toBe(48)
    expect(n.style.maxWidth).toBe(200)
    expect(n.style.minHeight).toBe(20)
    expect(n.style.maxHeight).toBe(80)
  })

  it('parses Compose widthIn / heightIn / sizeIn + textAdvance', () => {
    const n = leaf(
      composeSourceToDesignDoc(
        `Text("你好", modifier = Modifier.widthIn(min = 40.dp, max = 200.dp).heightIn(min = 16.dp, max = 48.dp), fontSize = 16.sp)`,
        'Home',
      ),
    )
    expect(n.style).toMatchObject({
      minWidth: 40,
      maxWidth: 200,
      minHeight: 16,
      maxHeight: 48,
      fontSize: 16,
    })
    expect(n.style.textAdvanceWidth).toBe(estimateTextAdvance('你好', 16))

    const sized = leaf(
      composeSourceToDesignDoc(
        `Text("OK", modifier = Modifier.sizeIn(minWidth = 32.dp, maxWidth = 100.dp, minHeight = 12.dp, maxHeight = 40.dp))`,
        'Home',
      ),
    )
    expect(sized.style).toMatchObject({
      minWidth: 32,
      maxWidth: 100,
      minHeight: 12,
      maxHeight: 40,
    })
  })

  it('parses SwiftUI frame min/max', () => {
    const n = leaf(
      swiftuiSourceToDesignDoc(
        `Text("Hi").frame(minWidth: 40, maxWidth: 200, minHeight: 16, maxHeight: 48)`,
        'Home',
      ),
    )
    expect(n.style).toMatchObject({
      minWidth: 40,
      maxWidth: 200,
      minHeight: 16,
      maxHeight: 48,
    })
  })

  it('parses Flutter BoxConstraints', () => {
    const n = leaf(
      flutterSourceToDesignDoc(
        `ConstrainedBox(constraints: BoxConstraints(minWidth: 40, maxWidth: 200, minHeight: 16, maxHeight: 48), child: Text('Hi'))`,
        'Home',
      ),
    )
    expect(n.style).toMatchObject({
      minWidth: 40,
      maxWidth: 200,
      minHeight: 16,
      maxHeight: 48,
    })
  })

  it('parses RN minWidth / maxHeight', () => {
    const n = leaf(
      reactNativeSourceToDesignDoc(
        `<Text style={{ minWidth: 40, maxWidth: 200, minHeight: 16, maxHeight: 48, fontSize: 14 }}>Hi</Text>`,
        'Home',
      ),
    )
    expect(n.style).toMatchObject({
      minWidth: 40,
      maxWidth: 200,
      minHeight: 16,
      maxHeight: 48,
    })
    expect(n.style.textAdvanceWidth).toBe(estimateTextAdvance('Hi', 14))
  })

  it('parses ArkUI constraintSize', () => {
    const n = leaf(
      arkuiSourceToDesignDoc(
        `Text('Hi').constraintSize({ minWidth: 40, maxWidth: 200, minHeight: 16, maxHeight: 48 })`,
        'Home',
      ),
    )
    expect(n.style).toMatchObject({
      minWidth: 40,
      maxWidth: 200,
      minHeight: 16,
      maxHeight: 48,
    })
  })
})

describe('compare soft-review for min/max + textAdvanceWidth', () => {
  it('flags large relative delta as needsReview', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 't',
        kind: 'text',
        text: 'Hello',
        box: { width: 100, height: 20 },
        style: { fontSize: 16, minWidth: 80, textAdvanceWidth: 100 },
        children: [],
      },
      scale: 1,
      source: 'figma',
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 't',
        kind: 'text',
        text: 'Hello',
        box: { width: 100, height: 20 },
        style: { fontSize: 16, minWidth: 40, textAdvanceWidth: 50 },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    const props = result.diffs.map((d) => d.property)
    expect(props).toContain('minWidth')
    expect(props).toContain('textAdvanceWidth')
    expect(result.diffs.every((d) => d.needsReview)).toBe(true)
  })
})
