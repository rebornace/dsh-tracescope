/**
 * Android implementation source: normalise layout XML (plus the referenced
 * `dimen` / `color` resources) into the vendor-neutral {@link DesignDoc}.
 */
import type {
  DesignDoc,
  DesignNode,
  DesignNodeKind,
  DesignStyle,
  HexColor,
  UnresolvedValue,
} from './design-types.js'
import { parseXml, type XmlElement } from './xml-lite.js'

export interface AndroidResources {
  /** name -> raw dimension token, e.g. { value: 16, unit: 'dp' } */
  dimens: Record<string, { value: number; unit: string }>
  /** name -> normalized hex */
  colors: Record<string, HexColor>
}

export const EMPTY_ANDROID_RESOURCES: AndroidResources = { dimens: {}, colors: {} }

export interface DimensionToken {
  value: number
  unit: string
}

/** Parse `16dp`, `12sp`, `0.5pt`, `24px`, `@dimen/name`. */
export function parseAndroidDimension(
  raw: string,
  resources: AndroidResources,
): DimensionToken | UnresolvedValue | undefined {
  const input = raw.trim()
  if (!input) return undefined
  if (input.startsWith('@dimen/')) {
    const name = input.slice('@dimen/'.length)
    const hit = resources.dimens[name]
    return hit ?? { unresolved: true, raw: input }
  }
  const match = /^(-?\d+(?:\.\d+)?)(dp|dip|sp|pt|px|in|mm)?$/i.exec(input)
  if (!match) {
    if (/^(match_parent|wrap_content|fill_parent|0dp)$/.test(input) && input !== '0dp') {
      return { unresolved: true, raw: input }
    }
    return { unresolved: true, raw: input }
  }
  return { value: Number(match[1]), unit: (match[2] ?? 'px').toLowerCase() }
}

function normalizeAndroidColor(
  raw: string | undefined,
  resources: AndroidResources,
): HexColor | UnresolvedValue | undefined {
  if (!raw) return undefined
  const input = raw.trim()
  if (!input) return undefined
  if (input.startsWith('@color/')) {
    const name = input.slice('@color/'.length)
    const hit = resources.colors[name]
    return hit ?? { unresolved: true, raw: input }
  }
  if (input.startsWith('#')) {
    let hex = input.toLowerCase()
    // Expand short forms and add/normalize alpha to #rrggbbaa.
    if (/^#([0-9a-f]){3}$/.test(hex)) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    }
    if (/^#[0-9a-f]{8}$/.test(hex)) {
      // Android is #aarrggbb -> move alpha to the end (#rrggbbaa).
      hex = `#${hex.slice(3)}${hex.slice(1, 3)}`
    }
    return hex
  }
  if (input.startsWith('@drawable/') || input.startsWith('?')) {
    return { unresolved: true, raw: input }
  }
  return undefined
}

const TEXT_TAGS = /^(textview|button|edittext|androidx\.appcompat\.widget\.appcompattextview|androidx\.appcompat\.widget\.appcompatbutton|com\.google\.android\.material\.button\.materialbutton|togglebutton|checkbox|radiobutton)$/i
const IMAGE_TAGS = /^(imageview|androidx\.appcompat\.widget\.appcompatimageview|com\.facebook\.drawee\.view\.simpleDraweeView|glide\.widget|videoView)$/i
const CONTAINER_TAGS = /(layout|viewgroup|pager|recyclerview|listview|scrollview|framelayout|linearlayout|relativelayout|constraintlayout|coordinatorlayout|cardview|include|merge)/i

function simpleTag(tag: string): string {
  return tag.includes('.') ? tag.split('.').pop()! : tag
}

function mapAndroidKind(tag: string, el: XmlElement): DesignNodeKind {
  if (TEXT_TAGS.test(tag)) return 'text'
  if (IMAGE_TAGS.test(tag)) return 'image'
  if (/icon|img|avatar/i.test(el.attrs['android:id'] ?? '')) return 'image'
  if (CONTAINER_TAGS.test(tag)) return 'frame'
  return 'view'
}

function dimensionToLogical(token: DimensionToken): number {
  // dp/dip/sp/pt are treated as logical units; raw px cannot be converted
  // without density, so callers should have resolved them already.
  return token.value
}

function unwrapDim(
  target: Record<string, number | UnresolvedValue>,
  key: string,
  raw: string | undefined,
  resources: AndroidResources,
): void {
  if (raw === undefined) return
  const parsed = parseAndroidDimension(raw, resources)
  if (!parsed) return
  if ('unresolved' in parsed) {
    target[key] = parsed
  } else {
    target[key] = Math.round(dimensionToLogical(parsed) * 100) / 100
  }
}

function convertElement(el: XmlElement, resources: AndroidResources, indexPath: string): DesignNode {
  const tag = simpleTag(el.tag)
  const a = el.attrs
  const style: DesignStyle = {}
  const box: DesignNode['box'] = {}

  unwrapDim(box as Record<string, number | UnresolvedValue>, 'width', a['android:layout_width'], resources)
  unwrapDim(box as Record<string, number | UnresolvedValue>, 'height', a['android:layout_height'], resources)

  const marginAttrs: Array<[string, string]> = [
    ['marginTop', 'android:layout_marginTop'],
    ['marginRight', 'android:layout_marginRight'],
    ['marginBottom', 'android:layout_marginBottom'],
    ['marginLeft', 'android:layout_marginLeft'],
  ]
  for (const [key, attr] of marginAttrs) {
    unwrapDim(style as Record<string, number | UnresolvedValue>, key, a[attr], resources)
  }
  const paddingAttrs: Array<[string, string]> = [
    ['paddingTop', 'android:paddingTop'],
    ['paddingRight', 'android:paddingRight'],
    ['paddingBottom', 'android:paddingBottom'],
    ['paddingLeft', 'android:paddingLeft'],
  ]
  for (const [key, attr] of paddingAttrs) {
    unwrapDim(style as Record<string, number | UnresolvedValue>, key, a[attr], resources)
  }

  const bg = normalizeAndroidColor(a['android:background'], resources)
  if (bg) style.backgroundColor = bg

  const textColor = normalizeAndroidColor(a['android:textColor'], resources)
  if (textColor) style.color = textColor

  unwrapDim(style as Record<string, number | UnresolvedValue>, 'fontSize', a['android:textSize'], resources)
  unwrapDim(style as Record<string, number | UnresolvedValue>, 'letterSpacing', a['android:letterSpacing'], resources)
  unwrapDim(style as Record<string, number | UnresolvedValue>, 'lineHeight', a['android:lineHeight'], resources)

  if (a['android:fontFamily']) style.fontFamily = a['android:fontFamily']
  if (/\bbold\b/i.test(a['android:textStyle'] ?? '')) style.fontWeight = 700

  const rawId = a['android:id'] ?? ''
  const id = rawId ? rawId.replace(/^@\+?id\//, '') : `${tag}-${indexPath}`
  const name = a['android:tag'] ?? (a['android:id'] ? simpleTag(id) : tag)

  return {
    id,
    name,
    kind: mapAndroidKind(tag, el),
    text: a['android:text'] && !a['android:text'].startsWith('@') ? a['android:text'] : undefined,
    box,
    style,
    children: el.children.map((c, i) => convertElement(c, resources, `${indexPath}.${i}`)),
  }
}

export function normalizeAndroidLayout(
  layoutXml: string,
  resources: AndroidResources = EMPTY_ANDROID_RESOURCES,
): DesignDoc {
  const root = parseXml(layoutXml)
  const normalized = convertElement(root, resources, '0')
  return { root: normalized, scale: 1, source: 'android-xml' }
}

// ---------------------------------------------------------------------------
// Resource file parsing
// ---------------------------------------------------------------------------

/** Parse one or more `dimens.xml` / `colors.xml` contents into a resource table. */
export function buildAndroidResources(...fileContents: string[]): AndroidResources {
  const resources: AndroidResources = { dimens: {}, colors: {} }
  for (const content of fileContents) {
    let root: XmlElement
    try {
      root = parseXml(content)
    } catch {
      continue
    }
    for (const el of root.children) {
      if (el.tag === 'dimen') {
        const name = el.attrs.name
        const parsed = parseAndroidDimension(el.text, EMPTY_ANDROID_RESOURCES)
        if (name && parsed && !('unresolved' in parsed)) resources.dimens[name] = parsed
      } else if (el.tag === 'color') {
        const name = el.attrs.name
        const color = normalizeAndroidColor(el.text, EMPTY_ANDROID_RESOURCES)
        if (name && color && typeof color === 'string') resources.colors[name] = color
      } else if (el.tag === 'item' && el.attrs.type === 'color') {
        const name = el.attrs.name
        const color = normalizeAndroidColor(el.text, EMPTY_ANDROID_RESOURCES)
        if (name && color && typeof color === 'string') resources.colors[name] = color
      }
    }
  }
  return resources
}
