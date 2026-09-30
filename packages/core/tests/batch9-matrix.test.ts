import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { discoverAllPages } from '../src/design/index.js'
import { matchPages, adapterSpecificity } from '../src/design/page-fingerprint.js'
import { platformAdapters } from '../src/design/registry.js'
import type { AdapterId } from '../src/design/adapters/adapter-types.js'
import type { CodePage } from '../src/design/adapters/adapter-types.js'
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
        box: {},
        style: {},
        children: [],
      },
    ],
  },
}

const EXPECTED_ADAPTERS: AdapterId[] = [
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

describe('batch9 matrix + ranking', () => {
  it('registers every planned adapter id', () => {
    const ids = new Set(platformAdapters().map((a) => a.id))
    for (const id of EXPECTED_ADAPTERS) {
      expect(ids.has(id), `missing adapter ${id}`).toBe(true)
    }
    expect(ids.size).toBe(EXPECTED_ADAPTERS.length)
  })

  it('prefers uni-app over web-vue on near-tie scores', () => {
    expect(adapterSpecificity('uni-app')).toBeGreaterThan(adapterSpecificity('web-vue'))
    expect(adapterSpecificity('taro')).toBeGreaterThan(adapterSpecificity('web-react'))
    expect(adapterSpecificity('miniprogram-wxml')).toBeGreaterThan(
      adapterSpecificity('web-html'),
    )

    const uni: CodePage = {
      adapterId: 'uni-app',
      platform: 'web',
      kindLabel: 'uni-app',
      relativePath: 'pages/home/index.vue',
      absolutePath: '/r/pages/home/index.vue',
      precise: true,
      fingerprint: { texts: ['欢迎首页'], nameTokens: ['home'], controlCount: 3 },
    }
    const vue: CodePage = {
      adapterId: 'web-vue',
      platform: 'web',
      kindLabel: 'Web Vue',
      relativePath: 'pages/home/index.vue',
      absolutePath: '/r/pages/home/index.vue',
      precise: true,
      fingerprint: { texts: ['欢迎首页'], nameTokens: ['home'], controlCount: 3 },
    }
    const matches = matchPages(design, [vue, uni])
    expect(matches[0]!.page.adapterId).toBe('uni-app')
  })

  it('discovers one fixture per major stack without web-vue stealing uni', async () => {
    const root = path.join(tmpdir(), `b9-matrix-${Date.now()}`)

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
      `<?xml version="1.0"?><document type="com.apple.InterfaceBuilder3.CocoaTouch.XIB">
  <objects><label text="欢迎首页" id="L1"/></objects></document>`,
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
    await write(root, 'web/home.html', `<html><body><h1>欢迎首页</h1><button>Go</button></body></html>`)
    await write(
      root,
      'web/Home.svelte',
      `<h1>欢迎首页</h1><button>Go</button><style>h1{color:#112233}</style>`,
    )
    await write(
      root,
      'web/app/home/home.component.ts',
      `import { Component } from '@angular/core';
@Component({ selector: 'app-home', template: '<h1>欢迎首页</h1><button>Go</button>' })
export class HomeComponent {}\n`,
    )
    await write(
      root,
      'web/Plain.vue',
      `<template><h1>欢迎首页</h1><button>Go</button></template><script setup></script>`,
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
    await write(
      root,
      'mp/pages/a/index.wxml',
      `<view><text>欢迎首页</text><button>Go</button></view>`,
    )
    await write(root, 'mp/pages/a/index.wxss', `.t{color:#112233}`)
    await write(
      root,
      'mp/pages/b/index.axml',
      `<view><text>欢迎首页</text><button>Go</button></view>`,
    )
    await write(
      root,
      'mp/pages/c/index.ttml',
      `<view><text>欢迎首页</text><button>Go</button></view>`,
    )
    await write(
      root,
      'mp/pages/d/index.swan',
      `<view><text>欢迎首页</text><button>Go</button></view>`,
    )
    await write(
      root,
      'maui/HomePage.xaml',
      `<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui">
  <Label Text="欢迎首页" /></ContentPage>`,
    )

    const pages = await discoverAllPages(root)
    const byId = new Map<string, number>()
    for (const p of pages) byId.set(p.adapterId, (byId.get(p.adapterId) ?? 0) + 1)

    const mustSee: AdapterId[] = [
      'android-xml',
      'ios-xib',
      'android-compose',
      'ios-swiftui',
      'android-view-java',
      'ios-uikit-objc',
      'flutter',
      'react-native',
      'harmony-arkui',
      'web-html',
      'web-svelte',
      'web-angular',
      'web-vue',
      'uni-app',
      'taro',
      'miniprogram-wxml',
      'miniprogram-axml',
      'miniprogram-ttml',
      'miniprogram-swan',
      'maui-xaml',
    ]
    for (const id of mustSee) {
      expect(byId.get(id) ?? 0, `expected discovery for ${id}`).toBeGreaterThan(0)
    }

    // uni page must not also be claimed by web-vue
    const uniPaths = pages.filter((p) => p.adapterId === 'uni-app').map((p) => p.relativePath)
    for (const rel of uniPaths) {
      expect(pages.some((p) => p.adapterId === 'web-vue' && p.relativePath === rel)).toBe(false)
    }
    // taro page must not also be claimed by web-react
    const taroPaths = pages.filter((p) => p.adapterId === 'taro').map((p) => p.relativePath)
    for (const rel of taroPaths) {
      expect(pages.some((p) => p.adapterId === 'web-react' && p.relativePath === rel)).toBe(false)
    }

    const matches = matchPages(design, pages)
    expect(matches.length).toBeGreaterThan(0)
  })
})
