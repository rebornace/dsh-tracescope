/**
 * HarmonyOS ArkUI adapter — ArkTS .ets with shallow L1 DesignDoc.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { walkFiles } from '../fs-walk.js'
import { tokenizeName } from '../page-fingerprint.js'
import { countMatches, extractStringLiterals } from './source-text.js'
import { arkuiSourceToDesignDoc } from './declarative-design-doc.js'
import type {
  CodePage,
  PageFingerprint,
  PlatformAdapter,
} from './adapter-types.js'
import type { DesignDoc } from '../types.js'

const ARK_HINT = /@Entry\b|@Component\b|@ComponentV2\b/
const ARK_CONTROLS =
  /\b(Text|Button|Image|Column|Row|Stack|List|Grid|Scroll|TextInput|Blank|Divider|Tabs|Swiper)\s*[\.(]/g

function fingerprint(src: string, fileBase: string): PageFingerprint {
  const names = new Set<string>(tokenizeName(fileBase.replace(/\.ets$/i, '')))
  const structRe = /struct\s+([A-Za-z0-9_]+)/g
  let m: RegExpExecArray | null
  while ((m = structRe.exec(src))) names.add((m[1] ?? '').toLowerCase())
  return {
    texts: [...extractStringLiterals(src)],
    nameTokens: [...names].filter(Boolean),
    controlCount: countMatches(src, ARK_CONTROLS),
  }
}

export const harmonyArkuiAdapter: PlatformAdapter = {
  id: 'harmony-arkui',
  platform: 'harmony',
  kindLabel: 'HarmonyOS ArkUI',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!file.name.endsWith('.ets')) return
      let src = ''
      try {
        src = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      if (!ARK_HINT.test(src)) return
      pages.push({
        adapterId: 'harmony-arkui',
        platform: 'harmony',
        kindLabel: 'HarmonyOS ArkUI',
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
    return arkuiSourceToDesignDoc(src, path.basename(page.relativePath, '.ets'))
  },
}
