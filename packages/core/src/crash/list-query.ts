/**
 * Crash list query parsing and local filtering (shared by Host + Umeng provider).
 */
import type {
  CrashIncident,
  CrashIncidentSummary,
  CrashListQuery,
  CrashListSortField,
} from './types.js'

const ERROR_KINDS = new Set(['crash', 'anr', 'error', 'other'])
const STATUSES = new Set(['open', 'closed', 'other'])
const SORT_FIELDS = new Set<CrashListSortField>(['lastSeenAt', 'count', 'title'])

function asStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out = raw.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean)
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
  const osDevice = typeof body.osDevice === 'string' ? body.osDevice.trim() : ''
  if (osDevice) query.osDevice = osDevice
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
  const osDevice = query.osDevice?.trim()
  if (osDevice) normalized.osDevice = osDevice
  return normalized
}

export function stableCrashListQueryKey(query?: CrashListQuery): string {
  const normalized = normalizeCrashListQuery(query)
  if (!Object.keys(normalized).length) return 'default'
  return JSON.stringify(normalized)
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
    const allowed = new Set(q.statuses)
    rows = rows.filter((row) => row.status && allowed.has(row.status))
  }

  if (q.appVersions?.length) {
    const allowed = new Set(q.appVersions.map((v) => v.trim()))
    rows = rows.filter((row) => row.appVersion && allowed.has(row.appVersion))
  }

  if (q.osDevice) {
    const needle = q.osDevice.toLowerCase()
    rows = rows.filter((row) => {
      const hay = [row.osVersion, row.deviceModel].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(needle)
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
