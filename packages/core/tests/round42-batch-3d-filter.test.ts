import { describe, expect, it } from 'vitest'
import { reactNativeSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import { parseCssDeclarations } from '../src/design/adapters/web-css.js'
import { compareVisualDocs } from '../src/design/compare.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

function leaf(doc: DesignDoc): DesignNode {
  const walk = (n: DesignNode): DesignNode =>
    n.children.length ? walk(n.children[0]!) : n
  return walk(doc.root)
}

describe('R42 batch: 3D / textShadow / direction / filter / outline / clip polygon', () => {
  it('parses CSS perspective, rotateX/Y, text-shadow, direction, filter, outline, polygon pts', () => {
    const parsed = parseCssDeclarations(
      [
        'perspective: 800px',
        'transform: rotateX(15deg) rotateY(-20deg)',
        'text-shadow: 1px 2px 3px #112233',
        'direction: rtl',
        'writing-mode: vertical-rl',
        'filter: brightness(0.8) contrast(120%)',
        'outline: 2px dashed #ff0000',
        'clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 80%)',
      ].join('; '),
    )
    expect(parsed.style.perspective).toBe(800)
    expect(parsed.style.rotateX).toBe(15)
    expect(parsed.style.rotateY).toBe(-20)
    expect(parsed.style.textShadow).toMatchObject({
      offsetX: 1,
      offsetY: 2,
      blur: 3,
      color: '#112233',
    })
    expect(parsed.style.direction).toBe('rtl')
    expect(parsed.style.writingMode).toBe('vertical-rl')
    expect(parsed.style.filter).toContain('brightness:0.8')
    expect(parsed.style.filter).toContain('contrast:1.2')
    expect(parsed.style.outline).toBe('2,dashed,#ff0000')
    expect(parsed.style.clipPath).toMatch(/^polygon:4:/)
    expect(parsed.style.clipPath).toContain('0,0')
  })

  it('parses RN direction + perspective + textShadow', () => {
    expect(
      leaf(
        reactNativeSourceToDesignDoc(
          `<Text style={{ direction: 'rtl', perspective: 600, rotateY: '30deg', textShadow: '0px 1px 2px #000000', filter: 'grayscale(50%)' }}>Hi</Text>`,
          'Home',
        ),
      ).style,
    ).toMatchObject({
      direction: 'rtl',
      perspective: 600,
      rotateY: 30,
      filter: 'grayscale:0.5',
    })
    expect(
      leaf(
        reactNativeSourceToDesignDoc(
          `<Text style={{ textShadow: '0px 1px 2px #000000' }}>Hi</Text>`,
          'Home',
        ),
      ).style.textShadow,
    ).toMatchObject({ offsetX: 0, offsetY: 1, blur: 2 })
  })

  it('soft-reviews new properties', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'card',
        kind: 'frame',
        box: { width: 100, height: 100 },
        style: {
          perspective: 800,
          rotateX: 10,
          direction: 'rtl',
          filter: 'brightness:0.8',
          outline: '2,solid,#000000',
          textShadow: { offsetX: 1, offsetY: 1, blur: 2, color: '#000' },
          clipPath: 'polygon:3:0,0;100,0;50,100',
        },
        children: [],
      },
      scale: 1,
      source: 'figma',
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 'card',
        kind: 'frame',
        box: { width: 100, height: 100 },
        style: {
          perspective: 400,
          rotateX: 0,
          direction: 'ltr',
          filter: 'brightness:1',
          outline: '1,solid,#111111',
          textShadow: { offsetX: 0, offsetY: 0, blur: 0, color: '#000' },
          clipPath: 'polygon:3',
        },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const byProp = Object.fromEntries(
      compareVisualDocs(design, code).diffs.map((d) => [d.property, d]),
    )
    expect(byProp.perspective?.needsReview).toBe(true)
    expect(byProp.rotateX?.needsReview).toBe(true)
    expect(byProp.direction?.needsReview).toBe(true)
    expect(byProp.filter?.needsReview).toBe(true)
    expect(byProp.outline?.needsReview).toBe(true)
    expect(byProp.textShadow?.needsReview).toBe(true)
    expect(byProp.clipPath?.needsReview).toBe(true)
  })
})
