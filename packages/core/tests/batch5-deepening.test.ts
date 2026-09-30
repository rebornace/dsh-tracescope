import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { discoverAllPages } from '../src/design/index.js'
import { compareVisualDocs } from '../src/design/compare.js'
import { androidViewSourceToDesignDoc, uikitSourceToDesignDoc } from '../src/design/adapters/imperative-design-doc.js'
import { composeSourceToDesignDoc, swiftuiSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
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

describe('batch5 deepening', () => {
  it('builds DesignDocs from imperative and declarative sources', () => {
    const javaDoc = androidViewSourceToDesignDoc(
      `
public class HomeActivity extends AppCompatActivity {
  void setup(TextView tv) {
    tv.setText("欢迎首页");
    tv.setTextColor(Color.parseColor("#112233"));
    tv.setTextSize(20f);
  }
}
`,
      'HomeActivity',
    )
    expect(javaDoc.root.children.some((c) => c.text === '欢迎首页')).toBe(true)
    expect(compareVisualDocs(design, javaDoc).comparedPairs).toBeGreaterThan(0)

    const composeDoc = composeSourceToDesignDoc(
      `
@Composable
fun Home() {
  Text("欢迎首页", color = Color(0xFF112233), fontSize = 20.sp)
}
`,
      'Home',
    )
    expect(composeDoc.root.children.some((c) => c.text === '欢迎首页')).toBe(true)

    const swiftDoc = swiftuiSourceToDesignDoc(
      `
struct HomeView: View {
  var body: some View {
    Text("欢迎首页").font(.system(size: 20))
  }
}
`,
      'HomeView',
    )
    expect(swiftDoc.root.children.some((c) => c.text === '欢迎首页')).toBe(true)

    const uikitDoc = uikitSourceToDesignDoc(
      `
@implementation HomeViewController
- (void)setup {
  label.text = @"欢迎首页";
  label.font = [UIFont systemFontOfSize:20];
}
@end
`,
      'HomeViewController',
    )
    expect(uikitDoc.root.children.some((c) => c.text === '欢迎首页')).toBe(true)
  })

  it('discovers Alipay axml and marks compose/view as precise', async () => {
    const root = path.join(tmpdir(), `b5-${Date.now()}`)
    await write(
      root,
      'pages/index/index.axml',
      `<view><text class="t">欢迎首页</text><button>立即开始</button></view>`,
    )
    await write(root, 'pages/index/index.acss', `.t { color: #112233; font-size: 20px; }`)
    await write(
      root,
      'app/src/Home.kt',
      `
@Composable
fun Home() { Text("欢迎首页") }
`,
    )
    await write(
      root,
      'app/src/HomeActivity.java',
      `
public class HomeActivity extends AppCompatActivity {
  void setup(TextView tv) { tv.setText("欢迎首页"); }
}
`,
    )

    const pages = await discoverAllPages(root)
    expect(pages.some((p) => p.adapterId === 'miniprogram-axml')).toBe(true)
    expect(pages.find((p) => p.adapterId === 'android-compose')?.precise).toBe(true)
    expect(pages.find((p) => p.adapterId === 'android-view-java')?.precise).toBe(true)
  })
})
