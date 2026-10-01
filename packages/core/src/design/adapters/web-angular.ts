/**
 * Angular component adapter — inline / external template + styles → DesignDoc.
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
import { loadAssociatedStyles } from './load-associated-styles.js'

async function readMaybe(abs: string): Promise<string> {
  try {
    return await readFile(abs, 'utf8')
  } catch {
    return ''
  }
}

function extractInlineTemplate(src: string): string {
  const m =
    src.match(/template\s*:\s*`([\s\S]*?)`/) ||
    src.match(/template\s*:\s*'([\s\S]*?)'/) ||
    src.match(/template\s*:\s*"([\s\S]*?)"/)
  return m?.[1] ?? ''
}

function extractInlineStyles(src: string): string {
  const blocks: string[] = []
  const arr = src.match(/styles\s*:\s*\[([\s\S]*?)\]/)
  if (arr) {
    for (const m of arr[1]!.matchAll(/`([\s\S]*?)`|'([\s\S]*?)'|"([\s\S]*?)"/g)) {
      blocks.push(m[1] ?? m[2] ?? m[3] ?? '')
    }
  }
  return blocks.join('\n')
}

function extractUrls(src: string, key: 'templateUrl' | 'styleUrls'): string[] {
  if (key === 'templateUrl') {
    const m = src.match(/templateUrl\s*:\s*['"]([^'"]+)['"]/)
    return m?.[1] ? [m[1]] : []
  }
  const block = src.match(/styleUrls\s*:\s*\[([\s\S]*?)\]/)
  if (!block) return []
  return [...block[1]!.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]!).filter(Boolean)
}

async function loadTemplateAndStyles(
  componentPath: string,
  src: string,
): Promise<{ template: string; css: string }> {
  const dir = path.dirname(componentPath)
  let template = extractInlineTemplate(src)
  for (const rel of extractUrls(src, 'templateUrl')) {
    template += (template ? '\n' : '') + (await readMaybe(path.resolve(dir, rel)))
  }
  // Convention: foo.component.html next to foo.component.ts
  if (!template.trim()) {
    const sibling = componentPath.replace(/\.ts$/i, '.html')
    template = await readMaybe(sibling)
  }

  let css = extractInlineStyles(src)
  for (const rel of extractUrls(src, 'styleUrls')) {
    css += '\n' + (await readMaybe(path.resolve(dir, rel)))
  }
  const siblingCss = componentPath.replace(/\.ts$/i, '.css')
  css += '\n' + (await readMaybe(siblingCss))
  const siblingScss = componentPath.replace(/\.ts$/i, '.scss')
  // Best-effort: read scss as plain text for simple class rules.
  css += '\n' + (await readMaybe(siblingScss))

  return { template, css }
}

function fingerprint(template: string, css: string, fileBase: string): PageFingerprint {
  return {
    texts: collectMarkupTexts(template),
    nameTokens: tokenizeName(
      fileBase.replace(/\.component\.ts$/i, '').replace(/\.ts$/i, ''),
    ),
    controlCount: countMarkupControls(template),
  }
}

export const webAngularAdapter: PlatformAdapter = {
  id: 'web-angular',
  platform: 'web',
  kindLabel: 'Web Angular',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!file.name.endsWith('.ts')) return
      if (file.name.endsWith('.d.ts')) return
      // Prefer *.component.ts; also allow @Component files.
      let src = ''
      try {
        src = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      if (!/@Component\b/.test(src)) return
      const { template, css } = await loadTemplateAndStyles(file.absolutePath, src)
      if (!template.trim()) return
      if (!/<(div|section|main|button|h[1-6]|p|span|a|img)\b/i.test(template)) return
      pages.push({
        adapterId: 'web-angular',
        platform: 'web',
        kindLabel: 'Web Angular',
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
        precise: true,
        fingerprint: fingerprint(template, css, file.name),
      })
    })
    return pages
  },

  async toDesignDoc(page: CodePage): Promise<DesignDoc> {
    const src = await readFile(page.absolutePath, 'utf8')
    const { template, css } = await loadTemplateAndStyles(page.absolutePath, src)
    const merged = await loadAssociatedStyles({
      entryAbsolutePath: page.absolutePath,
      sourceText: src,
      inlineCss: css,
    })
    return markupToDesignDoc(
      template,
      merged,
      path.basename(page.relativePath).replace(/\.component\.ts$/i, ''),
    )
  },
}
