import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  androidResourceDirRank,
  buildAndroidResources,
  normalizeAndroidColor,
  normalizeAndroidLayout,
} from '../src/design/adapters/android-xml.js'
import { parseCssColor } from '../src/design/adapters/web-css.js'
import {
  extractColorSymbols,
  loadNativeStyleContext,
  rewriteColorSymbols,
} from '../src/design/adapters/native-style-context.js'
import { reactNativeSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'

async function withTemp(run: (root: string) => Promise<void>) {
  const dir = path.join(
    os.tmpdir(),
    `ts-cont-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  await mkdir(dir, { recursive: true })
  await run(dir)
}

describe('android framework attr / string / include', () => {
  it('falls back to Material light defaults for undeclared ?attr', () => {
    const resources = buildAndroidResources(`<resources></resources>`)
    expect(normalizeAndroidColor('?attr/colorPrimary', resources)).toBe('#6200ee')
    expect(normalizeAndroidColor('?android:attr/textColorPrimary', resources)).toBe('#000000de')
  })

  it('resolves @string and expands include', () => {
    const resources = buildAndroidResources(
      `<resources><string name="welcome">欢迎</string><color name="title">#112233</color></resources>`,
    )
    const doc = normalizeAndroidLayout(
      `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="match_parent"
        android:layout_height="match_parent">
        <include layout="@layout/title_bar"/>
      </LinearLayout>`,
      resources,
      {
        resolveLayout: (name) =>
          name === 'title_bar'
            ? `<TextView xmlns:android="http://schemas.android.com/apk/res/android"
                android:id="@+id/title"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="@string/welcome"
                android:textColor="@color/title"
                android:textSize="18sp"/>`
            : undefined,
      },
    )
    const title = doc.root.children.find((n) => n.id === 'title')
    expect(title?.text).toBe('欢迎')
    expect(title?.style.color).toBe('#112233')
    expect(title?.style.fontSize).toBe(18)
  })

  it('ranks values above values-night', () => {
    expect(androidResourceDirRank('values')).toBeGreaterThan(androidResourceDirRank('values-night'))
    expect(androidResourceDirRank('drawable')).toBeGreaterThan(androidResourceDirRank('drawable-night'))
  })
})

describe('web modern colour tokens', () => {
  it('parses space-separated rgb and hsl', () => {
    expect(parseCssColor('rgb(17 34 51)')).toBe('#112233')
    expect(parseCssColor('rgb(17, 34, 51)')).toBe('#112233')
    expect(parseCssColor('hsl(210, 50%, 40%)')).toMatch(/^#[0-9a-f]{6}$/)
    expect(parseCssColor('hsl(210 50% 40%)')).toEqual(parseCssColor('hsl(210, 50%, 40%)'))
  })
})

describe('rn useTheme colours', () => {
  it('rewrites theme.colors / useTheme().colors', async () => {
    await withTemp(async (root) => {
      await writeFile(
        path.join(root, 'theme.ts'),
        `export const theme = { colors: { primary: '#112233' } }`,
        'utf8',
      )
      const page = path.join(root, 'Home.tsx')
      await writeFile(
        page,
        `import { Text } from 'react-native'
import { theme } from './theme'
export default function Home(){
  return <Text style={{ color: theme.colors.primary, fontSize: 20 }}>欢迎</Text>
}`,
        'utf8',
      )
      const src = await (await import('node:fs/promises')).readFile(page, 'utf8')
      const colors = extractColorSymbols(src + '\n' + (await (await import('node:fs/promises')).readFile(path.join(root, 'theme.ts'), 'utf8')))
      expect(colors.get('theme.colors.primary')).toBe('#112233')
      const rewritten = rewriteColorSymbols(
        `const c = useTheme().colors.primary`,
        colors,
        'rn',
      )
      expect(rewritten).toContain("'#112233'")
      const ctx = await loadNativeStyleContext(page, src, 'rn')
      const doc = reactNativeSourceToDesignDoc(ctx.source, 'Home')
      expect(doc.root.children.find((c) => c.text === '欢迎')?.style.color).toBe('#112233')
    })
  })
})
