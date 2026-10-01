import { describe, expect, it } from 'vitest'
import {
  composeSourceToDesignDoc,
  extractComposeAxisHint,
  extractFlutterAxisHint,
  extractRnAxisHint,
  extractSwiftuiAxisHint,
  flutterSourceToDesignDoc,
  reactNativeSourceToDesignDoc,
  swiftuiSourceToDesignDoc,
} from '../src/design/adapters/declarative-design-doc.js'

describe('compose Column/Row axis layout', () => {
  it('extracts spacedBy Column and stacks with gap', () => {
    const hint = extractComposeAxisHint(
      `Column(verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) { Text("A"); Text("B") }`,
    )
    expect(hint).toMatchObject({
      direction: 'column',
      gap: 12,
      alignItems: 'center',
      justifyContent: 'start',
    })

    const doc = composeSourceToDesignDoc(
      `Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
         Text("标题", modifier = Modifier.height(24.dp))
         Text("副标题", modifier = Modifier.height(16.dp))
       }`,
      'Home',
    )
    expect(doc.root.style.gap).toBe(12)
    expect(doc.root.children[0]?.box.y).toBe(0)
    expect(doc.root.children[1]?.box.y).toBe(36)
  })

  it('stacks Row with spacedBy along x', () => {
    const doc = composeSourceToDesignDoc(
      `Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
         Text("左", modifier = Modifier.width(40.dp).height(20.dp))
         Text("右", modifier = Modifier.width(40.dp).height(20.dp))
       }`,
      'Home',
    )
    expect(doc.root.children[0]?.box.x).toBe(0)
    expect(doc.root.children[1]?.box.x).toBe(48)
    expect(doc.root.style.gap).toBe(8)
  })
})

describe('swiftui VStack/HStack axis layout', () => {
  it('extracts VStack spacing and stacks', () => {
    const hint = extractSwiftuiAxisHint(`VStack(alignment: .leading, spacing: 10) { Text("A"); Text("B") }`)
    expect(hint).toMatchObject({ direction: 'column', gap: 10, alignItems: 'start' })

    const doc = swiftuiSourceToDesignDoc(
      `VStack(spacing: 10) {
         Text("A").frame(height: 20)
         Text("B").frame(height: 20)
       }`,
      'Home',
    )
    // frame(height:) may not be parsed; ensureStackableSizes defaults text to 20.
    expect(doc.root.style.gap).toBe(10)
    expect(doc.root.children[0]?.box.y).toBe(0)
    expect(doc.root.children[1]?.box.y).toBe(30)
  })

  it('stacks HStack along x', () => {
    const doc = swiftuiSourceToDesignDoc(
      `HStack(spacing: 6) { Text("左"); Text("右") }`,
      'Home',
    )
    expect(doc.root.children[0]?.box.x).toBe(0)
    expect(typeof doc.root.children[1]?.box.x).toBe('number')
    expect((doc.root.children[1]?.box.x as number) > 0).toBe(true)
  })
})

describe('flutter Column/Row axis layout', () => {
  it('extracts Column main/cross + SizedBox gap', () => {
    const hint = extractFlutterAxisHint(`
      Column(
        mainAxisAlignment: MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text('A'),
          SizedBox(height: 16),
          Text('B'),
        ],
      )
    `)
    expect(hint).toMatchObject({
      direction: 'column',
      gap: 16,
      alignItems: 'center',
      justifyContent: 'start',
    })

    const doc = flutterSourceToDesignDoc(
      `Column(
        children: [
          Text('标题', style: TextStyle(fontSize: 18)),
          SizedBox(height: 16),
          Text('副标题', style: TextStyle(fontSize: 14)),
        ],
      )`,
      'Home',
    )
    expect(doc.root.style.gap).toBe(16)
    expect(doc.root.children[0]?.box.y).toBe(0)
    const h0 = Number(doc.root.children[0]?.box.height) || 0
    expect(doc.root.children[1]?.box.y).toBe(h0 + 16)
  })

  it('maps spaceBetween justify', () => {
    const hint = extractFlutterAxisHint(
      `Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('A'), Text('B')])`,
    )
    expect(hint?.direction).toBe('row')
    expect(hint?.justifyContent).toBe('space-between')
  })
})

describe('rn flexDirection axis layout', () => {
  it('extracts flexDirection column + gap', () => {
    expect(
      extractRnAxisHint(`const styles = StyleSheet.create({ box: { flexDirection: 'column', gap: 12 } })`),
    ).toMatchObject({ direction: 'column', gap: 12 })

    const doc = reactNativeSourceToDesignDoc(
      `
      const styles = StyleSheet.create({
        col: { flexDirection: 'column', gap: 12 },
        t: { height: 20 },
      })
      export function Home() {
        return (
          <View style={styles.col}>
            <Text style={styles.t}>标题</Text>
            <Text style={styles.t}>副标题</Text>
          </View>
        )
      }
      `,
      'Home',
    )
    expect(doc.root.style.gap).toBe(12)
    expect(doc.root.children[0]?.box.y).toBe(0)
    expect(doc.root.children[1]?.box.y).toBe(32)
  })
})
