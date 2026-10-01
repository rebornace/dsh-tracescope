import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
  parseAndroidShapeDrawable,
} from '../src/design/adapters/android-xml.js'
import { swiftuiSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import {
  filterPrefersColorSchemeBlocks,
  preprocessStylesheet,
} from '../src/design/adapters/web-css.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'

describe('android inset drawable', () => {
  it('maps nested shape fill and inset* to padding', () => {
    const resources = buildAndroidResources(
      `<resources><color name="card">#112233</color></resources>`,
    )
    const inset = parseAndroidShapeDrawable(
      `<inset xmlns:android="http://schemas.android.com/apk/res/android"
        android:insetLeft="8dp"
        android:insetTop="4dp"
        android:insetRight="8dp"
        android:insetBottom="4dp">
        <shape android:shape="rectangle">
          <solid android:color="@color/card"/>
          <corners android:radius="6dp"/>
        </shape>
      </inset>`,
      resources,
    )
    expect(inset?.backgroundColor).toBe('#112233')
    expect(inset?.cornerRadius).toBe(6)
    expect(inset?.paddingLeft).toBe(8)
    expect(inset?.paddingTop).toBe(4)
    resources.drawables.card_inset = inset!
    const doc = normalizeAndroidLayout(
      `<View xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="100dp"
        android:layout_height="40dp"
        android:background="@drawable/card_inset" />`,
      resources,
    )
    expect(doc.root.style.backgroundColor).toBe('#112233')
    expect(doc.root.style.cornerRadius).toBe(6)
    expect(doc.root.style.paddingLeft).toBe(8)
    expect(doc.root.style.paddingTop).toBe(4)
  })
})

describe('swiftui foregroundStyle system colors', () => {
  it('resolves .blue / Color.primary semantic tokens', () => {
    const blue = swiftuiSourceToDesignDoc(
      `Text("标题").font(.headline).foregroundStyle(.blue)`,
      'Home',
    )
    expect(blue.root.children[0]?.style.color).toBe('#007aff')

    const primary = swiftuiSourceToDesignDoc(
      `Text("欢迎").foregroundColor(Color.primary)`,
      'Home',
    )
    expect(primary.root.children[0]?.style.color).toBe('#000000')
  })
})

describe('css prefers-color-scheme', () => {
  it('keeps light branch and drops dark branch', () => {
    const filtered = filterPrefersColorSchemeBlocks(
      `.box { color: #111111 }
      @media (prefers-color-scheme: light) { .box { color: #112233 } }
      @media (prefers-color-scheme: dark) { .box { color: #eeeeee; background: #000 } }`,
      'light',
    )
    expect(filtered).toContain('#112233')
    expect(filtered).not.toContain('#eeeeee')

    const sheet = preprocessStylesheet(`
      .box { color: #111111 }
      @media (prefers-color-scheme: dark) { .box { color: #ffffff } }
      @media (prefers-color-scheme: light) { .box { color: #abcdef } }
    `)
    const doc = markupToDesignDoc(`<div class="box">欢迎</div>`, sheet, 'Home')
    expect(doc.root.children[0]?.style.color).toBe('#abcdef')
  })
})
