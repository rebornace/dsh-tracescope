import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
  parseAndroidShapeDrawable,
} from '../src/design/adapters/android-xml.js'
import { reactNativeSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import { parseCssAspectRatio } from '../src/design/adapters/web-css.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'

describe('android level-list drawable', () => {
  it('picks the highest maxLevel item fill', () => {
    const resources = buildAndroidResources(
      `<resources>
        <color name="empty">#eeeeee</color>
        <color name="full">#112233</color>
      </resources>`,
    )
    const level = parseAndroidShapeDrawable(
      `<level-list xmlns:android="http://schemas.android.com/apk/res/android">
        <item android:maxLevel="0">
          <shape><solid android:color="@color/empty"/></shape>
        </item>
        <item android:maxLevel="100">
          <shape>
            <solid android:color="@color/full"/>
            <corners android:radius="4dp"/>
          </shape>
        </item>
      </level-list>`,
      resources,
    )
    expect(level?.backgroundColor).toBe('#112233')
    expect(level?.cornerRadius).toBe(4)
    resources.drawables.battery = level!
    const doc = normalizeAndroidLayout(
      `<View xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="40dp"
        android:layout_height="20dp"
        android:background="@drawable/battery" />`,
      resources,
    )
    expect(doc.root.style.backgroundColor).toBe('#112233')
  })
})

describe('rn StyleSheet.hairlineWidth', () => {
  it('maps hairlineWidth to 0.5 borderWidth', () => {
    const doc = reactNativeSourceToDesignDoc(
      `import { StyleSheet, Text, View } from 'react-native'
      const styles = StyleSheet.create({
        box: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#112233', width: 100, height: 40 },
        title: { fontSize: 16, color: '#112233' },
      })
      export function Home() {
        return <View style={styles.box}><Text style={styles.title}>欢迎</Text></View>
      }`,
      'Home',
    )
    const text = doc.root.children.find((n) => n.kind === 'text')
    expect(text?.style.fontSize).toBe(16)
    const box = doc.root.children.find((n) => n.style.borderWidth !== undefined)
      ?? doc.root.children.find((n) => n.box.width === 100)
    expect(box?.style.borderWidth).toBe(0.5)
    expect(box?.style.borderColor).toBe('#112233')
  })
})

describe('css aspect-ratio', () => {
  it('derives missing height or width from ratio', () => {
    expect(parseCssAspectRatio('16 / 9')).toBeCloseTo(16 / 9)
    expect(parseCssAspectRatio('1.5')).toBe(1.5)
    const fromWidth = markupToDesignDoc(
      `<div class="box">欢迎</div>`,
      `.box { width: 180px; aspect-ratio: 16 / 9; color: #112233 }`,
      'Home',
    )
    expect(fromWidth.root.children[0]?.box.width).toBe(180)
    expect(fromWidth.root.children[0]?.box.height).toBeCloseTo(101.25, 1)

    const fromHeight = markupToDesignDoc(
      `<div class="card">欢迎</div>`,
      `.card { height: 90px; aspect-ratio: 2; background: #abcdef }`,
      'Home',
    )
    expect(fromHeight.root.children[0]?.box.height).toBe(90)
    expect(fromHeight.root.children[0]?.box.width).toBe(180)
  })
})
