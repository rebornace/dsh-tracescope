/**
 * Jetpack Compose locator adapter.
 *
 * Compose builds UI in Kotlin code, so there is no static layout tree to diff.
 * This adapter only *locates* candidate screens (files declaring `@Composable`
 * content) and extracts a lightweight fingerprint — string literals and names —
 * used to match a design screen. Property-level comparison is not supported.
 */
import { readFile } from 'node:fs/promises'
import { walkFiles } from '../fs-walk.js'
import { normalizeText, tokenizeName } from '../page-fingerprint.js'
import type {
  CodePage,
  PageFingerprint,
  PlatformAdapter,
} from './adapter-types.js'

/** Extract string literal contents from Kotlin source (best effort). */
function stringLiterals(src: string): Set<string> {
  const out = new Set<string>()
  const re = /(?:"""([\s\S]*?)""")|(?:"([^"\n\\]*(?:\\.[^"\n\\]*)*)")/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const raw = m[1] ?? m[2] ?? ''
    // Ignore empty strings, resource references and format placeholders only.
    if (!raw.trim()) continue
    if (raw.startsWith('@') || raw.startsWith('$') && !/\s/.test(raw)) continue
    const t = normalizeText(raw)
    if (t) out.add(t)
  }
  return out
}

function fingerprint(src: string, fileBase: string): PageFingerprint {
  // Composable function names add useful name tokens.
  const names = new Set<string>(tokenizeName(fileBase.replace(/\.kt$/i, '')))
  const fnRe = /fun\s+([A-Za-z0-9_]+)\s*\(/g
  let fm: RegExpExecArray | null
  while ((fm = fnRe.exec(src))) names.add((fm[1] ?? '').toLowerCase())

  // Rough control count: number of composable call sites / @Composable tags.
  const composableTags = (src.match(/@Composable\b/g) ?? []).length
  const callSites = (src.match(/\b(Text|Button|Image|Icon|Spacer|Box|Column|Row|Scaffold|LazyColumn|LazyRow|Card|TopAppBar)\s*\(/g) ?? []).length

  return {
    texts: [...stringLiterals(src)],
    nameTokens: [...names].filter(Boolean),
    controlCount: Math.max(composableTags, callSites),
  }
}

export const androidComposeAdapter: PlatformAdapter = {
  id: 'android-compose',
  platform: 'android',
  kindLabel: 'Jetpack Compose',
  precise: false,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!file.name.endsWith('.kt')) return
      let src = ''
      try {
        src = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      if (!/@Composable\b/.test(src)) return
      pages.push({
        adapterId: 'android-compose',
        platform: 'android',
        kindLabel: 'Jetpack Compose',
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
        precise: false,
        fingerprint: fingerprint(src, file.name),
      })
    })
    return pages
  },
  // No toDesignDoc: locator only.
}
