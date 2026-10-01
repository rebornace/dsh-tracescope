import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
} from '../src/design/adapters/android-xml.js'
import {
  composeSourceToDesignDoc,
  flutterSourceToDesignDoc,
  reactNativeSourceToDesignDoc,
  swiftuiSourceToDesignDoc,
} from '../src/design/adapters/declarative-design-doc.js'
import { parseCssDeclarations } from '../src/design/adapters/web-css.js'
import { compareVisualDocs } from '../src/design/compare.js'
import { estimateTextBlock } from '../src/design/text-metrics.js'
import { normalizeFigmaTree } from '../src/design/sources/figma.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

function leaf(doc: DesignDoc): DesignNode {
  const walk = (n: DesignNode): DesignNode =>
    n.children.length ? walk(n.children[0]!) : n
  return walk(doc.root)
}

describe('figma auto-layout + textBlockHeight', () => {
  it('maps layoutMode / itemSpacing / axis align', () => {
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'Stack',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      itemSpacing: 12,
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      counterAxisAlignItems: 'CENTER',
      paddingLeft: 8,
      paddingRight: 8,
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 40 },
      fills: [],
    })
    expect(doc.root.style).toMatchObject({
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingLeft: 8,
      paddingRight: 8,
    })
  })

  it('maps italic + textAlignVertical + textBlockHeight', () => {
    const doc = normalizeFigmaTree({
      id: '1:2',
      name: 'Title',
      type: 'TEXT',
      characters: 'Hello World',
      absoluteBoundingBox: { x: 0, y: 0, width: 40, height: 40 },
      style: {
        fontSize: 16,
        fontWeight: 400,
        italic: true,
        textAlignVertical: 'CENTER',
        lineHeightPx: 20,
      },
      fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0, a: 1 } }],
    })
    expect(doc.root.style.fontStyle).toBe('italic')
    expect(doc.root.style.textAlignVertical).toBe('center')
    expect(doc.root.style.textBlockHeight).toBeGreaterThan(20)
    const expected = estimateTextBlock('Hello World', 16, {
      maxWidth: 40,
      lineHeight: 20,
    })
    expect(doc.root.style.textBlockHeight).toBe(expected.height)
  })
})

describe('CSS flex + font-style', () => {
  it('parses flex-direction / align-items / justify-content / italic', () => {
    const parsed = parseCssDeclarations(
      'display:flex; flex-direction: column; align-items: center; justify-content: space-between; font-style: italic; vertical-align: middle',
    )
    expect(parsed.style).toMatchObject({
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontStyle: 'italic',
      textAlignVertical: 'center',
    })
  })
})

describe('native axis + italic', () => {
  it('parses Android LinearLayout + italic + gravity', () => {
    const resources = buildAndroidResources([])
    const doc = normalizeAndroidLayout(
      `<?xml version="1.0" encoding="utf-8"?>
      <LinearLayout
         xmlns:android="http://schemas.android.com/apk/res/android"
         android:layout_width="match_parent"
         android:layout_height="wrap_content"
         android:orientation="horizontal"
         android:gravity="center_vertical">
        <TextView
           android:layout_width="wrap_content"
           android:layout_height="wrap_content"
           android:text="Hi"
           android:textStyle="italic"
           android:textSize="14sp" />
      </LinearLayout>`,
      resources,
    )
    expect(doc.root.style.flexDirection).toBe('row')
    expect(doc.root.style.alignItems).toBe('center')
    expect(leaf(doc).style.fontStyle).toBe('italic')
  })

  it('stores Compose Column axis on root + italic + textBlockHeight', () => {
    const doc = composeSourceToDesignDoc(
      `Column(verticalArrangement = Arrangement.SpaceBetween, horizontalAlignment = Alignment.CenterHorizontally) {
         Text("你好世界", fontSize = 16.sp, style = TextStyle(fontStyle = FontStyle.Italic), modifier = Modifier.width(40.dp))
       }`,
      'Home',
    )
    expect(doc.root.style).toMatchObject({
      flexDirection: 'column',
      justifyContent: 'space-between',
      alignItems: 'center',
    })
    const n = leaf(doc)
    expect(n.style.fontStyle).toBe('italic')
    expect(n.style.textBlockHeight).toBeGreaterThan(0)
  })

  it('parses SwiftUI / Flutter / RN italic', () => {
    expect(
      leaf(swiftuiSourceToDesignDoc(`Text("Hi").italic()`, 'Home')).style.fontStyle,
    ).toBe('italic')
    expect(
      leaf(
        flutterSourceToDesignDoc(
          `Text('Hi', style: TextStyle(fontStyle: FontStyle.italic))`,
          'Home',
        ),
      ).style.fontStyle,
    ).toBe('italic')
    expect(
      leaf(
        reactNativeSourceToDesignDoc(
          `<Text style={{ fontStyle: 'italic', textAlignVertical: 'center' }}>Hi</Text>`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ fontStyle: 'italic', textAlignVertical: 'center' })
  })
})

describe('compare soft-review for axis + textBlockHeight', () => {
  it('flags axis and block-height mismatches', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'stack',
        kind: 'frame',
        box: { width: 200, height: 80 },
        style: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          textBlockHeight: 40,
        },
        children: [],
      },
      scale: 1,
      source: 'figma',
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 'stack',
        kind: 'frame',
        box: { width: 200, height: 80 },
        style: {
          flexDirection: 'column',
          justifyContent: 'start',
          textBlockHeight: 20,
        },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    const props = result.diffs.map((d) => d.property)
    expect(props).toContain('flexDirection')
    expect(props).toContain('justifyContent')
    expect(props).toContain('textBlockHeight')
    expect(result.diffs.every((d) => d.needsReview)).toBe(true)
  })
})
