/**
 * Svelte SFC adapter — template + style → DesignDoc (same path as Vue).
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

function splitSvelte(src: string): { markup: string; style: string; script: string } {
  const style = [...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1] ?? '')
    .join('\n')
  const script = [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1] ?? '')
    .join('\n')
  // Markup is everything outside script/style blocks.
  const markup = src
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  return { markup, style, script }
}

function fingerprint(src: string, fileBase: string): PageFingerprint {
  const { markup, style, script } = splitSvelte(src)
  const texts = new Set<string>([
    ...collectMarkupTexts(markup),
    ...extractStringLiterals(script),
  ])
  return {
    texts: [...texts],
    nameTokens: tokenizeName(fileBase.replace(/\.svelte$/i, '')),
    controlCount: countMarkupControls(markup) + (style ? 1 : 0),
  }
}

export const webSvelteAdapter: PlatformAdapter = {
  id: 'web-svelte',
  platform: 'web',
  kindLabel: 'Web Svelte',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!file.name.endsWith('.svelte')) return
      let src = ''
      try {
        src = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      // Need some DOM-ish markup.
      if (!/<(div|section|main|button|h[1-6]|p|span|a)\b/i.test(src)) return
      pages.push({
        adapterId: 'web-svelte',
        platform: 'web',
        kindLabel: 'Web Svelte',
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
    const { markup, style } = splitSvelte(src)
    return markupToDesignDoc(markup, style, path.basename(page.relativePath, '.svelte'))
  },
}
