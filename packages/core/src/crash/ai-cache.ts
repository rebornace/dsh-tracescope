/**
 * Persist crash AI conclusions under the TraceScope data root so reopen /
 * re-analyze (local) can restore them without calling the model again.
 *
 * Keyed by repo scope + incident id + analysis kind (reproduce | fix).
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { dataRootSync } from '../paths.js'
import { crashRepoKey } from './store.js'
import {
  normalizeCrashAnalysisKind,
  type CrashAnalysisKind,
} from './types.js'

const AI_CACHE_SCHEMA_VERSION = 1

export interface CrashAiAnalysisPayload {
  incidentId: string
  repoKey: string
  aiAnalysis: string
  analysisKind?: CrashAnalysisKind
  /** Optional local-analysis summary at save time (informational). */
  summary?: string
}

export interface CrashAiAnalysisEntry {
  key: string
  savedAt: string
  schemaVersion: number
  payload: CrashAiAnalysisPayload
}

function aiCacheDir(cacheRoot?: string): string {
  return path.join(dataRootSync(cacheRoot), 'crash-ai-cache')
}

function hashKey(parts: string[]): string {
  const normalized = parts.map((p) => p.trim().replace(/\\/g, '/').toLowerCase()).join('\0')
  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 32)
}

/** Stable file key for one repo + incident + analysis kind. */
export function crashAiAnalysisKey(
  repoPath: string,
  incidentId: string,
  kind: CrashAnalysisKind = 'fix',
): string | null {
  const repo = crashRepoKey(repoPath)
  const id = incidentId.trim()
  if (!repo || !id) return null
  return hashKey([`v${AI_CACHE_SCHEMA_VERSION}`, 'crash-ai', repo, id, kind])
}

/** Pre-kind cache key (fix conclusions saved before analysisKind existed). */
function legacyCrashAiAnalysisKey(repoPath: string, incidentId: string): string | null {
  const repo = crashRepoKey(repoPath)
  const id = incidentId.trim()
  if (!repo || !id) return null
  return hashKey([`v${AI_CACHE_SCHEMA_VERSION}`, 'crash-ai', repo, id])
}

async function readEntry(
  key: string,
  cacheRoot?: string,
): Promise<CrashAiAnalysisEntry | null> {
  try {
    const raw = JSON.parse(
      await readFile(path.join(aiCacheDir(cacheRoot), `${key}.json`), 'utf8'),
    ) as CrashAiAnalysisEntry
    if (
      !raw ||
      raw.key !== key ||
      raw.schemaVersion !== AI_CACHE_SCHEMA_VERSION ||
      typeof raw.payload?.aiAnalysis !== 'string' ||
      !raw.payload.aiAnalysis.trim()
    ) {
      return null
    }
    return raw
  } catch {
    return null
  }
}

export async function loadCrashAiAnalysis(
  repoPath: string,
  incidentId: string,
  cacheRoot?: string,
  kind: CrashAnalysisKind = 'fix',
): Promise<CrashAiAnalysisEntry | null> {
  const normalized = normalizeCrashAnalysisKind(kind)
  const key = crashAiAnalysisKey(repoPath, incidentId, normalized)
  if (!key) return null
  const hit = await readEntry(key, cacheRoot)
  if (hit) return hit
  // Legacy files (no kind in key) only apply to the fix path.
  if (normalized === 'fix') {
    const legacy = legacyCrashAiAnalysisKey(repoPath, incidentId)
    if (legacy) return readEntry(legacy, cacheRoot)
  }
  return null
}

export async function saveCrashAiAnalysis(
  repoPath: string,
  incidentId: string,
  aiAnalysis: string,
  options?: { summary?: string; cacheRoot?: string; analysisKind?: CrashAnalysisKind },
): Promise<CrashAiAnalysisEntry | null> {
  const text = aiAnalysis.trim()
  const kind = normalizeCrashAnalysisKind(options?.analysisKind ?? 'fix')
  const key = crashAiAnalysisKey(repoPath, incidentId, kind)
  const repo = crashRepoKey(repoPath)
  const id = incidentId.trim()
  if (!key || !repo || !id || !text) return null
  const dir = aiCacheDir(options?.cacheRoot)
  await mkdir(dir, { recursive: true })
  const entry: CrashAiAnalysisEntry = {
    key,
    savedAt: new Date().toISOString(),
    schemaVersion: AI_CACHE_SCHEMA_VERSION,
    payload: {
      incidentId: id,
      repoKey: repo,
      aiAnalysis: text,
      analysisKind: kind,
      summary: options?.summary?.trim() || undefined,
    },
  }
  await writeFile(path.join(dir, `${key}.json`), `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
  return entry
}

export async function clearCrashAiAnalysis(
  repoPath: string,
  incidentId: string,
  cacheRoot?: string,
  kind?: CrashAnalysisKind,
): Promise<boolean> {
  const kinds: CrashAnalysisKind[] = kind
    ? [normalizeCrashAnalysisKind(kind)]
    : ['reproduce', 'fix']
  let cleared = false
  for (const k of kinds) {
    const key = crashAiAnalysisKey(repoPath, incidentId, k)
    if (!key) continue
    try {
      await unlink(path.join(aiCacheDir(cacheRoot), `${key}.json`))
      cleared = true
    } catch {
      /* missing ok */
    }
  }
  if (!kind || kind === 'fix') {
    const legacy = legacyCrashAiAnalysisKey(repoPath, incidentId)
    if (legacy) {
      try {
        await unlink(path.join(aiCacheDir(cacheRoot), `${legacy}.json`))
        cleared = true
      } catch {
        /* missing ok */
      }
    }
  }
  return cleared
}
