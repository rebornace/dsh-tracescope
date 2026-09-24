/**
 * iOS UIKit implementation source: normalise Interface Builder documents
 * (`.xib` / `.storyboard`, which are plist XML) into the vendor-neutral
 * {@link DesignDoc}.
 *
 * Interface Builder stores absolute `frame` rects in points, so positions and
 * sizes are directly available without running the app. Programmatic
 * UIKit (built in code) is not covered here.
 */
import type {
  DesignDoc,
  DesignNode,
  DesignNodeKind,
  HexColor,
} from './design-types.js'
import { parseXml, type XmlElement } from './xml-lite.js'

const VIEW_TAGS = new Set([
  'view',
  'scrollview',
  'tableview',
  'collectionview',
  'stackview',
  'containerView',
  'label',
  'button',
  'textfield',
  'textview',
  'imageview',
  'pagecontrol',
  'activityindicatorview',
  'switch',
  'progressview',
  'segmentedcontrol',
])

const CONTAINER_HINT = /(view|scroll|table|collection|stack|control)$/i

function findChild(el: XmlElement, tag: string): XmlElement | undefined {
  return el.children.find((c) => c.tag === tag)
}

function frameOf(el: XmlElement): DesignNode['box'] | undefined {
  const rect = el.children.find(
    (c) => c.tag === 'rect' && c.attrs.key === 'frame',
  )
  if (!rect) return undefined
  const num = (k: string) => {
    const v = Number(rect.attrs[k])
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined
  }
  return { x: num('x'), y: num('y'), width: num('width'), height: num('height') }
}

function colorOf(el: XmlElement, key: string): HexColor | undefined {
  const color = el.children.find((c) => c.tag === 'color' && c.attrs.key === key)
  if (!color) return undefined
  const toByte = (v: string | number | undefined): string | undefined => {
    if (v === undefined) return undefined
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isFinite(n)) return undefined
    return Math.max(0, Math.min(255, Math.round(n * 255)))
      .toString(16)
      .padStart(2, '0')
  }
  let r: string | undefined
  let g: string | undefined
  let b: string | undefined
  if (color.attrs.red !== undefined) {
    const rr = toByte(color.attrs.red)
    const gg = toByte(color.attrs.green)
    const bb = toByte(color.attrs.blue)
    if (!rr || !gg || !bb) return undefined
    r = rr
    g = gg
    b = bb
  } else if (color.attrs.white !== undefined) {
    const ww = toByte(color.attrs.white)
    if (!ww) return undefined
    r = g = b = ww
  } else {
    // System / named colors cannot be resolved without UIKit -> skip compare.
    return undefined
  }
  const alpha = color.attrs.alpha !== undefined ? Number(color.attrs.alpha) : 1
  if (alpha < 1) {
    const aa = toByte(alpha)
    return `#${r}${g}${b}${aa}`
  }
  return `#${r}${g}${b}`
}

function fontSizeOf(el: XmlElement): number | undefined {
  const font = el.children.find((c) => c.tag === 'fontdescription' || c.tag === 'font')
  if (!font) return undefined
  const pointSize = Number(font.attrs.pointSize ?? font.attrs.size)
  return Number.isFinite(pointSize) ? Math.round(pointSize * 100) / 100 : undefined
}

function textOf(el: XmlElement): string | undefined {
  const text = findChild(el, 'text')
  if (text?.text) return text.text
  const title = el.children.find((c) => c.tag === 'string' && c.attrs.key === 'title')
  return title?.text
}

function cornerRadiusOf(el: XmlElement): number | undefined {
  const attr = el.children
    .flatMap((c) => (c.tag === 'userdefinedruntimeattributes' ? c.children : []))
    .find(
      (c) =>
        c.attrs.keyPath === 'cornerRadius' && (c.attrs.value ?? c.attrs.number) !== undefined,
    )
  if (!attr) return undefined
  const v = Number(attr.attrs.value ?? attr.attrs.number)
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined
}

function kindFor(tag: string): DesignNodeKind {
  if (tag === 'label' || tag === 'textfield' || tag === 'textview' || tag === 'button') return 'text'
  if (tag === 'imageview') return 'image'
  if (CONTAINER_HINT.test(tag)) return 'frame'
  return 'view'
}

function convertView(el: XmlElement, sequence: { n: number }): DesignNode | null {
  const tag = el.tag.toLowerCase()
  const box = frameOf(el)
  if (!VIEW_TAGS.has(tag) || !box) return null

  const style: DesignNode['style'] = {}
  const bg = colorOf(el, 'backgroundColor')
  if (bg) style.backgroundColor = bg
  const textColor = colorOf(el, 'textColor')
  if (textColor) style.color = textColor
  const fontSize = fontSizeOf(el)
  if (fontSize) style.fontSize = fontSize
  const radius = cornerRadiusOf(el)
  if (radius) style.cornerRadius = radius

  const font = el.children.find((c) => c.tag === 'fontdescription' || c.tag === 'font')
  if (font?.attrs.name) style.fontFamily = font.attrs.name
  if (/\bbold\b/i.test(font?.attrs.name ?? '')) style.fontWeight = 700

  const id = el.attrs.id ?? `uikit-${sequence.n++}`
  const label = el.attrs.userLabel ?? textOf(el) ?? tag

  const subviews = findChild(el, 'subviews')
  const children: DesignNode[] = []
  for (const child of subviews?.children ?? []) {
    const node = convertView(child, sequence)
    if (node) children.push(node)
  }

  return {
    id,
    name: label,
    kind: kindFor(tag),
    text: textOf(el),
    box,
    style,
    children,
  }
}

/** Locate the first top-level view carrying a frame inside an IB document. */
function findRootView(el: XmlElement): XmlElement | undefined {
  if (frameOf(el) && VIEW_TAGS.has(el.tag.toLowerCase())) return el
  for (const child of el.children) {
    const hit = findRootView(child)
    if (hit) return hit
  }
  return undefined
}

export function normalizeUIKitDoc(ibXml: string): DesignDoc {
  const parsed = parseXml(ibXml)
  const rootEl = findRootView(parsed)
  if (!rootEl) throw new Error('xib/storyboard 中找不到带 frame 的根视图')
  const root = convertView(rootEl, { n: 0 })
  if (!root) throw new Error('无法解析 UIKit 视图树')
  return { root, scale: 1, source: 'uikit' }
}
