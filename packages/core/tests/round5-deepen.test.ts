import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  collectConstraintGuides,
  normalizeAndroidLayout,
} from '../src/design/adapters/android-xml.js'
import { parseXml } from '../src/design/xml-lite.js'
import { parseCssLength } from '../src/design/adapters/web-css.js'
import {
  extractComposeTypographySizes,
  rewriteComposeTypographySymbols,
} from '../src/design/adapters/native-style-context.js'
import { composeSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'

describe('constraint barrier coarse edges', () => {
  it('places barrier at max end of referenced views', () => {
    const resources = buildAndroidResources(`<resources></resources>`)
    const xml = `<androidx.constraintlayout.widget.ConstraintLayout
      xmlns:android="http://schemas.android.com/apk/res/android"
      xmlns:app="http://schemas.android.com/apk/res-auto"
      android:layout_width="360dp"
      android:layout_height="640dp">
      <View
        android:id="@+id/a"
        android:layout_width="40dp"
        android:layout_height="20dp"
        android:layout_marginStart="10dp"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintTop_toTopOf="parent" />
      <View
        android:id="@+id/b"
        android:layout_width="80dp"
        android:layout_height="20dp"
        android:layout_marginStart="20dp"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintTop_toTopOf="parent" />
      <androidx.constraintlayout.widget.Barrier
        android:id="@+id/endBarrier"
        app:barrierDirection="end"
        app:constraint_referenced_ids="a,b" />
      <TextView
        android:id="@+id/title"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginStart="4dp"
        android:text="欢迎"
        app:layout_constraintStart_toStartOf="@+id/endBarrier"
        app:layout_constraintTop_toTopOf="parent" />
    </androidx.constraintlayout.widget.ConstraintLayout>`
    const guides = collectConstraintGuides(parseXml(xml), resources, { width: 360, height: 640 })
    // b ends at 20+80=100; a ends at 10+40=50 → barrier x=100
    expect(guides.get('endBarrier')).toEqual({ x: 100 })
    const doc = normalizeAndroidLayout(xml, resources)
    expect(doc.root.children.find((n) => n.id === 'title')?.box.x).toBe(104)
  })
})

describe('compose typography', () => {
  it('rewrites MaterialTheme.typography roles', () => {
    const sizes = extractComposeTypographySizes(
      `Typography(titleLarge = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.Bold))`,
    )
    expect(sizes.get('titleLarge')).toBe(24)
    expect(sizes.get('bodyMedium')).toBe(14)
    const src = rewriteComposeTypographySymbols(
      `Text("欢迎", style = MaterialTheme.typography.titleLarge)`,
      sizes,
    )
    expect(src).toContain('TextStyle(fontSize = 24.sp)')
    const doc = composeSourceToDesignDoc(src, 'Home')
    expect(doc.root.children.find((c) => c.text === '欢迎')?.style.fontSize).toBe(24)
  })
})

describe('css clamp/min/max lengths', () => {
  it('resolves clamp min max and vw', () => {
    expect(parseCssLength('clamp(12px, 4vw, 24px)')).toBe(14.4)
    expect(parseCssLength('min(10px, 20px)')).toBe(10)
    expect(parseCssLength('max(10px, 20px)')).toBe(20)
    expect(parseCssLength('1.5rem')).toBe(24)
  })

  it('applies clamp font-size in markup rules', () => {
    const doc = markupToDesignDoc(
      `<div class="title">欢迎</div>`,
      `.title { font-size: clamp(16px, 5vw, 20px); color: #112233 }`,
      'Home',
    )
    // 5vw of 360 = 18 → within [16,20]
    expect(doc.root.children[0]?.style.fontSize).toBe(18)
    expect(doc.root.children[0]?.style.color).toBe('#112233')
  })
})
