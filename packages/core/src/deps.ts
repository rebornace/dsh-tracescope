import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { detectLanguage } from './heuristics.js'

export interface SourceIndex {
  /** relative path -> file content (head tree snapshot on disk; for fixtures we read workspace). */
  files: Map<string, string>
  /** relative path -> set of relative paths that import/reference it */
  reverseDeps: Map<string, Set<string>>
}

/**
 * Build a lightweight reverse-dependency index for Kotlin + Objective-C sources
 * under `rootDir` (working tree). Good enough for V0.1 static ripple.
 */
export async function buildSourceIndex(rootDir: string): Promise<SourceIndex> {
  const files = new Map<string, string>()
  const byStem = new Map<string, string[]>()

  await walk(rootDir, rootDir, async (rel, abs) => {
    const lang = detectLanguage(rel)
    if (lang !== 'kotlin' && lang !== 'objc' && lang !== 'resource') return
    if (lang === 'resource' && !/\.(xml|strings)$/i.test(rel)) return
    try {
      const content = await readFile(abs, 'utf8')
      files.set(rel, content)
      const stem = path.basename(rel).replace(/\.(kt|kts|m|mm|h|xml)$/i, '')
      const list = byStem.get(stem) ?? []
      list.push(rel)
      byStem.set(stem, list)
    } catch {
      // ignore unreadable
    }
  })

  const reverseDeps = new Map<string, Set<string>>()
  const ensure = (key: string) => {
    let set = reverseDeps.get(key)
    if (!set) {
      set = new Set()
      reverseDeps.set(key, set)
    }
    return set
  }

  for (const [rel, content] of files) {
    const lang = detectLanguage(rel)
    const refs = collectReferences(content, lang)
    for (const ref of refs) {
      const targets = resolveRef(ref, byStem, files)
      for (const target of targets) {
        if (target === rel) continue
        ensure(target).add(rel)
      }
    }
  }

  return { files, reverseDeps }
}

function collectReferences(content: string, lang: ReturnType<typeof detectLanguage>): string[] {
  const refs: string[] = []
  if (lang === 'kotlin') {
    const importRe = /^\s*import\s+([a-zA-Z0-9_.]+)/gm
    let m: RegExpExecArray | null
    while ((m = importRe.exec(content))) {
      const full = m[1] ?? ''
      const simple = full.split('.').pop()
      if (simple) refs.push(simple)
    }
    // Same-module type mentions: FooActivity, BarFragment
    const typeRe = /\b([A-Z][A-Za-z0-9]+(?:Activity|Fragment|ViewModel|Screen))\b/g
    while ((m = typeRe.exec(content))) {
      refs.push(m[1] ?? '')
    }
  } else if (lang === 'objc') {
    const importRe = /#import\s+"([^"]+)"/g
    let m: RegExpExecArray | null
    while ((m = importRe.exec(content))) {
      const header = m[1] ?? ''
      refs.push(header.replace(/\.(h|m|mm)$/i, ''))
    }
    const classRe = /@interface\s+([A-Za-z0-9_]+)/g
    while ((m = classRe.exec(content))) {
      refs.push(m[1] ?? '')
    }
  }
  return refs.filter(Boolean)
}

function resolveRef(
  ref: string,
  byStem: Map<string, string[]>,
  files: Map<string, string>,
): string[] {
  const stem = ref.replace(/\.(h|m|mm|kt)$/i, '')
  const hits = byStem.get(stem)
  if (hits?.length) return hits
  // Fallback: path contains stem
  const out: string[] = []
  for (const p of files.keys()) {
    if (path.basename(p).startsWith(stem + '.') || path.basename(p) === stem) {
      out.push(p)
    }
  }
  return out
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
      const importers = reverseDeps.get(file)
      if (!importers) continue
      for (const importer of importers) {
        if (seedSet.has(importer) || result.has(importer)) continue
        result.set(importer, { depth: d, via: file })
        next.push(importer)
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }
  return result
}

async function walk(
  root: string,
  dir: string,
  onFile: (rel: string, abs: string) => Promise<void>,
): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === 'build' ||
        entry.name === 'Pods' ||
        entry.name === 'dist'
      ) {
        continue
      }
      await walk(root, abs, onFile)
      continue
    }
    if (!entry.isFile()) continue
    const rel = path.relative(root, abs).replace(/\\/g, '/')
    await onFile(rel, abs)
  }
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}
