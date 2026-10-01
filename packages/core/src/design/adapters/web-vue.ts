/**
 * Vue SFC adapter — discovers .vue pages; precise compare from template + style.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { walkFiles } from '../fs-walk.js'
import { tokenizeName } from '../page-fingerprint.js'
import type { CodePage, PageFingerprint, PlatformAdapter } from './adapter-types.js'
import type { DesignDoc } from '../types.js'
import {
  collectMarkupTexts,
  countMarkupControls,
  markupToDesignDoc,
} from './web-markup.js'
import { extractStringLiterals } from './source-text.js'
import { loadAssociatedStyles } from './load-associated-styles.js'

function splitSfc(src: string): { template: string; style: string; script: string } {
  const template = src.match(/<template\b[^>]*>([\s\S]*?)<\/template>/i)?.[1] ?? ''
  const styles = [...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1] ?? '')
  const script = src.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? ''
  return { template, style: styles.join('\n'), script }
}

function fingerprint(src: string, fileBase: string): PageFingerprint {
  const { template, style, script } = splitSfc(src)
  const texts = new Set<string>([
    ...collectMarkupTexts(template),
    ...extractStringLiterals(script),
  ])
  return {
    texts: [...texts],
    nameTokens: tokenizeName(fileBase.replace(/\.vue$/i, '')),
    controlCount: countMarkupControls(template) + (style ? 1 : 0),
  }
}

export const webVueAdapter: PlatformAdapter = {
  id: 'web-vue',
  platform: 'web',
  kindLabel: 'Web Vue',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!file.name.endsWith('.vue')) return
      let src = ''
      try {
        src = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      if (!/<template\b/i.test(src)) return
      // Leave uni-app / nvue pages to the dedicated uni-app adapter.
      if (
        /\buni\./.test(src) ||
        /from\s+['"]@dcloudio\//.test(src) ||
        /\.nvue$/i.test(file.name)
      ) {
        return
      }
      pages.push({
        adapterId: 'web-vue',
        platform: 'web',
        kindLabel: 'Web Vue',
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
    const { template, style } = splitSfc(src)
    const css = await loadAssociatedStyles({
      entryAbsolutePath: page.absolutePath,
      sourceText: src,
      inlineCss: style,
    })
    return markupToDesignDoc(template, css, path.basename(page.relativePath, '.vue'))
  },
}
