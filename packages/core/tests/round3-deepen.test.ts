import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  androidResourceDirRank,
  buildAndroidResources,
  loadAndroidXmlResources,
  normalizeAndroidLayout,
  parseConstraintDimensionRatio,
} from '../src/design/adapters/android-xml.js'
import { oklchToHex, parseCssColor } from '../src/design/adapters/web-css.js'

async function withTemp(run: (root: string) => Promise<void>) {
  const dir = path.join(
    os.tmpdir(),
    `ts-n3-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  await mkdir(dir, { recursive: true })
  await run(dir)
}

describe('constraint layout coarse hints', () => {
  it('parses dimension ratio and parent margins', () => {
    expect(parseConstraintDimensionRatio('H,16:9')).toEqual({ width: 16, height: 9 })
    const resources = buildAndroidResources(`<resources></resources>`)
    const doc = normalizeAndroidLayout(
      `<androidx.constraintlayout.widget.ConstraintLayout
        xmlns:android="http://schemas.android.com/apk/res/android"
        xmlns:app="http://schemas.android.com/apk/res-auto"
        android:layout_width="match_parent"
        android:layout_height="match_parent">
        <View
          android:id="@+id/card"
          android:layout_width="160dp"
          android:layout_height="0dp"
          android:layout_marginStart="12dp"
          android:layout_marginTop="24dp"
          app:layout_constraintStart_toStartOf="parent"
          app:layout_constraintTop_toTopOf="parent"
          app:layout_constraintDimensionRatio="H,16:9" />
      </androidx.constraintlayout.widget.ConstraintLayout>`,
      resources,
    )
    const card = doc.root.children.find((n) => n.id === 'card')!
    expect(card.box.x).toBe(12)
    expect(card.box.y).toBe(24)
    expect(card.box.width).toBe(160)
    expect(card.box.height).toBe(90)
    expect(card.box.height).not.toEqual(expect.objectContaining({ unresolved: true }))
  })

  it('marks 0dp match_constraint as unresolved width', () => {
    const resources = buildAndroidResources(`<resources></resources>`)
    const doc = normalizeAndroidLayout(
      `<View xmlns:android="http://schemas.android.com/apk/res/android"
        xmlns:app="http://schemas.android.com/apk/res-auto"
        android:layout_width="0dp"
        android:layout_height="40dp"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent" />`,
      resources,
    )
    expect(doc.root.box.width).toEqual({ unresolved: true, raw: '0dp' })
    expect(doc.root.box.height).toBe(40)
  })
})

describe('android uiMode resource preference', () => {
  it('ranks night above values in dark mode', () => {
    expect(androidResourceDirRank('values-night', 'dark')).toBeGreaterThan(
      androidResourceDirRank('values', 'dark'),
    )
    expect(androidResourceDirRank('values', 'light')).toBeGreaterThan(
      androidResourceDirRank('values-night', 'light'),
    )
  })

  it('loads night colours when uiMode=dark', async () => {
    await withTemp(async (root) => {
      const res = path.join(root, 'app', 'src', 'main', 'res')
      await mkdir(path.join(res, 'values'), { recursive: true })
      await mkdir(path.join(res, 'values-night'), { recursive: true })
      await mkdir(path.join(res, 'layout'), { recursive: true })
      await writeFile(
        path.join(res, 'values', 'colors.xml'),
        `<resources><color name="brand">#112233</color></resources>`,
        'utf8',
      )
      await writeFile(
        path.join(res, 'values-night', 'colors.xml'),
        `<resources><color name="brand">#aabbcc</color></resources>`,
        'utf8',
      )
      const layout = path.join(res, 'layout', 'home.xml')
      await writeFile(
        layout,
        `<TextView xmlns:android="http://schemas.android.com/apk/res/android"
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:textColor="@color/brand"
          android:text="欢迎"/>`,
        'utf8',
      )
      const light = await loadAndroidXmlResources(layout, { uiMode: 'light' })
      const dark = await loadAndroidXmlResources(layout, { uiMode: 'dark' })
      expect(light.colors.brand).toBe('#112233')
      expect(dark.colors.brand).toBe('#aabbcc')
    })
  })
})

describe('oklch and color-mix', () => {
  it('parses oklch into hex', () => {
    const hex = parseCssColor('oklch(0.628 0.2577 29.23)')
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    // Roughly a vivid red-orange; ensure conversion is deterministic.
    expect(oklchToHex(0.628, 0.2577, 29.23)).toBe(hex)
  })

  it('blends color-mix in srgb', () => {
    expect(parseCssColor('color-mix(in srgb, #000000 50%, #ffffff)')).toBe('#808080')
    expect(parseCssColor('color-mix(in srgb, #ff0000, #0000ff)')).toBe('#800080')
  })
})
