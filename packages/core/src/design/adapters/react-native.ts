/**
 * React Native adapter — JS/TS screens with shallow L1 DesignDoc.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { walkFiles } from '../fs-walk.js'
import { tokenizeName } from '../page-fingerprint.js'
import { countMatches, extractUiTexts } from './source-text.js'
import { reactNativeSourceToDesignDoc } from './declarative-design-doc.js'
import type {
  CodePage,
  PageFingerprint,
  PlatformAdapter,
} from './adapter-types.js'
import type { DesignDoc } from '../types.js'

const RN_IMPORT = /from\s+['"]react-native['"]|require\(\s*['"]react-native['"]\s*\)/
const RN_CONTROLS =
  /\b(View|Text|Image|ScrollView|FlatList|SectionList|TouchableOpacity|Pressable|TextInput|Button|SafeAreaView|KeyboardAvoidingView)\b/g

function fingerprint(src: string, fileBase: string): PageFingerprint {
  const base = fileBase.replace(/\.(tsx|ts|jsx|js)$/i, '')
  const names = new Set<string>(tokenizeName(base))
  const fnRe =
    /(?:function|const|class)\s+([A-Za-z0-9_]+)|export\s+default\s+function\s+([A-Za-z0-9_]+)/g
  let m: RegExpExecArray | null
  while ((m = fnRe.exec(src))) {
    const n = m[1] ?? m[2]
    if (n) names.add(n.toLowerCase())
  }
  return {
    texts: [...extractUiTexts(src)],
    nameTokens: [...names].filter(Boolean),
    controlCount: countMatches(src, RN_CONTROLS),
  }
}

export const reactNativeAdapter: PlatformAdapter = {
  id: 'react-native',
  platform: 'react-native',
  kindLabel: 'React Native',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!/\.(tsx|ts|jsx|js)$/i.test(file.name)) return
      if (file.name.endsWith('.d.ts')) return
      let src = ''
      try {
        src = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      if (!RN_IMPORT.test(src)) return
      if (countMatches(src, RN_CONTROLS) < 1) return
      pages.push({
        adapterId: 'react-native',
        platform: 'react-native',
        kindLabel: 'React Native',
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
    return reactNativeSourceToDesignDoc(
      src,
      path.basename(page.relativePath).replace(/\.(tsx|ts|jsx|js)$/i, ''),
    )
  },
}
