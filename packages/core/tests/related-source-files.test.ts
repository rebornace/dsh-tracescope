import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  formatRelatedSourceFilesManifest,
  resolveRelatedSourceFiles,
} from '../src/design/related-source-files.js'

async function withTemp(run: (root: string) => Promise<void>) {
  const dir = path.join(os.tmpdir(), `ts-related-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(dir, { recursive: true })
  await run(dir)
}

describe('resolveRelatedSourceFiles', () => {
  it('picks up same-basename siblings and relative imports', async () => {
    await withTemp(async (root) => {
      const pageDir = path.join(root, 'pages', 'home')
      await mkdir(pageDir, { recursive: true })
      await mkdir(path.join(root, 'components'), { recursive: true })
      await writeFile(
        path.join(pageDir, 'index.vue'),
        `<template><PayButton /></template>
<script>
import PayButton from '../../components/PayButton.vue'
import './index.css'
</script>
`,
        'utf8',
      )
      await writeFile(path.join(pageDir, 'index.css'), '.home{color:red}', 'utf8')
      await writeFile(
        path.join(root, 'components', 'PayButton.vue'),
        `<template><button>pay</button></template>`,
        'utf8',
      )

      const related = await resolveRelatedSourceFiles(root, 'pages/home/index.vue')
      const paths = related.files.map((f) => f.relativePath)
      expect(paths[0]).toBe('pages/home/index.vue')
      expect(paths).toContain('pages/home/index.css')
      expect(paths).toContain('components/PayButton.vue')
      expect(formatRelatedSourceFilesManifest(related)).toContain('[样式]')
      expect(formatRelatedSourceFilesManifest(related)).toContain('PayButton.vue')
    })
  })

  it('resolves mini-program usingComponents and include', async () => {
    await withTemp(async (root) => {
      const pageDir = path.join(root, 'pages', 'cart')
      const compDir = path.join(root, 'components', 'badge')
      await mkdir(pageDir, { recursive: true })
      await mkdir(compDir, { recursive: true })
      await writeFile(path.join(pageDir, 'index.wxml'), `<include src="./header.wxml"/><badge />`, 'utf8')
      await writeFile(path.join(pageDir, 'header.wxml'), `<view>h</view>`, 'utf8')
      await writeFile(path.join(pageDir, 'index.js'), `Page({})`, 'utf8')
      await writeFile(
        path.join(pageDir, 'index.json'),
        JSON.stringify({ usingComponents: { badge: '/components/badge/index' } }),
        'utf8',
      )
      await writeFile(path.join(compDir, 'index.js'), `Component({})`, 'utf8')
      await writeFile(path.join(compDir, 'index.wxml'), `<view>b</view>`, 'utf8')

      const related = await resolveRelatedSourceFiles(root, 'pages/cart/index.wxml')
      const paths = related.files.map((f) => f.relativePath)
      expect(paths).toContain('pages/cart/index.js')
      expect(paths).toContain('pages/cart/index.json')
      expect(paths).toContain('pages/cart/header.wxml')
      expect(paths).toContain('components/badge/index.js')
    })
  })

  it('resolves @components alias and PascalCase tags to components/', async () => {
    await withTemp(async (root) => {
      const pageDir = path.join(root, 'pages', 'order')
      const compDir = path.join(root, 'components')
      await mkdir(pageDir, { recursive: true })
      await mkdir(compDir, { recursive: true })
      await writeFile(
        path.join(pageDir, 'index.vue'),
        `<template>
  <OrderHeader />
  <PriceTag />
</template>
<script>
import OrderHeader from '@components/OrderHeader.vue'
</script>
`,
        'utf8',
      )
      await writeFile(
        path.join(compDir, 'OrderHeader.vue'),
        `<template><div>h</div></template>`,
        'utf8',
      )
      await writeFile(
        path.join(compDir, 'PriceTag.vue'),
        `<template><span>¥</span></template>`,
        'utf8',
      )

      const related = await resolveRelatedSourceFiles(root, 'pages/order/index.vue')
      const paths = related.files.map((f) => f.relativePath)
      expect(paths).toContain('components/OrderHeader.vue')
      expect(paths).toContain('components/PriceTag.vue')
    })
  })
})
