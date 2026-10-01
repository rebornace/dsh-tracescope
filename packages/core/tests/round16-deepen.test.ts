import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
  parseAndroidShapeDrawable,
} from '../src/design/adapters/android-xml.js'
import { swiftuiSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import { parseCssDeclarations } from '../src/design/adapters/web-css.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'

describe('android vector tint', () => {
  it('prefers android:tint over path fillColor', () => {
    const resources = buildAndroidResources(
      `<resources><color name="icon">#112233</color></resources>`,
    )
    const vec = parseAndroidShapeDrawable(
      `<vector xmlns:android="http://schemas.android.com/apk/res/android"
        android:width="24dp"
        android:height="24dp"
        android:viewportWidth="24"
        android:viewportHeight="24"
        android:tint="@color/icon">
        <path android:fillColor="#FF000000" android:pathData="M0,0h24v24H0z"/>
      </vector>`,
      resources,
    )
    expect(vec?.backgroundColor).toBe('#112233')
    resources.drawables.ic_home = vec!
    const doc = normalizeAndroidLayout(
      `<ImageView xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="24dp"
        android:layout_height="24dp"
        android:src="@drawable/ic_home"
        android:tint="#abcdef"
        android:scaleType="centerCrop" />`,
      resources,
    )
    expect(doc.root.style.color).toBe('#abcdef')
    expect(doc.root.style.backgroundColor).toBe('#abcdef')
    expect(doc.root.style.imageFit).toBe('cover')
  })
})

describe('swiftui safeAreaInset / safeAreaPadding', () => {
  it('maps safeAreaPadding edges and safeAreaInset bottom chrome', () => {
    const pad = swiftuiSourceToDesignDoc(
      `Text("欢迎").safeAreaPadding(.horizontal, 16).font(.body)`,
      'Home',
    )
    expect(pad.root.children[0]?.style.paddingLeft).toBe(16)
    expect(pad.root.children[0]?.style.paddingRight).toBe(16)

    const inset = swiftuiSourceToDesignDoc(
      `Text("底栏").safeAreaInset(edge: .bottom) { Color.clear.frame(height: 0) }`,
      'Home',
    )
    expect(inset.root.children[0]?.style.paddingBottom).toBe(34)
  })
})

describe('css object-fit', () => {
  it('maps object-fit to imageFit', () => {
    expect(parseCssDeclarations('object-fit: cover').style.imageFit).toBe('cover')
    expect(parseCssDeclarations('object-fit: contain').style.imageFit).toBe('contain')
    expect(parseCssDeclarations('object-fit: fill').style.imageFit).toBe('fill')
    const doc = markupToDesignDoc(
      `<img class="hero" alt="封面" />`,
      `.hero { width: 360px; height: 200px; object-fit: cover }`,
      'Home',
    )
    expect(doc.root.children[0]?.style.imageFit).toBe('cover')
    expect(doc.root.children[0]?.box.width).toBe(360)
  })
})
