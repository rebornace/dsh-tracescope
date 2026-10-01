import { describe, expect, it } from 'vitest'
import { parseCssDeclarations } from '../src/design/adapters/web-css.js'
import { compareVisualDocs } from '../src/design/compare.js'
import { normalizeFigmaTree } from '../src/design/sources/figma.js'
import { normalizeLanhuAnnotation } from '../src/design/sources/lanhu.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

describe('figma DROP_SHADOW and individualStrokeWeights', () => {
  it('maps DROP_SHADOW radius to elevation', () => {
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'card',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
      fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
      effects: [
        { type: 'DROP_SHADOW', visible: true, radius: 8, offset: { x: 0, y: 2 } },
        { type: 'DROP_SHADOW', visible: true, radius: 12, offset: { x: 0, y: 4 } },
        { type: 'INNER_SHADOW', visible: true, radius: 99 },
      ],
    })
    expect(doc.root.style.elevation).toBe(12)
  })

  it('maps individualStrokeWeights to per-side borders', () => {
    const doc = normalizeFigmaTree({
      id: '1:2',
      name: 'divider',
      type: 'RECTANGLE',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 1 },
      strokes: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0, a: 1 } }],
      individualStrokeWeights: { top: 0, right: 0, bottom: 2, left: 0 },
    })
    expect(doc.root.style.borderBottomWidth).toBe(2)
    expect(doc.root.style.borderTopWidth).toBeUndefined()
    expect(doc.root.style.borderBottomColor).toBe('#000000')
    expect(doc.root.style.borderWidth).toBeUndefined()
  })
})

describe('lanhu shadow blur → elevation', () => {
  it('takes max blur from shadows array (1x after ArtboardScale)', () => {
    const doc = normalizeLanhuAnnotation(
      {
        ArtboardScale: 2,
        info: [
          {
            id: 'board-1',
            name: '首页',
            width: 750,
            height: 1624,
            left: 0,
            top: 0,
            layers: [
              {
                id: 'c1',
                name: 'card',
                type: 'shape',
                width: 200,
                height: 80,
                left: 0,
                top: 0,
                fills: [{ type: 'color', color: '#ffffff' }],
                shadows: [
                  { blur: 8, offsetX: 0, offsetY: 2 },
                  { blur: 20, offsetX: 0, offsetY: 4 },
                ],
              },
            ],
          },
        ],
      },
      { imageId: 'img-1', name: '首页' },
    )
    const card = doc.root.children.find((c) => c.name === 'card')
    expect(card?.style.elevation).toBe(10)
  })
})

describe('css per-side borders', () => {
  it('parses border-top / border-*-width / border-*-color', () => {
    const a = parseCssDeclarations('border-top: 2px solid #112233').style
    expect(a.borderTopWidth).toBe(2)
    expect(a.borderTopColor).toBe('#112233')

    const b = parseCssDeclarations(
      'border-left-width: 1px; border-left-color: #abcdef; border-bottom-width: 3px',
    ).style
    expect(b.borderLeftWidth).toBe(1)
    expect(b.borderLeftColor).toBe('#abcdef')
    expect(b.borderBottomWidth).toBe(3)
  })

  it('compare diffs per-side border width', () => {
    const leaf = (
      partial: Partial<DesignNode> & Pick<DesignNode, 'id' | 'name' | 'kind'>,
    ): DesignNode => ({
      box: {},
      style: {},
      children: [],
      ...partial,
    })
    const design: DesignDoc = {
      root: leaf({
        id: 'd',
        name: 'row',
        kind: 'view',
        style: { borderBottomWidth: 2, borderBottomColor: '#000000' },
      }),
      scale: 1,
      source: 'manual',
    }
    const code: DesignDoc = {
      root: leaf({
        id: 'c',
        name: 'row',
        kind: 'view',
        style: { borderBottomWidth: 1, borderBottomColor: '#000000' },
      }),
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    expect(result.diffs.some((d) => d.property === 'borderBottomWidth')).toBe(true)
  })
})
