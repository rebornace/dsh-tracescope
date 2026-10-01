/**
 * Flutter adapter — Dart Widget screens with shallow L1 DesignDoc.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { walkFiles } from '../fs-walk.js'
import { tokenizeName } from '../page-fingerprint.js'
import { countMatches, extractStringLiterals } from './source-text.js'
import { flutterSourceToDesignDoc } from './declarative-design-doc.js'
import { loadNativeStyleContext } from './native-style-context.js'
import type {
  CodePage,
  PageFingerprint,
  PlatformAdapter,
} from './adapter-types.js'
import type { DesignDoc } from '../types.js'

const WIDGET_HINT =
  /\b(extends|with)\s+[\w\s,]*\b(StatelessWidget|StatefulWidget|ConsumerWidget|HookWidget|CupertinoPageScaffold)\b|\bWidget\s+build\s*\(/
const FLUTTER_CONTROLS =
  /\b(Text|ElevatedButton|TextButton|IconButton|Image|Icon|Container|Column|Row|ListView|GridView|Scaffold|AppBar|Card|Padding|SizedBox|Center)\s*[\.(]/g

function fingerprint(src: string, fileBase: string): PageFingerprint {
  const names = new Set<string>(tokenizeName(fileBase.replace(/\.dart$/i, '')))
  const classRe = /class\s+([A-Za-z0-9_]+)/g
  let m: RegExpExecArray | null
  while ((m = classRe.exec(src))) names.add((m[1] ?? '').toLowerCase())
  return {
    texts: [...extractStringLiterals(src)],
    nameTokens: [...names].filter(Boolean),
    controlCount: countMatches(src, FLUTTER_CONTROLS),
  }
}

export const flutterAdapter: PlatformAdapter = {
  id: 'flutter',
  platform: 'flutter',
  kindLabel: 'Flutter',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!file.name.endsWith('.dart')) return
      if (file.relativePath.includes('/.dart_tool/')) return
      let src = ''
      try {
        src = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      if (!WIDGET_HINT.test(src)) return
      pages.push({
        adapterId: 'flutter',
        platform: 'flutter',
        kindLabel: 'Flutter',
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
    const ctx = await loadNativeStyleContext(page.absolutePath, src, 'flutter')
    return flutterSourceToDesignDoc(ctx.source, path.basename(page.relativePath, '.dart'))
  },
}
