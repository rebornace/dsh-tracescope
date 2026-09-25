/**
 * Android XML platform adapter.
 *
 * Locates layout XML files under the Android `res/layout*` directories and
 * normalises them plus the referenced `dimen` / `color` resources into the
 * vendor-neutral model. Fully deterministic and supports property-level
 * comparison.
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  DesignDoc,
  DesignNode,
  HexColor,
  UnresolvedValue,
} from '../types.js'
import { parseXml, type XmlElement } from '../xml-lite.js'
import { walkFiles } from '../fs-walk.js'
import { normalizeText, tokenizeName } from '../page-fingerprint.js'
import type {
  CodePage,
  PageFingerprint,
  PlatformAdapter,
} from './adapter-types.js'

export interface AndroidResources {
  /** name -> parsed dimension token, e.g. { value: 16, unit: 'dp' } */
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
    if (/^#([0-9a-f]){3}$/.test(hex)) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    }
    if (/^#[0-9a-f]{8}$/.test(hex)) {
      // Android #aarrggbb -> #rrggbbaa.
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

function mapAndroidKind(tag: string, el: XmlElement) {
  if (TEXT_TAGS.test(tag)) return 'text' as const
  if (IMAGE_TAGS.test(tag)) return 'image' as const
  if (/icon|img|avatar/i.test(el.attrs['android:id'] ?? '')) return 'image' as const
  if (CONTAINER_TAGS.test(tag)) return 'frame' as const
  return 'view' as const
}

function dimensionToLogical(token: DimensionToken): number {
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
  const style: DesignNode['style'] = {}
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

// ---------------------------------------------------------------------------
// Resource discovery
// ---------------------------------------------------------------------------

/** Walk up from a layout file to find the Android module res root. */
async function findAndroidResRoot(layoutPath: string): Promise<string | undefined> {
  let dir = path.dirname(layoutPath)
  for (let i = 0; i < 8; i++) {
    const resDir = path.join(dir, 'src', 'main', 'res')
    try {
      const entries = await readdir(resDir)
      if (entries.length) return path.join(dir, 'src', 'main')
    } catch {
      /* not here */
    }
    if (path.basename(dir) === 'res') return path.dirname(dir)
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/** Read every values* XML under an Android res root. */
async function loadAndroidResources(layoutPath: string): Promise<AndroidResources> {
  const resRoot = await findAndroidResRoot(layoutPath)
  if (!resRoot) return EMPTY_ANDROID_RESOURCES
  const resDir = path.join(resRoot, 'res')
  let valueDirs: string[] = []
  try {
    valueDirs = (await readdir(resDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && /^values/.test(d.name))
      .map((d) => path.join(resDir, d.name))
  } catch {
    return EMPTY_ANDROID_RESOURCES
  }
  const xmls: string[] = []
  for (const dir of valueDirs) {
    let entries: string[] = []
    try {
      entries = await readdir(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (name.endsWith('.xml')) xmls.push(await readFile(path.join(dir, name), 'utf8'))
    }
  }
  return buildAndroidResources(...xmls)
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

function isAndroidLayoutFile(relativePath: string): boolean {
  const dir = path.dirname(relativePath.split('/').join(path.sep))
  const base = path.basename(dir)
  const parentBase = path.basename(path.dirname(dir))
  return parentBase === 'res' && /^layout/.test(base)
}

/** Lightweight fingerprint directly from layout XML (resources not needed). */
function fingerprintFromXml(xml: string, fileBase: string): PageFingerprint {
  const texts = new Set<string>()
  let controlCount = 0
  let root: XmlElement
  try {
    root = parseXml(xml)
  } catch {
    return { texts: [], nameTokens: tokenizeName(fileBase), controlCount: 0 }
  }
  const walk = (el: XmlElement) => {
    controlCount += 1
    const t = el.attrs['android:text']
    if (t && !t.startsWith('@')) {
      const nt = normalizeText(t)
      if (nt) texts.add(nt)
    }
    for (const c of el.children) walk(c)
  }
  walk(root)
  return {
    texts: [...texts],
    nameTokens: tokenizeName(fileBase.replace(/\.xml$/i, '')),
    controlCount,
  }
}

export const androidXmlAdapter: PlatformAdapter = {
  id: 'android-xml',
  platform: 'android',
  kindLabel: 'Android XML',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!file.name.endsWith('.xml')) return
      if (!isAndroidLayoutFile(file.relativePath)) return
      let xml = ''
      try {
        xml = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      pages.push({
        adapterId: 'android-xml',
        platform: 'android',
        kindLabel: 'Android XML',
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
        precise: true,
        fingerprint: fingerprintFromXml(xml, file.name),
      })
    })
    return pages
  },

  async toDesignDoc(page: CodePage): Promise<DesignDoc> {
    const xml = await readFile(page.absolutePath, 'utf8')
    const resources = await loadAndroidResources(page.absolutePath)
    return normalizeAndroidLayout(xml, resources)
  },
}
