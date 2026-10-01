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
import { normalizeFigmaTree } from '../src/design/sources/figma.js'
import { normalizeLanhuAnnotation } from '../src/design/sources/lanhu.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

function leaf(doc: DesignDoc): DesignNode {
  const walk = (n: DesignNode): DesignNode =>
    n.children.length ? walk(n.children[0]!) : n
  return walk(doc.root)
}

describe('figma overflow + text truncation', () => {
  it('maps clipsContent and textTruncation/maxLines', () => {
    const frame = normalizeFigmaTree({
      id: '1:1',
      name: 'card',
      type: 'FRAME',
      clipsContent: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
      fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
      children: [
        {
          id: '1:2',
          name: 'title',
          type: 'TEXT',
          characters: 'Hello world',
          textTruncation: 'ENDING',
          maxLines: 2,
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 20 },
          style: { fontSize: 14, textAlignHorizontal: 'LEFT' },
          fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0, a: 1 } }],
        },
      ],
    })
    expect(frame.root.style.overflow).toBe('hidden')
    const text = frame.root.children[0]!
    expect(text.style.maxLines).toBe(2)
    expect(text.style.textOverflow).toBe('ellipsis')
  })
})

describe('lanhu overflow + ellipsis', () => {
  it('maps overflow and maxLines', () => {
    const doc = normalizeLanhuAnnotation(
      {
        ArtboardScale: 1,
        info: [
          {
            id: 'board-1',
            name: '页',
            width: 375,
            height: 100,
            left: 0,
            top: 0,
            layers: [
              {
                id: 'c1',
                name: 'card',
                type: 'shape',
                width: 100,
                height: 40,
                left: 0,
                top: 0,
                clipsContent: true,
                layers: [
                  {
                    id: 't1',
                    name: 'title',
                    type: 'text',
                    width: 100,
                    height: 20,
                    left: 0,
                    top: 0,
                    maxLines: 1,
                    textOverflow: 'ellipsis',
                    textInfo: { text: 'Hello', size: 14 },
                    style: { fontSize: 14 },
                  },
                ],
              },
            ],
          },
        ],
      },
      { name: 'page' },
    )
    const card = leaf(doc)
    // leaf walks deepest; we want card for overflow and its text child for maxLines
    const rootChild = doc.root.children[0]!
    expect(rootChild.style.overflow).toBe('hidden')
    const text = rootChild.children[0]!
    expect(text.style.maxLines).toBe(1)
    expect(text.style.textOverflow).toBe('ellipsis')
    void card
  })
})

describe('CSS overflow + line-clamp', () => {
  it('parses overflow, text-overflow, line-clamp', () => {
    const parsed = parseCssDeclarations(
      'overflow: hidden; text-overflow: ellipsis; -webkit-line-clamp: 3',
    )
    expect(parsed.style.overflow).toBe('hidden')
    expect(parsed.style.textOverflow).toBe('ellipsis')
    expect(parsed.style.maxLines).toBe(3)
  })
})

describe('native clip + ellipsis', () => {
  it('parses Android clipChildren / maxLines / ellipsize', () => {
    const resources = buildAndroidResources([])
    const doc = normalizeAndroidLayout(
      `<?xml version="1.0" encoding="utf-8"?>
      <FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
         android:layout_width="match_parent"
         android:layout_height="wrap_content"
         android:clipChildren="true">
        <TextView
           android:layout_width="wrap_content"
           android:layout_height="wrap_content"
           android:text="Hi"
           android:maxLines="2"
           android:ellipsize="end" />
      </FrameLayout>`,
      resources,
    )
    expect(doc.root.style.overflow).toBe('hidden')
    const tv = doc.root.children[0]
    expect(tv?.style.maxLines).toBe(2)
    expect(tv?.style.textOverflow).toBe('ellipsis')
  })

  it('parses Compose / SwiftUI / Flutter / RN clip + maxLines', () => {
    expect(
      leaf(
        composeSourceToDesignDoc(
          `Text("Hi", maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.clip(RoundedCornerShape(4.dp)))`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ maxLines: 2, textOverflow: 'ellipsis', overflow: 'hidden' })

    expect(
      leaf(
        swiftuiSourceToDesignDoc(`Text("Hi").lineLimit(3).truncationMode(.tail).clipped()`, 'Home'),
      ).style,
    ).toMatchObject({ maxLines: 3, textOverflow: 'ellipsis', overflow: 'hidden' })

    expect(
      leaf(
        flutterSourceToDesignDoc(
          `Text('Hi', maxLines: 2, overflow: TextOverflow.ellipsis); ClipRRect(child: Text('X'))`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ maxLines: 2, textOverflow: 'ellipsis' })

    expect(
      leaf(
        reactNativeSourceToDesignDoc(
          `<Text style={{ overflow: 'hidden' }} numberOfLines={2} ellipsizeMode="tail">Hi</Text>`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ overflow: 'hidden', maxLines: 2, textOverflow: 'ellipsis' })
  })
})

describe('compare overflow + maxLines', () => {
  it('soft-diffs overflow and truncation mismatches', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'label',
        kind: 'text',
        text: 'Hi',
        box: {},
        style: { overflow: 'hidden', maxLines: 2, textOverflow: 'ellipsis' },
        children: [],
      },
      scale: 1,
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 'label',
        kind: 'text',
        text: 'Hi',
        box: {},
        style: { maxLines: 1 },
        children: [],
      },
      scale: 1,
    }
    const result = compareVisualDocs(design, code)
    const props = result.diffs.map((d) => d.property)
    expect(props).toContain('overflow')
    expect(props).toContain('maxLines')
    expect(props).toContain('textOverflow')
    expect(result.diffs.every((d) => d.needsReview)).toBe(true)
  })
})
