import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { discoverAllPages } from '../src/design/index.js'
import { compareVisualDocs } from '../src/design/compare.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'
import { heuristicCompare } from '../src/design/heuristic-compare.js'
import type { DesignDoc } from '../src/design/types.js'

async function write(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, rel)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, content, 'utf8')
}

describe('batch3 web adapters', () => {
  it('discovers html/vue/react and compares html styles', async () => {
    const root = path.join(tmpdir(), `b3-${Date.now()}`)
    await write(
      root,
      'public/home.html',
      `<!doctype html><html><body>
        <h1 style="color:#112233;font-size:20px">欢迎首页</h1>
        <button style="background:#ff6600;border-radius:8px">立即开始</button>
      </body></html>`,
    )
    await write(
      root,
      'src/views/Home.vue',
      `<template>
        <div class="wrap">
          <h1 class="title">欢迎首页</h1>
          <button class="cta">立即开始</button>
        </div>
      </template>
      <style>
        .title { color: #112233; font-size: 20px; }
        .cta { background: #ff6600; border-radius: 8px; }
      </style>`,
    )
    await write(
      root,
      'src/pages/HomePage.tsx',
      `import React from 'react';
export default function HomePage() {
  return (
    <div>
      <h1>欢迎首页</h1>
      <button>立即开始</button>
    </div>
  );
}
`,
    )

    const pages = await discoverAllPages(root)
    const ids = new Set(pages.map((p) => p.adapterId))
    expect(ids.has('web-html')).toBe(true)
    expect(ids.has('web-vue')).toBe(true)
    expect(ids.has('web-react')).toBe(true)

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
          {
            id: 'b1',
            name: 'cta',
            kind: 'text',
            text: '立即开始',
            box: { x: 16, y: 80, width: 120, height: 40 },
            style: { backgroundColor: '#ff6600', cornerRadius: 8 },
            children: [],
          },
        ],
      },
    }

    const htmlPage = pages.find((p) => p.adapterId === 'web-html')!
    const htmlDoc = markupToDesignDoc(
      await (await import('node:fs/promises')).readFile(htmlPage.absolutePath, 'utf8'),
      '',
      'home',
    )
    const exact = compareVisualDocs(design, htmlDoc)
    expect(exact.comparedPairs).toBeGreaterThan(0)

    const reactPage = pages.find((p) => p.adapterId === 'web-react')!
    expect(reactPage.precise).toBe(true)
    const heuristic = await heuristicCompare(design, reactPage)
    expect(heuristic.comparedPairs).toBeGreaterThanOrEqual(1)
    expect(heuristic.diffs.some((d) => d.property === 'text')).toBe(false)
  })
})
