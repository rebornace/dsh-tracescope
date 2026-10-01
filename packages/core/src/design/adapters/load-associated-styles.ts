/**
 * Load co-located and imported stylesheets for a UI source file so L1 compare
 * can apply class/id rules that live outside the entry markup.
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { preprocessStylesheet } from './web-css.js'

const STYLE_EXTS = [
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.module.css',
  '.module.scss',
  '.module.sass',
  '.module.less',
  '.wxss',
  '.acss',
  '.ttss',
]

const GLOBAL_THEME_NAMES = [
  'variables.css',
  'variables.scss',
  'variables.less',
  'theme.css',
  'theme.scss',
  'tokens.css',
  'tokens.scss',
  'global.css',
  'global.scss',
  'app.css',
  'app.scss',
  'index.css',
  'index.scss',
  'common.wxss',
  'app.wxss',
]

async function readMaybe(abs: string): Promise<string> {
  try {
    return await readFile(abs, 'utf8')
  } catch {
    return ''
  }
}

function uniqPush(arr: string[], value: string): void {
  const v = value.trim()
  if (v && !arr.includes(v)) arr.push(v)
}

/** Same-basename style companions next to the entry file. */
async function readSiblingStyles(entryAbsolutePath: string): Promise<string[]> {
  const dir = path.dirname(entryAbsolutePath)
  const base = path.basename(entryAbsolutePath).replace(/\.[^.]+$/i, '')
  const chunks: string[] = []
  for (const ext of STYLE_EXTS) {
    const text = await readMaybe(path.join(dir, base + ext))
    if (text) chunks.push(text)
  }
  return chunks
}

/**
 * Nearby global theme / token stylesheets (`theme.css`, `variables.css`, …)
 * walking up a few directories and common `styles` / `assets` folders.
 */
async function readGlobalThemeStyles(entryAbsolutePath: string): Promise<string[]> {
  const chunks: string[] = []
  let dir = path.dirname(entryAbsolutePath)
  for (let depth = 0; depth < 4; depth += 1) {
    for (const name of GLOBAL_THEME_NAMES) {
      const text = await readMaybe(path.join(dir, name))
      if (text) chunks.push(text)
    }
    for (const sub of ['styles', 'style', 'assets', 'css', 'theme', 'themes']) {
      const subDir = path.join(dir, sub)
      for (const name of GLOBAL_THEME_NAMES) {
        const text = await readMaybe(path.join(subDir, name))
        if (text) chunks.push(text)
      }
      try {
        const entries = await readdir(subDir)
        for (const entry of entries) {
          if (!/\.(css|scss|less|wxss)$/i.test(entry)) continue
          if (!/(var|token|theme|global|palette)/i.test(entry)) continue
          if (GLOBAL_THEME_NAMES.includes(entry)) continue
          const text = await readMaybe(path.join(subDir, entry))
          if (text) chunks.push(text)
        }
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return chunks
}

/**
 * Collect local stylesheet paths referenced from source / existing CSS.
 */
export function collectStyleSpecifiers(sourceText: string): string[] {
  const out: string[] = []
  const push = (raw: string | undefined) => {
    if (!raw) return
    const cleaned = raw.trim().replace(/^url\(\s*['"]?|['"]?\s*\)$/gi, '').trim()
    if (!cleaned) return
    if (/^https?:/i.test(cleaned) || cleaned.startsWith('//')) return
    if (!/\.(css|scss|sass|less|wxss|acss|ttss)(?:\?.*)?$/i.test(cleaned)) return
    uniqPush(out, cleaned.split('?')[0]!)
  }

  for (const m of sourceText.matchAll(
    /\bimport\s+(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]/g,
  )) {
    push(m[1])
  }
  for (const m of sourceText.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    push(m[1])
  }
  for (const m of sourceText.matchAll(/@import\s+(?:url\(\s*)?['"]?([^'");\s]+)['"]?\s*\)?/gi)) {
    push(m[1])
  }
  return out
}

async function readResolvedStyles(
  fromFile: string,
  specs: string[],
  seen: Set<string>,
  depth: number,
): Promise<string[]> {
  if (depth > 3) return []
  const dir = path.dirname(fromFile)
  const chunks: string[] = []
  for (const spec of specs) {
    const abs = path.resolve(dir, spec)
    if (seen.has(abs)) continue
    seen.add(abs)
    const text = await readMaybe(abs)
    if (!text) continue
    chunks.push(text)
    const nested = collectStyleSpecifiers(text)
    if (nested.length) {
      chunks.push(...(await readResolvedStyles(abs, nested, seen, depth + 1)))
    }
  }
  return chunks
}

export interface LoadAssociatedStylesOptions {
  entryAbsolutePath: string
  sourceText?: string
  inlineCss?: string
}

/**
 * Merge inline + sibling + imported + global theme stylesheets into one CSS blob.
 */
export async function loadAssociatedStyles(
  options: LoadAssociatedStylesOptions,
): Promise<string> {
  const chunks: string[] = []
  // Global theme first so page rules can override, while CSS vars remain visible.
  chunks.push(...(await readGlobalThemeStyles(options.entryAbsolutePath)))
  if (options.inlineCss?.trim()) chunks.push(options.inlineCss)

  chunks.push(...(await readSiblingStyles(options.entryAbsolutePath)))

  const specs = collectStyleSpecifiers(options.sourceText ?? '')
  if (specs.length) {
    const seen = new Set<string>()
    const base = path.basename(options.entryAbsolutePath).replace(/\.[^.]+$/i, '')
    const dir = path.dirname(options.entryAbsolutePath)
    for (const ext of STYLE_EXTS) seen.add(path.join(dir, base + ext))
    chunks.push(
      ...(await readResolvedStyles(options.entryAbsolutePath, specs, seen, 0)),
    )
  }

  const fromCss = collectStyleSpecifiers(chunks.join('\n'))
  if (fromCss.length) {
    chunks.push(
      ...(await readResolvedStyles(options.entryAbsolutePath, fromCss, new Set(), 0)),
    )
  }

  return preprocessStylesheet(chunks.filter((c) => c.trim()).join('\n\n'))
}
