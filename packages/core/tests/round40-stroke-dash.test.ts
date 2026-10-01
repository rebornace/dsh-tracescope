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

describe('figma strokeDashArray + strokeCap + strokeJoin', () => {
  it('keeps exact dashes and maps cap/join', () => {
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'Line',
      type: 'RECTANGLE',
      strokeWeight: 2,
      strokeDashes: [8, 4],
      strokeCap: 'ROUND',
      strokeJoin: 'BEVEL',
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 2 },
      fills: [],
    })
    expect(doc.root.style.borderStyle).toBe('dashed')
    expect(doc.root.style.strokeDashArray).toBe('8,4')
    expect(doc.root.style.strokeCap).toBe('round')
    expect(doc.root.style.strokeJoin).toBe('bevel')
  })
})

describe('CSS stroke-dasharray / linecap / linejoin', () => {
  it('parses SVG stroke props', () => {
    const parsed = parseCssDeclarations(
      'stroke-dasharray: 6 3; stroke-linecap: round; stroke-linejoin: bevel',
    )
    expect(parsed.style).toMatchObject({
      strokeDashArray: '6,3',
      borderStyle: 'dashed',
      strokeCap: 'round',
      strokeJoin: 'bevel',
    })
  })
})

describe('native stroke dash + cap', () => {
  it('parses Flutter dashPattern + SwiftUI dash + RN strokeDasharray', () => {
    expect(
      leaf(
        flutterSourceToDesignDoc(
          `BorderSide(dashPattern: [5.0, 2.0], strokeCap: StrokeCap.round, child: Text('Hi'))`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ strokeDashArray: '5,2', strokeCap: 'round', borderStyle: 'dashed' })

    expect(
      leaf(
        swiftuiSourceToDesignDoc(
          `Text("Hi").stroke(style: StrokeStyle(dash: [4, 2], lineCap: .round, lineJoin: .bevel))`,
          'Home',
        ),
      ).style,
    ).toMatchObject({
      strokeDashArray: '4,2',
      strokeCap: 'round',
      strokeJoin: 'bevel',
      borderStyle: 'dashed',
    })

    expect(
      leaf(
        reactNativeSourceToDesignDoc(
          `<Text style={{ strokeDasharray: '3,3', strokeLinecap: 'square', strokeLinejoin: 'miter' }}>Hi</Text>`,
          'Home',
        ),
      ).style,
    ).toMatchObject({
      strokeDashArray: '3,3',
      strokeCap: 'square',
      strokeJoin: 'miter',
      borderStyle: 'dashed',
    })
  })
})

describe('compare soft-review for stroke dash/cap/join', () => {
  it('flags mismatches as needsReview', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'line',
        kind: 'shape',
        box: { width: 100, height: 2 },
        style: { strokeDashArray: '8,4', strokeCap: 'round', strokeJoin: 'bevel' },
        children: [],
      },
      scale: 1,
      source: 'figma',
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 'line',
        kind: 'shape',
        box: { width: 100, height: 2 },
        style: { strokeDashArray: '4,2', strokeCap: 'butt', strokeJoin: 'miter' },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    const byProp = Object.fromEntries(result.diffs.map((d) => [d.property, d]))
    expect(byProp.strokeDashArray?.needsReview).toBe(true)
    expect(byProp.strokeCap?.needsReview).toBe(true)
    expect(byProp.strokeJoin?.needsReview).toBe(true)
  })
})
