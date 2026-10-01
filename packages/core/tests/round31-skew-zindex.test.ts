import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
} from '../src/design/adapters/android-xml.js'
import {
  composeSourceToDesignDoc,
  reactNativeSourceToDesignDoc,
  swiftuiSourceToDesignDoc,
} from '../src/design/adapters/declarative-design-doc.js'
import { parseCssDeclarations, parseCssSkew } from '../src/design/adapters/web-css.js'
import { compareVisualDocs } from '../src/design/compare.js'
import { normalizeFigmaTree } from '../src/design/sources/figma.js'
import { normalizeLanhuAnnotation } from '../src/design/sources/lanhu.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

function leaf(doc: DesignDoc): DesignNode {
  const walk = (n: DesignNode): DesignNode =>
    n.children.length ? walk(n.children[0]!) : n
  return walk(doc.root)
}

describe('figma skew from relativeTransform', () => {
  it('extracts skewX from sheared matrix', () => {
    // Identity scale, 15° skewX: [[1, tanθ], [0, 1]]
    const tan = Math.tan((15 * Math.PI) / 180)
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'sheared',
      type: 'RECTANGLE',
      absoluteBoundingBox: { x: 0, y: 0, width: 40, height: 40 },
      relativeTransform: [
        [1, tan, 0],
        [0, 1, 0],
      ],
      fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
    })
    expect(doc.root.style.skewX).toBeCloseTo(15, 0)
  })
})

describe('lanhu skew + zIndex', () => {
  it('maps skew and zIndex', () => {
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
                id: 'c1',
                name: 'card',
                type: 'shape',
                width: 100,
                height: 40,
                left: 0,
                top: 0,
                skewX: 10,
                zIndex: 3,
                fills: [{ type: 'color', color: { r: 255, g: 255, b: 255, a: 1 } }],
              },
            ],
          },
        ],
      },
      { name: 'page' },
    )
    const n = leaf(doc)
    expect(n.style.skewX).toBe(10)
    expect(n.style.zIndex).toBe(3)
  })
})

describe('CSS skew + z-index', () => {
  it('parses skew helpers and z-index', () => {
    expect(parseCssSkew('skewX(12deg)')).toEqual({ skewX: 12 })
    expect(parseCssSkew('skew(10deg, -5deg)')).toEqual({ skewX: 10, skewY: -5 })
    const parsed = parseCssDeclarations(
      'transform: skewX(8deg) scale(1.1); z-index: 5',
    )
    expect(parsed.style.skewX).toBe(8)
    expect(parsed.style.scaleX).toBe(1.1)
    expect(parsed.style.zIndex).toBe(5)
  })
})

describe('native zIndex parsers', () => {
  it('parses Android translationZ as zIndex', () => {
    const resources = buildAndroidResources([])
    const doc = normalizeAndroidLayout(
      `<?xml version="1.0" encoding="utf-8"?>
      <View xmlns:android="http://schemas.android.com/apk/res/android"
         android:layout_width="40dp"
         android:layout_height="40dp"
         android:translationZ="4dp" />`,
      resources,
    )
    expect(leaf(doc).style.zIndex).toBe(4)
  })

  it('parses Compose / SwiftUI / RN zIndex', () => {
    expect(
      leaf(
        composeSourceToDesignDoc(`Text("Hi", modifier = Modifier.zIndex(2f))`, 'Home'),
      ).style.zIndex,
    ).toBe(2)

    expect(
      leaf(swiftuiSourceToDesignDoc(`Text("Hi").zIndex(3)`, 'Home')).style.zIndex,
    ).toBe(3)

    expect(
      leaf(
        reactNativeSourceToDesignDoc(
          `<Text style={{ zIndex: 4, transform: [{ skewX: '6deg' }] }}>Hi</Text>`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ zIndex: 4, skewX: 6 })
  })
})

describe('compare skew + zIndex', () => {
  it('soft-diffs skew and zIndex mismatches', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'card',
        kind: 'shape',
        box: {},
        style: { skewX: 12, zIndex: 2 },
        children: [],
      },
      scale: 1,
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 'card',
        kind: 'shape',
        box: {},
        style: { skewX: 4, zIndex: 1 },
        children: [],
      },
      scale: 1,
    }
    const result = compareVisualDocs(design, code)
    const props = result.diffs.map((d) => d.property)
    expect(props).toContain('skewX')
    expect(props).toContain('zIndex')
    expect(result.diffs.every((d) => d.needsReview)).toBe(true)
  })
})
