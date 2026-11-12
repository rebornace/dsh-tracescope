/**
 * Local crash inbox — multi-incident disk store for test-time device capture.
 * Writes to a shared bucket under ~/.tracescope/crash-inbox/shared/ so capture
 * and list always agree regardless of whether the UI's code directory is a
 * filesystem path or a remote git URL. Legacy per-repo hash folders are still
 * read (and deletable) for compatibility.
 *
 * Retention (documented policy): entries older than INBOX_RETENTION_DAYS, or
 * beyond INBOX_MAX_ENTRIES (oldest first), are pruned on append/list so the
 * local store does not become an unbounded sink. Corrupt JSON is moved to
 * crash-inbox/quarantine/ for recovery instead of being silently dropped.
 */
import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
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

const INBOX_SCHEMA_VERSION = 2
/** Canonical write / primary read scope — independent of repoPath form. */
const SHARED_SCOPE = 'shared'
const QUARANTINE_SCOPE = 'quarantine'

/** Keep local captures this many days (unless deleted earlier). */
export const INBOX_RETENTION_DAYS = 30
/** Soft cap — oldest entries pruned first after age-based cleanup. */
export const INBOX_MAX_ENTRIES = 200

export type CrashInboxSource = 'android-adb' | 'ios-usb' | 'file-import' | 'legacy-paste'

/** How `capturedAt` / incident times were derived. */
export type CrashClockSource = 'host-utc' | 'report' | 'unknown'

export interface CrashCaptureDeviceMeta {
  /** adb serial or iOS UDID. */
  id?: string
  model?: string
  product?: string
  manufacturer?: string
  osVersion?: string
  /** CPU ABI (Android) or equivalent. */
  abi?: string
  /** Friendly device name (iOS). */
  name?: string
  /** OS image / build id when distinct from the app binary. */
  osBuildId?: string
}

export interface CrashInboxEntry {
  schemaVersion: number
  capturedAt: string
  source: CrashInboxSource
  /** Clock used for capturedAt / occurredAt. */
  clockSource: CrashClockSource
  /** Binary identity mirrored from incident.buildId for artifact consumers. */
  buildId?: string
  device?: CrashCaptureDeviceMeta
  incident: CrashIncident
}

export interface AppendInboxOptions {
  source: CrashInboxSource
  cacheRoot?: string
  /** Override generated id. */
  id?: string
  clockSource?: CrashClockSource
  buildId?: string
  device?: CrashCaptureDeviceMeta
  /** Skip retention prune (tests). */
  skipPrune?: boolean
}

export interface InboxRetentionPolicy {
  retentionDays: number
  maxEntries: number
  storagePathHint: string
  uploadsToApm: false
  notes: string[]
}

export interface QuarantinedInboxItem {
  fileName: string
  quarantinedAt: string
  reason: string
  originalFileName: string
  rawPreview?: string
}

interface QuarantineSidecar {
  quarantinedAt: string
  reason: string
  originalFileName: string
  originalDir?: string
  rawPreview?: string
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

export function crashInboxQuarantineDir(cacheRoot?: string): string {
  return path.join(inboxRoot(cacheRoot), QUARANTINE_SCOPE)
}

/** Documented retention policy for Local crash capture artifacts. */
export function getInboxRetentionPolicy(): InboxRetentionPolicy {
  return {
    retentionDays: INBOX_RETENTION_DAYS,
    maxEntries: INBOX_MAX_ENTRIES,
    storagePathHint: '~/.tracescope/crash-inbox/shared/',
    uploadsToApm: false,
    notes: [
      'Captures stay on the machine that recorded them; TraceScope never uploads them to an APM.',
      `Entries older than ${INBOX_RETENTION_DAYS} days are deleted automatically on list/append.`,
      `At most ${INBOX_MAX_ENTRIES} entries are kept; oldest are removed first.`,
      'Corrupt JSON is moved to crash-inbox/quarantine/ instead of being dropped silently.',
      'Delete individual rows from the UI, or remove files under the inbox directory manually.',
    ],
  }
}

function newIncidentId(): string {
  return `inbox-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
}

function titleFromStack(stackText: string, fallback: string): string {
  const first = stackText.split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (first) return first.slice(0, 200)
  return fallback
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t ? t : undefined
}

function normalizeClockSource(value: unknown): CrashClockSource {
  if (value === 'host-utc' || value === 'report' || value === 'unknown') return value
  return 'unknown'
}

function normalizeDeviceMeta(raw: unknown): CrashCaptureDeviceMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const device: CrashCaptureDeviceMeta = {
    id: asOptionalString(o.id),
    model: asOptionalString(o.model),
    product: asOptionalString(o.product),
    manufacturer: asOptionalString(o.manufacturer),
    osVersion: asOptionalString(o.osVersion),
    abi: asOptionalString(o.abi),
    name: asOptionalString(o.name),
    osBuildId: asOptionalString(o.osBuildId),
  }
  return Object.values(device).some(Boolean) ? device : undefined
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
    buildId: partial.buildId,
    packageName: partial.packageName,
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

function parseEntryObject(
  raw: Record<string, unknown>,
): { ok: true; entry: CrashInboxEntry } | { ok: false; reason: string } {
  const incidentRaw = raw.incident
  if (!incidentRaw || typeof incidentRaw !== 'object') {
    return { ok: false, reason: 'missing-incident' }
  }
  const inc = incidentRaw as Record<string, unknown>
  const id = typeof inc.id === 'string' ? inc.id.trim() : ''
  const stackText = typeof inc.stackText === 'string' ? inc.stackText : ''
  if (!id) return { ok: false, reason: 'missing-id' }
  if (!stackText.trim()) return { ok: false, reason: 'missing-stack' }
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
  const device = normalizeDeviceMeta(raw.device)
  const incident = normalizeIncident(
    {
      ...inc,
      stackText,
      title: typeof inc.title === 'string' ? inc.title : id,
      provider: 'local',
      buildId: asOptionalString(inc.buildId) ?? asOptionalString(raw.buildId),
      packageName: asOptionalString(inc.packageName),
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
      deviceModel:
        asOptionalString(inc.deviceModel) ?? device?.model ?? device?.name,
      osVersion: asOptionalString(inc.osVersion) ?? device?.osVersion,
    },
    id,
  )
  const buildId = asOptionalString(raw.buildId) ?? incident.buildId
  return {
    ok: true,
    entry: {
      schemaVersion:
        typeof raw.schemaVersion === 'number' ? raw.schemaVersion : INBOX_SCHEMA_VERSION,
      capturedAt,
      source,
      clockSource: normalizeClockSource(raw.clockSource ?? 'host-utc'),
      buildId,
      device,
      incident: {
        ...incident,
        buildId: incident.buildId ?? buildId,
      },
    },
  }
}

async function quarantineCorruptFile(
  dir: string,
  fileName: string,
  reason: string,
  rawText: string,
  cacheRoot?: string,
): Promise<void> {
  const quarantineDir = crashInboxQuarantineDir(cacheRoot)
  await ensureDir(quarantineDir)
  const stamp = Date.now().toString(36)
  const base = fileName.replace(/\.json$/i, '')
  const destName = `${base}.${stamp}.corrupt`
  const from = path.join(dir, fileName)
  const to = path.join(quarantineDir, destName)
  try {
    await rename(from, to)
  } catch {
    // If rename fails (cross-device), best-effort copy+unlink via write of preview only.
    try {
      await writeFile(to, rawText, 'utf8')
      await unlink(from)
    } catch {
      return
    }
  }
  const sidecar: QuarantineSidecar = {
    quarantinedAt: new Date().toISOString(),
    reason,
    originalFileName: fileName,
    originalDir: dir,
    rawPreview: rawText.slice(0, 2_000),
  }
  try {
    await writeFile(
      path.join(quarantineDir, `${destName}.meta.json`),
      JSON.stringify(sidecar, null, 2),
      'utf8',
    )
  } catch {
    /* ignore sidecar failures */
  }
}

async function readEntryFile(
  filePath: string,
  options?: { quarantineOnError?: boolean; cacheRoot?: string },
): Promise<CrashInboxEntry | null> {
  let rawText = ''
  try {
    rawText = await readFile(filePath, 'utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    if (options?.quarantineOnError) {
      await quarantineCorruptFile(
        path.dirname(filePath),
        path.basename(filePath),
        'invalid-json',
        rawText,
        options.cacheRoot,
      )
    }
    return null
  }
  if (!parsed || typeof parsed !== 'object') {
    if (options?.quarantineOnError) {
      await quarantineCorruptFile(
        path.dirname(filePath),
        path.basename(filePath),
        'non-object',
        rawText,
        options.cacheRoot,
      )
    }
    return null
  }
  const result = parseEntryObject(parsed as Record<string, unknown>)
  if (!result.ok) {
    if (options?.quarantineOnError) {
      await quarantineCorruptFile(
        path.dirname(filePath),
        path.basename(filePath),
        result.reason,
        rawText,
        options.cacheRoot,
      )
    }
    return null
  }
  return result.entry
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
    if (name === SHARED_SCOPE || name === QUARANTINE_SCOPE) continue
    if (/^[a-f0-9]{24}$/i.test(name)) {
      dirs.push(path.join(root, name))
    }
  }
  return dirs
}

function entryAgeMs(entry: CrashInboxEntry): number {
  return (
    Date.parse(entry.incident.lastSeenAt || entry.capturedAt) ||
    Date.parse(entry.capturedAt) ||
    0
  )
}

async function pruneInboxEntries(
  entries: CrashInboxEntry[],
  cacheRoot?: string,
): Promise<CrashInboxEntry[]> {
  const now = Date.now()
  const maxAgeMs = INBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const kept: CrashInboxEntry[] = []
  for (const entry of entries) {
    const age = entryAgeMs(entry)
    if (age > 0 && now - age > maxAgeMs) {
      await deleteInboxIncident('', entry.incident.id, cacheRoot)
      continue
    }
    kept.push(entry)
  }
  if (kept.length <= INBOX_MAX_ENTRIES) return kept
  const sorted = [...kept].sort((a, b) => entryAgeMs(a) - entryAgeMs(b))
  const overflow = sorted.slice(0, sorted.length - INBOX_MAX_ENTRIES)
  for (const entry of overflow) {
    await deleteInboxIncident('', entry.incident.id, cacheRoot)
  }
  const overflowIds = new Set(overflow.map((e) => e.incident.id))
  return kept.filter((e) => !overflowIds.has(e.incident.id))
}

async function listEntries(
  _repoPath: string,
  cacheRoot?: string,
  options?: { prune?: boolean },
): Promise<CrashInboxEntry[]> {
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
      const entry = await readEntryFile(path.join(dir, name), {
        quarantineOnError: true,
        cacheRoot,
      })
      if (!entry) continue
      // Prefer shared over legacy when the same id exists in both.
      if (!byId.has(entry.incident.id)) byId.set(entry.incident.id, entry)
    }
  }
  let entries = [...byId.values()]
  entries.sort((a, b) => entryAgeMs(b) - entryAgeMs(a))
  if (options?.prune !== false) {
    entries = await pruneInboxEntries(entries, cacheRoot)
    entries.sort((a, b) => entryAgeMs(b) - entryAgeMs(a))
  }
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
  const device = options.device
  const incident = normalizeIncident(
    {
      ...partial,
      buildId: partial.buildId ?? options.buildId,
      deviceModel: partial.deviceModel ?? device?.model ?? device?.name,
      osVersion: partial.osVersion ?? device?.osVersion,
    },
    id,
  )
  const buildId = options.buildId ?? incident.buildId
  const entry: CrashInboxEntry = {
    schemaVersion: INBOX_SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    source: options.source,
    clockSource: options.clockSource ?? 'host-utc',
    buildId,
    device,
    incident: {
      ...incident,
      buildId: incident.buildId ?? buildId,
    },
  }
  await ensureDir(dir)
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify(entry, null, 2), 'utf8')
  if (!options.skipPrune) {
    await listEntries(repoPath, options.cacheRoot, { prune: true })
  }
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

/** Full inbox artifact (includes clockSource / device meta). */
export async function getInboxEntry(
  repoPath: string,
  id: string,
  cacheRoot?: string,
): Promise<CrashInboxEntry | null> {
  void repoPath
  const found = await findEntryPath(id, cacheRoot)
  return found?.entry ?? null
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
  const entries = await listEntries(repoPath, cacheRoot, { prune: true })
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
    buildId?: string
    packageName?: string
    device?: CrashCaptureDeviceMeta
    clockSource?: CrashClockSource
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
      buildId: options?.buildId,
      packageName: options?.packageName,
    },
    {
      source: 'file-import',
      cacheRoot: options?.cacheRoot,
      clockSource: options?.clockSource ?? 'host-utc',
      buildId: options?.buildId,
      device: options?.device,
    },
  )
}

export async function listQuarantinedInbox(
  cacheRoot?: string,
): Promise<QuarantinedInboxItem[]> {
  const dir = crashInboxQuarantineDir(cacheRoot)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const items: QuarantinedInboxItem[] = []
  for (const name of names) {
    if (!name.endsWith('.corrupt')) continue
    let sidecar: QuarantineSidecar | undefined
    try {
      const raw = await readFile(path.join(dir, `${name}.meta.json`), 'utf8')
      sidecar = JSON.parse(raw) as QuarantineSidecar
    } catch {
      sidecar = undefined
    }
    items.push({
      fileName: name,
      quarantinedAt: sidecar?.quarantinedAt || '',
      reason: sidecar?.reason || 'unknown',
      originalFileName: sidecar?.originalFileName || name,
      rawPreview: sidecar?.rawPreview,
    })
  }
  items.sort((a, b) => (b.quarantinedAt || '').localeCompare(a.quarantinedAt || ''))
  return items
}

/**
 * Attempt to recover a quarantined capture into a new inbox entry.
 * Prefers valid JSON incident.stackText; otherwise treats the raw file as stack text.
 */
export async function recoverQuarantinedInboxEntry(
  repoPath: string,
  corruptFileName: string,
  cacheRoot?: string,
): Promise<{ ok: true; entry: CrashInboxEntry } | { ok: false; error: string }> {
  const name = corruptFileName.trim()
  if (!name.endsWith('.corrupt')) {
    return { ok: false, error: 'Expected a .corrupt quarantine file name' }
  }
  const dir = crashInboxQuarantineDir(cacheRoot)
  const filePath = path.join(dir, name)
  let rawText = ''
  try {
    rawText = await readFile(filePath, 'utf8')
  } catch {
    return { ok: false, error: `Quarantined file not found: ${name}` }
  }

  let partial: (Partial<CrashIncident> & { stackText: string }) | null = null
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>
    if (parsed && typeof parsed === 'object') {
      const incident =
        parsed.incident && typeof parsed.incident === 'object'
          ? (parsed.incident as Record<string, unknown>)
          : parsed
      const stackText =
        typeof incident.stackText === 'string'
          ? incident.stackText
          : typeof parsed.stackText === 'string'
            ? parsed.stackText
            : ''
      if (stackText.trim()) {
        partial = {
          stackText,
          title: asOptionalString(incident.title),
          exceptionName: asOptionalString(incident.exceptionName),
          appVersion: asOptionalString(incident.appVersion),
          buildNumber: asOptionalString(incident.buildNumber),
          buildId: asOptionalString(incident.buildId) ?? asOptionalString(parsed.buildId),
          packageName: asOptionalString(incident.packageName),
          platform:
            incident.platform === 'android' ||
            incident.platform === 'ios' ||
            incident.platform === 'other'
              ? incident.platform
              : 'other',
          errorKind:
            incident.errorKind === 'crash' ||
            incident.errorKind === 'anr' ||
            incident.errorKind === 'error' ||
            incident.errorKind === 'other'
              ? incident.errorKind
              : 'crash',
          deviceModel: asOptionalString(incident.deviceModel),
          osVersion: asOptionalString(incident.osVersion),
          rawRef: asOptionalString(incident.rawRef) ?? `recovered:${name}`,
        }
      }
    }
  } catch {
    /* fall through to raw-text recovery */
  }

  if (!partial) {
    const text = rawText.trim()
    if (!text) return { ok: false, error: 'Quarantined file is empty — cannot recover' }
    partial = {
      stackText: text.slice(0, 200_000),
      title: `Recovered capture (${name})`.slice(0, 200),
      platform: 'other',
      errorKind: 'crash',
      rawRef: `recovered:${name}`,
    }
  }

  const entry = await appendInboxIncident(repoPath, partial, {
    source: 'file-import',
    cacheRoot,
    clockSource: 'unknown',
    buildId: partial.buildId,
    skipPrune: true,
  })
  if (!entry) return { ok: false, error: 'Failed to write recovered inbox entry' }

  try {
    await unlink(filePath)
  } catch {
    /* keep quarantine file if unlink fails */
  }
  try {
    await unlink(path.join(dir, `${name}.meta.json`))
  } catch {
    /* ignore */
  }
  return { ok: true, entry }
}

/** Delete all quarantined corrupt captures (and sidecars). */
export async function purgeQuarantinedInbox(cacheRoot?: string): Promise<number> {
  const dir = crashInboxQuarantineDir(cacheRoot)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return 0
  }
  let n = 0
  for (const name of names) {
    try {
      await unlink(path.join(dir, name))
      n += 1
    } catch {
      /* ignore */
    }
  }
  return n
}
