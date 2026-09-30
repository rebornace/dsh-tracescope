import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { discoverAllPages } from '../src/design/index.js'
import { compareVisualDocs } from '../src/design/compare.js'
import {
  flutterSourceToDesignDoc,
  reactNativeSourceToDesignDoc,
  arkuiSourceToDesignDoc,
} from '../src/design/adapters/declarative-design-doc.js'
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
    ],
  },
}

describe('batch6 cross-platform L1', () => {
  it('builds DesignDocs for Flutter / RN / ArkUI', () => {
    const flutterDoc = flutterSourceToDesignDoc(
      `
class HomePage extends StatelessWidget {
  Widget build(BuildContext context) {
    return Text('欢迎首页', style: TextStyle(fontSize: 20, color: Color(0xFF112233)));
  }
}
`,
      'HomePage',
    )
    expect(flutterDoc.root.children.some((c) => c.text === '欢迎首页')).toBe(true)
    expect(compareVisualDocs(design, flutterDoc).comparedPairs).toBeGreaterThan(0)

    const rnDoc = reactNativeSourceToDesignDoc(
      `
import { Text, View } from 'react-native';
export function Home() {
  return <Text style={{ fontSize: 20, color: '#112233' }}>欢迎首页</Text>;
}
`,
      'Home',
    )
    expect(rnDoc.root.children.some((c) => c.text === '欢迎首页')).toBe(true)

    const arkDoc = arkuiSourceToDesignDoc(
      `
@Entry
@Component
struct Index {
  build() {
    Text('欢迎首页').fontSize(20).fontColor('#112233')
  }
}
`,
      'Index',
    )
    expect(arkDoc.root.children.some((c) => c.text === '欢迎首页')).toBe(true)
  })

  it('marks flutter/rn/arkui pages as precise', async () => {
    const root = path.join(tmpdir(), `b6-${Date.now()}`)
    await write(
      root,
      'lib/home.dart',
      `class HomePage extends StatelessWidget {
  Widget build(BuildContext c) => Text('欢迎首页');
}`,
    )
    await write(
      root,
      'src/Home.tsx',
      `import { Text } from 'react-native';
export function Home() { return <Text>欢迎首页</Text>; }`,
    )
    await write(
      root,
      'pages/Index.ets',
      `@Entry @Component struct Index { build() { Text('欢迎首页') } }`,
    )

    const pages = await discoverAllPages(root)
    expect(pages.find((p) => p.adapterId === 'flutter')?.precise).toBe(true)
    expect(pages.find((p) => p.adapterId === 'react-native')?.precise).toBe(true)
    expect(pages.find((p) => p.adapterId === 'harmony-arkui')?.precise).toBe(true)
  })
})
