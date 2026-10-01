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
  arkuiSourceToDesignDoc,
} from '../src/design/adapters/declarative-design-doc.js'
import { parseCssDeclarations } from '../src/design/adapters/web-css.js'
import { compareVisualDocs } from '../src/design/compare.js'
import { normalizeLanhuAnnotation } from '../src/design/sources/lanhu.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

function leaf(doc: DesignDoc): DesignNode {
  const walk = (n: DesignNode): DesignNode =>
    n.children.length ? walk(n.children[0]!) : n
  return walk(doc.root)
}

describe('CSS unitless line-height / em letter-spacing', () => {
  it('resolves unitless line-height against font-size', () => {
    const parsed = parseCssDeclarations('font-size: 16px; line-height: 1.5')
    expect(parsed.style.lineHeight).toBe(24)
  })

  it('resolves letter-spacing em against font-size', () => {
    const parsed = parseCssDeclarations('font-size: 20px; letter-spacing: 0.05em')
    expect(parsed.style.letterSpacing).toBe(1)
  })

  it('keeps px line-height / letter-spacing literal', () => {
    const parsed = parseCssDeclarations(
      'font-size: 16px; line-height: 28px; letter-spacing: 0.5px',
    )
    expect(parsed.style.lineHeight).toBe(28)
    expect(parsed.style.letterSpacing).toBe(0.5)
  })
})

describe('Android letterSpacing em + alpha', () => {
  it('converts letterSpacing em × textSize to px', () => {
    const resources = buildAndroidResources({})
    const doc = normalizeAndroidLayout(
      `<?xml version="1.0"?>
       <TextView xmlns:android="http://schemas.android.com/apk/res/android"
         android:layout_width="wrap_content"
         android:layout_height="wrap_content"
         android:textSize="16sp"
         android:letterSpacing="0.05"
         android:text="Hi"
         android:alpha="0.5" />`,
      resources,
    )
    const tv = leaf(doc)
    expect(tv.style.letterSpacing).toBe(0.8)
    expect(tv.style.opacity).toBe(0.5)
  })
})

describe('declarative typography + opacity', () => {
  it('parses Compose letterSpacing / lineHeight / alpha', () => {
    const doc = composeSourceToDesignDoc(
      `Text("Hi", style = TextStyle(fontSize = 16.sp, letterSpacing = 0.5.sp, lineHeight = 24.sp),
        modifier = Modifier.alpha(0.8f))`,
      'Home',
    )
    const n = leaf(doc)
    expect(n.style.letterSpacing).toBe(0.5)
    expect(n.style.lineHeight).toBe(24)
    expect(n.style.opacity).toBe(0.8)
  })

  it('parses Compose Color.copy(alpha)', () => {
    const doc = composeSourceToDesignDoc(
      `Text("Hi", color = Color.Red.copy(alpha = 0.5f), fontSize = 14.sp)`,
      'Home',
    )
    expect(leaf(doc).style.color).toBe('#ff000080')
  })

  it('parses SwiftUI tracking / lineSpacing / opacity', () => {
    const doc = swiftuiSourceToDesignDoc(
      `Text("Hi").font(.system(size: 16)).tracking(0.5).lineSpacing(4).opacity(0.75)`,
      'Home',
    )
    const n = leaf(doc)
    expect(n.style.letterSpacing).toBe(0.5)
    expect(n.style.lineHeight).toBe(20)
    expect(n.style.opacity).toBe(0.75)
  })

  it('parses Flutter letterSpacing / TextStyle.height / withOpacity', () => {
    const doc = flutterSourceToDesignDoc(
      `Text('Hi', style: TextStyle(fontSize: 16, letterSpacing: 0.5, height: 1.5, color: Color(0xFF000000).withOpacity(0.5)))`,
      'Home',
    )
    const n = leaf(doc)
    expect(n.style.letterSpacing).toBe(0.5)
    expect(n.style.lineHeight).toBe(24)
    expect(n.style.color).toBe('#00000080')
  })

  it('parses RN letterSpacing / lineHeight / opacity', () => {
    const doc = reactNativeSourceToDesignDoc(
      `<Text style={{ fontSize: 16, letterSpacing: 0.5, lineHeight: 24, opacity: 0.6 }}>Hi</Text>`,
      'Home',
    )
    const n = leaf(doc)
    expect(n.style.letterSpacing).toBe(0.5)
    expect(n.style.lineHeight).toBe(24)
    expect(n.style.opacity).toBe(0.6)
  })

  it('parses ArkUI letterSpacing / lineHeight / opacity', () => {
    const doc = arkuiSourceToDesignDoc(
      `Text('Hi').fontSize(16).letterSpacing(0.5).lineHeight(24).opacity(0.9)`,
      'Home',
    )
    const n = leaf(doc)
    expect(n.style.letterSpacing).toBe(0.5)
    expect(n.style.lineHeight).toBe(24)
    expect(n.style.opacity).toBe(0.9)
  })
})

describe('compare typography defaults + color×opacity', () => {
  it('skips design letterSpacing 0 when code omits it', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 't',
        kind: 'text',
        text: 'Hi',
        box: {},
        style: { fontSize: 16, letterSpacing: 0, lineHeight: 16 },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 't',
        kind: 'text',
        text: 'Hi',
        box: {},
        style: { fontSize: 16 },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    expect(result.diffs.filter((d) => d.property === 'letterSpacing')).toHaveLength(0)
    expect(result.diffs.filter((d) => d.property === 'lineHeight')).toHaveLength(0)
  })

  it('bakes node opacity into colour compare', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'box',
        kind: 'shape',
        box: {},
        style: { backgroundColor: '#ff0000', opacity: 0.5 },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 'box',
        kind: 'shape',
        box: {},
        style: { backgroundColor: '#ff000080' },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    expect(result.diffs.filter((d) => d.property === 'backgroundColor')).toHaveLength(0)
  })

  it('soft-tolerates relative line-height drift', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 't',
        kind: 'text',
        text: 'Hi',
        box: {},
        style: { fontSize: 16, lineHeight: 24 },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 't',
        kind: 'text',
        text: 'Hi',
        box: {},
        style: { fontSize: 16, lineHeight: 22 },
        children: [],
      },
      scale: 1,
      source: 'manual',
    }
    const result = compareVisualDocs(design, code)
    expect(result.diffs.filter((d) => d.property === 'lineHeight')).toHaveLength(0)
  })
})

describe('lanhu fill opacity', () => {
  it('bakes fill.opacity into backgroundColor', () => {
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
                id: 's1',
                name: 'rect',
                type: 'shape',
                width: 100,
                height: 40,
                left: 0,
                top: 0,
                fills: [{ type: 'color', color: { r: 255, g: 0, b: 0, a: 1 }, opacity: 0.5 }],
              },
            ],
          },
        ],
      },
      { imageId: 'img-1', name: '页' },
    )
    const rect = doc.root.children.find((c) => c.name === 'rect')
    expect(rect?.style.backgroundColor).toBe('#ff000080')
  })
})
