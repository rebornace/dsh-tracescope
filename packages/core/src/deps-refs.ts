import type { AnalyzerLanguage } from './heuristics.js'

/** Raw references found in a source file: specifiers and bare identifiers. */
export interface RawRefs {
  /** Module/path-like specifiers (import 'x', require('x'), @import 'x', ...) */
  specifiers: string[]
  /** Bare type/symbol mentions (FooViewController, .class-name, #id) */
  symbols: string[]
}

function uniqPush(arr: string[], value: string | undefined | null) {
  const v = String(value || '').trim()
  if (v && !arr.includes(v)) arr.push(v)
}

function matchAll(content: string, re: RegExp): RegExpExecArray[] {
  const out: RegExpExecArray[] = []
  let m: RegExpExecArray | null
  re.lastIndex = 0
  while ((m = re.exec(content))) out.push(m)
  return out
}

function jsLikeSpecifiers(content: string, out: string[]) {
  // import ... from 'x' / export ... from 'x'
  for (const m of matchAll(content, /(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)) uniqPush(out, m[1])
  // side-effect import 'x'
  for (const m of matchAll(content, /\bimport\s*['"]([^'"]+)['"]/g)) uniqPush(out, m[1])
  // require('x')
  for (const m of matchAll(content, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) uniqPush(out, m[1])
  // dynamic import('x')
  for (const m of matchAll(content, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) uniqPush(out, m[1])
}

function vueParts(content: string): { template: string; script: string; style: string } {
  const block = (name: string) => {
    const m = content.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
    return m ? m[1]! : ''
  }
  return { template: block('template'), script: block('script'), style: block('style') }
}

/** Collect raw references for a given language from file content. */
export function collectRawReferences(content: string, lang: AnalyzerLanguage): RawRefs {
  const specifiers: string[] = []
  const symbols: string[] = []

  if (lang === 'kotlin') {
    for (const m of matchAll(content, /^\s*import\s+([a-zA-Z0-9_.]+)/gm)) uniqPush(symbols, m[1]?.split('.').pop())
    for (const m of matchAll(content, /\b([A-Z][A-Za-z0-9]+(?:Activity|Fragment|ViewModel|Screen))\b/g)) uniqPush(symbols, m[1])
  } else if (lang === 'java') {
    for (const m of matchAll(content, /^\s*import\s+(?:static\s+)?([a-zA-Z0-9_.*]+)\s*;/gm)) uniqPush(symbols, m[1]?.split('.').pop())
    for (const m of matchAll(content, /\b([A-Z][A-Za-z0-9]+(?:Activity|Fragment|ViewModel|Presenter|Repository|Repo|Adapter))\b/g)) uniqPush(symbols, m[1])
  } else if (lang === 'objc') {
    for (const m of matchAll(content, /#import\s+"([^"]+)"/g)) uniqPush(specifiers, m[1]!.replace(/\.(h|m|mm)$/i, ''))
    for (const m of matchAll(content, /@interface\s+([A-Za-z0-9_]+)/g)) uniqPush(symbols, m[1])
  } else if (lang === 'swift') {
    for (const m of matchAll(content, /\b(class|struct|enum|protocol)\s+([A-Za-z0-9_]+)/g)) uniqPush(symbols, m[2])
    // Same-module type mentions with common iOS/Android-ish suffixes
    for (const m of matchAll(content, /\b([A-Z][A-Za-z0-9]+(?:ViewController|View|ViewModel|Presenter|Coordinator|Service|Repository|Repo))\b/g)) uniqPush(symbols, m[1])
    // Any declared CamelCase type (covers ObjC interop types without suffix)
    for (const m of matchAll(content, /\b([A-Z][A-Za-z0-9]{2,})\b/g)) uniqPush(symbols, m[1])
  } else if (lang === 'dart') {
    for (const m of matchAll(content, /\b(?:import|part)\s+['"]([^'"]+)['"]/g)) uniqPush(specifiers, m[1])
  } else if (lang === 'javascript') {
    jsLikeSpecifiers(content, specifiers)
  } else if (lang === 'vue') {
    const parts = vueParts(content)
    jsLikeSpecifiers(parts.script, specifiers)
    // Template components: <PayButton> or <pay-button>
    for (const m of matchAll(parts.template, /<\s*([A-Za-z][A-Za-z0-9-]*)\b/g)) {
      const tag = m[1]!
      if (/^(template|slot|transition|component)$/i.test(tag)) continue
      uniqPush(symbols, tag)
    }
  } else if (lang === 'css') {
    for (const m of matchAll(content, /@(?:import|use|forward)\s+['"]?([^'")\s;]+)['"]?/g)) uniqPush(specifiers, m[1])
    for (const m of matchAll(content, /url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) uniqPush(specifiers, m[1])
  } else if (lang === 'html') {
    for (const m of matchAll(content, /(?:href|src)\s*=\s*['"]([^'"]+)['"]/g)) uniqPush(specifiers, m[1])
  }
  return { specifiers, symbols }
}

/** Classes and IDs defined by a stylesheet or used inside a template. */
export function extractStyleHooks(content: string, lang: AnalyzerLanguage): Set<string> {
  const hooks = new Set<string>()
  if (lang === 'css') {
    for (const m of matchAll(content, /\.(-?[A-Za-z0-9_-]+)/g)) hooks.add('.' + m[1])
    for (const m of matchAll(content, /#([A-Za-z0-9_-]+)/g)) hooks.add('#' + m[1])
  } else if (lang === 'vue' || lang === 'html') {
    const template =
      lang === 'vue' ? vueParts(content).template : content
    for (const m of matchAll(template, /\bclass\s*=\s*['"]([^'"]+)['"]/g)) {
      m[1]!.split(/\s+/).forEach((c) => c && hooks.add('.' + c))
    }
    for (const m of matchAll(template, /\bid\s*=\s*['"]([^'"]+)['"]/g)) hooks.add('#' + m[1])
  }
  return hooks
}

/** Declared type/symbol names per file (Java/Swift/ObjC classes etc.). */
export function extractDeclaredSymbols(content: string, lang: AnalyzerLanguage): string[] {
  const out: string[] = []
  if (lang === 'java') {
    for (const m of matchAll(content, /\b(?:class|interface|enum|record)\s+([A-Za-z0-9_]+)/g)) uniqPush(out, m[1])
  } else if (lang === 'kotlin') {
    for (const m of matchAll(content, /\b(?:class|interface|object|enum\s+class)\s+([A-Za-z0-9_]+)/g)) uniqPush(out, m[1])
  } else if (lang === 'swift') {
    for (const m of matchAll(content, /\b(?:class|struct|enum|protocol)\s+([A-Za-z0-9_]+)/g)) uniqPush(out, m[1])
  } else if (lang === 'objc') {
    for (const m of matchAll(content, /@interface\s+([A-Za-z0-9_]+)/g)) uniqPush(out, m[1])
  }
  return out
}
