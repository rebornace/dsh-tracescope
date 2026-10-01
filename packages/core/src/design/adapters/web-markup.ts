/**
 * Lightweight HTML/Vue-template → DesignDoc conversion for static compare.
 * Produces a flat-ish tree of elements that carry text and/or resolvable styles.
 * Custom component tags (PascalCase / kebab-case / unknown tags) become
 * placeholder view nodes so related modules can be inlined by name later.
 */
import type { DesignDoc, DesignNode, DesignNodeKind } from '../types.js'
import {
  decodeBasicEntities,
  parseCssDeclarations,
  parseSimpleStyleRules,
  applyFlexGapLayout,
  applyDocumentOrderStack,
} from './web-css.js'
import { normalizeText } from '../page-fingerprint.js'

const TEXT_TAGS = new Set([
  'p',
  'span',
  'a',
  'label',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'button',
  'li',
  'td',
  'th',
  'strong',
  'em',
  'b',
  'i',
  'small',
  'title',
  'div',
  'section',
])

/** Tags handled as native markup — everything else is treated as a component slot. */
const BUILTIN_TAGS = new Set([
  ...TEXT_TAGS,
  'img',
  'header',
  'footer',
  'nav',
  'main',
  'ul',
  'ol',
  'form',
  'input',
  'textarea',
  'select',
  'option',
  'table',
  'tr',
  'thead',
  'tbody',
  'html',
  'head',
  'body',
  'script',
  'style',
  'meta',
  'link',
  'br',
  'hr',
  'fragment',
  'template',
  'slot',
  'transition',
  'component',
  // miniprogram natives (pre-mapped or raw)
  'view',
  'text',
  'image',
  'navigator',
  'scroll-view',
  'swiper',
  'swiper-item',
  'block',
  'icon',
  'progress',
  'rich-text',
  'picker',
  'slider',
  'switch',
  'checkbox',
  'radio',
  'canvas',
  'video',
  'audio',
  'map',
  'web-view',
  'cover-view',
  'cover-image',
])

function kindFor(tag: string): DesignNodeKind {
  if (tag === 'img' || tag === 'image') return 'image'
  if (TEXT_TAGS.has(tag) || tag === 'text') return 'text'
  return 'view'
}

function attrsOf(openTag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([:@A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(openTag))) {
    attrs[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
  }
  return attrs
}

function classCss(classAttr: string | undefined, rules: Map<string, string>): string {
  if (!classAttr) return ''
  return classAttr
    .split(/\s+/)
    .map((n) => rules.get(n) ?? '')
    .filter(Boolean)
    .join(';')
}

/**
 * Strip scripts/styles/comments and return body inner HTML when present.
 */
export function extractMarkupBody(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  const body = s.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
  if (body) return body[1] ?? s
  return s
}

/** Collect normalised user-facing texts from markup. */
export function collectMarkupTexts(html: string): string[] {
  const body = extractMarkupBody(html)
  const texts = new Set<string>()
  // Attribute texts.
  for (const m of body.matchAll(/\b(?:alt|title|placeholder|aria-label)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const raw = decodeBasicEntities((m[1] ?? m[2] ?? '').trim())
    const t = normalizeText(raw)
    if (t) texts.add(t)
  }
  // Tag inner texts (non-nested best effort), including miniprogram-ish tags.
  for (const m of body.matchAll(
    /<(p|span|a|label|h[1-6]|button|li|td|th|strong|em|b|i|small|div|section|view|text)\b[^>]*>([^<]*)<\/\1>/gi,
  )) {
    const raw = decodeBasicEntities((m[2] ?? '').replace(/\s+/g, ' ').trim())
    const t = normalizeText(raw)
    if (t && raw.length <= 120) texts.add(t)
  }
  return [...texts]
}

function isBuiltinTag(tag: string): boolean {
  return BUILTIN_TAGS.has(tag.toLowerCase())
}

/**
 * Build a DesignDoc from HTML-like markup + optional CSS.
 * Native elements and custom component tags become children of the root frame.
 */
export function markupToDesignDoc(
  html: string,
  cssText = '',
  rootName = 'web',
): DesignDoc {
  const body = extractMarkupBody(html)
  const { classes, ids } = parseSimpleStyleRules(cssText)
  const children: DesignNode[] = []
  let seq = 0
  const seenSpans = new Set<string>()

  const pushSpan = (start: number, end: number) => {
    seenSpans.add(`${start}:${end}`)
  }
  const already = (start: number, end: number) => seenSpans.has(`${start}:${end}`)

  const tagRe =
    /<(img|p|span|a|label|h[1-6]|button|li|td|th|strong|em|b|i|small|div|section|header|footer|nav|main|ul|ol|form|input|textarea)\b([^>]*)>(?:([^<]*)<\/\1>)?/gi
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(body))) {
    const tag = (m[1] ?? 'div').toLowerCase()
    const openAttrs = m[2] ?? ''
    const inner = (m[3] ?? '').replace(/\s+/g, ' ').trim()
    const attrs = attrsOf(`<x ${openAttrs}>`)
    const idCss = attrs.id ? ids.get(attrs.id) ?? '' : ''
    const css = [idCss, classCss(attrs.class, classes), attrs.style ?? '']
      .filter(Boolean)
      .join(';')
    const parsed = parseCssDeclarations(css)
    const text =
      tag === 'img'
        ? attrs.alt || attrs.title
        : inner
          ? decodeBasicEntities(inner)
          : attrs['aria-label'] || attrs.placeholder || attrs.title || undefined

    // Skip empty unstyled shells.
    const hasStyle = Object.keys(parsed.style).length > 0 || parsed.width || parsed.height
    if (!text && !hasStyle && tag === 'div') continue

    pushSpan(m.index, m.index + m[0].length)
    children.push({
      id: attrs.id || `web-${seq++}`,
      name: attrs['aria-label'] || attrs.alt || text || tag,
      kind: kindFor(tag),
      text: text || undefined,
      box: {
        x: parsed.x,
        y: parsed.y,
        width: parsed.width,
        height: parsed.height,
      },
      style: parsed.style,
      children: [],
    })
  }

  // Custom / unknown component tags → placeholder views for later inlining.
  const customRe = /<([A-Za-z][\w.-]*)\b([^>]*?)(?:\/>|>([^<]*)<\/\1\s*>)/g
  while ((m = customRe.exec(body))) {
    const rawTag = m[1] ?? ''
    if (!rawTag || isBuiltinTag(rawTag)) continue
    if (already(m.index, m.index + m[0].length)) continue

    const openAttrs = m[2] ?? ''
    const inner = (m[3] ?? '').replace(/\s+/g, ' ').trim()
    const attrs = attrsOf(`<x ${openAttrs}>`)
    const idCss = attrs.id ? ids.get(attrs.id) ?? '' : ''
    const css = [idCss, classCss(attrs.class, classes), attrs.style ?? '']
      .filter(Boolean)
      .join(';')
    const parsed = parseCssDeclarations(css)
    const slotText = inner
      ? decodeBasicEntities(inner)
      : attrs['aria-label'] || attrs.title || undefined

    pushSpan(m.index, m.index + m[0].length)
    children.push({
      id: `cmp:${rawTag}:${seq++}`,
      name: rawTag,
      kind: 'view',
      text: slotText || undefined,
      box: {
        x: parsed.x,
        y: parsed.y,
        width: parsed.width,
        height: parsed.height,
      },
      style: parsed.style,
      children: [],
    })
  }

  applyFlexGapLayout(children, cssText)
  applyDocumentOrderStack(children)

  return {
    root: {
      id: 'web-root',
      name: rootName,
      kind: 'frame',
      box: {},
      style: {},
      children,
    },
    scale: 1,
    source: 'web',
  }
}

/** Count common interactive / layout tags for fingerprint controlCount. */
export function countMarkupControls(html: string): number {
  const body = extractMarkupBody(html)
  return (
    body.match(
      /<(button|input|img|a|select|textarea|ul|ol|li|nav|header|footer|form|h[1-6]|p|view|text)\b/gi,
    ) ?? []
  ).length
}
