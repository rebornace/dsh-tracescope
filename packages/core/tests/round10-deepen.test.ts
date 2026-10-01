import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
  parseAndroidShapeDrawable,
} from '../src/design/adapters/android-xml.js'
import { composeSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import {
  extractComposeShapeSizes,
  rewriteComposeShapeSymbols,
} from '../src/design/adapters/native-style-context.js'
import {
  preprocessStylesheet,
  resolveCssColorSchemePrefer,
  rewriteLightDarkFunctions,
} from '../src/design/adapters/web-css.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'

describe('android clip drawable', () => {
  it('unwraps nested shape fill ignoring clip level', () => {
    const resources = buildAndroidResources(
      `<resources><color name="bar">#112233</color></resources>`,
    )
    const clip = parseAndroidShapeDrawable(
      `<clip xmlns:android="http://schemas.android.com/apk/res/android"
        android:clipOrientation="horizontal"
        android:gravity="left">
        <shape android:shape="rectangle">
          <solid android:color="@color/bar"/>
          <corners android:radius="4dp"/>
        </shape>
      </clip>`,
      resources,
    )
    expect(clip?.backgroundColor).toBe('#112233')
    expect(clip?.cornerRadius).toBe(4)
    resources.drawables.progress = clip!
    const doc = normalizeAndroidLayout(
      `<View xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="100dp"
        android:layout_height="8dp"
        android:background="@drawable/progress" />`,
      resources,
    )
    expect(doc.root.style.backgroundColor).toBe('#112233')
    expect(doc.root.style.cornerRadius).toBe(4)
  })
})

describe('compose MaterialTheme.shapes', () => {
  it('rewrites shapes.medium and reads RoundedCornerShape radius', () => {
    const sizes = extractComposeShapeSizes(
      `val AppShapes = Shapes(medium = RoundedCornerShape(10.dp), large = RoundedCornerShape(20.dp))`,
    )
    expect(sizes.get('medium')).toBe(10)

    const defaults = composeSourceToDesignDoc(
      `Text("卡片", modifier = Modifier.clip(MaterialTheme.shapes.large))`,
      'Home',
    )
    expect(defaults.root.children[0]?.style.cornerRadius).toBe(16)

    const rewritten = rewriteComposeShapeSymbols(
      `Text("卡片", modifier = Modifier.clip(MaterialTheme.shapes.medium))`,
      sizes,
    )
    expect(rewritten).toContain('RoundedCornerShape(10.dp)')
    const after = composeSourceToDesignDoc(rewritten, 'Home')
    expect(after.root.children[0]?.style.cornerRadius).toBe(10)
  })
})

describe('css color-scheme', () => {
  it('prefers dark light-dark branch when color-scheme is only dark', () => {
    expect(resolveCssColorSchemePrefer(':root { color-scheme: only dark }')).toBe('dark')
    expect(resolveCssColorSchemePrefer(':root { color-scheme: light dark }')).toBe('light')
    expect(rewriteLightDarkFunctions('color: light-dark(#111111, #eeeeee)', 'dark')).toBe(
      'color: #eeeeee',
    )
    const sheet = preprocessStylesheet(`
      :root { color-scheme: only dark }
      .box { color: light-dark(#112233, #abcdef) }
      @media (prefers-color-scheme: light) { .box { color: #000000 } }
      @media (prefers-color-scheme: dark) { .box { background: #111111 } }
    `)
    const doc = markupToDesignDoc(`<div class="box">欢迎</div>`, sheet, 'Home')
    expect(doc.root.children[0]?.style.color).toBe('#abcdef')
    expect(doc.root.children[0]?.style.backgroundColor).toBe('#111111')
  })
})
