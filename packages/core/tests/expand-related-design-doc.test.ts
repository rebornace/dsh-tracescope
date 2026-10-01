import { describe, expect, it } from 'vitest'
import {
  expandDesignDocWithRelated,
  isDesignDocCandidatePath,
  normalizeComponentKey,
} from '../src/design/expand-related-design-doc.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'
import { jsxToHtmlish } from '../src/design/adapters/web-react.js'
import type { DesignDoc } from '../src/design/types.js'

function doc(name: string, texts: string[]): DesignDoc {
  return {
    root: {
      id: `${name}-root`,
      name,
      kind: 'frame',
      box: {},
      style: {},
      children: texts.map((t, i) => ({
        id: `${name}-${i}`,
        name: t,
        kind: 'text' as const,
        text: t,
        box: {},
        style: {},
        children: [],
      })),
    },
    scale: 1,
    source: 'test',
  }
}

describe('expandDesignDocWithRelated', () => {
  it('replaces custom-component placeholders by name instead of only appending', () => {
    const entry = markupToDesignDoc(
      `<div>标题</div><PayButton /><pay-badge></pay-badge>`,
      '',
      'page',
    )
    expect(entry.root.children.some((c) => c.id.startsWith('cmp:PayButton'))).toBe(true)

    const expanded = expandDesignDocWithRelated(entry, [
      { relativePath: 'components/PayButton.vue', doc: doc('PayButton', ['立即支付']) },
      { relativePath: 'components/pay-badge/index.vue', doc: doc('badge', ['99+']) },
    ])

    const payHost = expanded.root.children.find((c) => c.id === 'rel:PayButton:host')
    expect(payHost).toBeTruthy()
    expect(payHost!.children.some((c) => c.text === '立即支付')).toBe(true)

    const badgeHost = expanded.root.children.find((c) => c.id === 'rel:pay-badge:host')
    expect(badgeHost).toBeTruthy()
    expect(badgeHost!.children.some((c) => c.text === '99+')).toBe(true)

    // Should not also dump duplicate PayButton leaves at root when replaced.
    const rootPayLeaves = expanded.root.children.filter((c) => c.text === '立即支付')
    expect(rootPayLeaves.length).toBe(0)
  })

  it('falls back to root graft when no placeholder matches', () => {
    const entry = doc('page', ['标题'])
    const pay = doc('PayButton', ['立即支付'])
    const expanded = expandDesignDocWithRelated(entry, [
      { relativePath: 'components/PayButton.vue', doc: pay },
    ])
    expect(expanded.root.children.map((c) => c.text)).toContain('立即支付')
  })

  it('keeps PascalCase components through jsxToHtmlish', () => {
    const html = jsxToHtmlish(`export default function Page(){ return <div><PayButton/></div> }`)
    expect(html).toMatch(/<PayButton/)
    const d = markupToDesignDoc(html, '', 'Page')
    expect(d.root.children.some((c) => /PayButton/i.test(c.name) || c.id.includes('PayButton'))).toBe(
      true,
    )
  })

  it('normalizes component keys', () => {
    expect(normalizeComponentKey('PayButton')).toBe('paybutton')
    expect(normalizeComponentKey('pay-button')).toBe('paybutton')
    expect(normalizeComponentKey('pay_button.vue')).toBe('paybutton')
  })

  it('filters non-UI candidate paths', () => {
    expect(isDesignDocCandidatePath('pages/home/index.vue')).toBe(true)
    expect(isDesignDocCandidatePath('pages/home/index.css')).toBe(false)
    expect(isDesignDocCandidatePath('pages/home/index.json')).toBe(false)
    expect(isDesignDocCandidatePath('pages/home/index.js')).toBe(false)
    expect(isDesignDocCandidatePath('pages/home/index.tsx')).toBe(true)
  })
})
