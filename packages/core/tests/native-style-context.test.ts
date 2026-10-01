import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  extractColorSymbols,
  loadNativeStyleContext,
  rewriteColorSymbols,
} from '../src/design/adapters/native-style-context.js'
import { reactNativeSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import { flutterSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import { composeSourceToDesignDoc } from '../src/design/adapters/declarative-design-doc.js'
import { androidViewSourceToDesignDoc } from '../src/design/adapters/imperative-design-doc.js'
import { normalizeMauiXaml } from '../src/design/adapters/maui-xaml.js'

async function withTemp(run: (root: string) => Promise<void>) {
  const dir = path.join(
    os.tmpdir(),
    `ts-native-style-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  await mkdir(dir, { recursive: true })
  await run(dir)
}

describe('native style context', () => {
  it('merges RN companion StyleSheet and resolves color symbols', async () => {
    await withTemp(async (root) => {
      await writeFile(
        path.join(root, 'colors.ts'),
        `export const AppColors = { primary: '#112233' }`,
        'utf8',
      )
      await writeFile(
        path.join(root, 'styles.ts'),
        `import { AppColors } from './colors'
import { StyleSheet } from 'react-native'
export const styles = StyleSheet.create({
  title: { color: AppColors.primary, fontSize: 20 }
})`,
        'utf8',
      )
      const page = path.join(root, 'Home.tsx')
      await writeFile(
        page,
        `import { Text } from 'react-native'
import { styles } from './styles'
export default function Home(){ return <Text style={styles.title}>欢迎</Text> }`,
        'utf8',
      )
      const src = await (await import('node:fs/promises')).readFile(page, 'utf8')
      const ctx = await loadNativeStyleContext(page, src, 'rn')
      const doc = reactNativeSourceToDesignDoc(ctx.source, 'Home')
      const node = doc.root.children.find((c) => c.text === '欢迎')
      expect(node?.style.color).toBe('#112233')
      expect(node?.style.fontSize).toBe(20)
    })
  })

  it('resolves Flutter AppColors into Text styles', async () => {
    await withTemp(async (root) => {
      await writeFile(
        path.join(root, 'app_colors.dart'),
        `class AppColors { static const primary = Color(0xFF112233); }`,
        'utf8',
      )
      const page = path.join(root, 'home.dart')
      await writeFile(
        page,
        `import 'app_colors.dart';
Widget build() => Text('欢迎', style: TextStyle(color: AppColors.primary, fontSize: 18));`,
        'utf8',
      )
      const src = await (await import('node:fs/promises')).readFile(page, 'utf8')
      const ctx = await loadNativeStyleContext(page, src, 'flutter')
      const doc = flutterSourceToDesignDoc(ctx.source, 'home')
      const node = doc.root.children.find((c) => c.text === '欢迎')
      expect(node?.style.color).toBe('#112233ff')
      expect(node?.style.fontSize).toBe(18)
    })
  })

  it('resolves Compose object colours', async () => {
    await withTemp(async (root) => {
      await writeFile(
        path.join(root, 'Color.kt'),
        `object AppColors { val Primary = Color(0xFF112233) }`,
        'utf8',
      )
      const page = path.join(root, 'Home.kt')
      await writeFile(
        page,
        `fun Home(){ Text("欢迎", color = AppColors.Primary, fontSize = 16.sp) }`,
        'utf8',
      )
      const src = await (await import('node:fs/promises')).readFile(page, 'utf8')
      const ctx = await loadNativeStyleContext(page, src, 'compose')
      const doc = composeSourceToDesignDoc(ctx.source, 'Home')
      const node = doc.root.children.find((c) => c.text === '欢迎')
      expect(node?.style.color).toBe('#112233ff')
    })
  })

  it('resolves Android colors.xml via getColor rewrite', () => {
    const colors = extractColorSymbols(`<color name="title">#112233</color>`)
    expect(colors.get('title')).toBe('#112233')
    const src = rewriteColorSymbols(
      `titleView.setTextColor(ContextCompat.getColor(ctx, R.color.title)); titleView.setText("欢迎");`,
      colors,
      'android-view',
    )
    expect(src).toContain('parseColor("#112233")')
    const doc = androidViewSourceToDesignDoc(src, 'Home')
    const node = doc.root.children.find((c) => c.text === '欢迎')
    expect(node?.style.color).toBe('#112233')
  })

  it('resolves MAUI StaticResource colours', async () => {
    await withTemp(async (root) => {
      await mkdir(path.join(root, 'Resources', 'Styles'), { recursive: true })
      await writeFile(
        path.join(root, 'Resources', 'Styles', 'Colors.xaml'),
        `<ResourceDictionary><Color x:Key="Primary">#112233</Color></ResourceDictionary>`,
        'utf8',
      )
      const page = path.join(root, 'Home.xaml')
      await writeFile(
        page,
        `<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui">
  <Label Text="欢迎" TextColor="{StaticResource Primary}" FontSize="20" />
</ContentPage>`,
        'utf8',
      )
      const xaml = await (await import('node:fs/promises')).readFile(page, 'utf8')
      const ctx = await loadNativeStyleContext(page, xaml, 'maui')
      const doc = normalizeMauiXaml(ctx.source, 'Home')
      const node = doc.root.children.find((c) => c.text === '欢迎')
        ?? doc.root.children.flatMap((c) => c.children).find((c) => c.text === '欢迎')
      expect(node?.style.color).toBe('#112233')
    })
  })
})
