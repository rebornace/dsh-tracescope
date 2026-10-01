import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
} from '../src/design/adapters/android-xml.js'
import {
  composeSourceToDesignDoc,
  flutterSourceToDesignDoc,
  reactNativeSourceToDesignDoc,
} from '../src/design/adapters/declarative-design-doc.js'
import { DEFAULT_LIST_TILE_COUNT } from '../src/design/list-template-expand.js'

describe('android tools:listitem expand', () => {
  it('tiles listitem layout under RecyclerView', () => {
    const resources = buildAndroidResources(`<resources></resources>`)
    const layouts = new Map<string, string>([
      [
        'item_row',
        `<TextView xmlns:android="http://schemas.android.com/apk/res/android"
          android:layout_width="match_parent"
          android:layout_height="40dp"
          android:text="行标题"
          android:textSize="16sp" />`,
      ],
    ])
    const doc = normalizeAndroidLayout(
      `<RecyclerView xmlns:android="http://schemas.android.com/apk/res/android"
        xmlns:tools="http://schemas.android.com/tools"
        android:id="@+id/list"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        tools:listitem="@layout/item_row" />`,
      resources,
      { resolveLayout: (name) => layouts.get(name) },
    )
    expect(doc.root.children.length).toBe(DEFAULT_LIST_TILE_COUNT)
    expect(doc.root.children[0]?.text).toBe('行标题')
    expect(doc.root.children[1]?.box.y).toBeGreaterThan(0)
  })
})

describe('compose LazyColumn expand', () => {
  it('tiles LazyColumn item Text into a list frame', () => {
    const doc = composeSourceToDesignDoc(
      `LazyColumn {
         item { Text("卡片标题", modifier = Modifier.height(24.dp)) }
       }`,
      'Home',
    )
    const list = doc.root.children.find((c) => c.name === 'LazyColumn')
    expect(list).toBeTruthy()
    expect(list!.children.length).toBe(DEFAULT_LIST_TILE_COUNT)
    expect(list!.children.every((c) => c.text === '卡片标题')).toBe(true)
    expect(list!.children[1]?.box.y).toBeGreaterThan(0)
  })
})

describe('flutter ListView expand', () => {
  it('tiles ListView.builder item Text', () => {
    const doc = flutterSourceToDesignDoc(
      `ListView.builder(
        itemCount: 20,
        itemBuilder: (context, index) {
          return Text('列表项', style: TextStyle(fontSize: 16));
        },
      )`,
      'Home',
    )
    const list = doc.root.children.find((c) => c.name === 'ListView')
    expect(list).toBeTruthy()
    expect(list!.children.length).toBe(DEFAULT_LIST_TILE_COUNT)
    expect(list!.children[0]?.text).toBe('列表项')
  })
})

describe('rn FlatList expand', () => {
  it('tiles FlatList renderItem Text', () => {
    const doc = reactNativeSourceToDesignDoc(
      `export function Home() {
        return (
          <FlatList
            data={data}
            renderItem={({ item }) => (
              <Text style={{ height: 20 }}>列表项</Text>
            )}
          />
        )
      }`,
      'Home',
    )
    const list = doc.root.children.find((c) => c.name === 'FlatList')
    expect(list).toBeTruthy()
    expect(list!.children.length).toBe(DEFAULT_LIST_TILE_COUNT)
    expect(list!.children[0]?.text).toBe('列表项')
    expect(list!.children[1]?.box.y).toBeGreaterThan(0)
  })
})
