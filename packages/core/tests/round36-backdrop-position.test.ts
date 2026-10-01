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

describe('figma backdropBlur + position + axis gap', () => {
  it('splits LAYER_BLUR / BACKGROUND_BLUR and maps ABSOLUTE', () => {
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'Panel',
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      itemSpacing: 16,
      layoutPositioning: 'ABSOLUTE',
      effects: [
        { type: 'LAYER_BLUR', visible: true, radius: 8 },
        { type: 'BACKGROUND_BLUR', visible: true, radius: 24 },
      ],
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 100 },
      fills: [],
    })
    expect(doc.root.style.blur).toBe(8)
    expect(doc.root.style.backdropBlur).toBe(24)
    expect(doc.root.style.position).toBe('absolute')
    expect(doc.root.style.gap).toBe(16)
    expect(doc.root.style.rowGap).toBe(16)
  })
})

describe('CSS backdrop-filter + position + row/column-gap', () => {
  it('parses distinct backdrop and axis gaps', () => {
    const parsed = parseCssDeclarations(
      'position: absolute; filter: blur(4px); backdrop-filter: blur(20px); gap: 8px 24px',
    )
    expect(parsed.style).toMatchObject({
      position: 'absolute',
      blur: 4,
      backdropBlur: 20,
      rowGap: 8,
      columnGap: 24,
      gap: 8,
    })
  })
})

describe('native backdrop + position', () => {
  it('parses Flutter BackdropFilter + Positioned', () => {
    const n = leaf(
      flutterSourceToDesignDoc(
        `Positioned(left: 10, top: 20, child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12), child: Text('Hi')))`,
        'Home',
      ),
    )
    expect(n.style.position).toBe('absolute')
    expect(n.style.backdropBlur).toBe(12)
  })

  it('parses SwiftUI material + RN position/rowGap', () => {
    expect(
      leaf(
        swiftuiSourceToDesignDoc(`Text("Hi").background(.ultraThinMaterial)`, 'Home'),
      ).style.backdropBlur,
    ).toBe(20)

    expect(
      leaf(
        reactNativeSourceToDesignDoc(
          `<Text style={{ position: 'absolute', rowGap: 12, columnGap: 8 }}>Hi</Text>`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ position: 'absolute', rowGap: 12, columnGap: 8 })
  })
})

describe('compare soft-review for backdropBlur + position', () => {
  it('flags backdrop and absolute mismatches', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'panel',
        kind: 'frame',
        box: { width: 200, height: 100 },
        style: { backdropBlur: 24, position: 'absolute', rowGap: 16 },
        children: [],
      },
      scale: 1,
      source: 'figma',
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 'panel',
        kind: 'frame',
        box: { width: 200, height: 100 },
        style: { backdropBlur: 4, position: 'relative', rowGap: 4 },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    const props = result.diffs.map((d) => d.property)
    expect(props).toContain('backdropBlur')
    expect(props).toContain('position')
    expect(props).toContain('rowGap')
    const soft = result.diffs.filter((d) => d.property === 'position')
    expect(soft.every((d) => d.needsReview)).toBe(true)
  })
})
