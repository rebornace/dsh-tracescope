import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
  parseAndroidShapeDrawable,
} from '../src/design/adapters/android-xml.js'
import {
  arkuiSourceToDesignDoc,
} from '../src/design/adapters/declarative-design-doc.js'
import {
  extractArkuiFontSizes,
  rewriteArkuiFontSizeSymbols,
} from '../src/design/adapters/native-style-context.js'
import { parseCssColor } from '../src/design/adapters/web-css.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'

describe('android layer-list drawable', () => {
  it('takes topmost solid fill and radius from nested shapes', () => {
    const resources = buildAndroidResources(
      `<resources><color name="base">#eeeeee</color><color name="card">#112233</color></resources>`,
    )
    const layer = parseAndroidShapeDrawable(
      `<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
        <item>
          <shape android:shape="rectangle">
            <solid android:color="@color/base"/>
            <corners android:radius="4dp"/>
          </shape>
        </item>
        <item android:top="1dp" android:left="1dp">
          <shape android:shape="rectangle">
            <solid android:color="@color/card"/>
            <corners android:radius="8dp"/>
          </shape>
        </item>
      </layer-list>`,
      resources,
    )
    expect(layer?.backgroundColor).toBe('#112233')
    expect(layer?.cornerRadius).toBe(8)
    resources.drawables.card_layer = layer!
    const doc = normalizeAndroidLayout(
      `<View xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="100dp"
        android:layout_height="40dp"
        android:background="@drawable/card_layer" />`,
      resources,
    )
    expect(doc.root.style.backgroundColor).toBe('#112233')
    expect(doc.root.style.cornerRadius).toBe(8)
  })
})

describe('arkui font size tokens', () => {
  it('parses fp() and rewrites FontSize / $r float tokens', () => {
    const fpDoc = arkuiSourceToDesignDoc(
      `Text('标题').fontSize(fp(18)).fontColor('#112233')`,
      'Home',
    )
    expect(fpDoc.root.children[0]?.style.fontSize).toBe(18)

    const sizes = extractArkuiFontSizes(
      `export const FontSize = { title: 22, body: 15 }`,
    )
    expect(sizes.get('FontSize.title')).toBe(22)
    const rewritten = rewriteArkuiFontSizeSymbols(
      `Text('欢迎').fontSize(FontSize.title)\nText('说明').fontSize($r('sys.float.ohos_id_text_size_body1'))`,
      sizes,
    )
    const doc = arkuiSourceToDesignDoc(rewritten, 'Home')
    expect(doc.root.children[0]?.style.fontSize).toBe(22)
    expect(doc.root.children[1]?.style.fontSize).toBe(16)
  })
})

describe('css light-dark()', () => {
  it('prefers the light (first) branch for L1', () => {
    expect(parseCssColor('light-dark(#112233, #eeeeee)')).toBe('#112233')
    expect(parseCssColor('light-dark(rgb(17, 34, 51), #fff)')).toBe('#112233')
    const doc = markupToDesignDoc(
      `<div class="box">欢迎</div>`,
      `.box { color: light-dark(#112233, #ffffff); background: light-dark(#abcdef, #000) }`,
      'Home',
    )
    expect(doc.root.children[0]?.style.color).toBe('#112233')
    expect(doc.root.children[0]?.style.backgroundColor).toBe('#abcdef')
  })
})
