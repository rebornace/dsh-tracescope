import { describe, expect, it } from 'vitest'
import { parseCssBoxShadowEffects, parseCssDeclarations } from '../src/design/adapters/web-css.js'
import { compareVisualDocs, serializeShadows } from '../src/design/compare.js'
import { normalizeFigmaBlendMode, normalizeFigmaTree } from '../src/design/sources/figma.js'
import { normalizeLanhuAnnotation } from '../src/design/sources/lanhu.js'
import type { DesignDoc } from '../src/design/types.js'

describe('figma multi-shadow + blendMode', () => {
  it('keeps full DROP_SHADOW stack and maps blendMode', () => {
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'card',
      type: 'FRAME',
      blendMode: 'MULTIPLY',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
      fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
      effects: [
        {
          type: 'DROP_SHADOW',
          visible: true,
          radius: 4,
          offset: { x: 0, y: 1 },
          color: { r: 0, g: 0, b: 0, a: 0.1 },
        },
        {
          type: 'DROP_SHADOW',
          visible: true,
          radius: 12,
          offset: { x: 0, y: 6 },
          color: { r: 0, g: 0, b: 0, a: 0.2 },
        },
        {
          type: 'INNER_SHADOW',
          visible: true,
          radius: 2,
          offset: { x: 0, y: 1 },
        },
      ],
    })
    expect(doc.root.style.shadows).toHaveLength(3)
    expect(doc.root.style.shadows?.filter((s) => !s.inset)).toHaveLength(2)
    expect(doc.root.style.shadow?.blur).toBe(12)
    expect(doc.root.style.insetShadow?.inset).toBe(true)
    expect(doc.root.style.blendMode).toBe('multiply')
  })

  it('omits PASS_THROUGH blend', () => {
    expect(normalizeFigmaBlendMode('PASS_THROUGH')).toBeUndefined()
    expect(normalizeFigmaBlendMode('NORMAL')).toBeUndefined()
    expect(normalizeFigmaBlendMode('SOFT_LIGHT')).toBe('soft-light')
  })
})

describe('lanhu multi-shadow + blend', () => {
  it('stores stack and blendMode', () => {
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
                blendMode: 'multiply',
                fills: [{ type: 'color', color: { r: 255, g: 255, b: 255, a: 1 } }],
                shadows: [
                  { blur: 4, offsetX: 0, offsetY: 1 },
                  { blur: 10, offsetX: 0, offsetY: 4 },
                  { blur: 2, inset: true },
                ],
              },
            ],
          },
        ],
      },
      { imageId: 'img-1', name: '页' },
    )
    const card = doc.root.children.find((c) => c.name === 'card')
    expect(card?.style.shadows).toHaveLength(3)
    expect(card?.style.elevation).toBe(10)
    expect(card?.style.blendMode).toBe('multiply')
  })
})

describe('css multi-shadow + % geometry + blend', () => {
  it('keeps ordered shadow stack', () => {
    const fx = parseCssBoxShadowEffects(
      '0 1px 2px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.2), inset 0 1px 2px #00000033',
    )
    expect(fx.shadows).toHaveLength(3)
    expect(fx.shadows?.[2]?.inset).toBe(true)
    expect(fx.elevation).toBe(12)
  })

  it('resolves percentage width/height against L1 viewport', () => {
    const parsed = parseCssDeclarations('width: 50%; height: 25%; mix-blend-mode: multiply')
    expect(parsed.width).toBe(180)
    expect(parsed.height).toBe(160)
    expect(parsed.style.blendMode).toBe('multiply')
  })
})

describe('compare shadows stack + blendMode', () => {
  it('diffs shadow stack fingerprint', () => {
    const fp = serializeShadows([
      { offsetX: 0, offsetY: 1, blur: 2 },
      { offsetX: 0, offsetY: 4, blur: 8, inset: true },
    ])
    expect(fp).toContain('|')
    expect(fp?.endsWith(',i')).toBe(true)

    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'card',
        kind: 'shape',
        box: {},
        style: {
          shadows: [
            { offsetX: 0, offsetY: 1, blur: 2 },
            { offsetX: 0, offsetY: 4, blur: 8 },
          ],
          blendMode: 'multiply',
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
          shadows: [{ offsetX: 0, offsetY: 4, blur: 8 }],
        },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    expect(result.diffs.some((d) => d.property === 'shadows')).toBe(true)
    const blend = result.diffs.find((d) => d.property === 'blendMode')
    expect(blend?.needsReview).toBe(true)
  })
})
