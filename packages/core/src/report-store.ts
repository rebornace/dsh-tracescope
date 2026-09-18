import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  normalizeReportAttachments,
  removeReportAttachmentsDir,
} from './attachments.js'
import { ensureUniqueScopeItemIds } from './scope-ids.js'
import { normalizeTesterScreenshots } from './screenshots.js'
import type { ImpactReport, ScopeItem } from './types.js'

export interface StoredHandtestReport {
  key: string
  /** Unique history entry id (also used as history filename stem). */
  id: string
  /** User-facing repo input (path or remote URL). */
  repoInput: string
  baseCommit: string
  headCommit: string
  source: 'model' | 'deterministic'
  savedAt: string
  report: ImpactReport
}

export interface HandtestHistorySummary {
  id: string
  key: string
  repoInput: string
  baseCommit: string
  headCommit: string
  source: 'model' | 'deterministic'
  savedAt: string
  directCount: number
  rippleCount: number
  modelEnriched: boolean
}

function tracescopeRoot(cacheRoot?: string): string {
  return cacheRoot ?? path.join(os.homedir(), '.tracescope')
}

function reportsDir(cacheRoot?: string): string {
  return path.join(tracescopeRoot(cacheRoot), 'reports')
}

function historyDir(cacheRoot?: string): string {
  return path.join(reportsDir(cacheRoot), 'history')
}

function latestFile(key: string, cacheRoot?: string): string {
  return path.join(reportsDir(cacheRoot), `${key}.json`)
}

function historyFile(id: string, cacheRoot?: string): string {
  return path.join(historyDir(cacheRoot), `${id}.json`)
}

function indexFile(cacheRoot?: string): string {
  return path.join(reportsDir(cacheRoot), 'history-index.json')
}

/** Stable key for a comparison pair (repo + two commits). */
export function handtestReportKey(
  repoInput: string,
  baseCommit: string,
  headCommit: string,
): string {
  const normalized = [
    repoInput.trim().replace(/\\/g, '/').toLowerCase(),
    baseCommit.trim().toLowerCase(),
    headCommit.trim().toLowerCase(),
  ].join('\0')
  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 32)
}

function isScopeStatus(value: unknown): value is ScopeItem['status'] {
  return value === 'pending' || value === 'pass' || value === 'fail' || value === 'skip'
}

function isImpactReport(value: unknown): value is ImpactReport {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    typeof r.repoPath === 'string' &&
    typeof r.baseCommit === 'string' &&
    typeof r.headCommit === 'string' &&
    Array.isArray(r.direct) &&
    Array.isArray(r.ripple)
  )
}

function toSummary(stored: StoredHandtestReport): HandtestHistorySummary {
  return {
    id: stored.id,
    key: stored.key,
    repoInput: stored.repoInput,
    baseCommit: stored.baseCommit,
    headCommit: stored.headCommit,
    source: stored.source,
    savedAt: stored.savedAt,
    directCount: stored.report.direct?.length ?? 0,
    rippleCount: stored.report.ripple?.length ?? 0,
    modelEnriched: Boolean(stored.report.modelEnriched),
  }
}

async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

async function loadIndex(cacheRoot?: string): Promise<HandtestHistorySummary[]> {
  const raw = await readJsonFile<HandtestHistorySummary[]>(indexFile(cacheRoot))
  return Array.isArray(raw) ? raw : []
}

async function writeIndex(entries: HandtestHistorySummary[], cacheRoot?: string): Promise<void> {
  await mkdir(reportsDir(cacheRoot), { recursive: true })
  const sorted = [...entries].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  await writeFile(indexFile(cacheRoot), `${JSON.stringify(sorted, null, 2)}\n`, 'utf8')
}

function normalizeStored(raw: unknown): StoredHandtestReport | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (!isImpactReport(obj.report)) return null
  const report = obj.report
  const key =
    typeof obj.key === 'string'
      ? obj.key
      : handtestReportKey(String(obj.repoInput ?? report.repoPath), report.baseCommit, report.headCommit)
  const id = typeof obj.id === 'string' && obj.id ? obj.id : `legacy-${key}`
  const source = obj.source === 'model' || obj.source === 'deterministic' ? obj.source : report.modelEnriched ? 'model' : 'deterministic'
  return {
    key,
    id,
    repoInput: typeof obj.repoInput === 'string' ? obj.repoInput : report.repoPath,
    baseCommit: typeof obj.baseCommit === 'string' ? obj.baseCommit : report.baseCommit,
    headCommit: typeof obj.headCommit === 'string' ? obj.headCommit : report.headCommit,
    source,
    savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : report.generatedAt || new Date().toISOString(),
    report: ensureUniqueScopeItemIds({
      ...report,
      attachments: normalizeReportAttachments(
        (report as ImpactReport).attachments,
      ),
    }),
  }
}

/**
 * Persist a hand-test report as the latest for its pair.
 * Same comparison pair (repo + base + head) keeps a single history row — regenerating replaces it.
 */
export async function saveHandtestReport(
  input: {
    repoInput: string
    baseCommit: string
    headCommit: string
    report: ImpactReport
    source?: 'model' | 'deterministic'
    /** When true, only refresh latest (e.g. checklist status); keep the same history id. */
    updateLatestOnly?: boolean
  },
  cacheRoot?: string,
): Promise<StoredHandtestReport> {
  const key = handtestReportKey(input.repoInput, input.baseCommit, input.headCommit)
  const existingLatest = normalizeStored(await readJsonFile(latestFile(key, cacheRoot)))
  // One history slot per comparison pair: reuse id so regenerating overwrites, never duplicates.
  const id = existingLatest?.id ?? randomUUID()
  const savedAt = new Date().toISOString()
  const uniqued = ensureUniqueScopeItemIds(input.report)
  // Preserve task-level attachments across regenerate/status patches unless explicitly provided.
  const attachments = Array.isArray(input.report.attachments)
    ? normalizeReportAttachments(input.report.attachments)
    : normalizeReportAttachments(existingLatest?.report.attachments)
  const report: ImpactReport = {
    ...uniqued,
    ...(attachments.length ? { attachments } : { attachments: undefined }),
  }
  if (!attachments.length) delete report.attachments
  const stored: StoredHandtestReport = {
    key,
    id,
    repoInput: input.repoInput,
    baseCommit: input.baseCommit,
    headCommit: input.headCommit,
    source: input.source ?? (input.report.modelEnriched ? 'model' : 'deterministic'),
    savedAt,
    report,
  }

  await mkdir(reportsDir(cacheRoot), { recursive: true })
  await writeFile(latestFile(key, cacheRoot), `${JSON.stringify(stored, null, 2)}\n`, 'utf8')

  await mkdir(historyDir(cacheRoot), { recursive: true })
  await writeFile(historyFile(id, cacheRoot), `${JSON.stringify(stored, null, 2)}\n`, 'utf8')

  const index = await loadIndex(cacheRoot)
  const obsoleteIds = index.filter((e) => e.key === key && e.id !== id).map((e) => e.id)
  for (const obsoleteId of obsoleteIds) {
    try {
      await unlink(historyFile(obsoleteId, cacheRoot))
    } catch {
      /* ignore missing */
    }
  }
  const next = index.filter((e) => e.key !== key)
  next.unshift(toSummary(stored))
  await writeIndex(next.slice(0, 500), cacheRoot)

  return stored
}

/** Load the latest saved report for the same comparison pair. */
export async function loadHandtestReport(
  repoInput: string,
  baseCommit: string,
  headCommit: string,
  cacheRoot?: string,
): Promise<StoredHandtestReport | null> {
  const key = handtestReportKey(repoInput, baseCommit, headCommit)
  return normalizeStored(await readJsonFile(latestFile(key, cacheRoot)))
}

/** Load one history snapshot by id (latest for that pair after regenerations). */
export async function loadHandtestHistoryEntry(
  id: string,
  cacheRoot?: string,
): Promise<StoredHandtestReport | null> {
  if (!id) return null
  const fromHistory = normalizeStored(await readJsonFile(historyFile(id, cacheRoot)))
  if (fromHistory) return fromHistory
  // Fallback: scan latest files for legacy ids.
  try {
    const files = await readdir(reportsDir(cacheRoot))
    for (const name of files) {
      if (!name.endsWith('.json') || name === 'history-index.json') continue
      const stored = normalizeStored(await readJsonFile(path.join(reportsDir(cacheRoot), name)))
      if (stored?.id === id) return stored
    }
  } catch {
    /* ignore */
  }
  return null
}

/** List history summaries, newest first. Optionally filter by repo input substring. */
export async function listHandtestHistory(
  options: { repoInput?: string; limit?: number } = {},
  cacheRoot?: string,
): Promise<HandtestHistorySummary[]> {
  let index = await loadIndex(cacheRoot)
  if (index.length === 0) {
    // Bootstrap index from existing latest files (upgrade path).
    try {
      await mkdir(reportsDir(cacheRoot), { recursive: true })
      const files = await readdir(reportsDir(cacheRoot))
      const bootstrapped: HandtestHistorySummary[] = []
      for (const name of files) {
        if (!name.endsWith('.json') || name === 'history-index.json') continue
        if (name === 'history') continue
        const stored = normalizeStored(await readJsonFile(path.join(reportsDir(cacheRoot), name)))
        if (stored) bootstrapped.push(toSummary(stored))
      }
      if (bootstrapped.length) {
        await writeIndex(bootstrapped, cacheRoot)
        index = bootstrapped
      }
    } catch {
      /* ignore */
    }
  }

  const repoFilter = options.repoInput?.trim().replace(/\\/g, '/').toLowerCase()
  let rows = index
  if (repoFilter) {
    rows = rows.filter((e) => e.repoInput.replace(/\\/g, '/').toLowerCase().includes(repoFilter))
  }
  // Dedupe by comparison key (keep newest) for indexes written before one-per-pair policy.
  const seenKeys = new Set<string>()
  const deduped: HandtestHistorySummary[] = []
  for (const row of [...rows].sort((a, b) => b.savedAt.localeCompare(a.savedAt))) {
    if (seenKeys.has(row.key)) continue
    seenKeys.add(row.key)
    deduped.push(row)
  }
  const limit = Math.min(200, Math.max(1, options.limit ?? 50))
  return deduped.slice(0, limit)
}

/** Delete one history entry and its latest file for the same comparison pair. */
export async function deleteHandtestHistory(
  id: string,
  cacheRoot?: string,
): Promise<{ deleted: boolean; key: string | null }> {
  if (!id) return { deleted: false, key: null }
  const stored = await loadHandtestHistoryEntry(id, cacheRoot)
  const index = await loadIndex(cacheRoot)
  const fromIndex = index.find((e) => e.id === id)
  const key = stored?.key ?? fromIndex?.key ?? null

  let removed = false
  try {
    await unlink(historyFile(id, cacheRoot))
    removed = true
  } catch {
    /* may already be gone */
  }

  if (key) {
    try {
      await unlink(latestFile(key, cacheRoot))
      removed = true
    } catch {
      /* ignore */
    }
    await removeReportAttachmentsDir(key, cacheRoot)
  }

  const next = index.filter((e) => e.id !== id && (key ? e.key !== key : true))
  if (next.length !== index.length) {
    await writeIndex(next, cacheRoot)
    removed = true
  }

  return { deleted: removed, key }
}

/** Update one checklist item status (and optional tester note) in the latest report. */
export async function patchHandtestItemStatus(
  input: {
    repoInput: string
    baseCommit: string
    headCommit: string
    itemId: string
    status: ScopeItem['status']
    /** Prefer precise targeting when ids may collide in older reports. */
    listKind?: 'direct' | 'ripple'
    itemIndex?: number
    /** When status is fail, optional note for developers; cleared for other statuses unless keepNote. */
    testerNote?: string
    /**
     * When status is fail: pass an array to replace screenshots.
     * Omit to leave unchanged; pass [] to clear.
     */
    testerScreenshots?: unknown
  },
  cacheRoot?: string,
): Promise<StoredHandtestReport | null> {
  const existing = await loadHandtestReport(
    input.repoInput,
    input.baseCommit,
    input.headCommit,
    cacheRoot,
  )
  if (!existing) return null
  if (!isScopeStatus(input.status)) throw new Error('非法 status')

  // Uniquify first so id-based fallback never patches multiple cards.
  let report = ensureUniqueScopeItemIds(existing.report)

  const patchOne = (item: ScopeItem): ScopeItem => {
    const next: ScopeItem = { ...item, status: input.status }
    if (input.status === 'fail') {
      if (typeof input.testerNote === 'string') {
        const trimmed = input.testerNote.trim()
        if (trimmed) next.testerNote = trimmed.slice(0, 2000)
        else delete next.testerNote
      }
      if (input.testerScreenshots !== undefined) {
        const shots = normalizeTesterScreenshots(input.testerScreenshots)
        if (shots.length) next.testerScreenshots = shots
        else delete next.testerScreenshots
      }
    } else {
      delete next.testerNote
      delete next.testerScreenshots
    }
    return next
  }

  const useIndex =
    (input.listKind === 'direct' || input.listKind === 'ripple') &&
    typeof input.itemIndex === 'number' &&
    Number.isInteger(input.itemIndex) &&
    input.itemIndex >= 0

  if (useIndex) {
    const kind = input.listKind!
    const list = [...report[kind]]
    if (input.itemIndex! < list.length) {
      list[input.itemIndex!] = patchOne(list[input.itemIndex!]!)
      report = { ...report, [kind]: list }
    }
  } else {
    report = {
      ...report,
      direct: report.direct.map((item) => (item.id === input.itemId ? patchOne(item) : item)),
      ripple: report.ripple.map((item) => (item.id === input.itemId ? patchOne(item) : item)),
    }
  }

  return saveHandtestReport(
    {
      repoInput: existing.repoInput,
      baseCommit: existing.baseCommit,
      headCommit: existing.headCommit,
      report,
      source: existing.source,
      updateLatestOnly: true,
    },
    cacheRoot,
  )
}
