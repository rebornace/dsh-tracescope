import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { SKIP_DIR_NAMES } from '../skip-paths.js'
import { isPlaceholderFile, type ParsedStack, type StackFrame } from './parse-stack.js'

export interface RepoStackHit {
  path: string
  reason: string
  symbol?: string
  line?: number
}

const JVM_SYSTEM_PREFIXES = [
  'android.',
  'androidx.',
  'com.android.',
  'com.google.android.',
  'java.',
  'javax.',
  'sun.',
  'jdk.',
  'dalvik.',
  'libcore.',
  'kotlin.jvm.',
  'kotlin.coroutines.',
  'kotlinx.coroutines.',
]

const IOS_SYSTEM_LIBRARIES = new Set([
  'uikit',
  'foundation',
  'corefoundation',
  'libobjc.a.dylib',
  'libdispatch.dylib',
  'libsystem_kernel.dylib',
  'libsystem_pthread.dylib',
  'libsystem_c.dylib',
  'dyld',
  'cfnetwork',
  'quartzcore',
  'coregraphics',
  'javascriptcore',
  'swiftui',
  'combine',
])

function basenameOf(fileName: string): string {
  const clean = fileName.split('?')[0]?.replace(/\\/g, '/') ?? fileName
  const cut = clean.split('/').pop() ?? clean
  return cut
}

function suffixOf(fileName: string | undefined): string | undefined {
  if (!fileName) return undefined
  let clean = fileName.split('?')[0]?.replace(/\\/g, '/') ?? fileName
  clean = clean.replace(/^webpack:\/+/, '').replace(/^\.\//, '')
  const asUrl = clean.match(/^[a-z]+:\/\/[^/]+\/(.+)$/i)
  if (asUrl?.[1]) clean = asUrl[1]
  if (!clean.includes('/')) return undefined
  return clean.toLowerCase()
}

function isSystemFrame(frame: StackFrame): boolean {
  const file = frame.fileName?.trim().toLowerCase() ?? ''
  if (isPlaceholderFile(frame.fileName)) return true
  if (file.endsWith('.bundle') || file.endsWith('.jsbundle')) return true
  if (file.startsWith('node:') || file === 'native') return true
  const className = frame.className ?? ''
  if (JVM_SYSTEM_PREFIXES.some((prefix) => className.startsWith(prefix))) return true
  const libPath = (frame.library ?? '').replace(/\\/g, '/').toLowerCase()
  if (
    libPath.includes('/system/') ||
    libPath.includes('/apex/') ||
    libPath.includes('/vendor/')
  ) {
    return true
  }
  if (/(^|\/)(libc|libart|libandroid_runtime|libutils|libbinder)\.so$/.test(libPath)) return true
  const libBase = libPath.split('/').pop() ?? libPath
  if (frame.kind === 'ios' && IOS_SYSTEM_LIBRARIES.has(libBase)) return true
  return false
}

async function buildBasenameIndex(repoRoot: string): Promise<Map<string, string[]>> {
  const index = new Map<string, string[]>()

  async function walk(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (!SKIP_DIR_NAMES.has(ent.name)) {
          await walk(path.join(dir, ent.name))
        }
      } else if (ent.isFile()) {
        const full = path.join(dir, ent.name)
        const key = ent.name.toLowerCase()
        const list = index.get(key)
        if (list) list.push(full)
        else index.set(key, [full])
      }
    }
  }

  await walk(repoRoot)
  return index
}

interface ScoredPath {
  path: string
  score: number
  reason: 'packagePath' | 'pathSuffix' | 'fileName'
}

function scoreCandidate(filePath: string, frame: StackFrame, base: string): ScoredPath {
  const dirs = filePath.replace(/\\/g, '/').toLowerCase().split('/')
  const fileIdx = dirs.lastIndexOf(base.toLowerCase())
  let score = 10
  let reason: ScoredPath['reason'] = 'fileName'
  const norm = dirs.join('/')
  const suffix = suffixOf(frame.fileName)
  if (suffix && norm.endsWith(suffix)) {
    score += 50
    reason = 'pathSuffix'
  }
  const className = frame.className
  if (className && fileIdx >= 0) {
    const parts = className
      .split('.')
      .filter(Boolean)
      .map((part) => part.toLowerCase())
    const pkg = parts.slice(0, -1)
    let consecutive = 0
    let dirIndex = fileIdx - 1
    for (let i = pkg.length - 1; i >= 0 && dirIndex >= 0; i -= 1, dirIndex -= 1) {
      const segment = (pkg[i] ?? '').split('$')[0]
      if (segment && dirs[dirIndex] === segment) consecutive += 1
      else break
    }
    if (consecutive > 0) {
      score += consecutive * 20
      reason = 'packagePath'
    }
    const simple = parts[parts.length - 1]?.split('$')[0]
    const stem = base.toLowerCase().replace(/\.[^.]+$/, '')
    if (simple && stem === simple) score += 5
  }
  return { path: filePath, score, reason }
}

function tieBreak(a: string, b: string): number {
  const aSrc = a.replace(/\\/g, '/').includes('/src/') ? 1 : 0
  const bSrc = b.replace(/\\/g, '/').includes('/src/') ? 1 : 0
  if (aSrc !== bSrc) return bSrc - aSrc
  return a.length - b.length
}

function pickCandidate(candidates: string[], frame: StackFrame, base: string): ScoredPath | undefined {
  const ranked = candidates
    .map((candidate) => scoreCandidate(candidate, frame, base))
    .filter((item) => item.score >= 10)
    .sort((a, b) => b.score - a.score || tieBreak(a.path, b.path))
  const best = ranked[0]
  if (!best) return undefined
  const second = ranked[1]
  if (second && second.score === best.score && best.reason === 'fileName') return undefined
  return best
}

/**
 * Map parsed stack frames to source files under `repoRoot`.
 * Skips system frames. Prefers package-path alignment over a bare file name,
 * and keeps the top frame's line number.
 */
export async function matchStackToRepo(
  repoRoot: string,
  parsed: ParsedStack,
  limit: number,
): Promise<RepoStackHit[]> {
  const root = path.resolve(repoRoot)
  const basenameIndex = await buildBasenameIndex(root)
  const hits: RepoStackHit[] = []
  const seenPaths = new Set<string>()

  for (const frame of parsed.frames) {
    if (hits.length >= limit) break
    if (isSystemFrame(frame)) continue
    const fileName = frame.fileName
    if (!fileName || isPlaceholderFile(fileName)) continue
    const base = basenameOf(fileName)
    if (!base || isPlaceholderFile(base)) continue

    const candidates = basenameIndex.get(base.toLowerCase())
    if (!candidates?.length) continue
    const picked = pickCandidate(candidates, frame, base)
    if (!picked || seenPaths.has(picked.path)) continue

    seenPaths.add(picked.path)
    hits.push({
      path: picked.path,
      reason: picked.reason,
      symbol: frame.method,
      line: frame.line,
    })
  }

  return hits
}
