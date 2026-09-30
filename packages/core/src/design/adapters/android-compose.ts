/**
 * Jetpack Compose adapter — discover @Composable screens; shallow L1 DesignDoc
 * from Text(...) literals and nearby static modifiers.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { walkFiles } from '../fs-walk.js'
import { tokenizeName } from '../page-fingerprint.js'
import { extractStringLiterals } from './source-text.js'
import { composeSourceToDesignDoc } from './declarative-design-doc.js'
import type {
  CodePage,
  PageFingerprint,
  PlatformAdapter,
} from './adapter-types.js'
import type { DesignDoc } from '../types.js'

function fingerprint(src: string, fileBase: string): PageFingerprint {
  const names = new Set<string>(tokenizeName(fileBase.replace(/\.kt$/i, '')))
  const fnRe = /fun\s+([A-Za-z0-9_]+)\s*\(/g
  let fm: RegExpExecArray | null
  while ((fm = fnRe.exec(src))) names.add((fm[1] ?? '').toLowerCase())

  const composableTags = (src.match(/@Composable\b/g) ?? []).length
  const callSites = (src.match(/\b(Text|Button|Image|Icon|Spacer|Box|Column|Row|Scaffold|LazyColumn|LazyRow|Card|TopAppBar)\s*\(/g) ?? []).length

  return {
    texts: [...extractStringLiterals(src)],
    nameTokens: [...names].filter(Boolean),
    controlCount: Math.max(composableTags, callSites),
  }
}

export const androidComposeAdapter: PlatformAdapter = {
  id: 'android-compose',
  platform: 'android',
  kindLabel: 'Jetpack Compose',
  precise: true,

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
        precise: true,
        fingerprint: fingerprint(src, file.name),
      })
    })
    return pages
  },

  async toDesignDoc(page: CodePage): Promise<DesignDoc> {
    const src = await readFile(page.absolutePath, 'utf8')
    return composeSourceToDesignDoc(src, path.basename(page.relativePath, '.kt'))
  },
}
