/**
 * Factory for markup+stylesheet miniprogram adapters (wxml/axml/ttml/swan).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { walkFiles } from '../fs-walk.js'
import type { AdapterId, CodePage, PlatformAdapter } from './adapter-types.js'
import type { DesignDoc } from '../types.js'
import {
  MP_UI_HINT,
  miniprogramFingerprint,
  miniprogramToDesignDoc,
} from './miniprogram-shared.js'
import { loadAssociatedStyles } from './load-associated-styles.js'

export interface MiniprogramKind {
  id: AdapterId
  kindLabel: string
  /** Page markup extension without dot, e.g. wxml */
  markupExt: string
  /** Co-located style extension without dot, e.g. wxss (empty = try .css) */
  styleExt: string
}

async function readSiblingStyle(markupPath: string, styleExt: string): Promise<string> {
  const candidates = [
    markupPath.replace(/\.[^.]+$/i, `.${styleExt}`),
    markupPath.replace(/\.[^.]+$/i, '.css'),
  ]
  for (const p of candidates) {
    try {
      return await readFile(p, 'utf8')
    } catch {
      /* try next */
    }
  }
  return ''
}

export function createMiniprogramAdapter(kind: MiniprogramKind): PlatformAdapter {
  const markupDot = `.${kind.markupExt}`
  return {
    id: kind.id,
    platform: 'miniprogram',
    kindLabel: kind.kindLabel,
    precise: true,

    async discoverPages(root: string): Promise<CodePage[]> {
      const pages: CodePage[] = []
      await walkFiles(root, async (file) => {
        if (!file.name.toLowerCase().endsWith(markupDot)) return
        let markup = ''
        try {
          markup = await readFile(file.absolutePath, 'utf8')
        } catch {
          return
        }
        if (!MP_UI_HINT.test(markup)) return
        const css = await readSiblingStyle(file.absolutePath, kind.styleExt)
        pages.push({
          adapterId: kind.id,
          platform: 'miniprogram',
          kindLabel: kind.kindLabel,
          relativePath: file.relativePath,
          absolutePath: file.absolutePath,
          precise: true,
          fingerprint: miniprogramFingerprint(markup, css, file.name, kind.markupExt),
        })
      })
      return pages
    },

    async toDesignDoc(page: CodePage): Promise<DesignDoc> {
      const markup = await readFile(page.absolutePath, 'utf8')
      const sibling = await readSiblingStyle(page.absolutePath, kind.styleExt)
      const css = await loadAssociatedStyles({
        entryAbsolutePath: page.absolutePath,
        sourceText: markup,
        inlineCss: sibling,
      })
      return miniprogramToDesignDoc(
        markup,
        css,
        path.basename(page.relativePath).replace(/\.[^.]+$/i, ''),
      )
    },
  }
}
