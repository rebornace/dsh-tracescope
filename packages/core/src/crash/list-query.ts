/**
 * Crash list query parsing and local filtering (shared by Host + Umeng provider).
 */
import type {
  CrashIncident,
  CrashIncidentSummary,
  CrashListQuery,
  CrashListSortField,
  CrashTimeRangePreset,
} from './types.js'

export const DEFAULT_CRASH_LIST_PAGE_SIZE = 20
export const MAX_CRASH_LIST_PAGE_SIZE = 50

const TIME_RANGE_PRESETS = new Set<CrashTimeRangePreset>(['24h', '7d', '30d', '90d', 'custom'])

function clampPage(raw: unknown, fallback = 1): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.floor(n)
}

function clampPageSize(raw: unknown, fallback = DEFAULT_CRASH_LIST_PAGE_SIZE): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(MAX_CRASH_LIST_PAGE_SIZE, Math.floor(n))
}

const ERROR_KINDS = new Set(['crash', 'anr', 'error', 'other'])
const STATUSES = new Set(['open', 'closed', 'other'])
const SORT_FIELDS = new Set<CrashListSortField>(['lastSeenAt', 'count', 'title'])

/**
 * Split free-text multi-value filter strings like `"17, 18; iPhone"`.
 * Do NOT use this on already-selected option arrays — Umeng device ids
 * contain commas (`iPhone17,4`) and must stay atomic.
 */
export function splitCrashFilterTokens(raw: string | undefined | null): string[] {
  if (typeof raw !== 'string') return []
  return raw
    .split(/[,;|，、；]+/u)
    .map((v) => v.trim())
    .filter(Boolean)
}

function asStringArray(raw: unknown): string[] | undefined {
  if (typeof raw === 'string') {
    const parts = splitCrashFilterTokens(raw)
    return parts.length ? parts : undefined
  }
  if (!Array.isArray(raw)) return undefined
  // Array elements are already discrete selections (e.g. device ids with commas).
  const out = raw
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
  return out.length ? out : undefined
}

function asErrorKinds(raw: unknown): CrashListQuery['errorKinds'] {
  if (!Array.isArray(raw)) return undefined
  const out = raw.filter(
    (v): v is NonNullable<CrashListQuery['errorKinds']>[number] =>
      typeof v === 'string' && ERROR_KINDS.has(v),
  )
  return out.length ? out : undefined
}

function asStatuses(raw: unknown): CrashListQuery['statuses'] {
  if (!Array.isArray(raw)) return undefined
  const out = raw.filter(
    (v): v is NonNullable<CrashListQuery['statuses']>[number] =>
      typeof v === 'string' && STATUSES.has(v),
  )
  return out.length ? out : undefined
}

function parseSort(raw: unknown): CrashListQuery['sort'] {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const field = o.field
  const direction = o.direction
  if (
    typeof field === 'string' &&
    SORT_FIELDS.has(field as CrashListSortField) &&
    (direction === 'asc' || direction === 'desc')
  ) {
    return { field: field as CrashListSortField, direction }
  }
  return undefined
}

function asTimeRange(raw: unknown): CrashTimeRangePreset | undefined {
  if (typeof raw !== 'string') return undefined
  return TIME_RANGE_PRESETS.has(raw as CrashTimeRangePreset)
    ? (raw as CrashTimeRangePreset)
    : undefined
}

/** Normalize date-only / ISO inputs to a comparable timestamp (ms), or null. */
export function parseCrashFilterDate(
  raw: string | undefined,
  endOfDay: boolean,
): number | null {
  if (!raw?.trim()) return null
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const t = Date.parse(endOfDay ? `${s}T23:59:59.999` : `${s}T00:00:00.000`)
    return Number.isFinite(t) ? t : null
  }
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

function fieldMatchesAny(value: string | undefined, needles: string[]): boolean {
  if (!needles.length) return true
  const hay = (value ?? '').toLowerCase()
  if (!hay) return false
  return needles.some((n) => hay.includes(n.toLowerCase()))
}

/**
 * Like `fieldMatchesAny`, but keep the row when the field is absent.
 * Umeng aggregate errorList rows often omit per-device OS/model metadata.
 */
function fieldMatchesAnyIfPresent(value: string | undefined, needles: string[]): boolean {
  if (!needles.length) return true
  const hay = (value ?? '').toLowerCase()
  if (!hay) return true
  return needles.some((n) => hay.includes(n.toLowerCase()))
}

/** Parse list filters from Host POST body (crash-list). */
export function parseCrashListQuery(body: Record<string, unknown>): CrashListQuery {
  const query: CrashListQuery = {}
  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : ''
  if (keyword) query.keyword = keyword
  const errorKinds = asErrorKinds(body.errorKinds ?? body.errorKind)
  if (errorKinds) query.errorKinds = errorKinds
  const statuses = asStatuses(body.statuses ?? body.status)
  if (statuses) query.statuses = statuses
  const appVersions = asStringArray(body.appVersions ?? body.appVersion)
  if (appVersions) query.appVersions = appVersions
  const sort = parseSort(body.sort)
  if (sort) query.sort = sort

  const osVersions = asStringArray(body.osVersions ?? body.osVersion)
  if (osVersions) query.osVersions = osVersions
  const deviceModels = asStringArray(body.deviceModels ?? body.deviceModel)
  if (deviceModels) query.deviceModels = deviceModels
  // Legacy joint field — keep when dedicated fields absent.
  const osDevice = typeof body.osDevice === 'string' ? body.osDevice.trim() : ''
  if (osDevice && !osVersions?.length && !deviceModels?.length) {
    query.osDevice = osDevice
  }

  const timeRange = asTimeRange(body.timeRange)
  if (timeRange) query.timeRange = timeRange
  const startAt = typeof body.startAt === 'string' ? body.startAt.trim() : ''
  if (startAt) query.startAt = startAt
  const endAt = typeof body.endAt === 'string' ? body.endAt.trim() : ''
  if (endAt) query.endAt = endAt

  if (body.page != null) query.page = clampPage(body.page)
  if (body.pageSize != null) query.pageSize = clampPageSize(body.pageSize)
  return query
}

export function normalizeCrashListQuery(query?: CrashListQuery): CrashListQuery {
  if (!query) return {}
  const normalized: CrashListQuery = {}
  const keyword = query.keyword?.trim()
  if (keyword) normalized.keyword = keyword
  if (query.errorKinds?.length) {
    normalized.errorKinds = [...query.errorKinds].sort()
  }
  if (query.statuses?.length) {
    normalized.statuses = [...query.statuses].sort()
  }
  if (query.appVersions?.length) {
    normalized.appVersions = [...query.appVersions].map((v) => v.trim()).filter(Boolean).sort()
  }
  if (query.sort) normalized.sort = query.sort
  if (query.osVersions?.length) {
    normalized.osVersions = [...query.osVersions].map((v) => v.trim()).filter(Boolean).sort()
  }
  if (query.deviceModels?.length) {
    normalized.deviceModels = [...query.deviceModels].map((v) => v.trim()).filter(Boolean).sort()
  }
  const osDevice = query.osDevice?.trim()
  if (osDevice && !normalized.osVersions?.length && !normalized.deviceModels?.length) {
    normalized.osDevice = osDevice
  }
  if (query.timeRange) normalized.timeRange = query.timeRange
  const startAt = query.startAt?.trim()
  if (startAt) normalized.startAt = startAt
  const endAt = query.endAt?.trim()
  if (endAt) normalized.endAt = endAt
  if (query.page != null) normalized.page = clampPage(query.page)
  if (query.pageSize != null) normalized.pageSize = clampPageSize(query.pageSize)
  return normalized
}

export function resolveCrashListPage(query?: CrashListQuery): {
  page: number
  pageSize: number
} {
  const q = normalizeCrashListQuery(query)
  return {
    page: q.page ?? 1,
    pageSize: q.pageSize ?? DEFAULT_CRASH_LIST_PAGE_SIZE,
  }
}

export function stableCrashListQueryKey(query?: CrashListQuery): string {
  const normalized = normalizeCrashListQuery(query)
  if (!Object.keys(normalized).length) return 'default'
  return JSON.stringify(normalized)
}

/** Inclusive [start, end] ms window for client-side lastSeen filtering; null = no bound. */
export function resolveCrashTimeWindow(
  query?: CrashListQuery,
  now = new Date(),
): { startMs: number | null; endMs: number | null } {
  const q = normalizeCrashListQuery(query)
  const customStart = parseCrashFilterDate(q.startAt, false)
  const customEnd = parseCrashFilterDate(q.endAt, true)
  if (customStart != null || customEnd != null) {
    return { startMs: customStart, endMs: customEnd }
  }
  const endMs = now.getTime()
  if (q.timeRange === '24h') return { startMs: endMs - 24 * 3600 * 1000, endMs }
  if (q.timeRange === '7d') return { startMs: endMs - 7 * 24 * 3600 * 1000, endMs }
  if (q.timeRange === '30d') return { startMs: endMs - 30 * 24 * 3600 * 1000, endMs }
  if (q.timeRange === '90d') return { startMs: endMs - 90 * 24 * 3600 * 1000, endMs }
  return { startMs: null, endMs: null }
}

export function applyCrashListQuery(
  incidents: CrashIncident[],
  query?: CrashListQuery,
): CrashIncident[] {
  const q = normalizeCrashListQuery(query)
  let rows = incidents

  if (q.keyword) {
    const needle = q.keyword.toLowerCase()
    rows = rows.filter((row) => {
      const hay = [row.title, row.id, row.exceptionName, row.stackText]
        .filter(Boolean)
        .join('\n')
        .toLowerCase()
      return hay.includes(needle)
    })
  }

  if (q.errorKinds?.length) {
    const allowed = new Set(q.errorKinds)
    rows = rows.filter((row) => row.errorKind && allowed.has(row.errorKind))
  }

  if (q.statuses?.length) {
    // Aggregate list rows may omit status — keep those; only drop mismatches.
    rows = rows.filter((row) => !row.status || q.statuses!.includes(row.status))
  }

  if (q.appVersions?.length) {
    rows = rows.filter((row) => fieldMatchesAnyIfPresent(row.appVersion, q.appVersions ?? []))
  }

  if (q.osVersions?.length || q.deviceModels?.length) {
    rows = rows.filter(
      (row) =>
        fieldMatchesAnyIfPresent(row.osVersion, q.osVersions ?? []) &&
        fieldMatchesAnyIfPresent(row.deviceModel, q.deviceModels ?? []),
    )
  } else if (q.osDevice) {
    const needles = splitCrashFilterTokens(q.osDevice)
    rows = rows.filter((row) => {
      const hay = [row.osVersion, row.deviceModel].filter(Boolean).join(' ').toLowerCase()
      return needles.some((n) => hay.includes(n.toLowerCase()))
    })
  }

  const { startMs, endMs } = resolveCrashTimeWindow(q)
  if (startMs != null || endMs != null) {
    rows = rows.filter((row) => {
      const ts = Date.parse(row.lastSeenAt ?? row.occurredAt ?? '')
      if (!Number.isFinite(ts)) return true
      if (startMs != null && ts < startMs) return false
      if (endMs != null && ts > endMs) return false
      return true
    })
  }

  if (q.sort) {
    const dir = q.sort.direction === 'asc' ? 1 : -1
    rows = [...rows].sort((a, b) => {
      if (q.sort!.field === 'title') {
        return a.title.localeCompare(b.title) * dir
      }
      if (q.sort!.field === 'count') {
        return ((a.count ?? 0) - (b.count ?? 0)) * dir
      }
      const ta = Date.parse(a.lastSeenAt ?? a.occurredAt ?? '') || 0
      const tb = Date.parse(b.lastSeenAt ?? b.occurredAt ?? '') || 0
      return (ta - tb) * dir
    })
  }

  return rows
}

export function incidentToListSummary(incident: CrashIncident): CrashIncidentSummary {
  return {
    id: incident.id,
    title: incident.title,
    provider: incident.provider,
    appVersion: incident.appVersion,
    errorKind: incident.errorKind,
    status: incident.status,
    lastSeenAt: incident.lastSeenAt,
    count: incident.count,
    affectedUsers: incident.affectedUsers,
    osVersion: incident.osVersion,
    deviceModel: incident.deviceModel,
  }
}
