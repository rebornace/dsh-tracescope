/**
 * On-disk cache for UI visual-testing results.
 *
 * Re-running the whole-file scan or a high-fidelity comparison for the same
 * design + code is expensive (many Figma requests, tree building). Both kinds
 * of results are persisted under the TraceScope data root and keyed by their
 * inputs, so a repeat visit loads instantly. The user can always force a
 * regenerate to bypass the cache.
 *
 * NOTE: the payload may embed short-lived Figma-rendered image URLs (the S3
 * links last ~30 days). The structural trees stay valid; if an image link has
 * expired the user can force a regenerate to refresh the rasters.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { dataRootSync } from './paths.js'

/**
 * Version of the visual render/compare pipeline whose output the cache stores.
 * Bump this whenever the design/code rendering or compare logic changes in a
 * way that makes previously cached payloads stale (e.g. fixing corner-radius
 * or icon extraction). Old entries are then never matched and get replaced.
 */
export const VISUAL_CACHE_SCHEMA_VERSION = 7

function visualDir(cacheRoot?: string): string {
  return path.join(dataRootSync(cacheRoot), 'visual-cache')
}

function scanDir(cacheRoot?: string): string {
  return path.join(visualDir(cacheRoot), 'scan')
}

function hifiDir(cacheRoot?: string): string {
  return path.join(visualDir(cacheRoot), 'hifi')
}

function findingsDir(cacheRoot?: string): string {
  return path.join(visualDir(cacheRoot), 'findings')
}

function rematchDir(cacheRoot?: string): string {
  return path.join(visualDir(cacheRoot), 'rematch')
}

function hashKey(parts: string[]): string {
  const normalized = parts.map((p) => p.trim().replace(/\\/g, '/').toLowerCase()).join('\0')
  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 32)
}

/**
 * Build a stable fingerprint over the CONTENT (plus mtime/size) of the given
 * files, usually the entry layout and its full dependency closure. Missing or
 * unreadable files are skipped rather than failing the compare. Any change to
 * a relevant source file changes the fingerprint and therefore the cache key.
 */
export async function fingerprintFiles(files: string[]): Promise<string> {
  const sorted = [...new Set(files.map((f) => f.trim()).filter(Boolean))].sort((a, b) =>
    a.replace(/\\/g, '/').toLowerCase() < b.replace(/\\/g, '/').toLowerCase() ? -1 : 1,
  )
  const hash = createHash('sha256')
  for (const file of sorted) {
    try {
      const s = await stat(file)
      if (!s.isFile()) continue
      const content = await readFile(file)
      hash.update(path.basename(file)).update('\0')
      hash.update(String(s.size)).update(':').update(String(s.mtimeMs)).update('\0')
      hash.update(content).update('\n')
    } catch {
      /* missing/unreadable: contributes nothing */
    }
  }
  return hash.digest('hex').slice(0, 24)
}

/** Stable key for a whole-file scan (code location + Figma file). */
export function visualScanKey(repoInput: string, fileKey: string, focusNodeId = ''): string {
  if (focusNodeId.trim()) {
    return hashKey([
      'v' + VISUAL_CACHE_SCHEMA_VERSION,
      repoInput,
      fileKey,
      'focus',
      focusNodeId.trim(),
    ])
  }
  return hashKey(['v' + VISUAL_CACHE_SCHEMA_VERSION, repoInput, fileKey])
}

/**
 * Stable key for one page's high-fidelity comparison. `sourceFingerprint` is
 * an optional hash of the entry layout + its dependency closure; passing it
 * makes the cache miss as soon as any relevant source file changes.
 */
export function visualHifiKey(
  repoInput: string,
  fileKey: string,
  nodeId: string,
  relativePath: string,
  sourceFingerprint = '',
): string {
  return hashKey([
    'v' + VISUAL_CACHE_SCHEMA_VERSION,
    repoInput,
    fileKey,
    nodeId,
    relativePath,
    sourceFingerprint,
  ])
}

/**
 * Stable key for one page's AI review findings. Versioned with the schema but
 * not with the source fingerprint: findings are a review artifact that should
 * survive a code change until the model republishes.
 */
export function visualFindingsKey(
  repoInput: string,
  fileKey: string,
  nodeId: string,
  relativePath: string,
): string {
  return hashKey([
    'v' + VISUAL_CACHE_SCHEMA_VERSION,
    repoInput,
    fileKey,
    nodeId,
    relativePath,
  ])
}

/**
 * Stable key for one design page's AI file-rematch picks. Survives restart so
 * users do not need to re-chat for the same design↔file mapping.
 */
export function visualRematchKey(repoInput: string, fileKey: string, designId: string): string {
  return hashKey(['v' + VISUAL_CACHE_SCHEMA_VERSION, 'rematch', repoInput, fileKey, designId])
}

export interface CachedEntry<T> {
  key: string
  savedAt: string
  payload: T
}

async function readJson<T>(file: string): Promise<CachedEntry<T> | null> {
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as CachedEntry<T>
    if (!raw || typeof raw.key !== 'string' || raw.payload === undefined) return null
    return raw
  } catch {
    return null
  }
}

async function writeJson<T>(dir: string, key: string, payload: T): Promise<void> {
  await mkdir(dir, { recursive: true })
  const entry: CachedEntry<T> = { key, savedAt: new Date().toISOString(), payload }
  await writeFile(path.join(dir, `${key}.json`), `${JSON.stringify(entry)}\n`, 'utf8')
}

/** Load a cached whole-file scan, or null when absent. */
export async function loadVisualScan<T>(
  key: string,
  cacheRoot?: string,
): Promise<CachedEntry<T> | null> {
  return await readJson<T>(path.join(scanDir(cacheRoot), `${key}.json`))
}

/** Persist a whole-file scan. */
export async function saveVisualScan<T>(
  key: string,
  payload: T,
  cacheRoot?: string,
): Promise<void> {
  await writeJson(scanDir(cacheRoot), key, payload)
}

/** Load a cached high-fidelity comparison, or null when absent. */
export async function loadVisualHifi<T>(
  key: string,
  cacheRoot?: string,
): Promise<CachedEntry<T> | null> {
  return await readJson<T>(path.join(hifiDir(cacheRoot), `${key}.json`))
}

/** Persist a high-fidelity comparison. */
export async function saveVisualHifi<T>(
  key: string,
  payload: T,
  cacheRoot?: string,
): Promise<void> {
  await writeJson(hifiDir(cacheRoot), key, payload)
}

/** Load persisted AI review findings for one page, or null when absent. */
export async function loadVisualFindings<T>(
  key: string,
  cacheRoot?: string,
): Promise<CachedEntry<T> | null> {
  return await readJson<T>(path.join(findingsDir(cacheRoot), `${key}.json`))
}

/** Persist AI review findings for one page. */
export async function saveVisualFindings<T>(
  key: string,
  payload: T,
  cacheRoot?: string,
): Promise<void> {
  await writeJson(findingsDir(cacheRoot), key, payload)
}

/** Load persisted AI rematch picks for one design page, or null when absent. */
export async function loadVisualRematch<T>(
  key: string,
  cacheRoot?: string,
): Promise<CachedEntry<T> | null> {
  return await readJson<T>(path.join(rematchDir(cacheRoot), `${key}.json`))
}

/** Persist AI rematch picks for one design page. */
export async function saveVisualRematch<T>(
  key: string,
  payload: T,
  cacheRoot?: string,
): Promise<void> {
  await writeJson(rematchDir(cacheRoot), key, payload)
}
