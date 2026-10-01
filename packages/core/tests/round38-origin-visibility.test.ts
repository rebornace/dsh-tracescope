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

describe('figma transformOrigin + whiteSpace', () => {
  it('defaults origin on rotate and maps textAutoResize', () => {
    const rotated = normalizeFigmaTree({
      id: '1:1',
      name: 'Badge',
      type: 'FRAME',
      rotation: Math.PI / 4,
      absoluteBoundingBox: { x: 0, y: 0, width: 40, height: 40 },
      fills: [],
    })
    expect(rotated.root.style.rotation).toBeCloseTo(45, 0)
    expect(rotated.root.style.transformOrigin).toBe('50% 50%')

    const text = normalizeFigmaTree({
      id: '1:2',
      name: 'Label',
      type: 'TEXT',
      characters: 'Hi',
      textAutoResize: 'WIDTH_AND_HEIGHT',
      style: { fontSize: 14 },
      absoluteBoundingBox: { x: 0, y: 0, width: 20, height: 16 },
      fills: [],
    })
    expect(text.root.style.whiteSpace).toBe('nowrap')
  })
})

describe('CSS transform-origin / visibility / display / white-space', () => {
  it('parses distinct visibility and wrap', () => {
    const parsed = parseCssDeclarations(
      'transform-origin: left top; visibility: hidden; display: none; white-space: nowrap',
    )
    expect(parsed.style).toMatchObject({
      transformOrigin: '0% 0%',
      visibility: 'hidden',
      display: 'none',
      whiteSpace: 'nowrap',
    })
  })
})

describe('native visibility + whiteSpace', () => {
  it('parses Flutter softWrap + SwiftUI hidden + RN origin', () => {
    expect(
      leaf(
        flutterSourceToDesignDoc(`Text('Hi', softWrap: false, maxLines: 1)`, 'Home'),
      ).style.whiteSpace,
    ).toBe('nowrap')

    expect(
      leaf(swiftuiSourceToDesignDoc(`Text("Hi").hidden()`, 'Home')).style.visibility,
    ).toBe('hidden')

    expect(
      leaf(
        reactNativeSourceToDesignDoc(
          `<Text style={{ transformOrigin: '0% 100%', whiteSpace: 'nowrap', visibility: 'hidden' }}>Hi</Text>`,
          'Home',
        ),
      ).style,
    ).toMatchObject({
      transformOrigin: '0% 100%',
      whiteSpace: 'nowrap',
      visibility: 'hidden',
    })
  })
})

describe('compare soft-review for transformOrigin + visibility', () => {
  it('flags non-default origin and visibility as needsReview', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'badge',
        kind: 'frame',
        box: { width: 40, height: 40 },
        style: {
          transformOrigin: '0% 0%',
          visibility: 'hidden',
          whiteSpace: 'nowrap',
        },
        children: [],
      },
      scale: 1,
      source: 'figma',
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 'badge',
        kind: 'frame',
        box: { width: 40, height: 40 },
        style: {
          transformOrigin: '50% 50%',
          visibility: 'visible',
          whiteSpace: 'normal',
        },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    const byProp = Object.fromEntries(result.diffs.map((d) => [d.property, d]))
    expect(byProp.transformOrigin?.needsReview).toBe(true)
    expect(byProp.visibility?.needsReview).toBe(true)
    expect(byProp.whiteSpace?.needsReview).toBe(true)
  })
})
