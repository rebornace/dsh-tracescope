/**
 * Web HTML adapter — discovers .html pages and builds DesignDoc from markup + CSS.
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

function fingerprint(html: string, css: string, fileBase: string): PageFingerprint {
  const combined = html + '\n' + css
  return {
    texts: collectMarkupTexts(combined),
    nameTokens: tokenizeName(fileBase.replace(/\.html?$/i, '')),
    controlCount: countMarkupControls(html),
  }
}

async function readLinkedCss(html: string, pageDir: string, htmlPath: string): Promise<string> {
  const chunks: string[] = []
  // Inline <style>
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    chunks.push(m[1] ?? '')
  }
  // Relative linked stylesheets (best effort, local only).
  for (const m of html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)) {
    const href = m[0].match(/href=["']([^"']+)["']/i)?.[1]
    if (!href || /^https?:/i.test(href) || href.startsWith('//')) continue
    const abs = path.resolve(pageDir, href)
    try {
      chunks.push(await readFile(abs, 'utf8'))
    } catch {
      /* missing css is fine */
    }
  }
  void htmlPath
  return chunks.join('\n')
}

export const webHtmlAdapter: PlatformAdapter = {
  id: 'web-html',
  platform: 'web',
  kindLabel: 'Web HTML',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!/\.html?$/i.test(file.name)) return
      let html = ''
      try {
        html = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      if (!/<body\b|<div\b|<main\b|<section\b/i.test(html)) return
      const css = await readLinkedCss(html, path.dirname(file.absolutePath), file.absolutePath)
      pages.push({
        adapterId: 'web-html',
        platform: 'web',
        kindLabel: 'Web HTML',
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
        precise: true,
        fingerprint: fingerprint(html, css, file.name),
      })
    })
    return pages
  },

  async toDesignDoc(page: CodePage): Promise<DesignDoc> {
    const html = await readFile(page.absolutePath, 'utf8')
    const css = await readLinkedCss(html, path.dirname(page.absolutePath), page.absolutePath)
    return markupToDesignDoc(html, css, path.basename(page.relativePath))
  },
}
