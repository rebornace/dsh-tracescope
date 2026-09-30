import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { discoverAllPages } from '../src/design/index.js'
import { heuristicCompare } from '../src/design/heuristic-compare.js'
import type { DesignDoc } from '../src/design/types.js'

async function write(root: string, rel: string, content: string): Promise<string> {
  const abs = path.join(root, rel)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, content, 'utf8')
  return abs
}

describe('batch2 adapters', () => {
  it('discovers Java View, Flutter, RN, ArkUI pages', async () => {
    const root = path.join(tmpdir(), `b2-${Date.now()}`)
    await write(
      root,
      'app/src/main/java/com/demo/HomeActivity.java',
      `
package com.demo;
public class HomeActivity extends AppCompatActivity {
  void setup() {
    TextView tv = new TextView(this);
    tv.setText("首页标题");
  }
}
`,
    )
    await write(
      root,
      'lib/home_page.dart',
      `
import 'package:flutter/material.dart';
class HomePage extends StatelessWidget {
  Widget build(BuildContext context) {
    return Scaffold(body: Text('首页标题'));
  }
}
`,
    )
    await write(
      root,
      'src/screens/HomeScreen.tsx',
      `
import { View, Text, Button } from 'react-native';
export function HomeScreen() {
  return <View><Text>首页标题</Text><Button title="去看看" /></View>;
}
`,
    )
    await write(
      root,
      'entry/src/main/ets/pages/Index.ets',
      `
@Entry
@Component
struct Index {
  build() {
    Column() {
      Text('首页标题')
      Button('去看看')
    }
  }
}
`,
    )

    const pages = await discoverAllPages(root)
    const ids = new Set(pages.map((p) => p.adapterId))
    expect(ids.has('android-view-java')).toBe(true)
    expect(ids.has('flutter')).toBe(true)
    expect(ids.has('react-native')).toBe(true)
    expect(ids.has('harmony-arkui')).toBe(true)

    const flutter = pages.find((p) => p.adapterId === 'flutter')!
    const design: DesignDoc = {
      scale: 1,
      source: 'manual',
      root: {
        id: 'root',
        name: 'home',
        kind: 'frame',
        box: { x: 0, y: 0, width: 100, height: 200 },
        style: {},
        children: [
          {
            id: 't1',
            name: 'title',
            kind: 'text',
            text: '首页标题',
            box: { x: 0, y: 0, width: 80, height: 20 },
            style: {},
            children: [],
          },
          {
            id: 't2',
            name: 'missing',
            kind: 'text',
            text: '不存在的文案',
            box: { x: 0, y: 30, width: 80, height: 20 },
            style: {},
            children: [],
          },
        ],
      },
    }
    const result = await heuristicCompare(design, flutter)
    expect(result.comparedPairs).toBeGreaterThanOrEqual(1)
    expect(result.diffs.some((d) => d.property === 'text' && String(d.expected).includes('不存在'))).toBe(
      true,
    )
  })
})
