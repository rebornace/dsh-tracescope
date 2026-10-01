import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
  type AndroidResources,
} from '../src/design/adapters/android-xml.js'
import {
  composeSourceToDesignDoc,
  reactNativeSourceToDesignDoc,
  swiftuiSourceToDesignDoc,
} from '../src/design/adapters/declarative-design-doc.js'
import { parseCssDeclarations } from '../src/design/adapters/web-css.js'
import { compareVisualDocs } from '../src/design/compare.js'
import { normalizeFigmaTree } from '../src/design/sources/figma.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

function leaf(doc: DesignDoc): DesignNode {
  const walk = (n: DesignNode): DesignNode =>
    n.children.length ? walk(n.children[0]!) : n
  return walk(doc.root)
}

describe('figma borderStyle + paragraphSpacing + sizing', () => {
  it('maps strokeDashes / paragraphSpacing / layoutSizing', () => {
    const dashed = normalizeFigmaTree({
      id: '1:1',
      name: 'Card',
      type: 'FRAME',
      strokeWeight: 1,
      strokeDashes: [4, 4],
      strokes: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0, a: 1 } }],
      layoutSizingHorizontal: 'FILL',
      layoutSizingVertical: 'HUG',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
      fills: [],
    })
    expect(dashed.root.style.borderStyle).toBe('dashed')
    expect(dashed.root.style.sizingHorizontal).toBe('fill')
    expect(dashed.root.style.sizingVertical).toBe('hug')

    const text = normalizeFigmaTree({
      id: '1:2',
      name: 'Body',
      type: 'TEXT',
      characters: 'Hi',
      absoluteBoundingBox: { x: 0, y: 0, width: 80, height: 40 },
      style: { fontSize: 14, paragraphSpacing: 8 },
      fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0, a: 1 } }],
    })
    expect(text.root.style.paragraphSpacing).toBe(8)
  })
})

describe('CSS border-style + sizing keywords', () => {
  it('parses dashed and hug/fill sizing', () => {
    expect(
      parseCssDeclarations('border: 1px dashed #000; width: auto; height: 100%').style,
    ).toMatchObject({
      borderStyle: 'dashed',
      sizingHorizontal: 'hug',
      sizingVertical: 'fill',
    })
    expect(parseCssDeclarations('border-style: dotted; width: 120px').style).toMatchObject({
      borderStyle: 'dotted',
      sizingHorizontal: 'fixed',
    })
  })
})

describe('native borderStyle + sizing', () => {
  it('parses Android layout sizing + shape dash', () => {
    const resources: AndroidResources = {
      ...buildAndroidResources([]),
      drawables: {
        dashed_bg: {
          backgroundColor: '#ffffff',
          strokeColor: '#000000',
          strokeWidth: 1,
          borderStyle: 'dashed',
        },
      },
    }
    const doc = normalizeAndroidLayout(
      `<?xml version="1.0" encoding="utf-8"?>
      <FrameLayout
         xmlns:android="http://schemas.android.com/apk/res/android"
         android:layout_width="match_parent"
         android:layout_height="wrap_content"
         android:background="@drawable/dashed_bg" />`,
      resources,
    )
    expect(doc.root.style).toMatchObject({
      sizingHorizontal: 'fill',
      sizingVertical: 'hug',
      borderStyle: 'dashed',
      borderWidth: 1,
    })
  })

  it('parses Compose fillMax + dashPathEffect', () => {
    const n = leaf(
      composeSourceToDesignDoc(
        `Text("Hi", modifier = Modifier.fillMaxWidth().border(1.dp, Color.Black).then(
           Modifier.drawBehind { drawRoundRect(pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f))) }
         ))`,
        'Home',
      ),
    )
    expect(n.style.sizingHorizontal).toBe('fill')
    expect(n.style.borderStyle).toBe('dashed')
  })

  it('parses SwiftUI infinity frame + RN borderStyle', () => {
    expect(
      leaf(
        swiftuiSourceToDesignDoc(
          `Text("Hi").frame(maxWidth: .infinity).stroke(Color.black, style: StrokeStyle(dash: [4, 4]))`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ sizingHorizontal: 'fill', borderStyle: 'dashed' })

    expect(
      leaf(
        reactNativeSourceToDesignDoc(
          `<Text style={{ borderWidth: 1, borderStyle: 'dashed', width: 100 }}>Hi</Text>`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ borderStyle: 'dashed', sizingHorizontal: 'fixed' })
  })
})

describe('compare soft-review for borderStyle + sizing', () => {
  it('flags dashed vs solid and fill vs hug', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'box',
        kind: 'view',
        box: { width: 100, height: 40 },
        style: {
          borderStyle: 'dashed',
          sizingHorizontal: 'fill',
          sizingVertical: 'hug',
          paragraphSpacing: 10,
        },
        children: [],
      },
      scale: 1,
      source: 'figma',
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 'box',
        kind: 'view',
        box: { width: 100, height: 40 },
        style: {
          borderStyle: 'solid',
          sizingHorizontal: 'hug',
          paragraphSpacing: 2,
        },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    const props = result.diffs.map((d) => d.property)
    expect(props).toContain('borderStyle')
    expect(props).toContain('sizingHorizontal')
    expect(props).toContain('paragraphSpacing')
    const soft = result.diffs.filter((d) =>
      d.property === 'borderStyle' || d.property === 'sizingHorizontal',
    )
    expect(soft.length).toBeGreaterThan(0)
    expect(soft.every((d) => d.needsReview)).toBe(true)
  })
})
