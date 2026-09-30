import { describe, expect, it } from 'vitest'
import { normalizeMauiXaml } from '../src/design/adapters/maui-xaml.js'
import { compareVisualDocs } from '../src/design/compare.js'
import type { DesignDoc } from '../src/design/types.js'

const design: DesignDoc = {
  scale: 1,
  source: 'manual',
  root: {
    id: 'root',
    name: 'home',
    kind: 'frame',
    box: {},
    style: {},
    children: [
      {
        id: 't1',
        name: 'title',
        kind: 'text',
        text: '欢迎首页',
        box: { width: 200, height: 40 },
        style: {
          color: '#112233',
          fontSize: 20,
          fontWeight: 700,
          backgroundColor: '#ff6600',
          cornerRadius: 8,
          paddingTop: 12,
          paddingBottom: 12,
          paddingLeft: 12,
          paddingRight: 12,
          marginTop: 16,
          marginBottom: 16,
          marginLeft: 16,
          marginRight: 16,
          opacity: 0.9,
        },
        children: [],
      },
    ],
  },
}

describe('batch13 maui L1 thickness', () => {
  it('parses Margin / Padding / FontAttributes / Opacity onto Label', () => {
    const doc = normalizeMauiXaml(
      `<?xml version="1.0" encoding="utf-8" ?>
<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui">
  <Label Text="欢迎首页"
         TextColor="#112233"
         FontSize="20"
         FontAttributes="Bold"
         BackgroundColor="#ff6600"
         CornerRadius="8"
         WidthRequest="200"
         HeightRequest="40"
         Padding="12"
         Margin="16"
         Opacity="0.9" />
</ContentPage>`,
      'HomePage',
    )
    const texts: Array<{ text?: string; style: DesignDoc['root']['style']; box: DesignDoc['root']['box'] }> = []
    const walk = (n: DesignDoc['root']): void => {
      if (n.text) texts.push(n)
      for (const c of n.children) walk(c)
    }
    walk(doc.root)
    const node = texts.find((t) => t.text === '欢迎首页')
    expect(node).toBeTruthy()
    expect(node!.style.fontSize).toBe(20)
    expect(node!.style.fontWeight).toBe(700)
    expect(node!.style.cornerRadius).toBe(8)
    expect(node!.style.paddingTop).toBe(12)
    expect(node!.style.marginTop).toBe(16)
    expect(node!.style.opacity).toBe(0.9)
    expect(node!.box.width).toBe(200)
    expect(compareVisualDocs(design, doc).comparedPairs).toBeGreaterThan(0)
  })

  it('parses four-value Margin/Padding (left,top,right,bottom MAUI order)', () => {
    const doc = normalizeMauiXaml(
      `<ContentPage><Label Text="Hi" Margin="1,2,3,4" Padding="5,6,7,8" /></ContentPage>`,
      'P',
    )
    const node = (() => {
      const hit: DesignDoc['root'][] = []
      const walk = (n: DesignDoc['root']): void => {
        if (n.text === 'Hi') hit.push(n)
        for (const c of n.children) walk(c)
      }
      walk(doc.root)
      return hit[0]
    })()
    expect(node).toBeTruthy()
    expect(node!.style.marginLeft).toBe(1)
    expect(node!.style.marginTop).toBe(2)
    expect(node!.style.marginRight).toBe(3)
    expect(node!.style.marginBottom).toBe(4)
    expect(node!.style.paddingLeft).toBe(5)
    expect(node!.style.paddingTop).toBe(6)
    expect(node!.style.paddingRight).toBe(7)
    expect(node!.style.paddingBottom).toBe(8)
  })
})
