import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  collectConstraintGuides,
  normalizeAndroidLayout,
} from '../src/design/adapters/android-xml.js'
import { parseXml } from '../src/design/xml-lite.js'
import {
  normalizeUIKitDoc,
  resolveIosDynamicTypeSize,
} from '../src/design/adapters/ios-xib.js'
import {
  extractTextThemeSizes,
  rewriteTextThemeSymbols,
} from '../src/design/adapters/native-style-context.js'
import { flutterSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import { swiftuiSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'

describe('constraint guideline positioning', () => {
  it('positions views relative to vertical guideline begin', () => {
    const resources = buildAndroidResources(`<resources></resources>`)
    const xml = `<androidx.constraintlayout.widget.ConstraintLayout
      xmlns:android="http://schemas.android.com/apk/res/android"
      xmlns:app="http://schemas.android.com/apk/res-auto"
      android:layout_width="360dp"
      android:layout_height="640dp">
      <androidx.constraintlayout.widget.Guideline
        android:id="@+id/gStart"
        android:orientation="vertical"
        app:layout_constraintGuide_begin="48dp" />
      <TextView
        android:id="@+id/title"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginStart="8dp"
        android:text="欢迎"
        app:layout_constraintStart_toStartOf="@+id/gStart"
        app:layout_constraintTop_toTopOf="parent" />
    </androidx.constraintlayout.widget.ConstraintLayout>`
    const guides = collectConstraintGuides(parseXml(xml), resources, { width: 360, height: 640 })
    expect(guides.get('gStart')).toEqual({ x: 48 })
    const doc = normalizeAndroidLayout(xml, resources)
    const title = doc.root.children.find((n) => n.id === 'title')!
    expect(title.box.x).toBe(56)
    expect(title.box.y).toBe(0)
    expect(doc.root.children.some((n) => n.name === 'guideline')).toBe(false)
  })

  it('resolves percent guidelines against parent size', () => {
    const resources = buildAndroidResources(`<resources></resources>`)
    const root = parseXml(`<androidx.constraintlayout.widget.ConstraintLayout>
      <Guideline android:id="@+id/mid" android:orientation="horizontal"
        app:layout_constraintGuide_percent="0.25" />
    </androidx.constraintlayout.widget.ConstraintLayout>`)
    const guides = collectConstraintGuides(root, resources, { width: 360, height: 400 })
    expect(guides.get('mid')?.y).toBe(100)
  })
})

describe('ios dynamic type', () => {
  it('maps UICTFontTextStyle tokens', () => {
    expect(resolveIosDynamicTypeSize('UICTFontTextStyleBody')?.size).toBe(17)
    expect(resolveIosDynamicTypeSize('UICTFontTextStyleHeadline')?.weight).toBe(600)
    expect(resolveIosDynamicTypeSize('title1')?.size).toBe(28)
  })

  it('applies dynamic type size when pointSize absent', () => {
    const doc = normalizeUIKitDoc(`<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.XIB">
  <objects>
    <view id="v0">
      <rect key="frame" x="0" y="0" width="100" height="100"/>
      <subviews>
        <label id="L1">
          <rect key="frame" x="0" y="0" width="80" height="20"/>
          <fontDescription key="fontDescription" style="UICTFontTextStyleHeadline" type="system"/>
          <string key="text">欢迎</string>
        </label>
      </subviews>
    </view>
  </objects>
</document>`)
    const label = doc.root.children.find((n) => n.id === 'L1')!
    expect(label.style.fontSize).toBe(17)
    expect(label.style.fontWeight).toBe(600)
  })

  it('maps SwiftUI .font(.title2)', () => {
    const doc = swiftuiSourceToDesignDoc(
      `struct Home: View { var body: some View { Text("欢迎").font(.title2) } }`,
      'Home',
    )
    expect(doc.root.children.find((c) => c.text === '欢迎')?.style.fontSize).toBe(22)
  })
})

describe('flutter text theme', () => {
  it('rewrites Theme.of textTheme roles to TextStyle fontSize', () => {
    const sizes = extractTextThemeSizes(
      `textTheme: TextTheme(titleLarge: TextStyle(fontSize: 24, fontWeight: FontWeight.bold))`,
    )
    expect(sizes.get('titleLarge')).toBe(24)
    expect(sizes.get('bodyMedium')).toBe(14)
    const src = rewriteTextThemeSymbols(
      `Text('欢迎', style: Theme.of(context).textTheme.titleLarge)`,
      sizes,
    )
    expect(src).toContain('TextStyle(fontSize: 24)')
    const doc = flutterSourceToDesignDoc(src, 'home')
    expect(doc.root.children.find((c) => c.text === '欢迎')?.style.fontSize).toBe(24)
  })
})
