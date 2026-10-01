import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
} from '../src/design/adapters/android-xml.js'
import { composeSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import { parseCssDeclarations } from '../src/design/adapters/web-css.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'

describe('android MaterialCardView', () => {
  it('maps cardBackgroundColor / cardCornerRadius / contentPadding', () => {
    const resources = buildAndroidResources(
      `<resources><color name="card">#112233</color></resources>`,
    )
    const doc = normalizeAndroidLayout(
      `<com.google.android.material.card.MaterialCardView
        xmlns:android="http://schemas.android.com/apk/res/android"
        xmlns:app="http://schemas.android.com/apk/res-auto"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        app:cardBackgroundColor="@color/card"
        app:cardCornerRadius="12dp"
        app:contentPadding="16dp" />`,
      resources,
    )
    expect(doc.root.style.backgroundColor).toBe('#112233')
    expect(doc.root.style.cornerRadius).toBe(12)
    expect(doc.root.style.paddingTop).toBe(16)
    expect(doc.root.style.paddingLeft).toBe(16)
  })

  it('maps per-side contentPaddingStart/End', () => {
    const resources = buildAndroidResources(`<resources></resources>`)
    const doc = normalizeAndroidLayout(
      `<androidx.cardview.widget.CardView
        xmlns:android="http://schemas.android.com/apk/res/android"
        xmlns:app="http://schemas.android.com/apk/res-auto"
        android:layout_width="200dp"
        android:layout_height="100dp"
        app:cardCornerRadius="8dp"
        app:contentPaddingStart="4dp"
        app:contentPaddingEnd="8dp"
        app:contentPaddingTop="2dp"
        app:contentPaddingBottom="6dp" />`,
      resources,
    )
    expect(doc.root.style.cornerRadius).toBe(8)
    expect(doc.root.style.paddingLeft).toBe(4)
    expect(doc.root.style.paddingRight).toBe(8)
    expect(doc.root.style.paddingTop).toBe(2)
    expect(doc.root.style.paddingBottom).toBe(6)
  })
})

describe('compose fillMax*', () => {
  it('maps fillMaxWidth / fillMaxHeight / fillMaxSize to 360×640', () => {
    const w = composeSourceToDesignDoc(
      `Text("宽", modifier = Modifier.fillMaxWidth())`,
      'Home',
    )
    expect(w.root.children[0]?.box.width).toBe(360)

    const h = composeSourceToDesignDoc(
      `Text("高", modifier = Modifier.fillMaxHeight())`,
      'Home',
    )
    expect(h.root.children[0]?.box.height).toBe(640)

    const full = composeSourceToDesignDoc(
      `Text("满", modifier = Modifier.fillMaxSize())`,
      'Home',
    )
    expect(full.root.children[0]?.box.width).toBe(360)
    expect(full.root.children[0]?.box.height).toBe(640)
  })

  it('maps fractional fillMaxWidth', () => {
    const doc = composeSourceToDesignDoc(
      `Text("半宽", modifier = Modifier.fillMaxWidth(0.5f))`,
      'Home',
    )
    expect(doc.root.children[0]?.box.width).toBe(180)
  })
})

describe('css background-size / background-position', () => {
  it('maps cover/contain/100% 100% and position keywords', () => {
    expect(parseCssDeclarations('background-size: cover').style.imageFit).toBe('cover')
    expect(parseCssDeclarations('background-size: contain').style.imageFit).toBe('contain')
    expect(parseCssDeclarations('background-size: 100% 100%').style.imageFit).toBe('fill')
    expect(parseCssDeclarations('background-position: left top').style.imagePosition).toBe(
      '0% 0%',
    )
  })

  it('does not override object-fit / object-position', () => {
    const style = parseCssDeclarations(
      'object-fit: contain; background-size: cover; object-position: center; background-position: left',
    ).style
    expect(style.imageFit).toBe('contain')
    expect(style.imagePosition).toBe('50% 50%')
  })

  it('applies via markup class', () => {
    const doc = markupToDesignDoc(
      `<div class="hero">封面</div>`,
      `.hero { width: 360px; height: 200px; background-size: cover; background-position: right bottom }`,
      'Home',
    )
    expect(doc.root.children[0]?.style.imageFit).toBe('cover')
    expect(doc.root.children[0]?.style.imagePosition).toBe('100% 100%')
  })
})
