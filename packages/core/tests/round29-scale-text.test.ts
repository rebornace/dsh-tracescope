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
  parseCssDeclarations,
  parseCssScale,
  parseCssTextDecoration,
  parseCssTextTransform,
} from '../src/design/adapters/web-css.js'
import { compareVisualDocs } from '../src/design/compare.js'
import { normalizeFigmaTree } from '../src/design/sources/figma.js'
import { normalizeLanhuAnnotation } from '../src/design/sources/lanhu.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

function leaf(doc: DesignDoc): DesignNode {
  const walk = (n: DesignNode): DesignNode =>
    n.children.length ? walk(n.children[0]!) : n
  return walk(doc.root)
}

describe('figma scale + text decoration/case', () => {
  it('extracts scale from relativeTransform and text decoration', () => {
    const angle = Math.PI / 6
    const sx = 1.5
    const sy = 0.8
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'badge',
      type: 'TEXT',
      absoluteBoundingBox: { x: 0, y: 0, width: 80, height: 20 },
      characters: 'Hi',
      relativeTransform: [
        [Math.cos(angle) * sx, -Math.sin(angle) * sy, 0],
        [Math.sin(angle) * sx, Math.cos(angle) * sy, 0],
      ],
      style: {
        fontSize: 14,
        fontWeight: 400,
        textDecoration: 'UNDERLINE',
        textCase: 'UPPER',
        textAlignHorizontal: 'LEFT',
      },
      fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0, a: 1 } }],
    })
    expect(doc.root.style.scaleX).toBeCloseTo(1.5, 2)
    expect(doc.root.style.scaleY).toBeCloseTo(0.8, 2)
    expect(doc.root.style.rotation).toBeCloseTo(30, 0)
    expect(doc.root.style.textDecoration).toBe('underline')
    expect(doc.root.style.textTransform).toBe('uppercase')
  })
})

describe('lanhu scale + text decoration', () => {
  it('maps scale and underline/uppercase', () => {
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
                name: 'title',
                type: 'text',
                width: 100,
                height: 20,
                left: 0,
                top: 0,
                scaleX: 1.2,
                scaleY: 1.2,
                style: {
                  fontSize: 16,
                  textDecoration: 'underline',
                  textTransform: 'uppercase',
                },
                textInfo: { text: 'Hello', size: 16 },
              },
            ],
          },
        ],
      },
      { name: 'page' },
    )
    const n = leaf(doc)
    expect(n.style.scaleX).toBe(1.2)
    expect(n.style.scaleY).toBe(1.2)
    expect(n.style.textDecoration).toBe('underline')
    expect(n.style.textTransform).toBe('uppercase')
  })
})

describe('CSS scale + text decoration/transform', () => {
  it('parses scale helpers and declarations', () => {
    expect(parseCssScale('scale(1.25)')).toEqual({ scaleX: 1.25, scaleY: 1.25 })
    expect(parseCssScale('scale(1.5, 0.5)')).toEqual({ scaleX: 1.5, scaleY: 0.5 })
    expect(parseCssTextDecoration('underline line-through')).toBe('underline line-through')
    expect(parseCssTextTransform('uppercase')).toBe('uppercase')

    const parsed = parseCssDeclarations(
      'transform: scale(1.2) rotate(10deg); text-decoration: underline; text-transform: uppercase',
    )
    expect(parsed.style.scaleX).toBe(1.2)
    expect(parsed.style.scaleY).toBe(1.2)
    expect(parsed.style.rotation).toBe(10)
    expect(parsed.style.textDecoration).toBe('underline')
    expect(parsed.style.textTransform).toBe('uppercase')
  })
})

describe('native scale + text decoration', () => {
  it('parses Android scaleX/Y and textAllCaps', () => {
    const resources = buildAndroidResources([])
    const doc = normalizeAndroidLayout(
      `<?xml version="1.0" encoding="utf-8"?>
      <TextView xmlns:android="http://schemas.android.com/apk/res/android"
         android:layout_width="wrap_content"
         android:layout_height="wrap_content"
         android:text="Hi"
         android:scaleX="1.5"
         android:scaleY="0.75"
         android:textAllCaps="true" />`,
      resources,
    )
    const n = leaf(doc)
    expect(n.style.scaleX).toBe(1.5)
    expect(n.style.scaleY).toBe(0.75)
    expect(n.style.textTransform).toBe('uppercase')
  })

  it('parses Compose / SwiftUI / Flutter / RN / ArkUI scale + underline', () => {
    expect(
      leaf(
        composeSourceToDesignDoc(
          `Text("Hi", modifier = Modifier.scale(1.25f), style = TextStyle(textDecoration = TextDecoration.Underline))`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ scaleX: 1.25, scaleY: 1.25, textDecoration: 'underline' })

    expect(
      leaf(
        swiftuiSourceToDesignDoc(
          `Text("Hi").scaleEffect(1.3).underline().textCase(.uppercase)`,
          'Home',
        ),
      ).style,
    ).toMatchObject({
      scaleX: 1.3,
      scaleY: 1.3,
      textDecoration: 'underline',
      textTransform: 'uppercase',
    })

    expect(
      leaf(
        flutterSourceToDesignDoc(
          `Transform.scale(scale: 1.4, child: Text('Hi', style: TextStyle(decoration: TextDecoration.underline)))`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ scaleX: 1.4, scaleY: 1.4, textDecoration: 'underline' })

    expect(
      leaf(
        reactNativeSourceToDesignDoc(
          `<Text style={{ transform: [{ scale: 1.1 }], textDecorationLine: 'underline', textTransform: 'uppercase' }}>Hi</Text>`,
          'Home',
        ),
      ).style,
    ).toMatchObject({
      scaleX: 1.1,
      scaleY: 1.1,
      textDecoration: 'underline',
      textTransform: 'uppercase',
    })

    expect(
      leaf(arkuiSourceToDesignDoc(`Text('Hi').scale(1.2)`, 'Home')).style.scaleX,
    ).toBe(1.2)
  })
})

describe('compare scale + text decoration', () => {
  it('soft-diffs scale and text decoration mismatches', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'label',
        kind: 'text',
        text: 'Hi',
        box: {},
        style: { scaleX: 1.5, scaleY: 1.5, textDecoration: 'underline', textTransform: 'uppercase' },
        children: [],
      },
      scale: 1,
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 'label',
        kind: 'text',
        text: 'Hi',
        box: {},
        style: { scaleX: 1.2, textDecoration: 'line-through' },
        children: [],
      },
      scale: 1,
    }
    const result = compareVisualDocs(design, code)
    const props = result.diffs.map((d) => d.property)
    expect(props).toContain('scaleX')
    expect(props).toContain('textDecoration')
    expect(props).toContain('textTransform')
    expect(result.diffs.every((d) => d.needsReview)).toBe(true)
  })
})
