import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { discoverAllPages, compareDesignWithPage } from '../src/design/index.js'
import { heuristicCompare } from '../src/design/heuristic-compare.js'
import { normalizeMauiXaml } from '../src/design/adapters/maui-xaml.js'
import { platformAdapters } from '../src/design/registry.js'
import type { DesignDoc } from '../src/design/types.js'

async function write(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, rel)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, content, 'utf8')
}

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
        style: { backgroundColor: '#ff6600' },
        children: [],
      },
    ],
  },
}

describe('batch7 long-tail adapters', () => {
  it('registers uni-app / taro / ttml / swan / maui', () => {
    const ids = new Set(platformAdapters().map((a) => a.id))
    expect(ids.has('uni-app')).toBe(true)
    expect(ids.has('taro')).toBe(true)
    expect(ids.has('miniprogram-ttml')).toBe(true)
    expect(ids.has('miniprogram-swan')).toBe(true)
    expect(ids.has('maui-xaml')).toBe(true)
  })

  it('discovers uni-app pages from pages.json and compares L1', async () => {
    const root = path.join(tmpdir(), `b7-uni-${Date.now()}`)
    await write(
      root,
      'pages.json',
      JSON.stringify({
        pages: [{ path: 'pages/home/index' }],
      }),
    )
    await write(
      root,
      'pages/home/index.vue',
      `<template>
  <view class="wrap">
    <text class="title">欢迎首页</text>
    <button>立即开始</button>
  </view>
</template>
<script>
export default { onLoad() { uni.showToast({ title: 'ok' }) } }
</script>
<style>
.title { color: #112233; font-size: 20px; }
</style>`,
    )

    const pages = await discoverAllPages(root)
    const uni = pages.find((p) => p.adapterId === 'uni-app')
    expect(uni).toBeTruthy()
    expect(uni!.precise).toBe(true)
    expect(uni!.fingerprint.texts.some((t) => t.includes('欢迎') || t.includes('首页'))).toBe(
      true,
    )

    const cmp = await compareDesignWithPage(design, uni!)
    expect(cmp.precise).toBe(true)
    expect((cmp.result?.comparedPairs ?? 0) + (cmp.result?.diffs.length ?? 0)).toBeGreaterThan(0)
  })

  it('discovers Taro React pages and builds design doc', async () => {
    const root = path.join(tmpdir(), `b7-taro-${Date.now()}`)
    await write(
      root,
      'src/pages/index/index.tsx',
      `import { View, Text, Button } from '@tarojs/components'
export default function Index() {
  return (
    <View>
      <Text>欢迎首页</Text>
      <Button>立即开始</Button>
    </View>
  )
}
`,
    )

    const pages = await discoverAllPages(root)
    const taro = pages.find((p) => p.adapterId === 'taro')
    expect(taro).toBeTruthy()
    expect(taro!.precise).toBe(true)

    const cmp = await compareDesignWithPage(design, taro!)
    expect(cmp.precise).toBe(true)
  })

  it('discovers Douyin TTML and Baidu swan pages', async () => {
    const root = path.join(tmpdir(), `b7-mp-${Date.now()}`)
    await write(
      root,
      'pages/home/index.ttml',
      `<view><text class="t">欢迎首页</text><button>立即开始</button></view>`,
    )
    await write(root, 'pages/home/index.ttss', `.t { color: #112233; font-size: 20px; }`)
    await write(
      root,
      'pages/home/index.swan',
      `<view><text class="t">欢迎首页</text><button>立即开始</button></view>`,
    )
    await write(root, 'pages/home/index.css', `.t { color: #112233; font-size: 20px; }`)

    const pages = await discoverAllPages(root)
    expect(pages.some((p) => p.adapterId === 'miniprogram-ttml')).toBe(true)
    expect(pages.some((p) => p.adapterId === 'miniprogram-swan')).toBe(true)

    const ttml = pages.find((p) => p.adapterId === 'miniprogram-ttml')!
    const cmp = await compareDesignWithPage(design, ttml)
    expect(cmp.precise).toBe(true)
    expect(cmp.result?.comparedPairs ?? 0).toBeGreaterThan(0)
  })

  it('discovers MAUI XAML and parses Label/Button texts', async () => {
    const root = path.join(tmpdir(), `b7-maui-${Date.now()}`)
    const xaml = `<?xml version="1.0" encoding="utf-8" ?>
<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui"
             xmlns:x="http://schemas.microsoft.com/winfx/2009/xaml"
             x:Class="App.HomePage">
  <VerticalStackLayout>
    <Label Text="欢迎首页" TextColor="#112233" FontSize="20" />
    <Button Text="立即开始" BackgroundColor="#ff6600" />
  </VerticalStackLayout>
</ContentPage>`
    await write(root, 'Pages/HomePage.xaml', xaml)

    const doc = normalizeMauiXaml(xaml, 'HomePage')
    const texts: string[] = []
    const walk = (n: { text?: string; children: typeof doc.root.children }): void => {
      if (n.text) texts.push(n.text)
      for (const c of n.children) walk(c)
    }
    walk(doc.root)
    expect(texts).toContain('欢迎首页')
    expect(texts).toContain('立即开始')

    const pages = await discoverAllPages(root)
    const maui = pages.find((p) => p.adapterId === 'maui-xaml')
    expect(maui).toBeTruthy()
    expect(maui!.platform).toBe('dotnet')
    expect(maui!.fingerprint.texts.some((t) => t.includes('欢迎') || t.includes('首页'))).toBe(
      true,
    )

    const cmp = await compareDesignWithPage(design, maui!)
    expect(cmp.precise).toBe(true)
    expect(cmp.result?.comparedPairs ?? 0).toBeGreaterThan(0)
  })

  it('runs L2 heuristic for maui / uni / taro', async () => {
    const root = path.join(tmpdir(), `b7-h-${Date.now()}`)
    await write(
      root,
      'HomePage.xaml',
      `<ContentPage>
  <Label Text="欢迎首页" />
  <Button Text="立即开始" />
</ContentPage>`,
    )
    await write(
      root,
      'pages/a.vue',
      `<template><view><text>欢迎首页</text><button>立即开始</button></view></template>
<script>uni.getSystemInfo()</script>`,
    )
    await write(
      root,
      'pages/b.tsx',
      `import { View, Text } from '@tarojs/components'
export default () => <View><Text>欢迎首页</Text></View>`,
    )

    const pages = await discoverAllPages(root)
    const maui = pages.find((p) => p.adapterId === 'maui-xaml')!
    const uni = pages.find((p) => p.adapterId === 'uni-app')!
    const taro = pages.find((p) => p.adapterId === 'taro')!

    const hMaui = await heuristicCompare(design, maui)
    const hUni = await heuristicCompare(design, uni)
    const hTaro = await heuristicCompare(design, taro)
    expect(hMaui.comparedPairs + hMaui.diffs.length).toBeGreaterThan(0)
    expect(hUni.comparedPairs).toBeGreaterThan(0)
    expect(hTaro.comparedPairs).toBeGreaterThan(0)
  })
})
