import { describe, expect, it } from 'vitest'
import { compareVisualDocs } from '../src/design/compare.js'
import {
  composeSourceToDesignDoc,
  swiftuiSourceToDesignDoc,
} from '../src/design/adapters/declarative-design-doc.js'
import { applyDocumentOrderStack } from '../src/design/adapters/web-css.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

function leaf(partial: Partial<DesignNode> & Pick<DesignNode, 'id' | 'name' | 'kind'>): DesignNode {
  return {
    box: {},
    style: {},
    children: [],
    ...partial,
  }
}

function doc(root: DesignNode): DesignDoc {
  return { root, scale: 1, source: 'manual' }
}

describe('compare closed style fields', () => {
  it('diffs imageFit / textAlign / imagePosition', () => {
    const design = doc(
      leaf({
        id: 'd',
        name: 'cover',
        kind: 'image',
        style: { imageFit: 'cover', textAlign: 'center', imagePosition: '50% 50%' },
      }),
    )
    const code = doc(
      leaf({
        id: 'c',
        name: 'cover',
        kind: 'image',
        style: { imageFit: 'contain', textAlign: 'left', imagePosition: '0% 0%' },
      }),
    )
    const result = compareVisualDocs(design, code)
    const props = result.diffs.map((d) => d.property)
    expect(props).toContain('imageFit')
    expect(props).toContain('textAlign')
    expect(props).toContain('imagePosition')
  })

  it('diffs cornerRadii with tolerance and soft-reviews missing gradient', () => {
    const design = doc(
      leaf({
        id: 'd',
        name: 'card',
        kind: 'view',
        style: {
          cornerRadii: [12, 12, 0, 0],
          gradient: {
            type: 'linear',
            cssAngle: 90,
            stops: [
              { color: '#112233', position: 0 },
              { color: '#abcdef', position: 1 },
            ],
          },
        },
      }),
    )
    const code = doc(
      leaf({
        id: 'c',
        name: 'card',
        kind: 'view',
        style: {
          cornerRadii: [12, 12.2, 0, 0],
          backgroundColor: '#112233',
        },
      }),
    )
    const result = compareVisualDocs(design, code)
    expect(result.diffs.find((d) => d.property === 'cornerRadii')).toBeUndefined()
    const grad = result.diffs.find((d) => d.property === 'gradient')
    expect(grad?.needsReview).toBe(true)
  })

  it('flags mismatched gradient fingerprints', () => {
    const design = doc(
      leaf({
        id: 'd',
        name: 'hero',
        kind: 'view',
        style: {
          gradient: {
            type: 'linear',
            cssAngle: 180,
            stops: [
              { color: '#000000', position: 0 },
              { color: '#ffffff', position: 1 },
            ],
          },
        },
      }),
    )
    const code = doc(
      leaf({
        id: 'c',
        name: 'hero',
        kind: 'view',
        style: {
          gradient: {
            type: 'linear',
            cssAngle: 90,
            stops: [
              { color: '#000000', position: 0 },
              { color: '#ffffff', position: 1 },
            ],
          },
        },
      }),
    )
    const result = compareVisualDocs(design, code)
    expect(result.diffs.some((d) => d.property === 'gradient')).toBe(true)
  })
})

describe('document-order stack geometry', () => {
  it('stacks unpositioned markup siblings by height', () => {
    const out = markupToDesignDoc(
      `<div class="a">一</div><div class="b">二</div>`,
      `.a { height: 40px; width: 100px } .b { height: 30px; width: 100px }`,
      'Home',
    )
    const kids = out.root.children
    expect(kids[0]?.box.y).toBe(0)
    expect(kids[1]?.box.y).toBe(48)
  })

  it('stacks compose texts without explicit y', () => {
    const out = composeSourceToDesignDoc(
      `Text("标题", modifier = Modifier.height(24.dp))
       Text("副标题", modifier = Modifier.height(16.dp))`,
      'Home',
    )
    expect(out.root.children[0]?.box.y).toBe(0)
    expect(out.root.children[1]?.box.y).toBe(32)
  })

  it('applyDocumentOrderStack fills gaps after partial placement', () => {
    const nodes = [
      { kind: 'view', box: { x: 0, y: 0, height: 10, width: 40 } },
      { kind: 'text', text: '下', box: { height: 20, width: 40 } as { height: number; width: number } },
    ]
    applyDocumentOrderStack(nodes, 4)
    expect(nodes[1]?.box.y).toBe(14)
    expect(nodes[1]?.box.x).toBe(0)
  })

  it('stacks swiftui texts with default height', () => {
    const out = swiftuiSourceToDesignDoc(`Text("A"); Text("B")`, 'Home')
    expect(out.root.children.length).toBeGreaterThanOrEqual(2)
    expect(out.root.children[0]?.box.y).toBe(0)
    expect(typeof out.root.children[1]?.box.y).toBe('number')
    expect((out.root.children[1]?.box.y as number) > 0).toBe(true)
  })
})
