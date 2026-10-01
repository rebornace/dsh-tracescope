import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  parseAndroidShapeDrawable,
} from '../src/design/adapters/android-xml.js'
import { composeSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import {
  parseCssDeclarations,
  parseCssObjectPosition,
} from '../src/design/adapters/web-css.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'

describe('android adaptive-icon', () => {
  it('uses background color and mild squircle cornerRadius', () => {
    const resources = buildAndroidResources(
      `<resources><color name="ic_bg">#336699</color></resources>`,
    )
    const icon = parseAndroidShapeDrawable(
      `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
        <background android:drawable="@color/ic_bg"/>
        <foreground android:drawable="@color/ic_bg"/>
      </adaptive-icon>`,
      resources,
    )
    expect(icon?.backgroundColor).toBe('#336699')
    expect(icon?.cornerRadius).toBe(18)
  })

  it('reads nested background shape fill', () => {
    const resources = buildAndroidResources(`<resources></resources>`)
    const icon = parseAndroidShapeDrawable(
      `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
        <background>
          <shape android:shape="rectangle">
            <solid android:color="#112233"/>
          </shape>
        </background>
        <foreground>
          <vector android:width="108dp" android:height="108dp"
            android:viewportWidth="108" android:viewportHeight="108"
            android:tint="#FFFFFFFF">
            <path android:fillColor="#FF000000" android:pathData="M0,0h108v108H0z"/>
          </vector>
        </foreground>
      </adaptive-icon>`,
      resources,
    )
    expect(icon?.backgroundColor).toBe('#112233')
    expect(icon?.cornerRadius).toBe(18)
  })
})

describe('compose WindowInsets padding', () => {
  it('maps statusBars / navigationBars / systemBars helpers', () => {
    const status = composeSourceToDesignDoc(
      `Text("顶栏", modifier = Modifier.statusBarsPadding())`,
      'Home',
    )
    expect(status.root.children[0]?.style.paddingTop).toBe(24)

    const nav = composeSourceToDesignDoc(
      `Text("底栏", modifier = Modifier.navigationBarsPadding())`,
      'Home',
    )
    expect(nav.root.children[0]?.style.paddingBottom).toBe(48)

    const sys = composeSourceToDesignDoc(
      `Text("整页", modifier = Modifier.systemBarsPadding())`,
      'Home',
    )
    expect(sys.root.children[0]?.style.paddingTop).toBe(24)
    expect(sys.root.children[0]?.style.paddingBottom).toBe(48)
  })

  it('maps imePadding and WindowInsets.ime', () => {
    const ime = composeSourceToDesignDoc(
      `Text("输入", modifier = Modifier.imePadding())`,
      'Home',
    )
    expect(ime.root.children[0]?.style.paddingBottom).toBe(320)

    const win = composeSourceToDesignDoc(
      `Text("输入", modifier = Modifier.windowInsetsPadding(WindowInsets.ime))`,
      'Home',
    )
    expect(win.root.children[0]?.style.paddingBottom).toBe(320)
  })

  it('maps explicit WindowInsets(dp) padding', () => {
    const doc = composeSourceToDesignDoc(
      `Text("定制", modifier = Modifier.windowInsetsPadding(WindowInsets(left = 4.dp, top = 8.dp, right = 12.dp, bottom = 16.dp)))`,
      'Home',
    )
    const s = doc.root.children[0]?.style
    expect(s?.paddingLeft).toBe(4)
    expect(s?.paddingTop).toBe(8)
    expect(s?.paddingRight).toBe(12)
    expect(s?.paddingBottom).toBe(16)
  })
})

describe('css object-position', () => {
  it('normalizes keywords and percentages to X% Y%', () => {
    expect(parseCssObjectPosition('center')).toBe('50% 50%')
    expect(parseCssObjectPosition('left top')).toBe('0% 0%')
    expect(parseCssObjectPosition('top right')).toBe('100% 0%')
    expect(parseCssObjectPosition('bottom')).toBe('50% 100%')
    expect(parseCssObjectPosition('25% 75%')).toBe('25% 75%')
    expect(parseCssDeclarations('object-position: left center').style.imagePosition).toBe(
      '0% 50%',
    )
  })

  it('applies object-position on img via markup', () => {
    const doc = markupToDesignDoc(
      `<img class="hero" alt="封面" />`,
      `.hero { width: 360px; height: 200px; object-fit: cover; object-position: right bottom }`,
      'Home',
    )
    expect(doc.root.children[0]?.style.imageFit).toBe('cover')
    expect(doc.root.children[0]?.style.imagePosition).toBe('100% 100%')
  })
})
