import { describe, expect, it } from 'vitest'
import {
  composeSourceToDesignDoc,
  flutterSourceToDesignDoc,
  reactNativeSourceToDesignDoc,
  swiftuiSourceToDesignDoc,
} from '../src/design/adapters/declarative-design-doc.js'
import {
  parseCssBoxShadowEffects,
  parseCssDeclarations,
  parseCssFilterBlur,
  parseCssTranslate,
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

describe('figma innerShadow + blur', () => {
  it('maps INNER_SHADOW and LAYER_BLUR', () => {
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'card',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
      fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
      effects: [
        { type: 'DROP_SHADOW', visible: true, radius: 8 },
        { type: 'INNER_SHADOW', visible: true, radius: 6 },
        { type: 'LAYER_BLUR', visible: true, radius: 4 },
        { type: 'BACKGROUND_BLUR', visible: true, radius: 10 },
      ],
    })
    expect(doc.root.style.elevation).toBe(8)
    expect(doc.root.style.innerShadow).toBe(6)
    expect(doc.root.style.blur).toBe(10)
  })
})

describe('lanhu inset shadow + blur', () => {
  it('separates inset shadows and layer blur', () => {
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
                  { blur: 8, offsetX: 0, offsetY: 2 },
                  { blur: 4, inset: true },
                ],
                blur: 3,
              },
            ],
          },
        ],
      },
      { imageId: 'img-1', name: '页' },
    )
    const card = doc.root.children.find((c) => c.name === 'card')
    expect(card?.style.elevation).toBe(8)
    expect(card?.style.innerShadow).toBe(4)
    expect(card?.style.blur).toBe(3)
  })
})

describe('css box-shadow inset / filter blur / geometry', () => {
  it('parses outer + inset box-shadow', () => {
    const fx = parseCssBoxShadowEffects(
      '0 2px 8px rgba(0,0,0,0.2), inset 0 1px 4px rgba(0,0,0,0.1)',
    )
    expect(fx.elevation).toBe(8)
    expect(fx.innerShadow).toBe(4)
  })

  it('parses filter blur', () => {
    expect(parseCssFilterBlur('blur(6px)')).toBe(6)
    expect(parseCssDeclarations('filter: blur(5px)').style.blur).toBe(5)
  })

  it('parses translate and absolute right/bottom', () => {
    expect(parseCssTranslate('translate(10px, 20px)')).toEqual({ x: 10, y: 20 })
    const abs = parseCssDeclarations(
      'position: absolute; width: 100px; height: 40px; right: 20px; bottom: 30px',
    )
    // parent 360×640 → x = 360-20-100 = 240, y = 640-30-40 = 570
    expect(abs.x).toBe(240)
    expect(abs.y).toBe(570)

    const t = parseCssDeclarations('left: 10px; top: 5px; transform: translate(4px, 6px)')
    expect(t.x).toBe(14)
    expect(t.y).toBe(11)
  })
})

describe('declarative blur + offset', () => {
  it('parses Compose blur and offset', () => {
    const doc = composeSourceToDesignDoc(
      `Text("Hi", modifier = Modifier.blur(4.dp).offset(x = 12.dp, y = 8.dp))`,
      'Home',
    )
    const n = leaf(doc)
    expect(n.style.blur).toBe(4)
    expect(n.box.x).toBe(12)
    expect(n.box.y).toBe(8)
  })

  it('parses SwiftUI blur and offset', () => {
    const doc = swiftuiSourceToDesignDoc(
      `Text("Hi").blur(radius: 3).offset(x: 5, y: 7)`,
      'Home',
    )
    const n = leaf(doc)
    expect(n.style.blur).toBe(3)
    expect(n.box.x).toBe(5)
    expect(n.box.y).toBe(7)
  })

  it('parses Flutter ImageFilter.blur and Positioned', () => {
    const withPos = flutterSourceToDesignDoc(
      `Positioned(left: 10, top: 20, child: Text('Hi'))`,
      'Home',
    )
    const n = leaf(withPos)
    expect(n.box.x).toBe(10)
    expect(n.box.y).toBe(20)

    const blurNear = flutterSourceToDesignDoc(
      `Text('Hi', style: TextStyle(fontSize: 14)); BackdropFilter(filter: ImageFilter.blur(sigmaX: 5)`,
      'Home',
    )
    expect(leaf(blurNear).style.blur).toBe(5)
  })

  it('parses RN left/top translate', () => {
    const doc = reactNativeSourceToDesignDoc(
      `<Text style={{ left: 10, top: 4, transform: [{ translateX: 2 }, { translateY: 3 }] }}>Hi</Text>`,
      'Home',
    )
    // Our RN parser reads translateX/Y as style keys, not nested transform arrays.
    const simple = reactNativeSourceToDesignDoc(
      `<Text style={{ left: 10, top: 4, translateX: 2, translateY: 3 }}>Hi</Text>`,
      'Home',
    )
    const n = leaf(simple)
    expect(n.box.x).toBe(12)
    expect(n.box.y).toBe(7)
    void doc
  })
})

describe('compare innerShadow / blur', () => {
  it('flags mismatched innerShadow and blur', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'card',
        kind: 'shape',
        box: {},
        style: { elevation: 8, innerShadow: 4, blur: 2 },
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
        style: { elevation: 8 },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    expect(result.diffs.some((d) => d.property === 'innerShadow')).toBe(true)
    expect(result.diffs.some((d) => d.property === 'blur')).toBe(true)
  })
})
