/**
 * SwiftUI adapter — discover View structs; shallow L1 DesignDoc from Text(...)
 * and nearby static modifiers.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { walkFiles } from '../fs-walk.js'
import { tokenizeName } from '../page-fingerprint.js'
import { extractStringLiterals } from './source-text.js'
import { swiftuiSourceToDesignDoc } from './declarative-design-doc.js'
import type {
  CodePage,
  PageFingerprint,
  PlatformAdapter,
} from './adapter-types.js'
import type { DesignDoc } from '../types.js'

function fingerprint(src: string, fileBase: string): PageFingerprint {
  const names = new Set<string>(tokenizeName(fileBase.replace(/\.swift$/i, '')))
  const structRe = /struct\s+([A-Za-z0-9_]+)\s*:[^\{]*\bView\b/g
  let sm: RegExpExecArray | null
  while ((sm = structRe.exec(src))) names.add((sm[1] ?? '').toLowerCase())

  const callSites = (src.match(/\b(Text|Button|Image|Label|Spacer|VStack|HStack|ZStack|List|ScrollView|NavigationStack|Form|Rectangle|Circle)\s*[(\s]/g) ?? []).length

  return {
    texts: [...extractStringLiterals(src)],
    nameTokens: [...names].filter(Boolean),
    controlCount: callSites,
  }
}

export const iosSwiftuiAdapter: PlatformAdapter = {
  id: 'ios-swiftui',
  platform: 'ios',
  kindLabel: 'SwiftUI',
  precise: true,

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
      if (!/struct\s+[A-Za-z0-9_]+\s*:[^\{]*\bView\b/.test(src)) return
      pages.push({
        adapterId: 'ios-swiftui',
        platform: 'ios',
        kindLabel: 'SwiftUI',
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
    return swiftuiSourceToDesignDoc(src, path.basename(page.relativePath, '.swift'))
  },
}
