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
import {
  parseCssBackgroundFills,
  parseCssDeclarations,
  parseCssRotate,
} from '../src/design/adapters/web-css.js'
import { compareVisualDocs, serializeFills } from '../src/design/compare.js'
import { normalizeFigmaTree } from '../src/design/sources/figma.js'
import { normalizeLanhuAnnotation } from '../src/design/sources/lanhu.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

function leaf(doc: DesignDoc): DesignNode {
  const walk = (n: DesignNode): DesignNode =>
    n.children.length ? walk(n.children[0]!) : n
  return walk(doc.root)
}

describe('figma rotation + fills + strokeAlign', () => {
  it('maps relativeTransform / rotation and multi fills', () => {
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'card',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
      rotation: Math.PI / 6,
      strokeAlign: 'INSIDE',
      strokeWeight: 2,
      strokes: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0, a: 1 } }],
      fills: [
        { type: 'SOLID', visible: true, color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 0.5 },
        {
          type: 'GRADIENT_LINEAR',
          visible: true,
          gradientStops: [
            { position: 0, color: { r: 0, g: 0, b: 1, a: 1 } },
            { position: 1, color: { r: 0, g: 1, b: 0, a: 1 } },
          ],
          gradientHandlePositions: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
          ],
        },
      ],
    })
    expect(doc.root.style.rotation).toBeCloseTo(30, 0)
    expect(doc.root.style.strokeAlign).toBe('inside')
    expect(doc.root.style.fills).toHaveLength(2)
    expect(doc.root.style.fills?.[0]?.type).toBe('solid')
    expect(doc.root.style.fills?.[1]?.type).toBe('gradient')
  })

  it('derives rotation from relativeTransform matrix', () => {
    const angle = Math.PI / 4
    const doc = normalizeFigmaTree({
      id: '1:2',
      name: 'badge',
      type: 'RECTANGLE',
      absoluteBoundingBox: { x: 0, y: 0, width: 20, height: 20 },
      relativeTransform: [
        [Math.cos(angle), -Math.sin(angle), 0],
        [Math.sin(angle), Math.cos(angle), 0],
      ],
      fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
    })
    expect(doc.root.style.rotation).toBeCloseTo(45, 0)
  })
})

describe('lanhu fills + rotation + strokeAlign', () => {
  it('stores fill stack, rotation, and border align', () => {
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
                rotation: 15,
                fills: [
                  { type: 'color', color: { r: 255, g: 0, b: 0, a: 1 }, opacity: 0.8 },
                  { type: 'color', color: { r: 0, g: 0, b: 255, a: 1 } },
                ],
                borders: [
                  {
                    thickness: 2,
                    color: { r: 0, g: 0, b: 0, a: 1 },
                    position: 'inside',
                  },
                ],
              },
            ],
          },
        ],
      },
      { name: 'page' },
    )
    const n = leaf(doc)
    expect(n.style.rotation).toBe(15)
    expect(n.style.fills).toHaveLength(2)
    expect(n.style.strokeAlign).toBe('inside')
  })
})

describe('CSS rotate + fills + box-sizing', () => {
  it('parses transform rotate and independent rotate', () => {
    expect(parseCssRotate('rotate(15deg)')).toBe(15)
    expect(parseCssRotate('rotateZ(0.5turn)')).toBe(180)
    const parsed = parseCssDeclarations(
      'transform: translate(10px, 4px) rotate(-12deg); box-sizing: border-box',
    )
    expect(parsed.style.rotation).toBe(-12)
    expect(parsed.x).toBe(10)
    expect(parsed.y).toBe(4)
    expect(parsed.style.strokeAlign).toBe('inside')
  })

  it('builds multi-layer background fills', () => {
    const fills = parseCssBackgroundFills(
      'linear-gradient(90deg, #ff0000, #0000ff), rgba(0,0,0,0.2)',
    )
    expect(fills).toHaveLength(2)
    expect(fills[0]?.type).toBe('gradient')
    expect(fills[1]?.type).toBe('solid')
    const parsed = parseCssDeclarations(
      'background: linear-gradient(180deg, #fff, #eee), #112233',
    )
    expect(parsed.style.fills?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('native rotation parsers', () => {
  it('parses Android android:rotation', () => {
    const resources = buildAndroidResources([])
    const doc = normalizeAndroidLayout(
      `<?xml version="1.0" encoding="utf-8"?>
      <TextView xmlns:android="http://schemas.android.com/apk/res/android"
         android:layout_width="wrap_content"
         android:layout_height="wrap_content"
         android:text="Hi"
         android:rotation="20" />`,
      resources,
    )
    expect(leaf(doc).style.rotation).toBe(20)
  })

  it('parses Compose / SwiftUI / Flutter / RN / ArkUI rotate', () => {
    expect(
      leaf(
        composeSourceToDesignDoc(
          `Text("Hi", modifier = Modifier.rotate(15.deg))`,
          'Home',
        ),
      ).style.rotation,
    ).toBe(15)

    expect(
      leaf(
        swiftuiSourceToDesignDoc(
          `Text("Hi").rotationEffect(.degrees(-10))`,
          'Home',
        ),
      ).style.rotation,
    ).toBe(-10)

    expect(
      leaf(
        flutterSourceToDesignDoc(
          `Text('Hi'); Transform.rotate(angle: 0.5235987755982988, child: Text('X'))`,
          'Home',
        ),
      ).style.rotation,
    ).toBeCloseTo(30, 0)

    expect(
      leaf(
        reactNativeSourceToDesignDoc(
          `<Text style={{ transform: [{ rotate: '12deg' }] }}>Hi</Text>`,
          'Home',
        ),
      ).style.rotation,
    ).toBe(12)

    expect(
      leaf(arkuiSourceToDesignDoc(`Text('Hi').rotate({ angle: 8 })`, 'Home')).style
        .rotation,
    ).toBe(8)
  })
})

describe('compare fills + rotation', () => {
  it('fingerprints fill stacks and soft-diffs rotation', () => {
    const fp = serializeFills([
      { type: 'solid', color: '#ff0000' },
      { type: 'image', imageRef: 'a', imageFit: 'cover' },
    ])
    expect(fp).toContain('solid:#ff0000')
    expect(fp).toContain('image:a:cover')

    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'card',
        kind: 'shape',
        box: {},
        style: {
          rotation: 15,
          fills: [
            { type: 'solid', color: '#ffffff' },
            { type: 'solid', color: '#00000080' },
          ],
          strokeAlign: 'inside',
        },
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
        style: { rotation: 10, fills: [{ type: 'solid', color: '#ffffff' }] },
        children: [],
      },
      scale: 1,
    }
    const result = compareVisualDocs(design, code)
    const props = result.diffs.map((d) => d.property)
    expect(props).toContain('rotation')
    expect(props).toContain('fills')
    expect(result.diffs.find((d) => d.property === 'rotation')?.needsReview).toBe(true)
  })
})
