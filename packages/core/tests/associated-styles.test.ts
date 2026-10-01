import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadAssociatedStyles, collectStyleSpecifiers } from '../src/design/adapters/load-associated-styles.js'
import { parseSimpleStyleRules } from '../src/design/adapters/web-css.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'
import { jsxToHtmlish } from '../src/design/adapters/web-react.js'

async function withTemp(run: (root: string) => Promise<void>) {
  const dir = path.join(
    os.tmpdir(),
    `ts-styles-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  await mkdir(dir, { recursive: true })
  await run(dir)
}

describe('associated styles + rule parsing', () => {
  it('loads sibling css and imported module css for a vue page', async () => {
    await withTemp(async (root) => {
      const page = path.join(root, 'Home.vue')
      await writeFile(
        page,
        `<template><div class="title">欢迎</div></template>
<style>.inline{color:#111}</style>
<script>
import './extra.css'
</script>
`,
        'utf8',
      )
      await writeFile(path.join(root, 'Home.css'), '.title{font-size:20px;color:#112233}', 'utf8')
      await writeFile(path.join(root, 'extra.css'), '.title{font-weight:bold}', 'utf8')

      const css = await loadAssociatedStyles({
        entryAbsolutePath: page,
        sourceText: await (await import('node:fs/promises')).readFile(page, 'utf8'),
        inlineCss: '.inline{color:#111}',
      })
      expect(css).toContain('font-size')
      expect(css).toContain('font-weight')
      expect(css).toContain('inline')

      const doc = markupToDesignDoc(`<div class="title">欢迎</div>`, css, 'Home')
      const node = doc.root.children.find((c) => c.text === '欢迎')
      expect(node?.style.fontSize).toBe(20)
      expect(node?.style.color).toBe('#112233')
      expect(node?.style.fontWeight).toBe(700)
    })
  })

  it('parses media queries, comma selectors, and nested scss-like rules', () => {
    const rules = parseSimpleStyleRules(`
      @media (min-width: 375px) {
        .title, .heading { color: #112233; font-size: 18px; }
      }
      .card {
        padding: 8px;
        &.active { background-color: #ff6600; }
        .label { font-size: 12px; }
      }
    `)
    expect(rules.classes.get('title')).toContain('font-size')
    expect(rules.classes.get('heading')).toContain('color')
    expect(rules.classes.get('active')).toContain('background-color')
    expect(rules.classes.get('label')).toContain('font-size')
    expect(rules.classes.get('card')).toContain('padding')
  })

  it('maps CSS module className through jsxToHtmlish', () => {
    const html = jsxToHtmlish(`
      import styles from './Home.module.css'
      export default function Page(){
        return <div className={styles.title}>欢迎</div>
      }
    `)
    expect(html).toMatch(/class="title"/)
    expect(collectStyleSpecifiers(`import styles from './Home.module.css'`)).toEqual([
      './Home.module.css',
    ])
  })
})
