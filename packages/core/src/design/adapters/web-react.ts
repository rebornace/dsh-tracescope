/**
 * React (web) adapter — discovers JSX/TSX pages (not RN).
 * Partial L1: JSX text + static style={{...}} / style="..." → DesignDoc.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { walkFiles } from '../fs-walk.js'
import { tokenizeName } from '../page-fingerprint.js'
import { countMatches, extractUiTexts } from './source-text.js'
import type { CodePage, PageFingerprint, PlatformAdapter } from './adapter-types.js'
import type { DesignDoc } from '../types.js'
import { markupToDesignDoc } from './web-markup.js'
import { loadAssociatedStyles } from './load-associated-styles.js'

const RN_IMPORT = /from\s+['"]react-native['"]|require\(\s*['"]react-native['"]\s*\)/
const TARO_IMPORT = /from\s+['"]@tarojs\//
const REACT_HINT =
  /from\s+['"]react['"]|from\s+['"]react\/|from\s+['"]react-dom['"]|<\/?[A-Z][A-Za-z0-9]*\b/
const PAGE_PATH = /(^|\/)(pages?|views?|screens?|routes?|app)\//i
const DOM_CONTROLS =
  /\b(div|span|button|img|input|a|section|header|footer|nav|main|ul|li|form|h[1-6]|p)\b/gi

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
    controlCount: countMatches(src, DOM_CONTROLS),
  }
}

/**
 * Convert JSX style={{ color: '#fff', fontSize: 16 }} into a CSS declaration string.
 */
function jsStyleObjectToCss(objBody: string): string {
  const decls: string[] = []
  // color: '#112233' | "..." | 16 | 16.5
  const re =
    /([A-Za-z_][\w]*)\s*:\s*(?:'([^']*)'|"([^"]*)"|([\d.]+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(objBody))) {
    const key = m[1]!
    const strVal = m[2] ?? m[3]
    const numVal = m[4]
    const cssKey = key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
    if (strVal !== undefined) {
      decls.push(`${cssKey}: ${strVal}`)
    } else if (numVal !== undefined) {
      const n = Number(numVal)
      if (!Number.isFinite(n)) continue
      // Unitless numbers that are typically px in React.
      if (
        /width|height|fontSize|borderRadius|padding|margin|top|left|right|bottom|gap/i.test(
          key,
        )
      ) {
        decls.push(`${cssKey}: ${n}px`)
      } else {
        decls.push(`${cssKey}: ${n}`)
      }
    }
  }
  return decls.join('; ')
}

/**
 * Best-effort JSX → HTML fragment for the shared markup converter.
 * Keeps lowercase DOM tags and PascalCase components (as placeholders);
 * flattens static styles.
 */
export function jsxToHtmlish(src: string): string {
  let s = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')

  // style={{ ... }} → style="..."
  s = s.replace(/style=\{\{([\s\S]*?)\}\}/g, (_all, body: string) => {
    const css = jsStyleObjectToCss(body)
    return css ? `style="${css}"` : ''
  })

  // className="x" → class="x"
  s = s.replace(/\bclassName=/g, 'class=')

  // CSS modules: class={styles.title} / class={styles['title']} → class="title"
  s = s.replace(/\bclass=\{\s*styles\.([A-Za-z_][\w]*)\s*\}/g, 'class="$1"')
  s = s.replace(/\bclass=\{\s*styles\[(['"])([^'"]+)\1\]\s*\}/g, 'class="$2"')
  s = s.replace(/\bclass=\{\s*cx\([^)]*styles\.([A-Za-z_][\w]*)[^)]*\)\s*\}/g, 'class="$1"')

  // Strip JS expression braces, but keep brace bodies that still contain tags
  // (e.g. function Page(){ return <div/> } — otherwise the whole body vanishes).
  s = s.replace(/\{([^{}]*)\}/g, (_all, inner: string) => (/</.test(inner) ? inner : ' '))

  // Normalize member components: <Foo.Bar /> → <FooBar />
  s = s.replace(/<([A-Z][\w]*)\.([A-Z][\w]*)\b/g, '<$1$2')
  s = s.replace(/<\/([A-Z][\w]*)\.([A-Z][\w]*)>/g, '</$1$2>')

  // Self-closing components → paired empty tags so markupToDesignDoc keeps them.
  s = s.replace(/<([A-Z][\w]*)\b([^>]*)\/>/g, '<$1$2></$1>')

  return s
}

export const webReactAdapter: PlatformAdapter = {
  id: 'web-react',
  platform: 'web',
  kindLabel: 'Web React',
  precise: true,

  async discoverPages(root: string): Promise<CodePage[]> {
    const pages: CodePage[] = []
    await walkFiles(root, async (file) => {
      if (!/\.(tsx|jsx)$/i.test(file.name)) return
      let src = ''
      try {
        src = await readFile(file.absolutePath, 'utf8')
      } catch {
        return
      }
      if (RN_IMPORT.test(src)) return
      if (TARO_IMPORT.test(src)) return
      if (!REACT_HINT.test(src)) return
      const pathOk = PAGE_PATH.test(file.relativePath.replace(/\\/g, '/'))
      const hasDom = countMatches(src, DOM_CONTROLS) >= 2
      if (!pathOk && !hasDom) return
      pages.push({
        adapterId: 'web-react',
        platform: 'web',
        kindLabel: 'Web React',
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
    const htmlish = jsxToHtmlish(src)
    const css = await loadAssociatedStyles({
      entryAbsolutePath: page.absolutePath,
      sourceText: src,
    })
    return markupToDesignDoc(htmlish, css, path.basename(page.relativePath))
  },
}
