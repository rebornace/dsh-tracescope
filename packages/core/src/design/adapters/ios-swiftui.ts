/**
 * SwiftUI locator adapter.
 *
 * SwiftUI builds views in Swift code, so there is no static layout tree to
 * diff. This adapter only *locates* candidate screens (files declaring a
 * `View` conformance) and extracts a lightweight fingerprint — string literals
 * and names — used to match a design screen. Property-level comparison is not
 * supported.
 */
import { readFile } from 'node:fs/promises'
import { walkFiles } from '../fs-walk.js'
import { normalizeText, tokenizeName } from '../page-fingerprint.js'
import type {
  CodePage,
  PageFingerprint,
  PlatformAdapter,
} from './adapter-types.js'

/** Extract string literal contents from Swift source (best effort). */
function stringLiterals(src: string): Set<string> {
  const out = new Set<string>()
  const re = /(?:"""([\s\S]*?)""")|(?:"([^"\n\\]*(?:\\.[^"\n\\]*)*)")/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const raw = m[1] ?? m[2] ?? ''
    if (!raw.trim()) continue
    if (raw.startsWith('$') && !/\s/.test(raw)) continue
    const t = normalizeText(raw)
    if (t) out.add(t)
  }
  return out
}

function fingerprint(src: string, fileBase: string): PageFingerprint {
  const names = new Set<string>(tokenizeName(fileBase.replace(/\.swift$/i, '')))
  // struct names that conform to View are screen candidates.
  const structRe = /struct\s+([A-Za-z0-9_]+)\s*:[^\{]*\bView\b/g
  let sm: RegExpExecArray | null
  while ((sm = structRe.exec(src))) names.add((sm[1] ?? '').toLowerCase())

  const callSites = (src.match(/\b(Text|Button|Image|Label|Spacer|VStack|HStack|ZStack|List|ScrollView|NavigationStack|Form|Rectangle|Circle)\s*[(\s]/g) ?? []).length

  return {
    texts: [...stringLiterals(src)],
    nameTokens: [...names].filter(Boolean),
    controlCount: callSites,
  }
}

export const iosSwiftuiAdapter: PlatformAdapter = {
  id: 'ios-swiftui',
  platform: 'ios',
  kindLabel: 'SwiftUI',
  precise: false,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!file.name.endsWith('.swift')) return
      let src = ''
      try {
        src = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      // Must declare at least one View-conforming struct.
      if (!/struct\s+[A-Za-z0-9_]+\s*:[^\{]*\bView\b/.test(src)) return
      pages.push({
        adapterId: 'ios-swiftui',
        platform: 'ios',
        kindLabel: 'SwiftUI',
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
