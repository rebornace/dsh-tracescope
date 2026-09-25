/**
 * Shared, dependency-aware filesystem walker used by platform adapters to
 * enumerate candidate pages. Skips dependency / build output directories so
 * adapters stay fast and never inspect generated sources.
 */
import { readdir } from 'node:fs/promises'
import path from 'node:path'

/** Directories that never contain source pages we want to inspect. */
export const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'build',
  'dist',
  '.gradle',
  '.idea',
  'Pods',
  'DerivedData',
  'Carthage',
  '.build',
  'out',
  'target',
  'bin',
  'obj',
])

export const DEFAULT_MAX_DEPTH = 12
export const DEFAULT_MAX_FILES = 60_000

export interface WalkOptions {
  maxDepth?: number
  maxFiles?: number
  /** Extra directory names to skip (in addition to SKIP_DIRS). */
  skipDirs?: Iterable<string>
}

export interface WalkFile {
  absolutePath: string
  relativePath: string
  name: string
  depth: number
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/')
}

/**
 * Enumerate files under `root`. Invokes `onFile` for every regular file.
 * Returns when the tree is exhausted or `onFile` returns false (stop).
 */
export async function walkFiles(
  root: string,
  onFile: (file: WalkFile) => boolean | void | Promise<boolean | void>,
  options: WalkOptions = {},
): Promise<void> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES
  const extraSkip = options.skipDirs ? new Set(options.skipDirs) : null
  let seen = 0
  let stopped = false

  async function walk(dir: string, depth: number): Promise<void> {
    if (stopped || depth > maxDepth) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (stopped) return
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        if (extraSkip?.has(entry.name)) continue
        if (entry.name.startsWith('.')) continue
        await walk(path.join(dir, entry.name), depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      seen += 1
      if (seen > maxFiles) {
        stopped = true
        return
      }
      const absolutePath = path.join(dir, entry.name)
      const result = await onFile({
        absolutePath,
        relativePath: toPosix(path.relative(root, absolutePath)),
        name: entry.name,
        depth,
      })
      if (result === false) {
        stopped = true
        return
      }
    }
  }

  await walk(root, 0)
}
