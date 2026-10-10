import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { SKIP_DIR_NAMES } from '../skip-paths.js'
import type { ParsedStack } from './parse-stack.js'

export interface RepoStackHit {
  path: string
  reason: string
  symbol?: string
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
        const list = index.get(ent.name)
        if (list) {
          list.push(full)
        } else {
          index.set(ent.name, [full])
        }
      }
    }
  }

  await walk(repoRoot)
  return index
}

function sortedCandidates(candidates: string[], className?: string): string[] {
  return [...candidates].sort(
    (a, b) => classPathScore(b, className) - classPathScore(a, className),
  )
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
  const basenameIndex = await buildBasenameIndex(root)
  const hits: RepoStackHit[] = []
  const seenPaths = new Set<string>()

  for (const frame of parsed.frames) {
    if (hits.length >= limit) break
    const fileName = frame.fileName
    if (!fileName) continue

    const candidates = basenameIndex.get(fileName)
    if (!candidates?.length) continue

    const ranked = sortedCandidates(candidates, frame.className)
    let matched: string | undefined
    for (const candidate of ranked) {
      if (!seenPaths.has(candidate)) {
        matched = candidate
        break
      }
    }
    if (!matched) continue

    seenPaths.add(matched)
    const score = classPathScore(matched, frame.className)
    hits.push({
      path: matched,
      reason: score > 0 ? 'fileName+classPath' : 'fileName',
      symbol: frame.method,
    })
  }

  return hits
}
