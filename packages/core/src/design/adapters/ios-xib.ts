/**
 * iOS Interface Builder platform adapter.
 *
 * Locates `.xib` / `.storyboard` documents (plist XML) and normalises their
 * absolute point frames into the vendor-neutral model. Fully deterministic and
 * supports property-level comparison. Programmatic UIKit is not covered here.
 *
 * Named colours resolve from:
 * 1. Inline `<namedColor>` / nested `<color>` in the IB document
 * 2. Nearby `*.xcassets/*.colorset/Contents.json` asset catalogs
 * 3. A small set of well-known `systemColor` light-mode defaults
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  DesignDoc,
  DesignNode,
  HexColor,
} from '../types.js'
import { parseXml, type XmlElement } from '../xml-lite.js'
import { walkFiles } from '../fs-walk.js'
import { normalizeText, tokenizeName } from '../page-fingerprint.js'
import type {
  CodePage,
  PageFingerprint,
  PlatformAdapter,
} from './adapter-types.js'

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

/** Approximate light-mode UIKit system colours (sRGB). */
const SYSTEM_COLORS: Record<string, HexColor> = {
  labelColor: '#000000',
  secondaryLabelColor: '#3c3c4399',
  tertiaryLabelColor: '#3c3c434c',
  quaternaryLabelColor: '#3c3c432d',
  systemBackgroundColor: '#ffffff',
  secondarySystemBackgroundColor: '#f2f2f7',
  tertiarySystemBackgroundColor: '#ffffff',
  systemGroupedBackgroundColor: '#f2f2f7',
  systemBlueColor: '#007aff',
  systemGreenColor: '#34c759',
  systemIndigoColor: '#5856d6',
  systemOrangeColor: '#ff9500',
  systemPinkColor: '#ff2d55',
  systemPurpleColor: '#af52de',
  systemRedColor: '#ff3b30',
  systemTealColor: '#5ac8fa',
  systemYellowColor: '#ffcc00',
  systemGrayColor: '#8e8e93',
  systemGray2Color: '#aeaeb2',
  systemGray3Color: '#c7c7cc',
  systemGray4Color: '#d1d1d6',
  systemGray5Color: '#e5e5ea',
  systemGray6Color: '#f2f2f7',
  separatorColor: '#3c3c4349',
  opaqueSeparatorColor: '#c6c6c8',
  linkColor: '#007aff',
  placeholderTextColor: '#3c3c434c',
  lightTextColor: '#ffffff99',
  darkTextColor: '#000000',
}

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

function channelToByte(v: string | number | undefined): string | undefined {
  if (v === undefined) return undefined
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return undefined
  // IB stores 0–1 floats; asset catalogs may use 0–1 or 0–255 strings.
  const scaled = n > 1 ? n : n * 255
  return Math.max(0, Math.min(255, Math.round(scaled)))
    .toString(16)
    .padStart(2, '0')
}

/** Parse an IB / namedColor `<color …/>` element into #rrggbb[aa]. */
export function parseIbColorElement(color: XmlElement): HexColor | undefined {
  let r: string | undefined
  let g: string | undefined
  let b: string | undefined
  if (color.attrs.red !== undefined) {
    r = channelToByte(color.attrs.red)
    g = channelToByte(color.attrs.green)
    b = channelToByte(color.attrs.blue)
  } else if (color.attrs.white !== undefined) {
    const ww = channelToByte(color.attrs.white)
    if (!ww) return undefined
    r = g = b = ww
  } else {
    return undefined
  }
  if (!r || !g || !b) return undefined
  const alpha = color.attrs.alpha !== undefined ? Number(color.attrs.alpha) : 1
  if (Number.isFinite(alpha) && alpha < 1) {
    const aa = channelToByte(alpha)
    return `#${r}${g}${b}${aa}`
  }
  return `#${r}${g}${b}`
}

function colorOf(
  el: XmlElement,
  key: string,
  named: Map<string, HexColor>,
): HexColor | undefined {
  const color = el.children.find((c) => c.tag === 'color' && c.attrs.key === key)
  if (!color) return undefined

  const direct = parseIbColorElement(color)
  if (direct) return direct

  const system = color.attrs.systemColor
  if (system) {
    return SYSTEM_COLORS[system] ?? SYSTEM_COLORS[`${system}Color`]
  }

  const name = color.attrs.name
  if (name) {
    return named.get(name) ?? named.get(name.replace(/\s+/g, ''))
  }
  return undefined
}

function fontSizeOf(el: XmlElement): number | undefined {
  const font = el.children.find((c) => c.tag === 'fontdescription' || c.tag === 'font')
  if (!font) return undefined
  const pointSize = Number(font.attrs.pointSize ?? font.attrs.size)
  if (Number.isFinite(pointSize)) return Math.round(pointSize * 100) / 100
  // Dynamic Type text styles (default / Large content size).
  const styleToken = font.attrs.style ?? font.attrs.name ?? font.attrs.type
  const dyn = resolveIosDynamicTypeSize(styleToken)
  if (dyn) return dyn.size
  return undefined
}

/**
 * Apple HIG default (Large) Dynamic Type point sizes.
 * Keys match IB `style="UICTFontTextStyleBody"` / SwiftUI `.font(.body)` tokens.
 */
export const IOS_DYNAMIC_TYPE_SIZES: Record<
  string,
  { size: number; weight?: number }
> = {
  largeTitle: { size: 34, weight: 400 },
  title1: { size: 28, weight: 400 },
  title2: { size: 22, weight: 400 },
  title3: { size: 20, weight: 400 },
  headline: { size: 17, weight: 600 },
  body: { size: 17, weight: 400 },
  callout: { size: 16, weight: 400 },
  subheadline: { size: 15, weight: 400 },
  footnote: { size: 13, weight: 400 },
  caption1: { size: 12, weight: 400 },
  caption2: { size: 11, weight: 400 },
}

/** Normalize IB / UIKit Dynamic Type style name → size entry. */
export function resolveIosDynamicTypeSize(
  raw: string | undefined,
): { size: number; weight?: number } | undefined {
  if (!raw) return undefined
  let key = raw.trim()
  key = key.replace(/^UICTFontTextStyle/i, '')
  key = key.replace(/^UIFontTextStyle/i, '')
  key = key.replace(/^textStyle/i, '')
  key = key.replace(/^\./, '')
  // camelCase / Title Case → lower first letter key used in map
  const lower = key.charAt(0).toLowerCase() + key.slice(1)
  const normalized = lower.replace(/\s+/g, '')
  return (
    IOS_DYNAMIC_TYPE_SIZES[normalized] ??
    IOS_DYNAMIC_TYPE_SIZES[normalized.toLowerCase()] ??
    undefined
  )
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

function kindFor(tag: string): DesignNode['kind'] {
  if (tag === 'label' || tag === 'textfield' || tag === 'textview' || tag === 'button') return 'text'
  if (tag === 'imageview') return 'image'
  if (CONTAINER_HINT.test(tag)) return 'frame'
  return 'view'
}

function convertView(
  el: XmlElement,
  sequence: { n: number },
  named: Map<string, HexColor>,
): DesignNode | null {
  const tag = el.tag.toLowerCase()
  const box = frameOf(el)
  if (!VIEW_TAGS.has(tag) || !box) return null

  const style: DesignNode['style'] = {}
  const bg = colorOf(el, 'backgroundColor', named)
  if (bg) style.backgroundColor = bg
  const textColor = colorOf(el, 'textColor', named)
  if (textColor) style.color = textColor
  const fontSize = fontSizeOf(el)
  if (fontSize) style.fontSize = fontSize
  const radius = cornerRadiusOf(el)
  if (radius) style.cornerRadius = radius

  const font = el.children.find((c) => c.tag === 'fontdescription' || c.tag === 'font')
  if (font?.attrs.name) style.fontFamily = font.attrs.name
  if (/\bbold\b/i.test(font?.attrs.name ?? '')) style.fontWeight = 700
  // Dynamic Type headline etc. carry semibold when pointSize absent.
  if (style.fontWeight === undefined) {
    const dyn = resolveIosDynamicTypeSize(font?.attrs.style ?? font?.attrs.name)
    if (dyn?.weight) style.fontWeight = dyn.weight
  }

  const id = el.attrs.id ?? `uikit-${sequence.n++}`
  const label = el.attrs.userLabel ?? textOf(el) ?? tag

  const subviews = findChild(el, 'subviews')
  const children: DesignNode[] = []
  for (const child of subviews?.children ?? []) {
    const node = convertView(child, sequence, named)
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

function findRootView(el: XmlElement): XmlElement | undefined {
  if (frameOf(el) && VIEW_TAGS.has(el.tag.toLowerCase())) return el
  for (const child of el.children) {
    const hit = findRootView(child)
    if (hit) return hit
  }
  return undefined
}

/** Collect `<namedColor name="…">` definitions embedded in an IB document. */
export function extractNamedColorsFromIb(root: XmlElement): Map<string, HexColor> {
  const out = new Map<string, HexColor>()
  const visit = (el: XmlElement) => {
    if (el.tag === 'namedColor' || el.tag === 'namedcolor') {
      const name = el.attrs.name
      const nested = el.children.find((c) => c.tag === 'color')
      if (name && nested) {
        const hex = parseIbColorElement(nested)
        if (hex) out.set(name, hex)
      }
    }
    for (const c of el.children) visit(c)
  }
  visit(root)
  return out
}

function componentToByte(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const n = Number(raw)
  if (!Number.isFinite(n)) return undefined
  if (n <= 1) return Math.round(n * 255)
  return Math.max(0, Math.min(255, Math.round(n)))
}

/** Parse one colorset Contents.json into #rrggbb[aa] (universal / first entry). */
export function parseColorsetContents(jsonText: string): HexColor | undefined {
  let data: {
    colors?: Array<{
      idiom?: string
      appearances?: unknown[]
      color?: {
        'color-space'?: string
        components?: { red?: string; green?: string; blue?: string; alpha?: string; white?: string }
      }
    }>
  }
  try {
    data = JSON.parse(jsonText)
  } catch {
    return undefined
  }
  const entries = data.colors ?? []
  // Prefer universal without appearance variants (light default).
  const pick =
    entries.find((e) => (e.idiom === 'universal' || !e.idiom) && !e.appearances?.length) ??
    entries.find((e) => e.idiom === 'universal' || !e.idiom) ??
    entries[0]
  const comps = pick?.color?.components
  if (!comps) return undefined
  if (comps.white !== undefined) {
    const w = componentToByte(comps.white)
    if (w === undefined) return undefined
    const hex = w.toString(16).padStart(2, '0')
    const a = comps.alpha !== undefined ? Number(comps.alpha) : 1
    if (Number.isFinite(a) && a < 1) {
      const aa = Math.round(a * 255).toString(16).padStart(2, '0')
      return `#${hex}${hex}${hex}${aa}`
    }
    return `#${hex}${hex}${hex}`
  }
  const r = componentToByte(comps.red)
  const g = componentToByte(comps.green)
  const b = componentToByte(comps.blue)
  if (r === undefined || g === undefined || b === undefined) return undefined
  const rr = r.toString(16).padStart(2, '0')
  const gg = g.toString(16).padStart(2, '0')
  const bb = b.toString(16).padStart(2, '0')
  const a = comps.alpha !== undefined ? Number(comps.alpha) : 1
  if (Number.isFinite(a) && a < 1) {
    const aa = Math.round(a * 255).toString(16).padStart(2, '0')
    return `#${rr}${gg}${bb}${aa}`
  }
  return `#${rr}${gg}${bb}`
}

async function collectXcassetsDirs(startDir: string): Promise<string[]> {
  const found: string[] = []
  let dir = startDir
  for (let i = 0; i < 8; i++) {
    let entries: string[] = []
    try {
      entries = await readdir(dir)
    } catch {
      break
    }
    for (const name of entries) {
      if (name.endsWith('.xcassets')) found.push(path.join(dir, name))
    }
    // Also look one level into common iOS folders.
    for (const sub of ['Assets', 'Resources', 'Supporting Files']) {
      const subDir = path.join(dir, sub)
      try {
        const nested = await readdir(subDir)
        for (const name of nested) {
          if (name.endsWith('.xcassets')) found.push(path.join(subDir, name))
        }
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return found
}

async function loadColorsetsFromCatalog(catalogDir: string, out: Map<string, HexColor>): Promise<void> {
  let entries: string[] = []
  try {
    entries = await readdir(catalogDir)
  } catch {
    return
  }
  for (const name of entries) {
    if (!name.endsWith('.colorset')) {
      // Nested folders inside xcassets (e.g. Colors/).
      const full = path.join(catalogDir, name)
      try {
        const st = await readdir(full)
        if (st.some((s) => s.endsWith('.colorset') || s.endsWith('.imageset'))) {
          await loadColorsetsFromCatalog(full, out)
        }
      } catch {
        /* ignore */
      }
      continue
    }
    const colorName = name.replace(/\.colorset$/i, '')
    if (out.has(colorName)) continue
    try {
      const json = await readFile(path.join(catalogDir, name, 'Contents.json'), 'utf8')
      const hex = parseColorsetContents(json)
      if (hex) out.set(colorName, hex)
    } catch {
      /* ignore */
    }
  }
}

/** Load named colours from nearby `.xcassets` catalogs starting at a file path. */
export async function loadIosAssetCatalogColors(
  fromAbsolutePath: string,
): Promise<Map<string, HexColor>> {
  const out = new Map<string, HexColor>()
  const catalogs = await collectXcassetsDirs(path.dirname(fromAbsolutePath))
  for (const catalog of catalogs) {
    await loadColorsetsFromCatalog(catalog, out)
  }
  return out
}

export function normalizeUIKitDoc(
  ibXml: string,
  namedColors: Map<string, HexColor> = new Map(),
): DesignDoc {
  const parsed = parseXml(ibXml)
  const embedded = extractNamedColorsFromIb(parsed)
  const named = new Map<string, HexColor>([...namedColors, ...embedded])
  const rootEl = findRootView(parsed)
  if (!rootEl) throw new Error('xib/storyboard 中找不到带 frame 的根视图')
  const root = convertView(rootEl, { n: 0 }, named)
  if (!root) throw new Error('无法解析 UIKit 视图树')
  return { root, scale: 1, source: 'uikit' }
}

// ---------------------------------------------------------------------------
// Fingerprint / adapter
// ---------------------------------------------------------------------------

function fingerprintFromDoc(ibXml: string, fileBase: string): PageFingerprint {
  const texts = new Set<string>()
  let controlCount = 0
  try {
    const parsed = parseXml(ibXml)
    const visit = (el: XmlElement) => {
      if (VIEW_TAGS.has(el.tag.toLowerCase())) controlCount += 1
      const t = textOf(el)
      if (t) {
        const nt = normalizeText(t)
        if (nt) texts.add(nt)
      }
      for (const c of el.children) visit(c)
    }
    visit(parsed)
  } catch {
    /* malformed doc — keep name-only fingerprint */
  }
  return {
    texts: [...texts],
    nameTokens: tokenizeName(fileBase.replace(/\.(xib|storyboard)$/i, '')),
    controlCount,
  }
}

export const iosXibAdapter: PlatformAdapter = {
  id: 'ios-xib',
  platform: 'ios',
  kindLabel: 'iOS Xib',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!/\.(xib|storyboard)$/i.test(file.name)) return
      let xml = ''
      try {
        xml = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      pages.push({
        adapterId: 'ios-xib',
        platform: 'ios',
        kindLabel: 'iOS Xib',
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
        precise: true,
        fingerprint: fingerprintFromDoc(xml, file.name),
      })
    })
    return pages
  },

  async toDesignDoc(page: CodePage): Promise<DesignDoc> {
    const xml = await readFile(page.absolutePath, 'utf8')
    const named = await loadIosAssetCatalogColors(page.absolutePath)
    return normalizeUIKitDoc(xml, named)
  },
}
