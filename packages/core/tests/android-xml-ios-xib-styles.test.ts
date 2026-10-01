import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
  registerAndroidColorFile,
  resolveAndroidStyleAttrs,
} from '../src/design/adapters/android-xml.js'
import {
  extractNamedColorsFromIb,
  loadIosAssetCatalogColors,
  normalizeUIKitDoc,
  parseColorsetContents,
} from '../src/design/adapters/ios-xib.js'
import { parseXml } from '../src/design/xml-lite.js'

async function withTemp(run: (root: string) => Promise<void>) {
  const dir = path.join(
    os.tmpdir(),
    `ts-axml-xib-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  await mkdir(dir, { recursive: true })
  await run(dir)
}

describe('android xml styles & aliases', () => {
  it('resolves @color alias chains', () => {
    const resources = buildAndroidResources(
      `<resources>
        <color name="brand">#112233</color>
        <color name="title">@color/brand</color>
        <color name="titleAlias">@color/title</color>
      </resources>`,
    )
    expect(resources.colors.brand).toBe('#112233')
    expect(resources.colors.title).toBe('#112233')
    expect(resources.colors.titleAlias).toBe('#112233')
  })

  it('applies style/@style parent chain to textColor and textSize', () => {
    const resources = buildAndroidResources(
      `<resources>
        <color name="title">#112233</color>
        <dimen name="title_size">20sp</dimen>
        <style name="BaseText">
          <item name="android:textSize">@dimen/title_size</item>
        </style>
        <style name="TitleText" parent="@style/BaseText">
          <item name="android:textColor">@color/title</item>
        </style>
      </resources>`,
    )
    const merged = resolveAndroidStyleAttrs('@style/TitleText', resources)
    expect(merged['android:textColor']).toBe('@color/title')
    expect(merged['android:textSize']).toBe('@dimen/title_size')

    const doc = normalizeAndroidLayout(
      `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="match_parent"
        android:layout_height="match_parent">
        <TextView
          android:id="@+id/title"
          style="@style/TitleText"
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:text="欢迎" />
      </LinearLayout>`,
      resources,
    )
    const title = doc.root.children.find((n) => n.id === 'title')!
    expect(title.style.color).toBe('#112233')
    expect(title.style.fontSize).toBe(20)
  })

  it('registers res/color selector defaults', () => {
    const resources = buildAndroidResources(
      `<resources><color name="primary">#112233</color></resources>`,
    )
    registerAndroidColorFile(
      resources,
      'button_bg',
      `<selector xmlns:android="http://schemas.android.com/apk/res/android">
        <item android:state_pressed="true" android:color="#000000"/>
        <item android:color="@color/primary"/>
      </selector>`,
    )
    expect(resources.colors.button_bg).toBe('#112233')
  })
})

describe('ios xib named colors', () => {
  it('parses colorset Contents.json', () => {
    const hex = parseColorsetContents(`{
      "colors": [{
        "idiom": "universal",
        "color": {
          "color-space": "srgb",
          "components": { "alpha": "1.000", "blue": "0.200", "green": "0.133", "red": "0.067" }
        }
      }]
    }`)
    expect(hex).toBe('#112233')
  })

  it('resolves embedded namedColor and systemColor', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.XIB">
  <resources>
    <namedColor name="AppPrimary">
      <color red="0.067" green="0.133" blue="0.200" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
    </namedColor>
  </resources>
  <objects>
    <view id="v0">
      <rect key="frame" x="0" y="0" width="100" height="100"/>
      <color key="backgroundColor" systemColor="systemBackgroundColor"/>
      <subviews>
        <label id="L1">
          <rect key="frame" x="0" y="0" width="80" height="20"/>
          <color key="textColor" name="AppPrimary" catalog="Named Colors"/>
          <fontDescription key="font" pointSize="16"/>
        </label>
      </subviews>
    </view>
  </objects>
</document>`
    const embedded = extractNamedColorsFromIb(parseXml(xml))
    expect(embedded.get('AppPrimary')).toBe('#112233')
    const doc = normalizeUIKitDoc(xml)
    expect(doc.root.style.backgroundColor).toBe('#ffffff')
    const label = doc.root.children.find((n) => n.id === 'L1')!
    expect(label.style.color).toBe('#112233')
  })

  it('loads nearby xcassets colorsets', async () => {
    await withTemp(async (root) => {
      const colorset = path.join(root, 'Assets.xcassets', 'Brand.colorset')
      await mkdir(colorset, { recursive: true })
      await writeFile(
        path.join(colorset, 'Contents.json'),
        JSON.stringify({
          colors: [
            {
              idiom: 'universal',
              color: {
                'color-space': 'srgb',
                components: { red: '0.067', green: '0.133', blue: '0.200', alpha: '1.000' },
              },
            },
          ],
        }),
        'utf8',
      )
      const xibPath = path.join(root, 'Home.xib')
      await writeFile(
        xibPath,
        `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.XIB">
  <objects>
    <view id="v0">
      <rect key="frame" x="0" y="0" width="100" height="100"/>
      <subviews>
        <label id="L1">
          <rect key="frame" x="0" y="0" width="80" height="20"/>
          <color key="textColor" name="Brand" catalog="Named Colors"/>
        </label>
      </subviews>
    </view>
  </objects>
</document>`,
        'utf8',
      )
      const named = await loadIosAssetCatalogColors(xibPath)
      expect(named.get('Brand')).toBe('#112233')
      const xml = await (await import('node:fs/promises')).readFile(xibPath, 'utf8')
      const doc = normalizeUIKitDoc(xml, named)
      expect(doc.root.children.find((n) => n.id === 'L1')!.style.color).toBe('#112233')
    })
  })
})
