/**
 * Lightweight HTML/Vue-template → DesignDoc conversion for static compare.
 * Produces a flat-ish tree of elements that carry text and/or resolvable styles.
 */
import type { DesignDoc, DesignNode, DesignNodeKind } from '../types.js'
import {
  decodeBasicEntities,
  parseCssDeclarations,
  parseSimpleStyleRules,
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

function kindFor(tag: string): DesignNodeKind {
  if (tag === 'img') return 'image'
  if (TEXT_TAGS.has(tag)) return 'text'
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

/**
 * Build a DesignDoc from HTML-like markup + optional CSS.
 * Each styled / textual element becomes a child of the root frame.
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
