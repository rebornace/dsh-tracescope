/**
 * Local crash inbox — multi-incident disk store for test-time device capture.
 * Writes to a shared bucket under ~/.tracescope/crash-inbox/shared/ so capture
 * and list always agree regardless of whether the UI's code directory is a
 * filesystem path or a remote git URL. Legacy per-repo hash folders are still
 * read (and deletable) for compatibility.
 */
import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { dataRootSync } from '../paths.js'
import {
  applyCrashListQuery,
  incidentToListSummary,
  resolveCrashListPage,
} from './list-query.js'
import type {
  CrashIncident,
  CrashListQuery,
  CrashListResult,
  CrashProviderId,
} from './types.js'

const INBOX_SCHEMA_VERSION = 1
/** Canonical write / primary read scope — independent of repoPath form. */
const SHARED_SCOPE = 'shared'

export type CrashInboxSource = 'android-adb' | 'ios-usb' | 'file-import' | 'legacy-paste'

export interface CrashInboxEntry {
  schemaVersion: number
  capturedAt: string
  source: CrashInboxSource
  incident: CrashIncident
}

export interface AppendInboxOptions {
  source: CrashInboxSource
  cacheRoot?: string
  /** Override generated id. */
  id?: string
}

function inboxRoot(cacheRoot?: string): string {
  return path.join(dataRootSync(cacheRoot), 'crash-inbox')
}

/**
 * Directory used for new writes. `repoPath` is kept for API compatibility but
 * no longer scopes the folder — all captures land in `shared/`.
 */
export function crashInboxDir(_repoPath?: string, cacheRoot?: string): string {
  return path.join(inboxRoot(cacheRoot), SHARED_SCOPE)
}

function newIncidentId(): string {
  return `inbox-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
}

function titleFromStack(stackText: string, fallback: string): string {
  const first = stackText.split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (first) return first.slice(0, 200)
  return fallback
}

function normalizeIncident(
  partial: Partial<CrashIncident> & { stackText: string },
  id: string,
): CrashIncident {
  const stackText = partial.stackText.trim()
  const title =
    (typeof partial.title === 'string' && partial.title.trim()) ||
    titleFromStack(stackText, id)
  const provider: CrashProviderId = 'local'
  const now = new Date().toISOString()
  return {
    id,
    title,
    provider,
    stackText,
    exceptionName: partial.exceptionName,
    appVersion: partial.appVersion,
    buildNumber: partial.buildNumber,
    platform: partial.platform,
    errorKind: partial.errorKind ?? 'crash',
    status: partial.status ?? 'open',
    count: partial.count ?? 1,
    affectedUsers: partial.affectedUsers,
    osVersion: partial.osVersion,
    deviceModel: partial.deviceModel,
    occurredAt: partial.occurredAt ?? now,
    firstSeenAt: partial.firstSeenAt ?? now,
    lastSeenAt: partial.lastSeenAt ?? now,
    rawRef: partial.rawRef,
  }
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

async function readEntryFile(filePath: string): Promise<CrashInboxEntry | null> {
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>
    if (!raw || typeof raw !== 'object') return null
    const incidentRaw = raw.incident
    if (!incidentRaw || typeof incidentRaw !== 'object') return null
    const inc = incidentRaw as Record<string, unknown>
    const id = typeof inc.id === 'string' ? inc.id.trim() : ''
    const stackText = typeof inc.stackText === 'string' ? inc.stackText : ''
    if (!id || !stackText.trim()) return null
    const source =
      raw.source === 'android-adb' ||
      raw.source === 'ios-usb' ||
      raw.source === 'file-import' ||
      raw.source === 'legacy-paste'
        ? raw.source
        : 'file-import'
    const capturedAt =
      typeof raw.capturedAt === 'string' && raw.capturedAt.trim()
        ? raw.capturedAt
        : new Date().toISOString()
    return {
      schemaVersion:
        typeof raw.schemaVersion === 'number' ? raw.schemaVersion : INBOX_SCHEMA_VERSION,
      capturedAt,
      source,
      incident: normalizeIncident(
        {
          ...inc,
          stackText,
          title: typeof inc.title === 'string' ? inc.title : id,
          provider: 'local',
          platform:
            inc.platform === 'android' || inc.platform === 'ios' || inc.platform === 'other'
              ? inc.platform
              : undefined,
          errorKind:
            inc.errorKind === 'crash' ||
            inc.errorKind === 'anr' ||
            inc.errorKind === 'error' ||
            inc.errorKind === 'other'
              ? inc.errorKind
              : 'crash',
          status:
            inc.status === 'open' || inc.status === 'closed' || inc.status === 'other'
              ? inc.status
              : 'open',
        },
        id,
      ),
    }
  } catch {
    return null
  }
}

/** Shared + legacy per-repo hash dirs (24-char hex). */
async function listScopeDirs(cacheRoot?: string): Promise<string[]> {
  const root = inboxRoot(cacheRoot)
  const shared = path.join(root, SHARED_SCOPE)
  const dirs: string[] = [shared]
  let names: string[]
  try {
    names = await readdir(root)
  } catch {
    return dirs
  }
  for (const name of names) {
    if (name === SHARED_SCOPE) continue
    if (/^[a-f0-9]{24}$/i.test(name)) {
      dirs.push(path.join(root, name))
    }
  }
  return dirs
}

async function listEntries(_repoPath: string, cacheRoot?: string): Promise<CrashInboxEntry[]> {
  const dirs = await listScopeDirs(cacheRoot)
  const byId = new Map<string, CrashInboxEntry>()
  for (const dir of dirs) {
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const entry = await readEntryFile(path.join(dir, name))
      if (!entry) continue
      // Prefer shared over legacy when the same id exists in both.
      if (!byId.has(entry.incident.id)) byId.set(entry.incident.id, entry)
    }
  }
  const entries = [...byId.values()]
  entries.sort((a, b) => {
    const ta = Date.parse(a.incident.lastSeenAt || a.capturedAt) || 0
    const tb = Date.parse(b.incident.lastSeenAt || b.capturedAt) || 0
    return tb - ta
  })
  return entries
}

async function findEntryPath(
  id: string,
  cacheRoot?: string,
): Promise<{ dir: string; filePath: string; entry: CrashInboxEntry } | null> {
  const needle = id.trim()
  if (!needle) return null
  const dirs = await listScopeDirs(cacheRoot)
  for (const dir of dirs) {
    const filePath = path.join(dir, `${needle}.json`)
    const entry = await readEntryFile(filePath)
    if (entry) return { dir, filePath, entry }
  }
  return null
}

/** Append a captured / imported crash into the shared inbox. */
export async function appendInboxIncident(
  repoPath: string,
  partial: Partial<CrashIncident> & { stackText: string },
  options: AppendInboxOptions,
): Promise<CrashInboxEntry | null> {
  // repoPath retained for call-site compatibility; storage is shared.
  void repoPath
  const dir = crashInboxDir(undefined, options.cacheRoot)
  const id = (options.id?.trim() || newIncidentId()).trim()
  const incident = normalizeIncident(partial, id)
  const entry: CrashInboxEntry = {
    schemaVersion: INBOX_SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    source: options.source,
    incident,
  }
  await ensureDir(dir)
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify(entry, null, 2), 'utf8')
  return entry
}

export async function getInboxIncident(
  repoPath: string,
  id: string,
  cacheRoot?: string,
): Promise<CrashIncident | null> {
  void repoPath
  const found = await findEntryPath(id, cacheRoot)
  return found?.entry.incident ?? null
}

export async function deleteInboxIncident(
  repoPath: string,
  id: string,
  cacheRoot?: string,
): Promise<boolean> {
  void repoPath
  const found = await findEntryPath(id, cacheRoot)
  if (!found) return false
  try {
    await unlink(found.filePath)
    return true
  } catch {
    return false
  }
}

export async function listInboxIncidents(
  repoPath: string,
  query?: CrashListQuery,
  cacheRoot?: string,
): Promise<CrashListResult> {
  const entries = await listEntries(repoPath, cacheRoot)
  const incidents = applyCrashListQuery(
    entries.map((e) => e.incident),
    query,
  )
  const { page, pageSize } = resolveCrashListPage(query)
  const start = (page - 1) * pageSize
  const slice = incidents.slice(start, start + pageSize)
  return {
    items: slice.map(incidentToListSummary),
    page,
    pageSize,
    total: incidents.length,
    hasMore: start + pageSize < incidents.length,
  }
}

/** Import raw stack / crash file text into the inbox. */
export async function importInboxStack(
  repoPath: string,
  stackText: string,
  options?: {
    title?: string
    platform?: CrashIncident['platform']
    errorKind?: CrashIncident['errorKind']
    deviceModel?: string
    cacheRoot?: string
  },
): Promise<CrashInboxEntry | null> {
  const text = stackText.trim()
  if (!text) return null
  return appendInboxIncident(
    repoPath,
    {
      stackText: text,
      title: options?.title,
      platform: options?.platform ?? 'other',
      errorKind: options?.errorKind ?? 'crash',
      deviceModel: options?.deviceModel,
    },
    { source: 'file-import', cacheRoot: options?.cacheRoot },
  )
}
