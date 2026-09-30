import { describe, expect, it } from 'vitest'
import { compareVisualDocs } from '../src/design/compare.js'
import {
  composeSourceToDesignDoc,
  swiftuiSourceToDesignDoc,
  flutterSourceToDesignDoc,
  reactNativeSourceToDesignDoc,
  arkuiSourceToDesignDoc,
} from '../src/design/adapters/declarative-design-doc.js'
import type { DesignDoc } from '../src/design/types.js'

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
        box: { x: 16, y: 40, width: 200, height: 40 },
        style: {
          color: '#112233',
          fontSize: 20,
          fontWeight: 700,
          backgroundColor: '#ff6600',
          cornerRadius: 8,
          paddingTop: 12,
          paddingBottom: 12,
          paddingLeft: 12,
          paddingRight: 12,
        },
        children: [],
      },
    ],
  },
}

describe('batch10 declarative L1 geometry', () => {
  it('extracts Compose size / padding / radius / weight / background onto Text', () => {
    const doc = composeSourceToDesignDoc(
      `
@Composable
fun Home() {
  Text(
    "欢迎首页",
    color = Color(0xFF112233),
    fontSize = 20.sp,
    fontWeight = FontWeight.Bold,
    modifier = Modifier
      .width(200.dp)
      .height(40.dp)
      .padding(12.dp)
      .background(Color(0xFFFF6600), RoundedCornerShape(8.dp))
  )
}
`,
      'Home',
    )
    const node = doc.root.children.find((c) => c.text === '欢迎首页')
    expect(node).toBeTruthy()
    expect(node!.style.fontSize).toBe(20)
    expect(node!.style.fontWeight).toBe(700)
    expect(node!.style.color).toBe('#112233ff')
    expect(node!.style.backgroundColor).toBe('#ff6600ff')
    expect(node!.style.cornerRadius).toBe(8)
    expect(node!.style.paddingTop).toBe(12)
    expect(node!.box.width).toBe(200)
    expect(node!.box.height).toBe(40)
    expect(compareVisualDocs(design, doc).comparedPairs).toBeGreaterThan(0)
  })

  it('extracts SwiftUI frame / padding / cornerRadius / bold onto Text', () => {
    const doc = swiftuiSourceToDesignDoc(
      `
struct HomeView: View {
  var body: some View {
    Text("欢迎首页")
      .font(.system(size: 20))
      .bold()
      .foregroundColor(Color(red: 0.067, green: 0.133, blue: 0.2))
      .frame(width: 200, height: 40)
      .padding(12)
      .background(Color(red: 1, green: 0.4, blue: 0))
      .cornerRadius(8)
  }
}
`,
      'HomeView',
    )
    const node = doc.root.children.find((c) => c.text === '欢迎首页')
    expect(node).toBeTruthy()
    expect(node!.style.fontSize).toBe(20)
    expect(node!.style.fontWeight).toBe(700)
    expect(node!.style.cornerRadius).toBe(8)
    expect(node!.style.paddingTop).toBe(12)
    expect(node!.box.width).toBe(200)
    expect(node!.box.height).toBe(40)
  })

  it('extracts Flutter padding / radius / size near Text', () => {
    const doc = flutterSourceToDesignDoc(
      `
class HomePage extends StatelessWidget {
  Widget build(BuildContext context) {
    return Container(
      width: 200,
      height: 40,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Color(0xFFFF6600),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text('欢迎首页', style: TextStyle(fontSize: 20, color: Color(0xFF112233), fontWeight: FontWeight.bold)),
    );
  }
}
`,
      'HomePage',
    )
    const node = doc.root.children.find((c) => c.text === '欢迎首页')
    expect(node).toBeTruthy()
    expect(node!.style.fontSize).toBe(20)
    expect(node!.style.fontWeight).toBe(700)
    expect(node!.style.cornerRadius).toBe(8)
    expect(node!.style.paddingTop).toBe(12)
    expect(node!.box.width).toBe(200)
    expect(node!.box.height).toBe(40)
  })

  it('resolves RN StyleSheet refs and padding/margin', () => {
    const doc = reactNativeSourceToDesignDoc(
      `
import { Text, StyleSheet } from 'react-native';
export function Home() {
  return <Text style={styles.title}>欢迎首页</Text>;
}
const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    color: '#112233',
    fontWeight: 'bold',
    backgroundColor: '#ff6600',
    borderRadius: 8,
    width: 200,
    height: 40,
    padding: 12,
    marginHorizontal: 16,
  },
});
`,
      'Home',
    )
    const node = doc.root.children.find((c) => c.text === '欢迎首页')
    expect(node).toBeTruthy()
    expect(node!.style.fontSize).toBe(20)
    expect(node!.style.fontWeight).toBe(700)
    expect(node!.style.cornerRadius).toBe(8)
    expect(node!.style.paddingTop).toBe(12)
    expect(node!.style.marginLeft).toBe(16)
    expect(node!.box.width).toBe(200)
  })

  it('extracts ArkUI chained geometry onto Text', () => {
    const doc = arkuiSourceToDesignDoc(
      `
@Entry
@Component
struct Index {
  build() {
    Text('欢迎首页')
      .fontSize(20)
      .fontWeight(FontWeight.Bold)
      .fontColor('#112233')
      .backgroundColor('#ff6600')
      .borderRadius(8)
      .padding(12)
      .width(200)
      .height(40)
  }
}
`,
      'Index',
    )
    const node = doc.root.children.find((c) => c.text === '欢迎首页')
    expect(node).toBeTruthy()
    expect(node!.style.fontSize).toBe(20)
    expect(node!.style.fontWeight).toBe(700)
    expect(node!.style.cornerRadius).toBe(8)
    expect(node!.style.paddingTop).toBe(12)
    expect(node!.box.width).toBe(200)
    expect(node!.box.height).toBe(40)
  })
})
