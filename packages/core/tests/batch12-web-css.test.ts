import { describe, expect, it } from 'vitest'
import { compareVisualDocs } from '../src/design/compare.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'
import {
  parseCssDeclarations,
  parseSimpleStyleRules,
} from '../src/design/adapters/web-css.js'
import type { DesignDoc } from '../src/design/types.js'

const design: DesignDoc = {
  scale: 1,
  source: 'manual',
  root: {
    id: 'root',
    name: 'home',
    kind: 'frame',
    box: {},
    style: {},
    children: [
      {
        id: 'title',
        name: 'title',
        kind: 'text',
        text: '欢迎首页',
        box: { width: 200, height: 40 },
        style: {
          color: '#112233',
          fontSize: 20,
          fontWeight: 700,
          backgroundColor: '#ff6600',
          cornerRadius: 8,
          paddingTop: 12,
          paddingBottom: 12,
          paddingLeft: 12,
          paddingRight: 12,
          marginTop: 16,
          marginBottom: 16,
          marginLeft: 16,
          marginRight: 16,
          opacity: 0.9,
          lineHeight: 28,
        },
        children: [],
      },
    ],
  },
}

describe('batch12 web css / markup L1', () => {
  it('parses margin shorthand, line-height, letter-spacing, bolder', () => {
    const parsed = parseCssDeclarations(
      'margin: 16px; font-weight: bolder; line-height: 28px; letter-spacing: 0.5px; opacity: 0.9',
    )
    expect(parsed.style.marginTop).toBe(16)
    expect(parsed.style.marginLeft).toBe(16)
    expect(parsed.style.fontWeight).toBe(700)
    expect(parsed.style.lineHeight).toBe(28)
    expect(parsed.style.letterSpacing).toBe(0.5)
    expect(parsed.style.opacity).toBe(0.9)
  })

  it('parses #id selectors and applies them in markupToDesignDoc', () => {
    const rules = parseSimpleStyleRules(`
      #title {
        color: #112233;
        font-size: 20px;
        font-weight: bold;
        background-color: #ff6600;
        border-radius: 8px;
        width: 200px;
        height: 40px;
        padding: 12px;
        margin: 16px;
        opacity: 0.9;
        line-height: 28px;
      }
      .unused { color: #000; }
    `)
    expect(rules.ids.get('title')).toContain('font-size')
    expect(rules.classes.has('unused')).toBe(true)

    const doc = markupToDesignDoc(
      `<div id="title">欢迎首页</div>`,
      `#title {
        color: #112233;
        font-size: 20px;
        font-weight: bold;
        background-color: #ff6600;
        border-radius: 8px;
        width: 200px;
        height: 40px;
        padding: 12px;
        margin: 16px;
        opacity: 0.9;
        line-height: 28px;
      }`,
      'home',
    )
    const node = doc.root.children.find((c) => c.text === '欢迎首页')
    expect(node).toBeTruthy()
    expect(node!.id).toBe('title')
    expect(node!.style.fontSize).toBe(20)
    expect(node!.style.fontWeight).toBe(700)
    expect(node!.style.cornerRadius).toBe(8)
    expect(node!.style.paddingTop).toBe(12)
    expect(node!.style.marginTop).toBe(16)
    expect(node!.style.opacity).toBe(0.9)
    expect(node!.style.lineHeight).toBe(28)
    expect(node!.box.width).toBe(200)
    expect(compareVisualDocs(design, doc).comparedPairs).toBeGreaterThan(0)
  })
})
