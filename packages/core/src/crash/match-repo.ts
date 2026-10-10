import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { ParsedStack } from './parse-stack.js'

const SKIP_DIR_NAMES = new Set(['node_modules', 'Pods', '.git'])

export interface RepoStackHit {
  path: string
  reason: string
  symbol?: string
}

function shouldSkipDir(name: string): boolean {
  return SKIP_DIR_NAMES.has(name)
}

async function collectFilesByBasename(
  dir: string,
  basename: string,
  out: string[],
): Promise<void> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (!shouldSkipDir(ent.name)) {
        await collectFilesByBasename(full, basename, out)
      }
    } else if (ent.isFile() && ent.name === basename) {
      out.push(full)
    }
  }
}

function classPathScore(filePath: string, className?: string): number {
  if (!className) return 0
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  let score = 0
  for (const segment of className.split('.')) {
    if (segment && normalized.includes(segment.toLowerCase())) {
      score += 1
    }
  }
  return score
}

/**
 * Map parsed stack frames to source files under `repoRoot` by exact file name.
 */
export async function matchStackToRepo(
  repoRoot: string,
  parsed: ParsedStack,
  limit: number,
): Promise<RepoStackHit[]> {
  const root = path.resolve(repoRoot)
  const hits: RepoStackHit[] = []
  const seenPaths = new Set<string>()

  for (const frame of parsed.frames) {
    if (hits.length >= limit) break
    const fileName = frame.fileName
    if (!fileName) continue

    const candidates: string[] = []
    await collectFilesByBasename(root, fileName, candidates)
    if (candidates.length === 0) continue

    candidates.sort(
      (a, b) => classPathScore(b, frame.className) - classPathScore(a, frame.className),
    )

    const best = candidates[0]
    if (!best || seenPaths.has(best)) continue
    seenPaths.add(best)

    const score = classPathScore(best, frame.className)
    hits.push({
      path: best,
      reason: score > 0 ? 'fileName+classPath' : 'fileName',
      symbol: frame.method,
    })
  }

  return hits
}
