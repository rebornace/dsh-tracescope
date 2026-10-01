import { describe, expect, it } from 'vitest'
import {
  flutterSourceToDesignDoc,
  reactNativeSourceToDesignDoc,
  swiftuiSourceToDesignDoc,
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

describe('figma flexWrap + alignSelf + flexGrow', () => {
  it('maps layoutWrap / layoutAlign / layoutGrow', () => {
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'Chip',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      layoutWrap: 'WRAP',
      layoutAlign: 'CENTER',
      layoutGrow: 1,
      absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 40 },
      fills: [],
    })
    expect(doc.root.style.flexWrap).toBe('wrap')
    expect(doc.root.style.alignSelf).toBe('center')
    expect(doc.root.style.flexGrow).toBe(1)
  })
})

describe('CSS flex-wrap / align-self / flex-grow|shrink', () => {
  it('parses flex child props', () => {
    const parsed = parseCssDeclarations(
      'flex-wrap: wrap; align-self: flex-end; flex-grow: 2; flex-shrink: 0',
    )
    expect(parsed.style).toMatchObject({
      flexWrap: 'wrap',
      alignSelf: 'end',
      flexGrow: 2,
      flexShrink: 0,
    })
  })
})

describe('native flex child', () => {
  it('parses Flutter Expanded + Wrap + Align', () => {
    const n = leaf(
      flutterSourceToDesignDoc(
        `Wrap(children: [Expanded(flex: 2, child: Align(alignment: Alignment.centerRight, child: Text('Hi')))])`,
        'Home',
      ),
    )
    expect(n.style.flexWrap).toBe('wrap')
    expect(n.style.flexGrow).toBe(2)
    expect(n.style.alignSelf).toBe('end')
  })

  it('parses SwiftUI layoutPriority + RN flex child', () => {
    expect(
      leaf(swiftuiSourceToDesignDoc(`Text("Hi").layoutPriority(1)`, 'Home')).style.flexGrow,
    ).toBe(1)

    expect(
      leaf(
        reactNativeSourceToDesignDoc(
          `<Text style={{ flexWrap: 'wrap', alignSelf: 'stretch', flexGrow: 1, flexShrink: 0 }}>Hi</Text>`,
          'Home',
        ),
      ).style,
    ).toMatchObject({
      flexWrap: 'wrap',
      alignSelf: 'stretch',
      flexGrow: 1,
      flexShrink: 0,
    })
  })
})

describe('compare soft-review for flex child', () => {
  it('flags flexWrap / alignSelf / flexGrow mismatches as needsReview', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'row',
        kind: 'frame',
        box: { width: 200, height: 40 },
        style: { flexWrap: 'wrap', alignSelf: 'center', flexGrow: 1 },
        children: [],
      },
      scale: 1,
      source: 'figma',
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 'row',
        kind: 'frame',
        box: { width: 200, height: 40 },
        style: { flexWrap: 'nowrap', alignSelf: 'start', flexGrow: 0 },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    const byProp = Object.fromEntries(result.diffs.map((d) => [d.property, d]))
    expect(byProp.flexWrap?.needsReview).toBe(true)
    expect(byProp.alignSelf?.needsReview).toBe(true)
    expect(byProp.flexGrow?.needsReview).toBe(true)
  })
})
