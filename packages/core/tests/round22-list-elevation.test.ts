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
import {
  parseCssBoxShadowElevation,
  parseCssDeclarations,
} from '../src/design/adapters/web-css.js'
import { compareVisualDocs } from '../src/design/compare.js'
import { DEFAULT_LIST_TILE_COUNT } from '../src/design/list-template-expand.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

describe('swiftui List/ForEach expand', () => {
  it('tiles List body Text into a list frame', () => {
    const doc = swiftuiSourceToDesignDoc(
      `List {
         Text("行标题").font(.body)
       }`,
      'Home',
    )
    const list = doc.root.children.find((c) => c.name === 'List')
    expect(list).toBeTruthy()
    expect(list!.children.length).toBe(DEFAULT_LIST_TILE_COUNT)
    expect(list!.children[0]?.text).toBe('行标题')
  })

  it('tiles ForEach with nested Array(...) args', () => {
    const doc = swiftuiSourceToDesignDoc(
      `ForEach(Array(1...3), id: \\.self) {
         Text("条目")
       }`,
      'Home',
    )
    const list = doc.root.children.find((c) => c.name === 'ForEach')
    expect(list).toBeTruthy()
    expect(list!.children.length).toBe(DEFAULT_LIST_TILE_COUNT)
    expect(list!.children.every((c) => c.text === '条目')).toBe(true)
  })

  it('tiles LazyVStack with spacing', () => {
    const doc = swiftuiSourceToDesignDoc(
      `LazyVStack(spacing: 8) { Text("A"); Text("B") }`,
      'Home',
    )
    const list = doc.root.children.find((c) => c.name === 'LazyVStack')
    expect(list).toBeTruthy()
    // Two texts per tile × 3 tiles
    expect(list!.children.length).toBe(DEFAULT_LIST_TILE_COUNT * 2)
  })
})

describe('elevation / shadow', () => {
  it('parses Compose / SwiftUI / Flutter / RN / Android / CSS', () => {
    expect(
      composeSourceToDesignDoc(
        `Text("卡", modifier = Modifier.shadow(6.dp).height(20.dp))`,
        'Home',
      ).root.children[0]?.style.elevation,
    ).toBe(6)

    expect(
      swiftuiSourceToDesignDoc(`Text("卡").shadow(radius: 4)`, 'Home').root.children[0]?.style
        .elevation,
    ).toBe(4)

    expect(
      flutterSourceToDesignDoc(
        `Text('卡', style: TextStyle(fontSize: 14)); Container(elevation: 8, child: Text('x'))`,
        'Home',
      ).root.children.find((c) => c.style.elevation)?.style.elevation ??
        flutterSourceToDesignDoc(
          `Card(elevation: 8, child: Text('卡'))`,
          'Home',
        ).root.children[0]?.style.elevation,
    ).toBeTruthy()

    // Flutter Text window may pick elevation from nearby Card — check Card path:
    const flutter = flutterSourceToDesignDoc(
      `Container(
        decoration: BoxDecoration(
          boxShadow: [BoxShadow(blurRadius: 10, color: Color(0x33000000))],
          color: Color(0xFFFFFFFF),
        ),
        child: Text('卡'),
      )`,
      'Home',
    )
    const flutterElev = flutter.root.children.find((c) => c.style.elevation !== undefined)
    expect(flutterElev?.style.elevation).toBe(10)

    expect(
      reactNativeSourceToDesignDoc(
        `<Text style={{ elevation: 5, height: 20 }}>卡</Text>`,
        'Home',
      ).root.children[0]?.style.elevation,
    ).toBe(5)

    const resources = buildAndroidResources(`<resources></resources>`)
    const android = normalizeAndroidLayout(
      `<androidx.cardview.widget.CardView
        xmlns:android="http://schemas.android.com/apk/res/android"
        xmlns:app="http://schemas.android.com/apk/res-auto"
        android:layout_width="100dp"
        android:layout_height="40dp"
        app:cardElevation="4dp"
        app:cardCornerRadius="8dp" />`,
      resources,
    )
    expect(android.root.style.elevation).toBe(4)

    expect(parseCssBoxShadowElevation('0 2px 8px rgba(0,0,0,0.2)')).toBe(8)
    expect(parseCssDeclarations('box-shadow: 0 4px 12px #000').style.elevation).toBe(12)
  })

  it('compare diffs elevation mismatch', () => {
    const leaf = (
      partial: Partial<DesignNode> & Pick<DesignNode, 'id' | 'name' | 'kind'>,
    ): DesignNode => ({
      box: {},
      style: {},
      children: [],
      ...partial,
    })
    const design: DesignDoc = {
      root: leaf({ id: 'd', name: 'card', kind: 'view', style: { elevation: 8 } }),
      scale: 1,
      source: 'manual',
    }
    const code: DesignDoc = {
      root: leaf({ id: 'c', name: 'card', kind: 'view', style: { elevation: 2 } }),
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    expect(result.diffs.some((d) => d.property === 'elevation')).toBe(true)
  })
})
