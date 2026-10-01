/**
 * Taro adapter — pages importing @tarojs/* (React or Vue runtime).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { walkFiles } from '../fs-walk.js'
import { tokenizeName } from '../page-fingerprint.js'
import { countMatches, extractUiTexts } from './source-text.js'
import { jsxToHtmlish } from './web-react.js'
import { markupToDesignDoc } from './web-markup.js'
import { loadAssociatedStyles } from './load-associated-styles.js'
import type { CodePage, PageFingerprint, PlatformAdapter } from './adapter-types.js'
import type { DesignDoc } from '../types.js'

const TARO_IMPORT = /from\s+['"]@tarojs\//
const PAGE_PATH = /(^|\/)(pages?|views?|screens?)\//i
const DOM_OR_TARO =
  /\b(View|Text|Image|Button|ScrollView|Input|div|span|button|img|h[1-6]|p)\b/g

function fingerprint(src: string, fileBase: string): PageFingerprint {
  const base = fileBase.replace(/\.(tsx|ts|jsx|js|vue)$/i, '')
  return {
    texts: [...extractUiTexts(src)],
    nameTokens: tokenizeName(base),
    controlCount: countMatches(src, DOM_OR_TARO),
  }
}

function splitVue(src: string): { template: string; style: string } {
  const template = src.match(/<template\b[^>]*>([\s\S]*?)<\/template>/i)?.[1] ?? ''
  const style = [...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1] ?? '')
    .join('\n')
  return { template, style }
}

export const taroAdapter: PlatformAdapter = {
  id: 'taro',
  platform: 'web',
  kindLabel: 'Taro',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!/\.(tsx|jsx|vue)$/i.test(file.name)) return
      let src = ''
      try {
        src = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      if (!TARO_IMPORT.test(src) && !PAGE_PATH.test(file.relativePath.replace(/\\/g, '/'))) {
        return
      }
      // Require taro import for non-pages paths; pages/ can be taro without import in config-only files — still need UI.
      if (!TARO_IMPORT.test(src) && !/<View\b|<Text\b|<view\b|<text\b/i.test(src)) return
      if (TARO_IMPORT.test(src) || /<View\b|<Text\b/i.test(src)) {
        pages.push({
          adapterId: 'taro',
          platform: 'web',
          kindLabel: 'Taro',
          relativePath: file.relativePath,
          absolutePath: file.absolutePath,
          precise: true,
          fingerprint: fingerprint(src, file.name),
        })
      }
    })
    return pages
  },

  async toDesignDoc(page: CodePage): Promise<DesignDoc> {
    const src = await readFile(page.absolutePath, 'utf8')
    const name = path.basename(page.relativePath).replace(/\.(tsx|jsx|vue)$/i, '')
    if (page.relativePath.endsWith('.vue')) {
      const { template, style } = splitVue(src)
      const htmlish = template
        .replace(/<\/?View\b/g, (m) => m.replace(/View/, 'div'))
        .replace(/<\/?Text\b/g, (m) => m.replace(/Text/, 'span'))
        .replace(/<\/?view\b/gi, (m) => m.replace(/view/i, 'div'))
        .replace(/<\/?text\b/gi, (m) => m.replace(/text/i, 'span'))
      const css = await loadAssociatedStyles({
        entryAbsolutePath: page.absolutePath,
        sourceText: src,
        inlineCss: style,
      })
      return markupToDesignDoc(htmlish, css, name)
    }
    // React Taro: map <View>/<Text> then reuse JSX→HTML pipeline.
    const mapped = src
      .replace(/<\/?View\b/g, (m) => m.replace(/View/, 'div'))
      .replace(/<\/?Text\b/g, (m) => m.replace(/Text/, 'span'))
      .replace(/<\/?Image\b/g, (m) => m.replace(/Image/, 'img'))
      .replace(/<\/?Button\b/g, (m) => m.replace(/Button/, 'button'))
    const css = await loadAssociatedStyles({
      entryAbsolutePath: page.absolutePath,
      sourceText: src,
    })
    return markupToDesignDoc(jsxToHtmlish(mapped), css, name)
  },
}
