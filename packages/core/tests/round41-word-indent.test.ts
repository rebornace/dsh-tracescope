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

describe('figma paragraphIndent → textIndent', () => {
  it('maps first-line indent', () => {
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'Body',
      type: 'TEXT',
      characters: 'Hello world',
      style: { fontSize: 14, paragraphIndent: 24 },
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 40 },
      fills: [],
    })
    expect(doc.root.style.textIndent).toBe(24)
  })
})

describe('CSS word-break / word-spacing / text-indent', () => {
  it('parses wrap and indent', () => {
    const parsed = parseCssDeclarations(
      'word-break: break-all; word-spacing: 4px; text-indent: 16px',
    )
    expect(parsed.style).toMatchObject({
      wordBreak: 'break-all',
      wordSpacing: 4,
      textIndent: 16,
    })
  })
})

describe('native wordSpacing + textIndent', () => {
  it('parses Flutter / SwiftUI / RN', () => {
    expect(
      leaf(
        flutterSourceToDesignDoc(`Text('Hi', wordSpacing: 2.0, textIndent: 12.0)`, 'Home'),
      ).style,
    ).toMatchObject({ wordSpacing: 2, textIndent: 12 })

    expect(
      leaf(swiftuiSourceToDesignDoc(`Text("Hi").firstLineIndent(18)`, 'Home')).style.textIndent,
    ).toBe(18)

    expect(
      leaf(
        reactNativeSourceToDesignDoc(
          `<Text style={{ wordBreak: 'break-word', wordSpacing: 3, textIndent: 10 }}>Hi</Text>`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ wordBreak: 'break-word', wordSpacing: 3, textIndent: 10 })
  })
})

describe('compare soft-review for wordBreak / wordSpacing / textIndent', () => {
  it('flags mismatches as needsReview', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'body',
        kind: 'text',
        box: { width: 200, height: 40 },
        style: { wordBreak: 'break-all', wordSpacing: 4, textIndent: 16 },
        children: [],
      },
      scale: 1,
      source: 'figma',
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 'body',
        kind: 'text',
        box: { width: 200, height: 40 },
        style: { wordBreak: 'normal', wordSpacing: 0, textIndent: 0 },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    const byProp = Object.fromEntries(result.diffs.map((d) => [d.property, d]))
    expect(byProp.wordBreak?.needsReview).toBe(true)
    expect(byProp.wordSpacing?.needsReview).toBe(true)
    expect(byProp.textIndent?.needsReview).toBe(true)
  })
})
