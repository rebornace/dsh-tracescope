import { describe, expect, it } from 'vitest'
import {
  flutterSourceToDesignDoc,
  reactNativeSourceToDesignDoc,
} from '../src/design/adapters/declarative-design-doc.js'
import { parseCssDeclarations } from '../src/design/adapters/web-css.js'
import { compareVisualDocs } from '../src/design/compare.js'
import { normalizeFigmaTree } from '../src/design/sources/figma.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

function leaf(doc: DesignDoc): DesignNode {
  const walk = (n: DesignNode): DesignNode =>
    n.children.length ? walk(n.children[0]!) : n
  return walk(doc.root)
}

describe('figma alignContent when wrapping', () => {
  it('maps counterAxisAlignContent SPACE_BETWEEN', () => {
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'Chips',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      layoutWrap: 'WRAP',
      counterAxisAlignContent: 'SPACE_BETWEEN',
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 80 },
      fills: [],
    })
    expect(doc.root.style.flexWrap).toBe('wrap')
    expect(doc.root.style.alignContent).toBe('space-between')
  })
})

describe('CSS align-content / order / grid-template', () => {
  it('parses packed lines, order, and grid fingerprint', () => {
    const parsed = parseCssDeclarations(
      'align-content: space-around; order: 2; grid-template-columns: repeat(3, 1fr); grid-template-rows: auto 40px',
    )
    expect(parsed.style.alignContent).toBe('space-around')
    expect(parsed.style.order).toBe(2)
    expect(parsed.style.gridTemplate).toBe('cols:1fr 1fr 1fr|rows:auto 40px')
    expect(parsed.style.display).toBe('grid')
  })
})

describe('native alignContent', () => {
  it('parses Flutter Wrap runAlignment + RN alignContent/order', () => {
    expect(
      leaf(
        flutterSourceToDesignDoc(
          `Wrap(runAlignment: WrapAlignment.spaceBetween, children: [Text('Hi')])`,
          'Home',
        ),
      ).style.alignContent,
    ).toBe('space-between')

    expect(
      leaf(
        reactNativeSourceToDesignDoc(
          `<Text style={{ flexWrap: 'wrap', alignContent: 'center', order: 3 }}>Hi</Text>`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ flexWrap: 'wrap', alignContent: 'center', order: 3 })
  })
})

describe('compare soft-review for alignContent / order / grid', () => {
  it('flags mismatches as needsReview', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'grid',
        kind: 'frame',
        box: { width: 200, height: 100 },
        style: {
          alignContent: 'space-between',
          order: 2,
          gridTemplate: 'cols:1fr 1fr',
        },
        children: [],
      },
      scale: 1,
      source: 'figma',
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 'grid',
        kind: 'frame',
        box: { width: 200, height: 100 },
        style: {
          alignContent: 'start',
          order: 0,
          gridTemplate: 'cols:1fr',
        },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    const byProp = Object.fromEntries(result.diffs.map((d) => [d.property, d]))
    expect(byProp.alignContent?.needsReview).toBe(true)
    expect(byProp.order?.needsReview).toBe(true)
    expect(byProp.gridTemplate?.needsReview).toBe(true)
  })
})
