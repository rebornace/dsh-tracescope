import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
  parseAndroidShapeDrawable,
} from '../src/design/adapters/android-xml.js'
import { loadAssociatedStyles } from '../src/design/adapters/load-associated-styles.js'
import {
  extractCssCustomProperties,
  preprocessStylesheet,
  resolveCssVarReferences,
} from '../src/design/adapters/web-css.js'
import { markupToDesignDoc } from '../src/design/adapters/web-markup.js'
import {
  extractColorSymbols,
  loadNativeStyleContext,
  rewriteColorSymbols,
} from '../src/design/adapters/native-style-context.js'
import { composeSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import { flutterSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'

async function withTemp(run: (root: string) => Promise<void>) {
  const dir = path.join(
    os.tmpdir(),
    `ts-deep-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  await mkdir(dir, { recursive: true })
  await run(dir)
}

describe('android ?attr + shape drawable', () => {
  it('resolves ?attr/colorPrimary from Theme style', () => {
    const resources = buildAndroidResources(
      `<resources>
        <color name="brand">#112233</color>
        <style name="Theme.App" parent="Theme.MaterialComponents.DayNight">
          <item name="colorPrimary">@color/brand</item>
          <item name="android:textColorPrimary">@color/brand</item>
        </style>
      </resources>`,
    )
    expect(resources.attrs.colorPrimary).toBe('#112233')
    const doc = normalizeAndroidLayout(
      `<TextView xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="欢迎"
        android:textColor="?attr/colorPrimary" />`,
      resources,
    )
    expect(doc.root.style.color).toBe('#112233')
  })

  it('parses shape drawable fill and radius', () => {
    const resources = buildAndroidResources(
      `<resources><color name="card">#abcdef</color></resources>`,
    )
    const shape = parseAndroidShapeDrawable(
      `<shape xmlns:android="http://schemas.android.com/apk/res/android">
        <solid android:color="@color/card"/>
        <corners android:radius="8dp"/>
      </shape>`,
      resources,
    )
    expect(shape?.backgroundColor).toBe('#abcdef')
    expect(shape?.cornerRadius).toBe(8)
    resources.drawables.card_bg = shape!
    const doc = normalizeAndroidLayout(
      `<View xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="100dp"
        android:layout_height="40dp"
        android:background="@drawable/card_bg" />`,
      resources,
    )
    expect(doc.root.style.backgroundColor).toBe('#abcdef')
    expect(doc.root.style.cornerRadius).toBe(8)
  })
})

describe('web css variables + global theme', () => {
  it('inlines var(--token) and nested vars', () => {
    const css = preprocessStylesheet(`
      :root { --brand: #112233; --title: var(--brand); }
      .title { color: var(--title); font-size: 18px; }
    `)
    expect(css).toContain('#112233')
    expect(css).not.toMatch(/var\(--title\)/)
    const doc = markupToDesignDoc(`<div class="title">欢迎</div>`, css, 'Home')
    expect(doc.root.children[0]?.style.color).toBe('#112233')
  })

  it('uses fallback when var missing', () => {
    expect(resolveCssVarReferences('color: var(--missing, #ff0000)')).toContain('#ff0000')
    expect(extractCssCustomProperties('--a: 1px;').get('--a')).toBe('1px')
  })

  it('loads styles/theme.css globals for a page', async () => {
    await withTemp(async (root) => {
      await mkdir(path.join(root, 'styles'), { recursive: true })
      await writeFile(
        path.join(root, 'styles', 'theme.css'),
        ':root { --brand: #112233; }',
        'utf8',
      )
      const page = path.join(root, 'Home.vue')
      await writeFile(
        page,
        `<template><div class="title">欢迎</div></template>
<style>.title{color:var(--brand);font-size:20px}</style>`,
        'utf8',
      )
      const css = await loadAssociatedStyles({
        entryAbsolutePath: page,
        sourceText: await (await import('node:fs/promises')).readFile(page, 'utf8'),
        inlineCss: '.title{color:var(--brand);font-size:20px}',
      })
      const doc = markupToDesignDoc(`<div class="title">欢迎</div>`, css, 'Home')
      expect(doc.root.children[0]?.style.color).toBe('#112233')
      expect(doc.root.children[0]?.style.fontSize).toBe(20)
    })
  })
})

describe('flutter / compose theme colour scheme', () => {
  it('rewrites MaterialTheme.colorScheme.primary', () => {
    const colors = extractColorSymbols(
      `ColorScheme.light(primary: Color(0xFF112233), onPrimary: Color(0xFFFFFFFF))`,
    )
    expect(colors.get('MaterialTheme.colorScheme.primary')).toBe('#112233ff')
    const src = rewriteColorSymbols(
      `Text("欢迎", color = MaterialTheme.colorScheme.primary)`,
      colors,
      'compose',
    )
    expect(src).toMatch(/Color\(0x[fF]{2}112233\)/)
    const doc = composeSourceToDesignDoc(src, 'Home')
    expect(doc.root.children.find((c) => c.text === '欢迎')?.style.color).toBe('#112233ff')
  })

  it('rewrites Theme.of(context).colorScheme.primary for Flutter', async () => {
    await withTemp(async (root) => {
      await writeFile(
        path.join(root, 'theme.dart'),
        `final scheme = ColorScheme.light(primary: Color(0xFF112233));`,
        'utf8',
      )
      const page = path.join(root, 'home.dart')
      await writeFile(
        page,
        `import 'theme.dart';
Widget build(BuildContext context) => Text('欢迎', style: TextStyle(color: Theme.of(context).colorScheme.primary, fontSize: 18));`,
        'utf8',
      )
      const src = await (await import('node:fs/promises')).readFile(page, 'utf8')
      const ctx = await loadNativeStyleContext(page, src, 'flutter')
      expect(ctx.source).toMatch(/Color\(0xFF112233\)/)
      const doc = flutterSourceToDesignDoc(ctx.source, 'home')
      expect(doc.root.children.find((c) => c.text === '欢迎')?.style.color).toBe('#112233ff')
    })
  })
})
