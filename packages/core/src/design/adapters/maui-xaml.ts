/**
 * .NET MAUI / Xamarin.Forms XAML adapter.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { walkFiles } from '../fs-walk.js'
import { tokenizeName, normalizeText } from '../page-fingerprint.js'
import { parseXml, type XmlElement } from '../xml-lite.js'
import type { CodePage, PageFingerprint, PlatformAdapter } from './adapter-types.js'
import type { DesignDoc, DesignNode, DesignStyle, HexColor } from '../types.js'
import { parseCssColor } from './web-css.js'
import { loadNativeStyleContext } from './native-style-context.js'

function localName(tag: string): string {
  const i = tag.indexOf(':')
  return (i >= 0 ? tag.slice(i + 1) : tag).toLowerCase()
}

function attr(el: XmlElement, ...names: string[]): string | undefined {
  for (const n of names) {
    if (el.attrs[n] !== undefined) return el.attrs[n]
    const hit = Object.entries(el.attrs).find(
      ([k]) => k.toLowerCase() === n.toLowerCase() || k.toLowerCase().endsWith('.' + n.toLowerCase()),
    )
    if (hit) return hit[1]
  }
  return undefined
}

function parseMauiColor(raw: string | undefined): HexColor | undefined {
  if (!raw) return undefined
  return parseCssColor(raw.trim())
}

function parseLength(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const m = raw.trim().match(/^([\d.]+)/)
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isFinite(n) ? n : undefined
}

function textOf(el: XmlElement): string | undefined {
  const t = attr(el, 'Text', 'Title', 'Placeholder')
  if (t) return t
  const direct = el.text?.trim()
  return direct || undefined
}

function parseThickness(
  raw: string | undefined,
): { top: number; right: number; bottom: number; left: number } | undefined {
  if (!raw) return undefined
  const parts = raw
    .trim()
    .split(/[,\s]+/)
    .map((p) => Number(p))
    .filter((n) => Number.isFinite(n))
  // MAUI Thickness: 1=uniform; 2=horizontal,vertical; 4=left,top,right,bottom
  if (parts.length === 1) {
    const v = parts[0]!
    return { top: v, right: v, bottom: v, left: v }
  }
  if (parts.length === 2) {
    return { top: parts[1]!, right: parts[0]!, bottom: parts[1]!, left: parts[0]! }
  }
  if (parts.length >= 4) {
    return { left: parts[0]!, top: parts[1]!, right: parts[2]!, bottom: parts[3]! }
  }
  return undefined
}

function applyMauiVisualStateDefaults(el: XmlElement, style: DesignStyle): void {
  const setters: Array<{ property: string; value: string }> = []
  const visit = (node: XmlElement) => {
    const tag = localName(node.tag)
    if (tag === 'visualstate') {
      const name = (attr(node, 'x:Name', 'Name') ?? '').toLowerCase()
      // Prefer Normal; also accept empty name as default.
      if (name && name !== 'normal' && name !== 'common' && name !== 'normalstate') {
        for (const c of node.children) visit(c)
        return
      }
      const collectSetters = (n: XmlElement) => {
        if (localName(n.tag) === 'setter') {
          const property = attr(n, 'Property') ?? ''
          const value = attr(n, 'Value') ?? n.text?.trim() ?? ''
          if (property && value) setters.push({ property, value })
        }
        for (const c of n.children) collectSetters(c)
      }
      collectSetters(node)
    }
    for (const c of node.children) visit(c)
  }
  visit(el)

  for (const { property, value } of setters) {
    const prop = property.replace(/^[^.]+\./, '') // Button.BackgroundColor → BackgroundColor
    if (/backgroundcolor|background/i.test(prop) && !style.backgroundColor) {
      const c = parseMauiColor(value)
      if (c) style.backgroundColor = c
    }
    if (/textcolor|color$/i.test(prop) && !/background/i.test(prop) && !style.color) {
      const c = parseMauiColor(value)
      if (c) style.color = c
    }
    if (/fontsize/i.test(prop) && style.fontSize === undefined) {
      const n = parseLength(value)
      if (n !== undefined) style.fontSize = n
    }
    if (/cornerradius/i.test(prop) && style.cornerRadius === undefined) {
      const n = parseLength(value)
      if (n !== undefined) style.cornerRadius = n
    }
  }
}

function convert(el: XmlElement, seq: { n: number }): DesignNode | null {
  const tag = localName(el.tag)
  // Skip xaml root noise
  if (tag === 'contentpage.toolbaritems' || tag === 'contentpage.resources') return null
  // Skip VisualState machinery as nodes
  if (
    tag === 'visualstatemanager.visualstategroups' ||
    tag === 'visualstategrouplist' ||
    tag === 'visualstategroup' ||
    tag === 'visualstate' ||
    tag === 'visualstate.setters' ||
    tag === 'setter'
  ) {
    return null
  }

  const style: DesignStyle = {}
  const color = parseMauiColor(attr(el, 'TextColor', 'Color'))
  if (color) style.color = color
  const bg = parseMauiColor(attr(el, 'BackgroundColor', 'Background'))
  if (bg) style.backgroundColor = bg
  const fontSize = parseLength(attr(el, 'FontSize'))
  if (fontSize !== undefined) style.fontSize = fontSize
  const radius = parseLength(attr(el, 'CornerRadius'))
  if (radius !== undefined) style.cornerRadius = radius

  // Fill missing colours / sizes from VisualState Normal setters.
  applyMauiVisualStateDefaults(el, style)

  const fontAttrs = attr(el, 'FontAttributes')
  if (fontAttrs && /bold/i.test(fontAttrs)) style.fontWeight = 700

  const padding = parseThickness(attr(el, 'Padding'))
  if (padding) {
    style.paddingTop = padding.top
    style.paddingRight = padding.right
    style.paddingBottom = padding.bottom
    style.paddingLeft = padding.left
  }
  const margin = parseThickness(attr(el, 'Margin'))
  if (margin) {
    style.marginTop = margin.top
    style.marginRight = margin.right
    style.marginBottom = margin.bottom
    style.marginLeft = margin.left
  }

  const opacity = parseLength(attr(el, 'Opacity'))
  if (opacity !== undefined) style.opacity = opacity

  const width = parseLength(attr(el, 'WidthRequest', 'Width'))
  const height = parseLength(attr(el, 'HeightRequest', 'Height'))
  const text = textOf(el)

  const children: DesignNode[] = []
  for (const c of el.children) {
    const node = convert(c, seq)
    if (node) children.push(node)
  }

  const isText =
    tag === 'label' ||
    tag === 'button' ||
    tag === 'entry' ||
    tag === 'editor' ||
    tag === 'span'
  const kind = isText ? 'text' : tag === 'image' ? 'image' : 'view'

  // Skip empty structural wrappers with no style/text/children
  if (!text && children.length === 0 && Object.keys(style).length === 0 && width === undefined) {
    return null
  }

  return {
    id: attr(el, 'x:Name', 'Name') || `maui-${seq.n++}`,
    name: attr(el, 'x:Name', 'Name') || text || tag,
    kind,
    text,
    box: { width, height },
    style,
    children,
  }
}

export function normalizeMauiXaml(xaml: string, rootName: string): DesignDoc {
  const parsed = parseXml(xaml)
  const seq = { n: 0 }
  const rootNode = convert(parsed, seq) ?? {
    id: 'maui-root',
    name: rootName,
    kind: 'frame' as const,
    box: {},
    style: {},
    children: [] as DesignNode[],
  }
  // Ensure frame root
  if (rootNode.kind !== 'frame') {
    return {
      root: {
        id: 'maui-root',
        name: rootName,
        kind: 'frame',
        box: {},
        style: {},
        children: [rootNode],
      },
      scale: 1,
      source: 'manual',
    }
  }
  rootNode.name = rootName
  return { root: rootNode, scale: 1, source: 'manual' }
}

function fingerprint(xaml: string, fileBase: string): PageFingerprint {
  const texts = new Set<string>()
  try {
    const doc = normalizeMauiXaml(xaml, fileBase)
    const walk = (n: DesignNode): void => {
      if (n.text) {
        const t = normalizeText(n.text)
        if (t) texts.add(t)
      }
      for (const c of n.children) walk(c)
    }
    walk(doc.root)
  } catch {
    /* keep name-only */
  }
  return {
    texts: [...texts],
    nameTokens: tokenizeName(fileBase.replace(/\.xaml$/i, '')),
    controlCount: (xaml.match(/<(Label|Button|Entry|Image|Frame|Grid|StackLayout|VerticalStackLayout|HorizontalStackLayout)\b/gi) ?? []).length,
  }
}

export const mauiXamlAdapter: PlatformAdapter = {
  id: 'maui-xaml',
  platform: 'dotnet',
  kindLabel: '.NET MAUI XAML',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!file.name.toLowerCase().endsWith('.xaml')) return
      let xaml = ''
      try {
        xaml = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      if (!/<(ContentPage|ContentView|FlyoutPage|TabbedPage)\b/i.test(xaml)) return
      pages.push({
        adapterId: 'maui-xaml',
        platform: 'dotnet',
        kindLabel: '.NET MAUI XAML',
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
        precise: true,
        fingerprint: fingerprint(xaml, file.name),
      })
    })
    return pages
  },

  async toDesignDoc(page: CodePage): Promise<DesignDoc> {
    const xaml = await readFile(page.absolutePath, 'utf8')
    const ctx = await loadNativeStyleContext(page.absolutePath, xaml, 'maui')
    return normalizeMauiXaml(ctx.source, path.basename(page.relativePath, '.xaml'))
  },
}
