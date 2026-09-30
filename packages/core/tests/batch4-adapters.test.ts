import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { discoverAllPages } from '../src/design/index.js'
import { compareVisualDocs } from '../src/design/compare.js'
import { jsxToHtmlish } from '../src/design/adapters/web-react.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'
import type { DesignDoc } from '../src/design/types.js'

async function write(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, rel)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, content, 'utf8')
}

describe('batch4 adapters', () => {
  it('discovers miniprogram/svelte/angular and upgrades react L1', async () => {
    const root = path.join(tmpdir(), `b4-${Date.now()}`)
    await write(
      root,
      'pages/index/index.wxml',
      `<view class="wrap">
  <text class="title">欢迎首页</text>
  <button class="cta">立即开始</button>
</view>`,
    )
    await write(
      root,
      'pages/index/index.wxss',
      `.title { color: #112233; font-size: 20px; }
.cta { background: #ff6600; border-radius: 8px; }`,
    )
    await write(
      root,
      'src/Home.svelte',
      `<script></script>
<h1 class="title">欢迎首页</h1>
<button class="cta">立即开始</button>
<style>
  .title { color: #112233; font-size: 20px; }
  .cta { background: #ff6600; border-radius: 8px; }
</style>`,
    )
    await write(
      root,
      'src/app/home/home.component.ts',
      `import { Component } from '@angular/core';
@Component({
  selector: 'app-home',
  template: \`
    <h1 class="title">欢迎首页</h1>
    <button class="cta">立即开始</button>
  \`,
  styles: [\`
    .title { color: #112233; font-size: 20px; }
    .cta { background: #ff6600; border-radius: 8px; }
  \`]
})
export class HomeComponent {}
`,
    )
    await write(
      root,
      'src/pages/HomePage.tsx',
      `import React from 'react';
export default function HomePage() {
  return (
    <div>
      <h1 style={{ color: '#112233', fontSize: 20 }}>欢迎首页</h1>
      <button style={{ background: '#ff6600', borderRadius: 8 }}>立即开始</button>
    </div>
  );
}
`,
    )

    const pages = await discoverAllPages(root)
    const ids = new Set(pages.map((p) => p.adapterId))
    expect(ids.has('miniprogram-wxml')).toBe(true)
    expect(ids.has('web-svelte')).toBe(true)
    expect(ids.has('web-angular')).toBe(true)
    expect(ids.has('web-react')).toBe(true)
    expect(pages.find((p) => p.adapterId === 'web-react')?.precise).toBe(true)

    const design: DesignDoc = {
      scale: 1,
      source: 'manual',
      root: {
        id: 'root',
        name: 'home',
        kind: 'frame',
        box: { x: 0, y: 0, width: 375, height: 812 },
        style: {},
        children: [
          {
            id: 't1',
            name: 'title',
            kind: 'text',
            text: '欢迎首页',
            box: { x: 16, y: 40, width: 200, height: 28 },
            style: { color: '#112233', fontSize: 20 },
            children: [],
          },
        ],
      },
    }

    const reactSrc = await (
      await import('node:fs/promises')
    ).readFile(pages.find((p) => p.adapterId === 'web-react')!.absolutePath, 'utf8')
    const reactDoc = markupToDesignDoc(jsxToHtmlish(reactSrc), '', 'HomePage')
    const result = compareVisualDocs(design, reactDoc)
    expect(result.comparedPairs).toBeGreaterThan(0)

    const mp = pages.find((p) => p.adapterId === 'miniprogram-wxml')!
    expect(mp.fingerprint.texts.some((t) => t.includes('欢迎') || t.includes('首页'))).toBe(true)
  })
})
