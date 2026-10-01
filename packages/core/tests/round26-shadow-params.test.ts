import { describe, expect, it } from 'vitest'
import {
  flutterSourceToDesignDoc,
  reactNativeSourceToDesignDoc,
  swiftuiSourceToDesignDoc,
} from '../src/design/adapters/declarative-design-doc.js'
import { parseCssBoxShadowEffects, parseCssDeclarations } from '../src/design/adapters/web-css.js'
import { compareVisualDocs, serializeShadow } from '../src/design/compare.js'
import { normalizeFigmaTree } from '../src/design/sources/figma.js'
import { normalizeLanhuAnnotation } from '../src/design/sources/lanhu.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

function leaf(doc: DesignDoc): DesignNode {
  const walk = (n: DesignNode): DesignNode =>
    n.children.length ? walk(n.children[0]!) : n
  return walk(doc.root)
}

describe('figma full drop/inset shadow', () => {
  it('captures offset, spread, color on DROP_SHADOW / INNER_SHADOW', () => {
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'card',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
      fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
      effects: [
        {
          type: 'DROP_SHADOW',
          visible: true,
          radius: 8,
          spread: 2,
          offset: { x: 0, y: 4 },
          color: { r: 0, g: 0, b: 0, a: 0.25 },
        },
        {
          type: 'INNER_SHADOW',
          visible: true,
          radius: 3,
          offset: { x: 1, y: 1 },
          color: { r: 0, g: 0, b: 0, a: 0.5 },
        },
      ],
    })
    expect(doc.root.style.elevation).toBe(8)
    expect(doc.root.style.shadow).toEqual({
      offsetX: 0,
      offsetY: 4,
      blur: 8,
      spread: 2,
      color: '#00000040',
    })
    expect(doc.root.style.innerShadow).toBe(3)
    expect(doc.root.style.insetShadow?.offsetX).toBe(1)
    expect(doc.root.style.insetShadow?.blur).toBe(3)
    expect(doc.root.style.insetShadow?.color).toBe('#00000080')
  })
})

describe('lanhu full shadow', () => {
  it('keeps offset and color on outer/inset shadows', () => {
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
                fills: [{ type: 'color', color: { r: 255, g: 255, b: 255, a: 1 } }],
                shadows: [
                  {
                    blur: 10,
                    offsetX: 0,
                    offsetY: 4,
                    spread: 1,
                    color: { r: 0, g: 0, b: 0, a: 0.2 },
                  },
                  { blur: 2, offsetX: 0, offsetY: 1, inset: true },
                ],
              },
            ],
          },
        ],
      },
      { imageId: 'img-1', name: '页' },
    )
    const card = doc.root.children.find((c) => c.name === 'card')
    expect(card?.style.shadow).toMatchObject({
      offsetX: 0,
      offsetY: 4,
      blur: 10,
      spread: 1,
    })
    expect(card?.style.insetShadow?.blur).toBe(2)
  })
})

describe('css full box-shadow + stretch geometry', () => {
  it('parses offset/spread/color', () => {
    const fx = parseCssBoxShadowEffects('0 4px 12px 2px rgba(0,0,0,0.2)')
    expect(fx.shadow).toEqual({
      offsetX: 0,
      offsetY: 4,
      blur: 12,
      spread: 2,
      color: '#00000033',
    })
    expect(fx.elevation).toBe(12)
  })

  it('infers width from left+right stretch', () => {
    const parsed = parseCssDeclarations(
      'position: absolute; left: 16px; right: 16px; top: 8px; bottom: 8px',
    )
    expect(parsed.width).toBe(328) // 360 - 16 - 16
    expect(parsed.height).toBe(624) // 640 - 8 - 8
    expect(parsed.x).toBe(16)
    expect(parsed.y).toBe(8)
  })
})

describe('declarative full shadow', () => {
  it('parses SwiftUI shadow color/x/y', () => {
    const doc = swiftuiSourceToDesignDoc(
      `Text("Hi").shadow(color: .black, radius: 8, x: 0, y: 4)`,
      'Home',
    )
    expect(leaf(doc).style.shadow).toEqual({
      offsetX: 0,
      offsetY: 4,
      blur: 8,
      color: '#000000',
    })
  })

  it('parses Flutter BoxShadow', () => {
    const doc = flutterSourceToDesignDoc(
      `Text('Hi'); Container(decoration: BoxDecoration(boxShadow: [BoxShadow(color: Color(0x33000000), offset: Offset(0, 4), blurRadius: 12, spreadRadius: 1)]))`,
      'Home',
    )
    // BoxShadow may be outside Text window — put it near Text:
    const near = flutterSourceToDesignDoc(
      `Container(decoration: BoxDecoration(boxShadow: [BoxShadow(color: Color(0x33000000), offset: Offset(0, 4), blurRadius: 12, spreadRadius: 1)]), child: Text('Hi'))`,
      'Home',
    )
    expect(leaf(near).style.shadow).toMatchObject({
      offsetX: 0,
      offsetY: 4,
      blur: 12,
      spread: 1,
    })
    void doc
  })

  it('parses RN shadowOffset / shadowColor', () => {
    const doc = reactNativeSourceToDesignDoc(
      `<Text style={{ shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowRadius: 6, shadowOpacity: 0.25 }}>Hi</Text>`,
      'Home',
    )
    const sh = leaf(doc).style.shadow
    expect(sh?.offsetY).toBe(3)
    expect(sh?.blur).toBe(6)
    expect(sh?.color).toBe('#00000040')
  })
})

describe('compare shadow fingerprint', () => {
  it('serializes and diffs shadow params', () => {
    expect(
      serializeShadow({ offsetX: 0, offsetY: 4, blur: 8, spread: 1, color: '#00000040' }),
    ).toBe('0,4,8,1,#00000040,o')

    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'card',
        kind: 'shape',
        box: {},
        style: {
          shadow: { offsetX: 0, offsetY: 4, blur: 8, color: '#00000040' },
          elevation: 8,
        },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 'card',
        kind: 'shape',
        box: {},
        style: {
          shadow: { offsetX: 0, offsetY: 2, blur: 8, color: '#00000040' },
          elevation: 8,
        },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    expect(result.diffs.some((d) => d.property === 'shadow')).toBe(true)
  })
})
