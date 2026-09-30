import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  analyzeLayoutDependencies,
  formatDependencyManifest,
} from '../src/design/deps-manifest.js'
import { loadAndroidProjectResources } from '../src/design/android-resources.js'
import { buildAndroidRenderContext } from '../src/design/android-render-context.js'

describe('analyzeLayoutDependencies (multi-file)', () => {
  const roots: string[] = []

  afterEach(async () => {
    for (const dir of roots) await rm(dir, { recursive: true, force: true })
    roots.length = 0
  })

  async function fixtureProject(): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'tracescope-deps-'))
    roots.push(root)
    const res = path.join(root, 'app', 'src', 'main', 'res')
    await mkdir(path.join(res, 'layout'), { recursive: true })
    await mkdir(path.join(res, 'drawable'), { recursive: true })
    await mkdir(path.join(res, 'values'), { recursive: true })

    await writeFile(
      path.join(res, 'layout', 'home.xml'),
      [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"',
        '    android:layout_width="match_parent" android:layout_height="match_parent"',
        '    android:background="@color/screen_bg">',
        '    <include layout="@layout/item_header" />',
        '    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content"',
        '        android:text="@string/title" android:textColor="@color/brand"',
        '        style="@style/Card" />',
        '    <View android:layout_width="match_parent" android:layout_height="10dp"',
        '        android:background="@drawable/bg_card" />',
        '</LinearLayout>',
      ].join('\n'),
      'utf8',
    )

    await writeFile(
      path.join(res, 'layout', 'item_header.xml'),
      '<?xml version="1.0"?>\n<TextView xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="@dimen/header_height" android:background="@color/brand" />',
      'utf8',
    )

    await writeFile(
      path.join(res, 'drawable', 'bg_card.xml'),
      '<?xml version="1.0"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android"><solid android:color="@color/card_fill" /><corners android:radius="8dp" /><stroke android:width="1dp" android:color="@color/brand" /></shape>',
      'utf8',
    )

    await writeFile(
      path.join(res, 'values', 'colors.xml'),
      '<?xml version="1.0"?>\n<resources><color name="screen_bg">#ffffff</color><color name="brand">#1a9b6e</color><color name="card_fill">#f5f5f5</color></resources>',
      'utf8',
    )
    await writeFile(
      path.join(res, 'values', 'dimens.xml'),
      '<?xml version="1.0"?>\n<resources><dimen name="header_height">48dp</dimen></resources>',
      'utf8',
    )
    await writeFile(
      path.join(res, 'values', 'strings.xml'),
      '<?xml version="1.0"?>\n<resources><string name="title">首页标题</string></resources>',
      'utf8',
    )
    await writeFile(
      path.join(res, 'values', 'styles.xml'),
      '<?xml version="1.0"?>\n<resources><style name="Base" /><style name="Card" parent="Base"><item name="android:padding">@dimen/card_padding</item></style></resources>',
      'utf8',
    )
    // padding referenced only from the style body.
    await writeFile(
      path.join(res, 'values', 'dimens2.xml'),
      '<?xml version="1.0"?>\n<resources><dimen name="card_padding">12dp</dimen></resources>',
      'utf8',
    )

    return root
  }

  it('resolves include + drawable + style inheritance to real files', async () => {
    const root = await fixtureProject()
    const resources = await loadAndroidProjectResources(root)
    const built = await buildAndroidRenderContext(root, resources)
    const manifest = await analyzeLayoutDependencies('home', built, resources)

    const has = (file: string) => file.split(path.sep).join('/')
    expect(has(manifest.entryLayout)).toMatch(/layout\/home\.xml$/)

    const layouts = manifest.layouts.map(has)
    expect(layouts.some((f) => f.endsWith('layout/item_header.xml'))).toBe(true)

    const drawables = manifest.drawables.map(has)
    expect(drawables.some((f) => f.endsWith('drawable/bg_card.xml'))).toBe(true)

    // drawable -> @color/card_fill and layout -> @color/brand & screen_bg.
    const colors = manifest.colorFiles.map(has)
    expect(colors.some((f) => f.endsWith('values/colors.xml'))).toBe(true)

    // @dimen/header_height from included layout, and @dimen/card_padding from
    // inside the style body must both surface.
    const dimens = manifest.dimenFiles.map(has)
    expect(dimens.some((f) => f.endsWith('values/dimens.xml'))).toBe(true)
    expect(dimens.some((f) => f.endsWith('values/dimens2.xml'))).toBe(true)

    const strings = manifest.stringFiles.map(has)
    expect(strings.some((f) => f.endsWith('values/strings.xml'))).toBe(true)

    // @style/Card -> parent Base; both live in styles.xml, listed once.
    const styleFiles = manifest.styleFiles.map(has)
    expect(styleFiles.some((f) => f.endsWith('values/styles.xml'))).toBe(true)

    // Everything in the fixture resolved; no unresolved symbols.
    expect(manifest.unresolved).toEqual([])
  })

  it('formats the manifest as repo-relative paths grouped by kind', async () => {
    const root = await fixtureProject()
    const resources = await loadAndroidProjectResources(root)
    const built = await buildAndroidRenderContext(root, resources)
    const manifest = await analyzeLayoutDependencies('home', built, resources)
    const text = formatDependencyManifest(manifest, root)
    expect(text).toContain('app/src/main/res/layout/home.xml')
    expect(text).toContain('<include>')
    expect(text).toContain('parent 继承链')
  })
})
