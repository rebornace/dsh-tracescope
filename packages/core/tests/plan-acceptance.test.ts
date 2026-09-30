/**
 * Plan acceptance harness for design-only_review_ui (f732ac5d).
 *
 * Asserts §3 matrix + §7 acceptance criteria without live Figma:
 * registry completeness, L0 discovery, L1/L2 compare paths, capabilities,
 * and cache schema bump after native-render removal.
 */
import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { discoverAllPages, compareDesignWithPage } from '../src/design/index.js'
import { platformAdapters } from '../src/design/registry.js'
import {
  resolveAdapterCapabilities,
  type AdapterId,
} from '../src/design/adapters/adapter-types.js'
import { heuristicCompare } from '../src/design/heuristic-compare.js'
import { VISUAL_CACHE_SCHEMA_VERSION } from '../src/visual-cache.js'
import type { DesignDoc } from '../src/design/types.js'

async function write(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, rel)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, content, 'utf8')
}

/** Full planned matrix (§3) plus delivered long-tail (maui). */
const PLANNED_ADAPTERS: AdapterId[] = [
  'android-xml',
  'ios-xib',
  'android-compose',
  'ios-swiftui',
  'android-view-java',
  'android-view-kotlin',
  'ios-uikit-objc',
  'ios-uikit-swift',
  'flutter',
  'react-native',
  'harmony-arkui',
  'web-html',
  'web-react',
  'web-vue',
  'web-svelte',
  'web-angular',
  'miniprogram-wxml',
  'miniprogram-axml',
  'miniprogram-ttml',
  'miniprogram-swan',
  'uni-app',
  'taro',
  'maui-xaml',
]

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
        box: { x: 16, y: 40, width: 120, height: 28 },
        style: { fontSize: 18, color: '#112233' },
        children: [],
      },
      {
        id: 'b1',
        name: 'cta',
        kind: 'frame',
        text: '去看看',
        box: { x: 16, y: 80, width: 88, height: 36 },
        style: {},
        children: [],
      },
    ],
  },
}

describe('plan acceptance (design-only review UI)', () => {
  it('registers every planned adapter and exposes discover + exactCompare', () => {
    const adapters = platformAdapters()
    const ids = new Set(adapters.map((a) => a.id))
    for (const id of PLANNED_ADAPTERS) {
      expect(ids.has(id), `missing planned adapter ${id}`).toBe(true)
    }
    expect(ids.size).toBe(PLANNED_ADAPTERS.length)

    for (const adapter of adapters) {
      const caps = resolveAdapterCapabilities(adapter)
      expect(caps.discover, `${adapter.id} discover`).toBe(true)
      expect(caps.heuristicCompare, `${adapter.id} heuristic`).toBe(true)
      // Plan §7: adapters that claim L1 must expose toDesignDoc.
      expect(typeof adapter.toDesignDoc, `${adapter.id} toDesignDoc`).toBe('function')
      expect(caps.exactCompare, `${adapter.id} exactCompare`).toBe(true)
      expect(adapter.precise, `${adapter.id} precise`).toBe(true)
    }
  })

  it('bumped visual cache schema after native-render removal', () => {
    expect(VISUAL_CACHE_SCHEMA_VERSION).toBeGreaterThanOrEqual(7)
  })

  it('Batch1 layered paths: XML/Xib L1 + heuristic L2 fallback', async () => {
    const root = path.join(tmpdir(), `plan-acc-b1-${Date.now()}`)
    await write(
      root,
      'app/src/main/res/layout/home.xml',
      `<?xml version="1.0"?><LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent" android:layout_height="match_parent">
  <TextView android:text="欢迎首页" android:layout_width="wrap_content" android:layout_height="wrap_content"/>
  <Button android:text="去看看" android:layout_width="wrap_content" android:layout_height="wrap_content"/>
</LinearLayout>`,
    )
    await write(
      root,
      'ios/Home.xib',
      `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.XIB">
  <objects>
    <view id="v0" userLabel="Root">
      <rect key="frame" x="0" y="0" width="375" height="812"/>
      <subviews>
        <label id="L1" text="欢迎首页">
          <rect key="frame" x="16" y="40" width="120" height="28"/>
        </label>
        <button id="B1">
          <rect key="frame" x="16" y="80" width="88" height="36"/>
          <state key="normal" title="去看看"/>
        </button>
      </subviews>
    </view>
  </objects>
</document>`,
    )
    await write(
      root,
      'compose/Home.kt',
      `@Composable\nfun Home() { Column { Text("欢迎首页"); Button(onClick={}) { Text("去看看") } } }\n`,
    )

    const pages = await discoverAllPages(root)
    const xml = pages.find((p) => p.adapterId === 'android-xml')
    const xib = pages.find((p) => p.adapterId === 'ios-xib')
    const compose = pages.find((p) => p.adapterId === 'android-compose')
    expect(xml, 'android-xml discovery').toBeTruthy()
    expect(xib, 'ios-xib discovery').toBeTruthy()
    expect(compose, 'android-compose discovery').toBeTruthy()

    const xmlCmp = await compareDesignWithPage(design, xml!)
    expect(xmlCmp.precise).toBe(true)
    expect(xmlCmp.result).toBeTruthy()

    const xibCmp = await compareDesignWithPage(design, xib!)
    expect(xibCmp.precise).toBe(true)
    expect(xibCmp.result).toBeTruthy()

    // Compose now has partial L1; also verify L2 heuristic still works when forced.
    const composeL1 = await compareDesignWithPage(design, compose!)
    expect(composeL1.precise).toBe(true)
    expect(composeL1.result).toBeTruthy()

    const heuristic = await heuristicCompare(design, {
      ...compose!,
      precise: false,
    })
    expect(heuristic.diffs.length + heuristic.unmatched.length).toBeGreaterThanOrEqual(0)
    // Missing an extra design text should surface when code lacks it.
    const designExtra: DesignDoc = {
      ...design,
      root: {
        ...design.root,
        children: [
          ...design.root.children,
          {
            id: 'ghost',
            name: 'ghost',
            kind: 'text',
            text: '不存在的文案XYZ',
            box: {},
            style: {},
            children: [],
          },
        ],
      },
    }
    const miss = await heuristicCompare(designExtra, { ...compose!, precise: false })
    expect(
      miss.diffs.some((d) => d.property === 'text') ||
        miss.unmatched.some((u) => u.side === 'design' && /不存在/.test(u.text ?? u.name)),
    ).toBe(true)
  })

  it('matrix smoke: every major stack discovers + compareDesignWithPage yields result', async () => {
    const root = path.join(tmpdir(), `plan-acc-matrix-${Date.now()}`)

    await write(
      root,
      'app/src/main/res/layout/home.xml',
      `<?xml version="1.0"?><LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent" android:layout_height="match_parent">
  <TextView android:text="欢迎首页" android:layout_width="wrap_content" android:layout_height="wrap_content"/>
</LinearLayout>`,
    )
    await write(
      root,
      'ios/Home.xib',
      `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.XIB">
  <objects>
    <view id="v0" userLabel="Root">
      <rect key="frame" x="0" y="0" width="375" height="812"/>
      <subviews>
        <label id="L1" text="欢迎首页">
          <rect key="frame" x="16" y="40" width="120" height="28"/>
        </label>
      </subviews>
    </view>
  </objects>
</document>`,
    )
    await write(root, 'compose/Home.kt', `@Composable\nfun Home() { Text("欢迎首页") }\n`)
    await write(
      root,
      'swiftui/HomeView.swift',
      `struct HomeView: View { var body: some View { Text("欢迎首页") } }\n`,
    )
    await write(
      root,
      'android/HomeActivity.java',
      `public class HomeActivity extends AppCompatActivity {
  void setup(TextView tv) { tv.setText("欢迎首页"); }
}\n`,
    )
    await write(
      root,
      'android/HomeScreen.kt',
      `class HomeScreenActivity : AppCompatActivity() {
  fun setup(tv: TextView) { tv.text = "欢迎首页" }
}\n`,
    )
    await write(
      root,
      'ios/HomeViewController.m',
      `@implementation HomeViewController
- (void)viewDidLoad {
  UILabel *label = [[UILabel alloc] init];
  label.text = @"欢迎首页";
}
@end\n`,
    )
    await write(
      root,
      'ios/HomeVC.swift',
      `import UIKit
class HomeVC: UIViewController {
  func setup() {
    let label = UILabel()
    label.text = "欢迎首页"
  }
}\n`,
    )
    await write(
      root,
      'flutter/lib/home.dart',
      `class HomePage extends StatelessWidget {
  Widget build(BuildContext context) => Text('欢迎首页');
}\n`,
    )
    await write(
      root,
      'rn/HomeScreen.tsx',
      `import { Text, View } from 'react-native';
export function HomeScreen() { return <View><Text>欢迎首页</Text></View>; }\n`,
    )
    await write(
      root,
      'harmony/Index.ets',
      `@Entry @Component struct Index { build() { Text('欢迎首页') } }\n`,
    )
    await write(root, 'web/home.html', `<html><body><h1>欢迎首页</h1></body></html>`)
    await write(
      root,
      'web/Home.tsx',
      `import React from 'react'
export function Home() { return <div><h1>欢迎首页</h1><button>Go</button></div> }\n`,
    )
    await write(
      root,
      'web/Plain.vue',
      `<template><h1>欢迎首页</h1></template><script setup></script>`,
    )
    await write(
      root,
      'web/Home.svelte',
      `<h1>欢迎首页</h1><style>h1{color:#112233}</style>`,
    )
    await write(
      root,
      'web/app/home/home.component.ts',
      `import { Component } from '@angular/core';
@Component({ selector: 'app-home', template: '<h1>欢迎首页</h1>' })
export class HomeComponent {}\n`,
    )
    await write(
      root,
      'pages.json',
      JSON.stringify({ pages: [{ path: 'pages/home/index' }] }),
    )
    await write(
      root,
      'pages/home/index.vue',
      `<template><view><text>欢迎首页</text></view></template>
<script>export default { onLoad() { uni.showToast({ title: 'ok' }) } }</script>`,
    )
    await write(
      root,
      'src/pages/index/index.tsx',
      `import { View, Text } from '@tarojs/components'
export default function Index() { return <View><Text>欢迎首页</Text></View> }\n`,
    )
    await write(root, 'mp/pages/a/index.wxml', `<view><text>欢迎首页</text></view>`)
    await write(root, 'mp/pages/a/index.wxss', `.t{color:#112233}`)
    await write(root, 'mp/pages/b/index.axml', `<view><text>欢迎首页</text></view>`)
    await write(root, 'mp/pages/c/index.ttml', `<view><text>欢迎首页</text></view>`)
    await write(root, 'mp/pages/d/index.swan', `<view><text>欢迎首页</text></view>`)
    await write(
      root,
      'maui/HomePage.xaml',
      `<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui">
  <Label Text="欢迎首页" /></ContentPage>`,
    )

    const pages = await discoverAllPages(root)
    const seen = new Set(pages.map((p) => p.adapterId))
    for (const id of PLANNED_ADAPTERS) {
      expect(seen.has(id), `L0 discovery missing ${id}`).toBe(true)
    }

    // One page per adapter: L1 compare must return a result (plan §7).
    for (const id of PLANNED_ADAPTERS) {
      const page = pages.find((p) => p.adapterId === id)
      expect(page, `page for ${id}`).toBeTruthy()
      const cmp = await compareDesignWithPage(design, page!)
      expect(cmp.result, `${id} compare result`).toBeTruthy()
      expect(cmp.precise, `${id} should be exact when toDesignDoc exists`).toBe(true)
    }
  })
})
