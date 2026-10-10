/**
 * Umeng U-APM console transport (Cookie session).
 *
 * ## Synthetic fixture schema (no public HAR in repo — replace URLs after capture)
 *
 * **List** (`list.json` root):
 * - `code` number — 200 when OK
 * - `data.list[]`:
 *   - `errorId` string — incident id
 *   - `errorTitle` string — summary title
 *   - `errorType` `"crash" | "anr" | "error" | string`
 *   - `appVersion`, `buildVersion`, `osName`, `osVersion`, `deviceModel` optional strings
 *   - `status` number — 0 open, 1 closed
 *   - `count`, `userCount` optional numbers
 *   - `firstTime`, `lastTime` optional ISO timestamps
 *
 * **Detail** (`detail.json` root):
 * - `code` number
 * - `data`:
 *   - same identity fields as list row
 *   - `stackTrace` string — full stack text (required for detail mapping)
 *   - `occurredAt` optional ISO timestamp
 *
 * ## Console URLs (需按抓包替换 path/query)
 * Defaults target `mobile.umeng.com` U-APM style JSON endpoints.
 */
import { createHash } from 'node:crypto'
import {
  applyCrashListQuery,
  incidentToListSummary,
  normalizeCrashListQuery,
  stableCrashListQueryKey,
} from '../list-query.js'
import type { CrashProvider } from '../provider-types.js'
import type {
  CrashIncident,
  CrashIncidentSummary,
  CrashListQuery,
  CrashProviderConfig,
} from '../types.js'

/** Default origin when `consoleBaseUrl` is unset — 需按抓包替换 */
export const UMENG_CONSOLE_DEFAULT_ORIGIN = 'https://mobile.umeng.com'

/** List API path — 需按抓包替换 */
export const UMENG_CONSOLE_LIST_PATH = '/apmcc/openapi/error/list'

/** Detail API path — 需按抓包替换 */
export const UMENG_CONSOLE_DETAIL_PATH = '/apmcc/openapi/error/detail'

/** Host allowlist for outbound fetch (suffix match for `*.umeng.com`). */
export const UMENG_HOST_ALLOWLIST = [
  'mobile.umeng.com',
  'apm.umeng.com',
  'console.umeng.com',
  '*.umeng.com',
] as const

export type UmengCrashErrorCode =
  | 'UMENG_AUTH'
  | 'UMENG_OPENAPI_UNSUPPORTED'
  | 'UMENG_HOST_DENIED'
  | 'UMENG_HTTP'
  | 'UMENG_BAD_RESPONSE'

export class UmengCrashError extends Error {
  readonly code: UmengCrashErrorCode

  constructor(code: UmengCrashErrorCode, message: string) {
    super(message)
    this.name = 'UmengCrashError'
    this.code = code
  }
}

type UmengListRow = {
  errorId?: string
  errorTitle?: string
  errorType?: string
  appVersion?: string
  buildVersion?: string
  osName?: string
  osVersion?: string
  deviceModel?: string
  status?: number
  count?: number
  userCount?: number
  firstTime?: string
  lastTime?: string
  stackTrace?: string
  occurredAt?: string
}

type UmengListEnvelope = {
  code?: number
  msg?: string
  data?: { list?: UmengListRow[] }
}

type UmengDetailEnvelope = {
  code?: number
  msg?: string
  data?: UmengListRow
}

/** Console JSON success code in synthetic fixtures — adjust if capture differs. */
export const UMENG_API_SUCCESS_CODE = 200

export function assertUmengEnvelopeCode(raw: unknown): void {
  const envelope = raw as { code?: number; msg?: string }
  if (envelope.code !== UMENG_API_SUCCESS_CODE) {
    const detail =
      typeof envelope.msg === 'string' && envelope.msg.trim()
        ? envelope.msg.trim()
        : `code=${envelope.code ?? 'missing'}`
    throw new UmengCrashError(
      'UMENG_BAD_RESPONSE',
      `Umeng API returned non-success envelope (${detail})`,
    )
  }
}

const LIST_CACHE_TTL_MS = 30_000

const listCache = new Map<string, { expiresAt: number; items: CrashIncidentSummary[] }>()

function resolveTransport(config: CrashProviderConfig): 'console' | 'openapi' {
  return config.transport ?? 'console'
}

function assertConsoleTransport(config: CrashProviderConfig): void {
  if (resolveTransport(config) === 'openapi') {
    throw new UmengCrashError(
      'UMENG_OPENAPI_UNSUPPORTED',
      'Umeng OpenAPI transport is not implemented in v1; set transport to console.',
    )
  }
}

function consoleOrigin(config: CrashProviderConfig): string {
  const raw = config.consoleBaseUrl?.trim() || UMENG_CONSOLE_DEFAULT_ORIGIN
  return raw.replace(/\/+$/, '')
}

function hostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase()
  for (const entry of UMENG_HOST_ALLOWLIST) {
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(2)
      if (host === suffix || host.endsWith(`.${suffix}`)) return true
    } else if (host === entry) return true
  }
  return false
}

function assertAllowedUrl(url: URL): void {
  if (url.protocol !== 'https:') {
    throw new UmengCrashError('UMENG_HOST_DENIED', `Umeng console requires HTTPS: ${url.href}`)
  }
  if (!hostAllowed(url.hostname)) {
    throw new UmengCrashError(
      'UMENG_HOST_DENIED',
      `Host not in Umeng allowlist: ${url.hostname}`,
    )
  }
}

function mapPlatform(osName: string | undefined): CrashIncident['platform'] {
  const os = (osName ?? '').toLowerCase()
  if (os.includes('android')) return 'android'
  if (os.includes('ios') || os.includes('iphone') || os.includes('ipad')) return 'ios'
  if (!os) return undefined
  return 'other'
}

function mapErrorKind(errorType: string | undefined): CrashIncident['errorKind'] {
  const t = (errorType ?? '').toLowerCase()
  if (t === 'crash') return 'crash'
  if (t === 'anr') return 'anr'
  if (t === 'error') return 'error'
  if (!t) return undefined
  return 'other'
}

function mapStatus(status: number | undefined): CrashIncident['status'] {
  if (status === 0) return 'open'
  if (status === 1) return 'closed'
  if (status === undefined) return undefined
  return 'other'
}

function rowTitle(row: UmengListRow): string {
  const title = row.errorTitle?.trim()
  if (title) return title
  const id = row.errorId?.trim()
  return id ? `Umeng error ${id}` : 'Umeng crash'
}

function mapRowToIncident(row: UmengListRow): CrashIncident {
  const id = row.errorId?.trim() ?? ''
  const stackText = row.stackTrace?.trim() ?? ''
  const title = rowTitle(row)
  const exceptionName = stackText.split(/\r?\n/, 1)[0]?.trim() || title
  return {
    id,
    title,
    provider: 'umeng',
    stackText,
    exceptionName,
    appVersion: row.appVersion,
    buildNumber: row.buildVersion,
    platform: mapPlatform(row.osName),
    errorKind: mapErrorKind(row.errorType),
    status: mapStatus(row.status),
    count: row.count,
    affectedUsers: row.userCount,
    osVersion: row.osVersion,
    deviceModel: row.deviceModel,
    occurredAt: row.occurredAt ?? row.lastTime,
    firstSeenAt: row.firstTime,
    lastSeenAt: row.lastTime,
    rawRef: row.errorId,
  }
}

export function mapUmengListIncidents(raw: unknown): CrashIncident[] {
  assertUmengEnvelopeCode(raw)
  const envelope = raw as UmengListEnvelope
  const rows = envelope.data?.list ?? []
  return rows.map((row) => mapRowToIncident(row)).filter((item) => Boolean(item.id))
}

export function mapUmengListResponse(raw: unknown): CrashIncidentSummary[] {
  return mapUmengListIncidents(raw).map((row) => incidentToListSummary(row))
}

export function mapUmengDetailResponse(raw: unknown): CrashIncident {
  assertUmengEnvelopeCode(raw)
  const envelope = raw as UmengDetailEnvelope
  const row = envelope.data
  if (!row) {
    throw new UmengCrashError('UMENG_BAD_RESPONSE', 'Umeng detail response missing data')
  }
  const incident = mapRowToIncident(row)
  if (!incident.id) {
    throw new UmengCrashError('UMENG_BAD_RESPONSE', 'Umeng detail response missing errorId')
  }
  if (!incident.stackText.trim()) {
    throw new UmengCrashError('UMENG_BAD_RESPONSE', 'Umeng detail response missing stackTrace')
  }
  return incident
}

function buildListUrl(
  config: CrashProviderConfig,
  pageSize: number,
  query?: CrashListQuery,
): URL {
  const origin = consoleOrigin(config)
  const url = new URL(`${origin}${UMENG_CONSOLE_LIST_PATH}`)
  url.searchParams.set('appKey', config.appKey?.trim() ?? '')
  url.searchParams.set('page', '1')
  url.searchParams.set('pageSize', String(pageSize))

  const q = normalizeCrashListQuery(query)
  // Remote query params (names unverified — replace after HAR). Always re-apply filters locally in list().
  if (q.keyword) url.searchParams.set('keyword', q.keyword)
  if (q.appVersions?.length === 1) url.searchParams.set('appVersion', q.appVersions[0]!)
  // errorKinds, statuses, multi appVersion, sort: not sent remotely (API shape unknown); local-only in applyCrashListQuery().

  return url
}

function buildDetailUrl(config: CrashProviderConfig, errorId: string): URL {
  const origin = consoleOrigin(config)
  const url = new URL(`${origin}${UMENG_CONSOLE_DETAIL_PATH}`)
  url.searchParams.set('appKey', config.appKey?.trim() ?? '')
  url.searchParams.set('errorId', errorId)
  return url
}

async function umengFetch(config: CrashProviderConfig, url: URL): Promise<Response> {
  assertConsoleTransport(config)
  assertAllowedUrl(url)
  const cookie = config.cookie?.trim()
  if (!cookie) {
    throw new UmengCrashError('UMENG_AUTH', 'Umeng console requires a session cookie')
  }
  const origin = consoleOrigin(config)
  const response = await fetch(url.href, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      Cookie: cookie,
      Origin: origin,
      Referer: `${origin}/`,
    },
  })
  if (response.status === 401) {
    throw new UmengCrashError(
      'UMENG_AUTH',
      'Umeng session expired or cookie invalid (HTTP 401)',
    )
  }
  if (!response.ok) {
    throw new UmengCrashError(
      'UMENG_HTTP',
      `Umeng console HTTP ${response.status}: ${response.statusText}`,
    )
  }
  return response
}

async function fetchListJson(
  config: CrashProviderConfig,
  pageSize: number,
  query?: CrashListQuery,
): Promise<unknown> {
  const url = buildListUrl(config, pageSize, query)
  const response = await umengFetch(config, url)
  return response.json() as Promise<unknown>
}

async function fetchDetailJson(config: CrashProviderConfig, errorId: string): Promise<unknown> {
  const url = buildDetailUrl(config, errorId)
  const response = await umengFetch(config, url)
  return response.json() as Promise<unknown>
}

function listCacheKey(config: CrashProviderConfig, query?: CrashListQuery): string {
  const queryKey = stableCrashListQueryKey(query)
  const hash = createHash('sha256').update(queryKey).digest('hex').slice(0, 16)
  return `${config.appKey?.trim() ?? ''}|${consoleOrigin(config)}|${hash}`
}

function getCachedList(
  config: CrashProviderConfig,
  query?: CrashListQuery,
): CrashIncidentSummary[] | null {
  const key = listCacheKey(config, query)
  const hit = listCache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) {
    listCache.delete(key)
    return null
  }
  return hit.items
}

function setCachedList(
  config: CrashProviderConfig,
  query: CrashListQuery | undefined,
  items: CrashIncidentSummary[],
): void {
  listCache.set(listCacheKey(config, query), {
    expiresAt: Date.now() + LIST_CACHE_TTL_MS,
    items,
  })
}

/** Clears in-memory list cache (tests). */
export function clearUmengListCacheForTests(): void {
  listCache.clear()
}

export const umengCrashProvider: CrashProvider & {
  probe(config: CrashProviderConfig): Promise<{ ok: boolean; error?: string }>
} = {
  id: 'umeng',

  isReady(config: CrashProviderConfig): boolean {
    return (
      config.provider === 'umeng' &&
      Boolean(config.appKey?.trim() && config.cookie?.trim())
    )
  },

  capabilities() {
    return {
      filters: [
        'timeRange',
        'appVersion',
        'errorKind',
        'osDevice',
        'sort',
        'status',
        'keyword',
      ],
      supportsDetail: true,
    }
  },

  async probe(config) {
    try {
      assertConsoleTransport(config)
      if (!umengCrashProvider.isReady(config)) {
        return { ok: false, error: 'Umeng requires appKey and cookie' }
      }
      await fetchListJson(config, 1)
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: message }
    }
  },

  async list(config, query) {
    if (config.provider !== 'umeng') return []
    assertConsoleTransport(config)
    if (!umengCrashProvider.isReady(config)) return []

    const cached = getCachedList(config, query)
    if (cached) return cached

    const raw = await fetchListJson(config, 50, query)
    const incidents = mapUmengListIncidents(raw)
    const filtered = applyCrashListQuery(incidents, query)
    const items = filtered.map((row) => incidentToListSummary(row))
    setCachedList(config, query, items)
    return items
  },

  async get(config, id) {
    if (config.provider !== 'umeng') {
      throw new Error('Umeng crash provider requires provider: umeng')
    }
    assertConsoleTransport(config)
    const errorId = id.trim()
    if (!errorId) {
      throw new UmengCrashError('UMENG_BAD_RESPONSE', 'Missing crash incident id')
    }
    const raw = await fetchDetailJson(config, errorId)
    const incident = mapUmengDetailResponse(raw)
    if (incident.id !== errorId) {
      return { ...incident, id: errorId }
    }
    return incident
  },
}
