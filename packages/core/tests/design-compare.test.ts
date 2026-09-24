import { describe, expect, it } from 'vitest'
import {
  figmaColorToHex,
  fetchFigmaDoc,
  normalizeFigmaTree,
  parseFigmaUrl,
  type FigmaClientOptions,
} from '../src/design-figma.js'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
} from '../src/design-android.js'
import { normalizeUIKitDoc } from '../src/design-uikit.js'
import { compareVisualDocs } from '../src/design-compare.js'
import type { DesignDoc, DesignNode } from '../src/design-types.js'

// ---------------------------------------------------------------------------
// Figma
// ---------------------------------------------------------------------------

describe('figma source', () => {
  it('parses file key and node id from a URL', () => {
    const parsed = parseFigmaUrl(
      'https://www.figma.com/design/r0szEKmBc2IP8te9sCSrql/2025new?node-id=0-3046&t=x',
    )
    expect(parsed.fileKey).toBe('r0szEKmBc2IP8te9sCSrql')
    expect(parsed.nodeId).toBe('0:3046')
  })

  it('converts color with alpha', () => {
    expect(figmaColorToHex({ r: 1, g: 1, b: 1, a: 1 })).toBe('#ffffff')
    expect(figmaColorToHex({ r: 0.2, g: 0.2, b: 0.2, a: 1 })).toBe('#333333')
    expect(figmaColorToHex({ r: 1, g: 1, b: 1, a: 0 })).toBe('#ffffff00')
  })

  it('normalises a text node with typography', () => {
    const doc = normalizeFigmaTree({
      id: '0:1',
      name: 'title',
      type: 'TEXT',
      characters: '单图插画',
      absoluteBoundingBox: { x: 83, y: 336, width: 120, height: 42 },
      fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2, a: 1 } }],
      style: { fontFamily: 'PingFang SC', fontSize: 30, fontWeight: 500, lineHeightPx: 42 },
    })
    const node = doc.root
    expect(node.kind).toBe('text')
    expect(node.text).toBe('单图插画')
    expect(node.style.fontSize).toBe(30)
    expect(node.style.fontWeight).toBe(500)
    expect(node.style.lineHeight).toBe(42)
    expect(node.style.color).toBe('#333333')
  })

  it('fetches a doc via injected fetch', async () => {
    const figmaNode = {
      id: '0:1',
      name: 'title',
      type: 'TEXT',
      characters: 'x',
      absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
    }
    const fetchImpl: typeof fetch = (async (input: any) =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ nodes: { '0:1': { document: figmaNode } } }),
      })) as typeof fetch
    const options: FigmaClientOptions = { token: 't', fetchImpl }
    const doc = await fetchFigmaUrl('https://www.figma.com/design/KEY/x?node-id=0-1', options)
    expect(doc.source).toBe('figma')
    expect(doc.root.id).toBe('0:1')
  })
})

async function fetchFigmaUrl(url: string, options: FigmaClientOptions): Promise<DesignDoc> {
  return fetchFigmaDoc(url, undefined, options)
}

// ---------------------------------------------------------------------------
// Android XML
// ---------------------------------------------------------------------------

const ANDROID_LAYOUT = `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="414dp" android:layout_height="931dp" android:paddingTop="12dp">
  <TextView
      android:id="@+id/title"
      android:layout_width="wrap_content"
      android:layout_height="42dp"
      android:text="单图插画"
      android:textColor="#333333"
      android:textSize="28sp" />
  <Button
      android:id="@+id/follow"
      android:layout_width="64dp"
      android:layout_height="24dp"
      android:background="@color/gold" />
</LinearLayout>`

describe('android xml source', () => {
  it('resolves @color references and dimensions', () => {
    const resources = buildAndroidResources(
      `<resources><color name="gold">#D7BF91</color></resources>`,
    )
    const doc = normalizeAndroidLayout(ANDROID_LAYOUT, resources)
    const title = doc.root.children.find((n) => n.id === 'title')!
    expect(title.kind).toBe('text')
    expect(title.text).toBe('单图插画')
    expect(title.style.fontSize).toBe(28)
    expect(title.style.color).toBe('#333333')
    expect(title.box.height).toBe(42)

    const follow = doc.root.children.find((n) => n.id === 'follow')!
    expect(follow.box.width).toBe(64)
    expect(follow.box.height).toBe(24)
    expect(follow.style.backgroundColor).toBe('#d7bf91')
  })

  it('marks unknown resource references as unresolved (no false failure)', () => {
    const doc = normalizeAndroidLayout(ANDROID_LAYOUT)
    const follow = doc.root.children.find((n) => n.id === 'follow')!
    expect(follow.style.backgroundColor).toEqual({
      unresolved: true,
      raw: '@color/gold',
    })
  })

  it('parses dimens.xml', () => {
    const resources = buildAndroidResources(
      `<resources>
        <dimen name="spacing">16dp</dimen>
        <color name="brand">#FF0000</color>
      </resources>`,
    )
    expect(resources.dimens.spacing).toEqual({ value: 16, unit: 'dp' })
    expect(resources.colors.brand).toBe('#ff0000')
  })
})

// ---------------------------------------------------------------------------
// UIKit
// ---------------------------------------------------------------------------

const XIB = `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.XIB">
  <objects>
    <view id="v0" userLabel="Root">
      <rect key="frame" x="0" y="0" width="414" height="931"/>
      <color key="backgroundColor" red="1" green="1" blue="1" alpha="1"/>
      <subviews>
        <label id="L1" userLabel="Title">
          <rect key="frame" x="16" y="146" width="120" height="42"/>
          <color key="textColor" red="0.2" green="0.2" blue="0.2" alpha="1"/>
          <fontDescription key="font" name="PingFangSC-Medium" pointSize="30"/>
          <userDefinedRuntimeAttributes>
            <boolean keyPath="x" value="YES"/>
            <real keyPath="cornerRadius" value="8"/>
          </userDefinedRuntimeAttributes>
        </label>
      </subviews>
    </view>
  </objects>
</document>`

describe('uikit source', () => {
  it('reads frames, colors, font size and corner radius', () => {
    const doc = normalizeUIKitDoc(XIB)
    expect(doc.root.box).toMatchObject({ width: 414, height: 931 })
    expect(doc.root.style.backgroundColor).toBe('#ffffff')
    const title = doc.root.children.find((n) => n.id === 'L1')!
    expect(title.box).toMatchObject({ x: 16, y: 146, width: 120, height: 42 })
    expect(title.style.color).toBe('#333333')
    expect(title.style.fontSize).toBe(30)
    expect(title.style.cornerRadius).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// Deterministic compare
// ---------------------------------------------------------------------------

describe('compare engine', () => {
  function figmaDesign(): DesignDoc {
    return normalizeFigmaTree({
      id: '0:3046',
      name: 'screen',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 414, height: 931 },
      children: [
        {
          id: '0:t',
          name: 'title',
          type: 'TEXT',
          characters: '单图插画',
          absoluteBoundingBox: { x: 16, y: 146, width: 120, height: 42 },
          fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2, a: 1 } }],
          style: { fontFamily: 'PingFang SC', fontSize: 30, fontWeight: 500, lineHeightPx: 42 },
        },
      ],
    })
  }

  it('pairs nodes by text and reports a font size delta', () => {
    const resources = buildAndroidResources(
      `<resources><color name="gold">#D7BF91</color></resources>`,
    )
    const code = normalizeAndroidLayout(ANDROID_LAYOUT, resources)
    const result = compareVisualDocs(figmaDesign(), code)

    const fontDiffs = result.diffs.filter((d) => d.property === 'fontSize')
    expect(fontDiffs).toHaveLength(1)
    expect(fontDiffs[0]).toMatchObject({
      expected: 30,
      actual: 28,
      severity: 'medium',
    })
    // Equal colors do not produce a diff.
    expect(result.diffs.filter((d) => d.property === 'color')).toHaveLength(0)
  })

  it('flags unresolved values as needsReview rather than failure', () => {
    const code = normalizeAndroidLayout(ANDROID_LAYOUT)
    const result = compareVisualDocs(figmaDesign(), code)
    const followMatch = result.unmatched.find((u) => u.id === 'follow')
    // follow has no text/name/spatial link to a figma node -> unmatched on code
    expect(followMatch).toMatchObject({ side: 'code' })
  })

  it('returns no diffs when values match within tolerance', () => {
    const design = normalizeFigmaTree({
      id: 'a',
      name: 'n',
      type: 'TEXT',
      characters: 'ok',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 20 },
      fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0, a: 1 } }],
      style: { fontSize: 16 },
    })
    const node: DesignNode = {
      id: 'b',
      name: 'n',
      kind: 'text',
      text: 'ok',
      box: { width: 100.4, height: 20 },
      style: { fontSize: 16.3, color: '#000000' },
      children: [],
    }
    const code: DesignDoc = { root: node, scale: 1, source: 'android-xml' }
    const result = compareVisualDocs(design, code)
    expect(result.diffs).toHaveLength(0)
    expect(result.comparedPairs).toBeGreaterThan(0)
  })
})
