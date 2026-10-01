import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
} from '../src/design/adapters/android-xml.js'
import { parseCssLength } from '../src/design/adapters/web-css.js'
import { swiftuiSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'

describe('constraint flow wrap layout', () => {
  it('places referenced views in wrapping rows with gaps', () => {
    const resources = buildAndroidResources(`<resources></resources>`)
    const doc = normalizeAndroidLayout(
      `<androidx.constraintlayout.widget.ConstraintLayout
        xmlns:android="http://schemas.android.com/apk/res/android"
        xmlns:app="http://schemas.android.com/apk/res-auto"
        android:layout_width="200dp"
        android:layout_height="400dp">
        <View android:id="@+id/a" android:layout_width="80dp" android:layout_height="40dp" />
        <View android:id="@+id/b" android:layout_width="80dp" android:layout_height="40dp" />
        <View android:id="@+id/c" android:layout_width="80dp" android:layout_height="40dp" />
        <androidx.constraintlayout.helper.widget.Flow
          android:id="@+id/flow"
          app:constraint_referenced_ids="a,b,c"
          app:flow_horizontalGap="10dp"
          app:flow_verticalGap="12dp"
          app:flow_maxElementsWrap="2"
          app:layout_constraintStart_toStartOf="parent"
          app:layout_constraintTop_toTopOf="parent"
          app:layout_constraintEnd_toEndOf="parent" />
      </androidx.constraintlayout.widget.ConstraintLayout>`,
      resources,
    )
    const a = doc.root.children.find((n) => n.id === 'a')!
    const b = doc.root.children.find((n) => n.id === 'b')!
    const c = doc.root.children.find((n) => n.id === 'c')!
    expect(a.box).toMatchObject({ x: 0, y: 0, width: 80, height: 40 })
    expect(b.box).toMatchObject({ x: 90, y: 0, width: 80, height: 40 })
    expect(c.box).toMatchObject({ x: 0, y: 52, width: 80, height: 40 })
    expect(doc.root.children.some((n) => n.name === 'flow')).toBe(false)
  })
})

describe('swiftui text style weights', () => {
  it('applies headline semibold and .weight(.bold) override', () => {
    const headline = swiftuiSourceToDesignDoc(
      `Text("标题").font(.headline)`,
      'Home',
    )
    expect(headline.root.children[0]?.style.fontSize).toBe(17)
    expect(headline.root.children[0]?.style.fontWeight).toBe(600)

    const boldTitle = swiftuiSourceToDesignDoc(
      `Text("欢迎").font(.title2.weight(.bold))`,
      'Home',
    )
    expect(boldTitle.root.children[0]?.style.fontSize).toBe(22)
    expect(boldTitle.root.children[0]?.style.fontWeight).toBe(700)
  })
})

describe('css container query units', () => {
  it('maps cqw/cqh like viewport percentages of 360×640', () => {
    expect(parseCssLength('10cqw')).toBe(36)
    expect(parseCssLength('10cqh')).toBe(64)
    expect(parseCssLength('10cqi')).toBe(36)
    const doc = markupToDesignDoc(
      `<div class="box">欢迎</div>`,
      `.box { width: 50cqw; font-size: 4cqw; color: #112233 }`,
      'Home',
    )
    expect(doc.root.children[0]?.box.width).toBe(180)
    expect(doc.root.children[0]?.style.fontSize).toBe(14.4)
  })
})
