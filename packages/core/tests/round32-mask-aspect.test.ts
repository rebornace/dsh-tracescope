import { describe, expect, it } from 'vitest'
import {
  buildAndroidResources,
  normalizeAndroidLayout,
} from '../src/design/adapters/android-xml.js'
import {
  composeSourceToDesignDoc,
  flutterSourceToDesignDoc,
  swiftuiSourceToDesignDoc,
} from '../src/design/adapters/declarative-design-doc.js'
import { parseCssClipPath, parseCssDeclarations } from '../src/design/adapters/web-css.js'
import { compareVisualDocs } from '../src/design/compare.js'
import { normalizeFigmaTree } from '../src/design/sources/figma.js'
import { normalizeLanhuAnnotation } from '../src/design/sources/lanhu.js'
import type { DesignDoc, DesignNode } from '../src/design/types.js'

function leaf(doc: DesignDoc): DesignNode {
  const walk = (n: DesignNode): DesignNode =>
    n.children.length ? walk(n.children[0]!) : n
  return walk(doc.root)
}

describe('figma mask → clipPath', () => {
  it('maps isMask + maskType', () => {
    const doc = normalizeFigmaTree({
      id: '1:1',
      name: 'avatar-mask',
      type: 'ELLIPSE',
      isMask: true,
      maskType: 'ALPHA',
      absoluteBoundingBox: { x: 0, y: 0, width: 40, height: 40 },
      fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
    })
    expect(doc.root.style.clipPath).toBe('mask:alpha')
    expect(doc.root.style.overflow).toBe('hidden')
  })
})

describe('lanhu mask + aspectRatio', () => {
  it('maps isMask and aspectRatio', () => {
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
                id: 'm1',
                name: 'mask',
                type: 'shape',
                width: 80,
                height: 80,
                left: 0,
                top: 0,
                isMask: true,
                maskType: 'luminance',
                aspectRatio: 1.5,
                fills: [{ type: 'color', color: { r: 0, g: 0, b: 0, a: 1 } }],
              },
            ],
          },
        ],
      },
      { name: 'page' },
    )
    const n = leaf(doc)
    expect(n.style.clipPath).toBe('mask:luminance')
    expect(n.style.aspectRatio).toBe(1.5)
  })
})

describe('CSS clip-path + aspect-ratio', () => {
  it('fingerprints clip-path shapes and stores aspect-ratio', () => {
    expect(parseCssClipPath('circle(50% at 50% 50%)')).toBe('circle')
    // polygon keeps vertex count + rounded % points when present (see round42).
    expect(parseCssClipPath('polygon(0 0, 100% 0, 100% 100%)')).toBe('polygon:3:100,100')
    const parsed = parseCssDeclarations(
      'clip-path: ellipse(40% 50%); aspect-ratio: 16 / 9; overflow: hidden',
    )
    expect(parsed.style.clipPath).toBe('ellipse')
    expect(parsed.style.aspectRatio).toBeCloseTo(16 / 9, 3)
    expect(parsed.style.overflow).toBe('hidden')
  })
})

describe('native clipPath + aspectRatio', () => {
  it('parses Android clipToOutline + dimensionRatio', () => {
    const resources = buildAndroidResources([])
    const doc = normalizeAndroidLayout(
      `<?xml version="1.0" encoding="utf-8"?>
      <androidx.constraintlayout.widget.ConstraintLayout
         xmlns:android="http://schemas.android.com/apk/res/android"
         xmlns:app="http://schemas.android.com/apk/res-auto"
         android:layout_width="match_parent"
         android:layout_height="wrap_content"
         android:clipToOutline="true"
         app:layout_constraintDimensionRatio="16:9" />`,
      resources,
    )
    expect(doc.root.style.overflow).toBe('hidden')
    expect(doc.root.style.clipPath).toBe('outline')
    expect(doc.root.style.aspectRatio).toBeCloseTo(16 / 9, 3)
  })

  it('parses Compose / SwiftUI / Flutter clip + aspectRatio', () => {
    expect(
      leaf(
        composeSourceToDesignDoc(
          `Text("Hi", modifier = Modifier.clip(CircleShape).aspectRatio(1.5f))`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ clipPath: 'circle', aspectRatio: 1.5, overflow: 'hidden' })

    expect(
      leaf(
        swiftuiSourceToDesignDoc(
          `Text("Hi").clipShape(Circle()).aspectRatio(1.2, contentMode: .fit)`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ clipPath: 'circle', aspectRatio: 1.2, overflow: 'hidden' })

    expect(
      leaf(
        flutterSourceToDesignDoc(
          `ClipOval(child: AspectRatio(aspectRatio: 1.77, child: Text('Hi')))`,
          'Home',
        ),
      ).style,
    ).toMatchObject({ clipPath: 'ellipse', aspectRatio: 1.77, overflow: 'hidden' })
  })
})

describe('compare clipPath + aspectRatio', () => {
  it('soft-diffs clipPath and aspectRatio mismatches', () => {
    const design: DesignDoc = {
      root: {
        id: 'd',
        name: 'avatar',
        kind: 'image',
        box: {},
        style: { clipPath: 'circle', aspectRatio: 1 },
        children: [],
      },
      scale: 1,
    }
    const code: DesignDoc = {
      root: {
        id: 'c',
        name: 'avatar',
        kind: 'image',
        box: {},
        style: { clipPath: 'inset', aspectRatio: 1.2 },
        children: [],
      },
      scale: 1,
    }
    const result = compareVisualDocs(design, code)
    const props = result.diffs.map((d) => d.property)
    expect(props).toContain('clipPath')
    expect(props).toContain('aspectRatio')
    expect(result.diffs.every((d) => d.needsReview)).toBe(true)
  })
})
