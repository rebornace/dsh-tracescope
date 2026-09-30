/**
 * uni-app adapter — discovers pages from pages.json (+ .vue / .nvue sources).
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

function splitVueLike(src: string): { template: string; style: string; script: string } {
  const template =
    src.match(/<template\b[^>]*>([\s\S]*?)<\/template>/i)?.[1] ??
    // .nvue often is whole-file template-ish without script wrapper
    src.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  const style = [...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1] ?? '')
    .join('\n')
  const script = src.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? ''
  return { template, style, script }
}

function toHtmlish(template: string): string {
  return template
    .replace(/<\/?view\b/gi, (m) => m.replace(/view/i, 'div'))
    .replace(/<\/?text\b/gi, (m) => m.replace(/text/i, 'span'))
    .replace(/<\/?image\b/gi, (m) => m.replace(/image/i, 'img'))
    .replace(/<\/?navigator\b/gi, (m) => m.replace(/navigator/i, 'a'))
}

function fingerprint(src: string, fileBase: string): PageFingerprint {
  const { template, style, script } = splitVueLike(src)
  const htmlish = toHtmlish(template)
  const texts = new Set<string>([
    ...collectMarkupTexts(htmlish),
    ...extractStringLiterals(script),
  ])
  return {
    texts: [...texts],
    nameTokens: tokenizeName(fileBase.replace(/\.(vue|nvue)$/i, '')),
    controlCount: countMarkupControls(htmlish) + (style ? 1 : 0),
  }
}

async function loadPagesJson(root: string): Promise<Set<string>> {
  const hits = new Set<string>()
  await walkFiles(
    root,
    async (file) => {
      if (file.name !== 'pages.json') return
      let raw = ''
      try {
        raw = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      // Strip // and /* */ comments common in uni-app pages.json
      const cleaned = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      try {
        const json = JSON.parse(cleaned) as {
          pages?: Array<{ path?: string }>
          subPackages?: Array<{ root?: string; pages?: Array<{ path?: string }> }>
        }
        for (const p of json.pages ?? []) {
          if (p.path) hits.add(p.path.replace(/^\//, ''))
        }
        for (const sub of json.subPackages ?? []) {
          const base = (sub.root ?? '').replace(/\/$/, '')
          for (const p of sub.pages ?? []) {
            if (!p.path) continue
            hits.add(`${base}/${p.path}`.replace(/\/+/g, '/'))
          }
        }
      } catch {
        /* ignore malformed */
      }
    },
    { maxFiles: 5000 },
  )
  return hits
}

export const uniAppAdapter: PlatformAdapter = {
  id: 'uni-app',
  platform: 'web',
  kindLabel: 'uni-app',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pagePaths = await loadPagesJson(root)
    const pages: CodePage[] = []
    const seen = new Set<string>()

    await walkFiles(root, async (file) => {
      if (!/\.(vue|nvue)$/i.test(file.name)) return
      // Prefer pages registered in pages.json; also accept pages/ / components paths with uni APIs.
      let src = ''
      try {
        src = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      const relPosix = file.relativePath.replace(/\\/g, '/').replace(/\.(vue|nvue)$/i, '')
      const inPagesJson = [...pagePaths].some(
        (p) => relPosix === p || relPosix.endsWith('/' + p) || relPosix.endsWith(p),
      )
      const uniHint =
        /\buni\./.test(src) ||
        /from\s+['"]@dcloudio\//.test(src) ||
        /pages\//i.test(file.relativePath)
      if (!inPagesJson && !uniHint) return
      if (!/<template\b|<view\b|<text\b/i.test(src)) return
      if (seen.has(file.relativePath)) return
      seen.add(file.relativePath)
      pages.push({
        adapterId: 'uni-app',
        platform: 'web',
        kindLabel: 'uni-app',
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
    const { template, style } = splitVueLike(src)
    return markupToDesignDoc(
      toHtmlish(template),
      style,
      path.basename(page.relativePath).replace(/\.(vue|nvue)$/i, ''),
    )
  },
}
