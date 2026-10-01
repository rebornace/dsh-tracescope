/**
 * Resolve co-located and shallow-imported source files for a UI page entry.
 *
 * Matching stays single-entry; compare / AI prompts get this reading list so
 * modular components, styles, and includes are not invisible.
 */
import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { detectLanguage } from '../heuristics.js'
import { collectRawReferences } from '../deps-refs.js'

export type RelatedFileRole = 'entry' | 'sibling' | 'import' | 'include' | 'style' | 'resource'

export interface RelatedSourceFile {
  /** Repo-relative posix path. */
  relativePath: string
  role: RelatedFileRole
  /** Short human reason shown in the sidebar. */
  reason?: string
}

export interface RelatedSourceFilesResult {
  entry: string
  files: RelatedSourceFile[]
}

export const MAX_RELATED = 80
export const MAX_DEPTH = 3

const RESOLVE_EXTS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.dart',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.wxml',
  '.wxss',
  '.axml',
  '.acss',
  '.ttml',
  '.ttss',
  '.qml',
  '.xml',
  '.swift',
  '.kt',
  '.java',
  '.h',
  '.m',
]

async function exists(abs: string): Promise<boolean> {
  try {
    await access(abs)
    return true
  } catch {
    return false
  }
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

function roleLabel(role: RelatedFileRole): string {
  switch (role) {
    case 'entry':
      return '入口'
    case 'sibling':
      return '同目录'
    case 'import':
      return '引用'
    case 'include':
      return 'include'
    case 'style':
      return '样式'
    case 'resource':
      return '资源'
    default:
      return role
  }
}

/** Co-located page files: foo.vue + foo.css, index.wxml + index.js + index.json, … */
async function listSiblingFiles(
  checkoutPath: string,
  entryRel: string,
): Promise<RelatedSourceFile[]> {
  const abs = path.join(checkoutPath, entryRel)
  const dir = path.dirname(abs)
  const entryName = path.basename(abs)
  const base = entryName.replace(/\.[^.]+$/i, '')
  const dirRel = toPosix(path.dirname(entryRel))
  const out: RelatedSourceFile[] = []
  try {
    const entries = await readdir(dir)
    for (const name of entries.sort()) {
      if (name === entryName) continue
      if (!name.toLowerCase().startsWith(base.toLowerCase() + '.')) continue
      const rel = dirRel === '.' ? name : `${dirRel}/${name}`
      const ext = path.extname(name).toLowerCase()
      const role: RelatedFileRole =
        /\.(css|scss|sass|less|wxss|acss|ttss)$/i.test(ext) ? 'style' : 'sibling'
      out.push({
        relativePath: rel,
        role,
        reason: role === 'style' ? '同名样式' : '同名配套文件',
      })
    }
  } catch {
    /* optional */
  }
  return out
}

async function resolveLocalSpec(
  checkoutPath: string,
  fromRel: string,
  spec: string,
): Promise<string | undefined> {
  const cleaned = spec.split(/[?#]/)[0]!.trim()
  if (!cleaned) return undefined
  const noLead = cleaned.replace(/^\//, '')
  // Only follow project-local paths; package imports stay for the agent to open.
  const isLocal =
    cleaned.startsWith('./') ||
    cleaned.startsWith('../') ||
    cleaned.startsWith('@/') ||
    cleaned.startsWith('~/') ||
    cleaned.startsWith('/') ||
    cleaned.startsWith('@components/') ||
    cleaned.startsWith('@views/') ||
    cleaned.startsWith('@pages/') ||
    cleaned.startsWith('@/components/') ||
    noLead.startsWith('src/') ||
    noLead.startsWith('pages/') ||
    noLead.startsWith('page/') ||
    noLead.startsWith('components/') ||
    noLead.startsWith('component/') ||
    noLead.startsWith('package/') ||
    noLead.startsWith('common/') ||
    noLead.startsWith('app/') ||
    noLead.startsWith('apps/') ||
    noLead.startsWith('views/') ||
    noLead.startsWith('view/') ||
    noLead.startsWith('widgets/') ||
    noLead.startsWith('features/') ||
    noLead.startsWith('modules/') ||
    noLead.startsWith('screens/') ||
    noLead.startsWith('screen/') ||
    noLead.startsWith('ui/') ||
    noLead.startsWith('shared/') ||
    noLead.startsWith('lib/') ||
    noLead.startsWith('libs/') ||
    noLead.startsWith('packages/') ||
    noLead.startsWith('composables/') ||
    noLead.startsWith('hooks/') ||
    noLead.startsWith('layouts/') ||
    noLead.startsWith('layout/') ||
    // Same-folder bare name: `Header` / `header.wxml` resolved next to the entry.
    !cleaned.includes('/') && !cleaned.includes('\\')
  if (!isLocal) return undefined

  const fromDir = toPosix(path.dirname(fromRel))
  let baseRel: string
  if (cleaned.startsWith('@/')) {
    baseRel = cleaned.slice(2)
  } else if (cleaned.startsWith('~/')) {
    baseRel = cleaned.slice(2)
  } else if (cleaned.startsWith('@components/')) {
    baseRel = `components/${cleaned.slice('@components/'.length)}`
  } else if (cleaned.startsWith('@views/')) {
    baseRel = `views/${cleaned.slice('@views/'.length)}`
  } else if (cleaned.startsWith('@pages/')) {
    baseRel = `pages/${cleaned.slice('@pages/'.length)}`
  } else if (cleaned.startsWith('./') || cleaned.startsWith('../')) {
    baseRel = toPosix(path.posix.normalize(`${fromDir}/${cleaned}`))
  } else if (!cleaned.includes('/') && !cleaned.includes('\\')) {
    baseRel = toPosix(path.posix.normalize(`${fromDir}/${cleaned}`))
  } else {
    baseRel = noLead
  }
  baseRel = baseRel.replace(/^\.\//, '')

  const candidates: string[] = []
  for (const ext of RESOLVE_EXTS) {
    candidates.push(baseRel + ext)
    if (!ext || !path.posix.extname(baseRel)) {
      candidates.push(`${baseRel}/index${ext || '.ts'}`)
      candidates.push(`${baseRel}/index${ext || '.js'}`)
      candidates.push(`${baseRel}/index${ext || '.vue'}`)
      candidates.push(`${baseRel}/index${ext || '.tsx'}`)
    }
  }
  // Dedup while preserving order.
  const seen = new Set<string>()
  for (const cand of candidates) {
    const rel = toPosix(cand).replace(/^(\.\/)+/, '')
    if (seen.has(rel)) continue
    seen.add(rel)
    if (await exists(path.join(checkoutPath, rel))) return rel
  }
  return undefined
}

function extraMarkupRefs(content: string, rel: string): string[] {
  const out: string[] = []
  const push = (v: string | undefined) => {
    const s = String(v || '').trim()
    if (s) out.push(s)
  }
  // Mini-program / Android-ish includes.
  for (const m of content.matchAll(/<(?:include|import)\b[^>]*\b(?:src|layout)\s*=\s*["']([^"']+)["']/gi)) {
    push(m[1])
  }
  // CSS / SCSS chain.
  for (const m of content.matchAll(/@import\s+(?:url\()?["']([^"']+)["']/gi)) {
    push(m[1])
  }
  // uni-app / Vue easycom-ish path props on custom components are skipped;
  // JSON usingComponents covers mini programs.
  if (/\.json$/i.test(rel)) {
    try {
      const parsed = JSON.parse(content) as { usingComponents?: Record<string, string> }
      for (const v of Object.values(parsed.usingComponents ?? {})) push(v)
    } catch {
      /* ignore */
    }
  }
  // PascalCase tags in Vue / JSX → try components/<Name> (common convention).
  if (/\.(vue|tsx|jsx)$/i.test(rel)) {
    const seen = new Set<string>()
    for (const m of content.matchAll(/<([A-Z][A-Za-z0-9]+)\b/g)) {
      const name = m[1]!
      if (seen.has(name)) continue
      seen.add(name)
      push(`components/${name}`)
      push(`src/components/${name}`)
      push(`./components/${name}`)
    }
  }
  return out
}

function classifyResolved(rel: string, via: 'import' | 'include'): RelatedFileRole {
  if (via === 'include') return 'include'
  if (/\.(css|scss|sass|less|wxss|acss|ttss)$/i.test(rel)) return 'style'
  if (/\/res\//i.test(rel) || /\.(xml|strings)$/i.test(rel)) return 'resource'
  return 'import'
}

/**
 * Walk entry → siblings → relative imports / includes (depth-limited).
 */
export async function resolveRelatedSourceFiles(
  checkoutPath: string,
  entryRelativePath: string,
  options?: { maxFiles?: number; maxDepth?: number },
): Promise<RelatedSourceFilesResult> {
  const maxFiles = Math.max(1, options?.maxFiles ?? MAX_RELATED)
  const maxDepth = Math.max(0, options?.maxDepth ?? MAX_DEPTH)
  const entry = toPosix(entryRelativePath)
  const files: RelatedSourceFile[] = [
    { relativePath: entry, role: 'entry', reason: '页面入口' },
  ]
  const seen = new Set<string>([entry])

  const siblings = await listSiblingFiles(checkoutPath, entry)
  for (const s of siblings) {
    if (seen.has(s.relativePath)) continue
    seen.add(s.relativePath)
    files.push(s)
    if (files.length >= maxFiles) {
      return { entry, files }
    }
  }

  type QueueItem = { rel: string; depth: number }
  const queue: QueueItem[] = [
    { rel: entry, depth: 0 },
    ...siblings.map((s) => ({ rel: s.relativePath, depth: 0 })),
  ]

  while (queue.length && files.length < maxFiles) {
    const cur = queue.shift()!
    if (cur.depth >= maxDepth) continue
    const abs = path.join(checkoutPath, cur.rel)
    let content = ''
    try {
      content = await readFile(abs, 'utf8')
    } catch {
      continue
    }
    if (content.length > 800_000) content = content.slice(0, 800_000)

    const lang = detectLanguage(cur.rel)
    const refs =
      lang === 'other'
        ? { specifiers: [] as string[], symbols: [] as string[] }
        : collectRawReferences(content, lang)
    const markupSpecs = extraMarkupRefs(content, cur.rel)
    const specs: Array<{ spec: string; fromMarkup: boolean }> = [
      ...refs.specifiers.map((spec) => ({ spec, fromMarkup: false })),
      ...markupSpecs.map((spec) => ({ spec, fromMarkup: true })),
    ]

    for (const { spec, fromMarkup } of specs) {
      if (files.length >= maxFiles) break
      const resolved = await resolveLocalSpec(checkoutPath, cur.rel, spec)
      if (!resolved || seen.has(resolved)) continue
      seen.add(resolved)
      const role = classifyResolved(resolved, fromMarkup ? 'include' : 'import')
      files.push({
        relativePath: resolved,
        role,
        reason: fromMarkup
          ? `由 ${path.posix.basename(cur.rel)} include`
          : `由 ${path.posix.basename(cur.rel)} 引用`,
      })
      queue.push({ rel: resolved, depth: cur.depth + 1 })

      // Pull co-located companions of the imported module (wxml/js/json, vue+css, …).
      if (files.length < maxFiles) {
        const importedSiblings = await listSiblingFiles(checkoutPath, resolved)
        for (const s of importedSiblings) {
          if (files.length >= maxFiles) break
          if (seen.has(s.relativePath)) continue
          seen.add(s.relativePath)
          files.push({
            ...s,
            reason: s.reason || `配套 ${path.posix.basename(resolved)}`,
          })
          queue.push({ rel: s.relativePath, depth: cur.depth + 1 })
        }
      }
    }
  }

  return { entry, files }
}

/** Absolute paths for cache fingerprinting (existing files only). */
export function relatedFilesAbsolute(
  checkoutPath: string,
  related: RelatedSourceFilesResult,
): string[] {
  return related.files.map((f) => path.join(checkoutPath, f.relativePath))
}

/** Prompt / AI reading list text. */
export function formatRelatedSourceFilesManifest(related: RelatedSourceFilesResult): string {
  const lines: string[] = [`入口源文件：${related.entry}`]
  const rest = related.files.filter((f) => f.role !== 'entry')
  if (rest.length) {
    lines.push('关联文件：')
    for (const f of rest) {
      const tag = roleLabel(f.role)
      const why = f.reason ? `（${f.reason}）` : ''
      lines.push(`- [${tag}] ${f.relativePath}${why}`)
    }
  } else {
    lines.push('关联文件：无（未发现同目录配套或可解析的本地引用）')
  }
  lines.push('')
  lines.push('说明：请从入口与清单内文件出发，再按 import / 组件注册 / 路由继续读取；不要只看单个文件下结论。')
  return lines.join('\n')
}

/** Convert Android layout dependency absolute paths into the shared related-file shape. */
export function relatedFromAndroidManifest(
  checkoutPath: string,
  entryRelativePath: string,
  paths: {
    entryLayout: string
    layouts: string[]
    drawables: string[]
    colorFiles: string[]
    dimenFiles: string[]
    stringFiles: string[]
    styleFiles: string[]
  },
): RelatedSourceFilesResult {
  const root = path.resolve(checkoutPath)
  const toRel = (abs: string): string => {
    const rel = toPosix(path.relative(root, abs))
    return rel.startsWith('..') ? toPosix(abs) : rel
  }
  const files: RelatedSourceFile[] = []
  const seen = new Set<string>()
  const push = (abs: string, role: RelatedFileRole, reason: string) => {
    if (!abs) return
    const rel = toRel(abs)
    if (seen.has(rel)) return
    seen.add(rel)
    files.push({ relativePath: rel, role, reason })
  }

  const entry = toPosix(entryRelativePath)
  push(path.join(checkoutPath, entry), 'entry', '页面入口')
  if (paths.entryLayout) push(paths.entryLayout, 'entry', '页面入口')

  for (const p of paths.layouts) push(p, 'include', 'layout include')
  for (const p of paths.drawables) push(p, 'resource', 'drawable')
  for (const p of paths.colorFiles) push(p, 'resource', 'color')
  for (const p of paths.dimenFiles) push(p, 'resource', 'dimen')
  for (const p of paths.stringFiles) push(p, 'resource', 'string')
  for (const p of paths.styleFiles) push(p, 'style', 'style')

  // Ensure entry is first and unique.
  const rest = files.filter((f) => f.relativePath !== entry)
  return {
    entry,
    files: [{ relativePath: entry, role: 'entry', reason: '页面入口' }, ...rest],
  }
}
