import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { gitListTree, readGitBlobs } from './git.js'
import { detectLanguage } from './heuristics.js'
import {
  collectRawReferences,
  extractDeclaredSymbols,
  extractStyleHooks,
} from './deps-refs.js'

export interface SourceIndex {
  files: Map<string, string>
  reverseDeps: Map<string, Set<string>>
}

const INDEXED_EXT =
  /\.(kt|kts|java|swift|m|mm|h|dart|ts|tsx|mts|cts|js|jsx|mjs|cjs|vue|css|scss|sass|less|html?|xml|strings)$/i

function isIndexedSource(rel: string): boolean {
  const lang = detectLanguage(rel)
  if (lang === 'other') return false
  if (lang === 'resource') return /\.(xml|strings)$/i.test(rel)
  return INDEXED_EXT.test(rel.replace(/\\/g, '/'))
}

function normalizeSpec(spec: string): string {
  return String(spec).replace(/^[./]*\//, '').replace(/\.(js|jsx|ts|tsx|mjs|cjs|mts|cts|vue|css|scss|sass|less|h|m|mm|dart|java|kt|kts|swift)$/i, '')
}

function specCandidates(spec: string): string[] {
  const base = normalizeSpec(spec)
  const exts = ['', '.ts', '.tsx', '.js', '.jsx', '.vue', '.dart', '.java', '.kt', '.swift', '.css', '.scss', '.h']
  const cands = new Set<string>()
  for (const e of exts) {
    cands.add(base + e)
    cands.add(base + '/index' + e)
  }
  return [...cands]
}

function resolveSpecifier(spec: string, files: Map<string, string>): string[] {
  const out = new Set<string>()
  const addPath = (p: string) => {
    const cands = specCandidates(p)
    for (const f of files.keys()) {
      const nf = normalizeSpec(f)
      if (cands.some((c) => nf === normalizeSpec(c))) out.add(f)
    }
  }

  const pkg = spec.match(/^package:[^/]+\/(.+)$/)
  if (pkg) {
    addPath(pkg[1]!)
    addPath('lib/' + pkg[1]!)
    return [...out]
  }

  const clean = spec.split(/[?#]/)[0]!
  if (spec.startsWith('@/')) addPath(clean.slice(2))
  addPath(clean)
  return [...out]
}

export function buildIndexFromFileMap(files: Map<string, string>): SourceIndex {
  const reverseDeps = new Map<string, Set<string>>()
  const bySymbol = new Map<string, string[]>()
  const styleHooks = new Map<string, Set<string>>()

  const ensure = (target: string) => {
    let set = reverseDeps.get(target)
    if (!set) {
      set = new Set()
      reverseDeps.set(target, set)
    }
    return set
  }

  // Pass 1: declared symbols and style hooks
  for (const [rel, content] of files) {
    const lang = detectLanguage(rel)
    for (const sym of extractDeclaredSymbols(content, lang)) {
      const list = bySymbol.get(sym) ?? []
      list.push(rel)
      bySymbol.set(sym, list)
    }
    const hooks = extractStyleHooks(content, lang)
    if (hooks.size) styleHooks.set(rel, hooks)
  }

  // Pass 2: references
  for (const [rel, content] of files) {
    const lang = detectLanguage(rel)
    const raw = collectRawReferences(content, lang)
    const targets = new Set<string>()

    const fromDir = path.posix.dirname(rel.replace(/\\/g, '/'))
    const resolveRel = (spec: string): string[] => {
      if (spec.startsWith('@/')) {
        const tail = spec.slice(2)
        // Common web roots; exact match resolves if present, else src/ then lib/.
        return [tail, 'src/' + tail, 'lib/' + tail]
      }
      if (/^\.\.?\//.test(spec)) {
        return [
          path.posix
            .normalize(path.posix.join(fromDir, spec))
            .replace(/^\//, ''),
        ]
      }
      // Dart allows same-directory part/import without "./".
      if (lang === 'dart' && /^[A-Za-z0-9_.-]+$/.test(spec)) {
        return [path.posix.join(fromDir, spec)]
      }
      return [spec]
    }

    for (const spec of raw.specifiers) {
      if (/^[a-z]+:\/\//i.test(spec) && !spec.startsWith('package:')) continue
      for (const relSpec of resolveRel(spec)) {
        for (const t of resolveSpecifier(relSpec, files)) {
          if (t !== rel) targets.add(t)
        }
      }
    }
    for (const sym of raw.symbols) {
      // Vue kebab tag -> PascalCase symbol
      const variants = [sym]
      if (sym.includes('-')) {
        variants.push(
          sym
            .split('-')
            .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
            .join(''),
        )
      }
      for (const v of variants) {
        for (const t of bySymbol.get(v) ?? []) {
          if (t !== rel) targets.add(t)
        }
        // Also match by file stem
        for (const f of files.keys()) {
          const stem = path.basename(f).replace(/\.[^.]+$/, '')
          if (stem === v && f !== rel) targets.add(f)
        }
      }
    }
    for (const t of targets) ensure(t).add(rel)
  }

  // Pass 3: style hooks usage -> stylesheet
  for (const [rel, content] of files) {
    const lang = detectLanguage(rel)
    if (lang !== 'vue' && lang !== 'html' && lang !== 'javascript') continue
    const used = extractStyleHooks(content, lang)
    for (const [styleFile, hooks] of styleHooks) {
      if (styleFile === rel) continue
      for (const h of used) {
        if (hooks.has(h)) {
          ensure(styleFile).add(rel)
          break
        }
      }
    }
  }

  return { files, reverseDeps }
}

export async function buildSourceIndex(rootDir: string): Promise<SourceIndex> {
  const files = new Map<string, string>()
  await walk(rootDir, rootDir, async (rel, abs) => {
    if (!isIndexedSource(rel)) return
    try {
      files.set(rel, await readFile(abs, 'utf8'))
    } catch {
      // ignore unreadable
    }
  })
  return buildIndexFromFileMap(files)
}

export async function buildSourceIndexAtCommit(
  repoPath: string,
  commit: string,
): Promise<SourceIndex> {
  const names = await gitListTree(repoPath, commit)
  const wanted = names.filter(isIndexedSource)
  const files = await readGitBlobs(repoPath, commit, wanted)
  return buildIndexFromFileMap(files)
}

export function rippleFrom(
  seeds: string[],
  reverseDeps: Map<string, Set<string>>,
  depth: number,
): Map<string, { depth: number; via: string }> {
  const result = new Map<string, { depth: number; via: string }>()
  const seedSet = new Set(seeds)
  let frontier = [...seeds]
  for (let d = 1; d <= depth; d++) {
    const next: string[] = []
    for (const file of frontier) {
      for (const importer of reverseDeps.get(file) ?? []) {
        if (seedSet.has(importer) || result.has(importer)) continue
        result.set(importer, { depth: d, via: file })
        next.push(importer)
      }
    }
    frontier = next
    if (!frontier.length) break
  }
  return result
}

async function walk(
  rootDir: string,
  dir: string,
  onFile: (rel: string, abs: string) => Promise<void>,
): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  const skip = new Set(['node_modules', '.git', 'build', 'Pods', 'dist', '.dart_tool'])
  for (const entry of entries) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (skip.has(entry.name)) continue
      await walk(rootDir, abs, onFile)
      continue
    }
    if (!entry.isFile()) continue
    const rel = path.relative(rootDir, abs).replace(/\\/g, '/')
    await onFile(rel, abs)
  }
}
