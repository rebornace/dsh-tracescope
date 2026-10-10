/**
 * Umeng U-APM console transport (Cookie session).
 *
 * Real console (apm.umeng.com U-APM SPA) uses POST `/hsf/analysis/*` with
 * `dataSourceId` (= appKey), `x-csrf-token` from cookie `ctoken`, and Cookie.
 *
 * Synthetic fixtures under `tests/fixtures/umeng/` keep a normalized envelope
 * (`errorId` / `errorTitle` / `stackTrace`); live responses also accept
 * `id` / `summary` / `happenTimes` / `affectUsers`.
 */
import { createHash } from 'node:crypto'
import {
  applyCrashListQuery,
  incidentToListSummary,
  normalizeCrashListQuery,
  parseCrashFilterDate,
  resolveCrashListPage,
  stableCrashListQueryKey,
} from '../list-query.js'
import type { CrashProvider } from '../provider-types.js'
import type {
  CrashFilterOption,
  CrashFilterOptions,
  CrashIncident,
  CrashIncidentSummary,
  CrashListQuery,
  CrashListResult,
  CrashProviderConfig,
} from '../types.js'

/** Default origin — U-APM SPA host (same-origin for /hsf/*). */
export const UMENG_CONSOLE_DEFAULT_ORIGIN = 'https://apm.umeng.com'

/** Aggregated error list — POST JSON. */
export const UMENG_CONSOLE_LIST_PATH = '/hsf/analysis/errorList'

/** Error detail — POST JSON. */
export const UMENG_CONSOLE_DETAIL_PATH = '/hsf/analysis/errorDetail'

/** Per-log list for an error — POST JSON. */
export const UMENG_CONSOLE_LOG_LIST_PATH = '/hsf/analysis/errorlogList'

/** Per-log detail — POST JSON. */
export const UMENG_CONSOLE_LOG_DETAIL_PATH = '/hsf/analysis/errorlogDetail'

/** Symbolicated / raw stack by key — POST JSON. */
export const UMENG_CONSOLE_STACK_PATH = '/hsf/analysis/errorStack'

/** App version filter options — POST JSON (`metaType`). */
export const UMENG_CONSOLE_VERSIONS_PATH = '/hsf/analysis/getVersionsList'

/** Device model filter options — POST JSON (`metaType`). */
export const UMENG_CONSOLE_DEVICES_PATH = '/hsf/analysis/getDevices'

/** OS version filter options — POST JSON (`metaType`). */
export const UMENG_CONSOLE_METAOS_PATH = '/hsf/analysis/getMetaosList'

/** Host allowlist for outbound fetch (suffix match for `*.umeng.com`). */
export const UMENG_HOST_ALLOWLIST = [
  'apm.umeng.com',
  'mobile.umeng.com',
  'console.umeng.com',
  '*.umeng.com',
] as const

export type UmengCrashErrorCode =
  | 'UMENG_AUTH'
  | 'UMENG_FORBIDDEN'
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
  id?: string
  errorId?: string
  summary?: string
  errorTitle?: string
  /** Live console may return string (`crash`) or numeric codes. */
  errorType?: string | number
  appVersion?: string
  version?: string
  versions?: string
  buildVersion?: string
  /** Live console uses `os` (`ios` / `android`); fixtures may use `osName`. */
  os?: string | number
  osName?: string | number
  osVersion?: string | number
  deviceModel?: string
  deviceVersion?: string
  status?: number
  count?: number
  happenTimes?: number
  userCount?: number
  affectUsers?: number
  firstTime?: string
  lastTime?: string
  firstHappenTime?: string
  lastHappenTime?: string
  stackTrace?: string
  originStack?: string
  afterStack?: string
  stackMd5?: string
  summaryMd5?: string
  occurredAt?: string
  logId?: string
  serverTime?: string | number
}

/** Coerce Umeng scalar fields that are sometimes number/boolean in live JSON. */
function asUmengText(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

type UmengListEnvelope = {
  code?: number
  msg?: string
  message?: string
  data?: { list?: UmengListRow[]; total?: number; page?: number } | UmengListRow[]
}

type UmengDetailEnvelope = {
  code?: number
  msg?: string
  message?: string
  data?: UmengListRow
}

type UmengStackEnvelope = {
  code?: number
  msg?: string
  data?: {
    originStack?: string
    afterStack?: string
    emphases?: unknown
  }
}

/** Console JSON success code. */
export const UMENG_API_SUCCESS_CODE = 200

/** Session expired / not logged in (SPA redirects to passport). */
export const UMENG_API_AUTH_CODE = 999999001

/** No privilege for this app / action (SPA routes to /apps/403). */
export const UMENG_API_FORBIDDEN_CODE = 403

function envelopeMessage(raw: { msg?: string; message?: string }): string {
  if (typeof raw.msg === 'string' && raw.msg.trim()) return raw.msg.trim()
  if (typeof raw.message === 'string' && raw.message.trim()) return raw.message.trim()
  return ''
}

function looksLikePermissionDenied(code: number | undefined, detail: string): boolean {
  if (code === UMENG_API_FORBIDDEN_CODE) return true
  return /没有.*权限|无权限|not\s*allowed|permission|forbidden/i.test(detail)
}

export function assertUmengEnvelopeCode(raw: unknown): void {
  const envelope = raw as { code?: number; msg?: string; message?: string }
  if (envelope.code === UMENG_API_AUTH_CODE) {
    throw new UmengCrashError(
      'UMENG_AUTH',
      'Umeng session expired or cookie invalid (code 999999001)',
    )
  }
  const detail = envelopeMessage(envelope) || `code=${envelope.code ?? 'missing'}`
  if (looksLikePermissionDenied(envelope.code, detail)) {
    throw new UmengCrashError(
      'UMENG_FORBIDDEN',
        `${detail} — confirm this Umeng account can open the app crash list on apm.umeng.com, and re-copy Cookie from an /hsf/analysis/* request (needs EGG_SESS).`,
    )
  }
  if (envelope.code !== UMENG_API_SUCCESS_CODE) {
    throw new UmengCrashError(
      'UMENG_BAD_RESPONSE',
      `Umeng API returned non-success envelope (${detail})`,
    )
  }
}

const LIST_CACHE_TTL_MS = 30_000

const listCache = new Map<string, { expiresAt: number; result: CrashListResult }>()

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

function csrfFromCookie(cookie: string): string | undefined {
  const m = /(?:^|;\s*)ctoken=([^;]+)/i.exec(cookie)
  if (!m?.[1]) return undefined
  try {
    return decodeURIComponent(m[1].trim())
  } catch {
    return m[1].trim()
  }
}

/** Drop empty string / null / undefined / empty-array fields (SPA removeEmptyParams). */
export function omitEmptyUmengFields(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && value.trim() === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    out[key] = value
  }
  return out
}

/** U-APM SPA hard-limit: each dimension supports at most 10 selected values. */
export const UMENG_FILTER_MAX_PER_DIMENSION = 10

/**
 * SPA dimension filters on `/hsf/analysis/errorList` use **arrays**:
 * `version` / `os` / `device` (not osVersions / deviceModels).
 * Selecting “全部…” is represented as `[""]` and normalized to `[]` (omitted).
 * More than 10 values are truncated (console shows an error and refuses update).
 */
export function umengFilterArray(values: string[] | undefined): string[] | undefined {
  if (!values?.length) return undefined
  const cleaned = values.map((v) => v.trim()).filter(Boolean)
  if (!cleaned.length) return undefined
  // SPA: any empty token means “all” → send nothing.
  if (cleaned.some((v) => v === '')) return undefined
  return cleaned.slice(0, UMENG_FILTER_MAX_PER_DIMENSION)
}

/**
 * Use the caller Cookie as-is.
 *
 * Live `/hsf/*` accepts `EGG_SESS` alone (`ctoken` optional). A prior HTML
 * warmup + Set-Cookie merge could follow a passport redirect and wipe the
 * session, after which `errorList` returns HTTP 200 with an empty body.
 */
async function ensureUmengSessionCookie(config: CrashProviderConfig): Promise<string> {
  const initial = config.cookie?.trim() ?? ''
  if (!initial) {
    throw new UmengCrashError('UMENG_AUTH', 'Umeng console requires a session cookie')
  }
  return initial
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** U-APM list/detail date bounds: `YYYYMMDD HHMMSS`. */
export function formatUmengDayBound(d: Date, endOfDay: boolean): string {
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  return endOfDay ? `${y}${m}${day} 235959` : `${y}${m}${day} 000000`
}

export function defaultUmengDateRange(now = new Date()): {
  startDay: string
  endDay: string
  dateType: string
} {
  const end = new Date(now)
  const start = new Date(now)
  start.setDate(end.getDate() - 6)
  return {
    startDay: formatUmengDayBound(start, false),
    endDay: formatUmengDayBound(end, true),
    dateType: 'last7Days',
  }
}

function dateFromMs(ms: number): Date {
  return new Date(ms)
}

/**
 * Map list query time filters to U-APM `startDay` / `endDay` / `dateType`.
 *
 * Tokens match the U-APM SPA map (`recent7DayFromToday` → `last7Days`,
 * `unit_custom` → `freeDays`, `today` → `today`, …).
 * Preset `timeRange` wins over display `startAt`/`endAt` unless custom.
 */
export function resolveUmengDateRange(
  query?: CrashListQuery,
  now = new Date(),
): { startDay: string; endDay: string; dateType: string } {
  const q = normalizeCrashListQuery(query)
  const isPreset =
    q.timeRange === '24h' ||
    q.timeRange === '7d' ||
    q.timeRange === '30d' ||
    q.timeRange === '90d'
  const wantsCustom =
    q.timeRange === 'custom' ||
    (!isPreset && (Boolean(q.startAt?.trim()) || Boolean(q.endAt?.trim())))

  if (wantsCustom) {
    const customStart = parseCrashFilterDate(q.startAt, false)
    const customEnd = parseCrashFilterDate(q.endAt, true)
    const end = customEnd != null ? dateFromMs(customEnd) : new Date(now)
    const start =
      customStart != null
        ? dateFromMs(customStart)
        : (() => {
            const d = new Date(end)
            d.setDate(d.getDate() - 6)
            return d
          })()
    return {
      startDay: formatUmengDayBound(start, false),
      endDay: formatUmengDayBound(end, true),
      // SPA: unit_custom → freeDays (not "custom").
      dateType: 'freeDays',
    }
  }

  const end = new Date(now)
  const start = new Date(now)
  if (q.timeRange === '24h') {
    return {
      startDay: formatUmengDayBound(start, false),
      endDay: formatUmengDayBound(end, true),
      dateType: 'today',
    }
  }
  if (q.timeRange === '30d') {
    start.setDate(end.getDate() - 29)
    return {
      startDay: formatUmengDayBound(start, false),
      endDay: formatUmengDayBound(end, true),
      dateType: 'last30Days',
    }
  }
  if (q.timeRange === '90d') {
    start.setDate(end.getDate() - 89)
    return {
      startDay: formatUmengDayBound(start, false),
      endDay: formatUmengDayBound(end, true),
      dateType: 'last90Days',
    }
  }
  // Default / 7d / empty → last 7 days (verified live against errorList).
  start.setDate(end.getDate() - 6)
  return {
    startDay: formatUmengDayBound(start, false),
    endDay: formatUmengDayBound(end, true),
    dateType: 'last7Days',
  }
}

function mapPlatform(osName: unknown): CrashIncident['platform'] {
  const os = (asUmengText(osName) ?? '').toLowerCase()
  if (os.includes('android')) return 'android'
  if (os.includes('ios') || os.includes('iphone') || os.includes('ipad') || os === 'apple') {
    return 'ios'
  }
  if (!os) return undefined
  return 'other'
}

function mapErrorKind(errorType: unknown): CrashIncident['errorKind'] {
  const t = (asUmengText(errorType) ?? '').toLowerCase()
  if (t === 'crash' || t === 'oom') return 'crash'
  if (t === 'anr') return 'anr'
  if (t === 'error' || t === 'exception' || t === 'dartexception') return 'error'
  if (!t) return undefined
  return 'other'
}

/** Value for Umeng request `errorType` field (always a known console token). */
function umengErrorTypeParam(errorType: unknown): string {
  const kind = mapErrorKind(errorType)
  if (kind === 'anr') return 'anr'
  if (kind === 'error') return 'exception'
  return 'crash'
}

function mapStatus(status: number | undefined): CrashIncident['status'] {
  if (status === 0) return 'open'
  if (status === 1 || status === 2 || status === 3) return 'closed'
  if (status === undefined) return undefined
  return 'other'
}

function rowId(row: UmengListRow): string {
  return (asUmengText(row.errorId) ?? asUmengText(row.id))?.trim() ?? ''
}

function rowTitle(row: UmengListRow): string {
  const title = (asUmengText(row.errorTitle) ?? asUmengText(row.summary))?.trim()
  if (title) return title
  const id = rowId(row)
  return id ? `Umeng error ${id}` : 'Umeng crash'
}

function rowStack(row: UmengListRow): string {
  return (
    asUmengText(row.stackTrace)?.trim() ||
    asUmengText(row.afterStack)?.trim() ||
    asUmengText(row.originStack)?.trim() ||
    ''
  )
}

function mapRowToIncident(row: UmengListRow): CrashIncident {
  const id = rowId(row)
  const stackText = rowStack(row)
  const title = rowTitle(row)
  const exceptionName =
    stackText.split(/\r?\n/, 1)[0]?.trim() ||
    title.split(/\r?\n/, 1)[0]?.trim() ||
    title
  const versionsText = asUmengText(row.versions)
  const appVersion =
    asUmengText(row.appVersion)?.trim() ||
    asUmengText(row.version)?.trim() ||
    (versionsText ? versionsText.split(/[-,~]/)[0]?.trim() : undefined)
  return {
    id,
    title: title.split(/\r?\n/, 1)[0]?.trim() || title,
    provider: 'umeng',
    stackText,
    exceptionName,
    appVersion,
    buildNumber: asUmengText(row.buildVersion),
    platform: mapPlatform(row.os ?? row.osName),
    errorKind: mapErrorKind(row.errorType),
    status: mapStatus(row.status),
    count: row.count ?? row.happenTimes,
    affectedUsers: row.userCount ?? row.affectUsers,
    osVersion: asUmengText(row.osVersion),
    deviceModel: asUmengText(row.deviceModel) ?? asUmengText(row.deviceVersion),
    occurredAt:
      asUmengText(row.occurredAt) ??
      asUmengText(row.lastHappenTime) ??
      asUmengText(row.lastTime),
    firstSeenAt: asUmengText(row.firstHappenTime) ?? asUmengText(row.firstTime),
    lastSeenAt: asUmengText(row.lastHappenTime) ?? asUmengText(row.lastTime),
    rawRef: id || asUmengText(row.errorId),
  }
}

function listRowsFromEnvelope(raw: unknown): UmengListRow[] {
  assertUmengEnvelopeCode(raw)
  const envelope = raw as UmengListEnvelope
  const data = envelope.data
  if (Array.isArray(data)) return data
  return data?.list ?? []
}

export function mapUmengListIncidents(raw: unknown): CrashIncident[] {
  return listRowsFromEnvelope(raw)
    .map((row) => mapRowToIncident(row))
    .filter((item) => Boolean(item.id))
}

export function mapUmengListResponse(raw: unknown): CrashIncidentSummary[] {
  return mapUmengListIncidents(raw).map((row) => incidentToListSummary(row))
}

export function mapUmengDetailResponse(raw: unknown): CrashIncident {
  assertUmengEnvelopeCode(raw)
  const envelope = raw as UmengDetailEnvelope
  const row = envelope.data
  if (!row || typeof row !== 'object') {
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

function appKeyOf(config: CrashProviderConfig): string {
  return config.appKey?.trim() ?? ''
}

function listTotalFromEnvelope(raw: unknown): number | undefined {
  const data = (raw as UmengListEnvelope).data
  if (!data || Array.isArray(data)) return undefined
  return typeof data.total === 'number' && Number.isFinite(data.total) ? data.total : undefined
}

function umengOrderBy(query?: CrashListQuery): string {
  const field = normalizeCrashListQuery(query).sort?.field
  // SPA sorts by happenTimes / lastHappenTime / affectUsers — keep known tokens only.
  if (field === 'lastSeenAt') return 'lastHappenTime'
  return 'happenTimes'
}

function buildListBody(
  config: CrashProviderConfig,
  pageSize: number,
  query?: CrashListQuery,
  page = 1,
): Record<string, unknown> {
  const range = resolveUmengDateRange(query)
  const q = normalizeCrashListQuery(query)
  const errorType =
    q.errorKinds?.length === 1
      ? q.errorKinds[0] === 'anr'
        ? 'anr'
        : q.errorKinds[0] === 'error'
          ? 'exception'
          : 'crash'
      : 'crash'
  // Align with U-APM SPA errorList body (10.chunk.js):
  // dimension filters are arrays on `version` / `os` / `device`, merged via `w`.
  const body: Record<string, unknown> = {
    dataSourceId: appKeyOf(config),
    appkey: appKeyOf(config),
    appType: 'app',
    type: 'app',
    errorType,
    page,
    pageSize,
    startDay: range.startDay,
    endDay: range.endDay,
    dateType: range.dateType,
    orderBy: umengOrderBy(query),
    order: q.sort?.direction === 'asc' ? 'asc' : 'desc',
    errorAbstract: q.keyword?.trim() || undefined,
    version: umengFilterArray(q.appVersions),
    os: umengFilterArray(q.osVersions),
    device: umengFilterArray(q.deviceModels),
  }
  return omitEmptyUmengFields(body)
}

function buildDetailBody(
  config: CrashProviderConfig,
  errorId: string,
  query?: CrashListQuery,
): Record<string, unknown> {
  const range = resolveUmengDateRange(query)
  const q = normalizeCrashListQuery(query)
  return omitEmptyUmengFields({
    dataSourceId: appKeyOf(config),
    appkey: appKeyOf(config),
    appType: 'app',
    type: 'app',
    errorId,
    errorType: 'crash',
    startDay: range.startDay,
    endDay: range.endDay,
    dateType: range.dateType,
    version: umengFilterArray(q.appVersions),
    os: umengFilterArray(q.osVersions),
    device: umengFilterArray(q.deviceModels),
  })
}

function platformReferer(config: CrashProviderConfig): string {
  const origin = consoleOrigin(config)
  const appKey = appKeyOf(config)
  if (!appKey) return `${origin}/`
  return `${origin}/platform/${encodeURIComponent(appKey)}/error_analysis/crash`
}

async function parseUmengJson(response: Response, requestUrl: string): Promise<unknown> {
  const text = await response.text()
  const trimmed = text.trim()
  if (!trimmed) {
    const ctype = response.headers.get('content-type') ?? 'none'
    throw new UmengCrashError(
      'UMENG_BAD_RESPONSE',
      `Umeng console returned empty body (HTTP ${response.status}, content-type=${ctype}, url=${requestUrl}). Re-copy Cookie from an apm.umeng.com /hsf/analysis/errorList request.`,
    )
  }
  if (trimmed.startsWith('<') || /^<!DOCTYPE/i.test(trimmed)) {
    throw new UmengCrashError(
      'UMENG_AUTH',
      'Umeng returned HTML instead of JSON — cookie may be for the wrong host or expired. Copy Cookie from an apm.umeng.com /hsf/analysis/* request.',
    )
  }
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    throw new UmengCrashError(
      'UMENG_BAD_RESPONSE',
      `Umeng response is not valid JSON (starts with ${JSON.stringify(trimmed.slice(0, 24))})`,
    )
  }
}

async function umengPost(
  config: CrashProviderConfig,
  apiPath: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  assertConsoleTransport(config)
  const origin = consoleOrigin(config)
  const url = new URL(`${origin}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`)
  assertAllowedUrl(url)
  const cookie = await ensureUmengSessionCookie(config)
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json; charset=utf-8',
    Cookie: cookie,
    Origin: origin,
    Referer: platformReferer(config),
  }
  const csrf = csrfFromCookie(cookie)
  if (csrf) headers['x-csrf-token'] = csrf

  const response = await fetch(url.href, {
    method: 'POST',
    headers,
    body: JSON.stringify(omitEmptyUmengFields(body)),
    // Avoid following passport redirects (would turn POST→GET and yield empty HTML).
    redirect: 'manual',
  })
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location') ?? ''
    throw new UmengCrashError(
      'UMENG_AUTH',
      `Umeng redirected away from the API (HTTP ${response.status}${location ? `, location=${location}` : ''}) — session cookie likely expired. Re-copy Cookie from apm.umeng.com.`,
    )
  }
  if (response.status === 401) {
    throw new UmengCrashError(
      'UMENG_AUTH',
      'Umeng session expired or cookie invalid (HTTP 401)',
    )
  }
  if (response.status === 403) {
    throw new UmengCrashError(
      'UMENG_FORBIDDEN',
      'Umeng forbidden (HTTP 403) — account may lack U-APM access for this appKey, or Cookie/session is expired.',
    )
  }
  if (!response.ok) {
    throw new UmengCrashError(
      'UMENG_HTTP',
      `Umeng console HTTP ${response.status}: ${response.statusText}`,
    )
  }
  return parseUmengJson(response, url.href)
}

async function fetchListJson(
  config: CrashProviderConfig,
  pageSize: number,
  query?: CrashListQuery,
  page = 1,
): Promise<unknown> {
  return umengPost(config, UMENG_CONSOLE_LIST_PATH, buildListBody(config, pageSize, query, page))
}

async function fetchDetailJson(
  config: CrashProviderConfig,
  errorId: string,
  query?: CrashListQuery,
): Promise<unknown> {
  return umengPost(config, UMENG_CONSOLE_DETAIL_PATH, buildDetailBody(config, errorId, query))
}

const MAX_STACK_CHARS = 200_000

function clipStack(stack: string): string {
  if (stack.length <= MAX_STACK_CHARS) return stack
  return `${stack.slice(0, MAX_STACK_CHARS)}\n…[truncated ${stack.length - MAX_STACK_CHARS} chars]`
}

async function fetchStackByKey(config: CrashProviderConfig, key: string): Promise<string> {
  const stackRaw = await umengPost(config, UMENG_CONSOLE_STACK_PATH, {
    dataSourceId: appKeyOf(config),
    appkey: appKeyOf(config),
    appType: 'app',
    type: 'app',
    key,
    retrace: true,
  })
  assertUmengEnvelopeCode(stackRaw)
  const data = (stackRaw as UmengStackEnvelope).data
  return clipStack(data?.afterStack?.trim() || data?.originStack?.trim() || '')
}

async function fetchStackText(
  config: CrashProviderConfig,
  errorId: string,
  detailRow: UmengListRow,
): Promise<string> {
  const existing = rowStack(detailRow)
  if (existing) return clipStack(existing)

  const range = resolveUmengDateRange()
  // Live console: summaryMd5 often does not resolve via errorStack; use latest log's stackMd5.
  try {
    const logListRaw = await umengPost(config, UMENG_CONSOLE_LOG_LIST_PATH, {
      dataSourceId: appKeyOf(config),
      appkey: appKeyOf(config),
      appType: 'app',
      type: 'app',
      errorId,
      errorType: umengErrorTypeParam(detailRow.errorType),
      page: 1,
      pageSize: 1,
      startDay: range.startDay,
      endDay: range.endDay,
      dateType: range.dateType,
      orderBy: 'serverTime',
      order: 'desc',
    })
    const logs = listRowsFromEnvelope(logListRaw)
    const first = logs[0]
    if (first?.logId) {
      const logDetailRaw = await umengPost(config, UMENG_CONSOLE_LOG_DETAIL_PATH, {
        dataSourceId: appKeyOf(config),
        appkey: appKeyOf(config),
        appType: 'app',
        type: 'app',
        logId: first.logId,
        errorId,
        serverTime: first.serverTime,
        errorType: umengErrorTypeParam(detailRow.errorType ?? first.errorType),
      })
      assertUmengEnvelopeCode(logDetailRaw)
      const logRow = (logDetailRaw as UmengDetailEnvelope).data
      if (logRow) {
        const fromLog = rowStack(logRow)
        if (fromLog) return clipStack(fromLog)
        const md5 = asUmengText(logRow.stackMd5)?.trim()
        if (md5) {
          const stack = await fetchStackByKey(config, md5)
          if (stack) return stack
        }
      }
    }
  } catch {
    // fall through
  }

  const summaryKey = asUmengText(detailRow.summaryMd5)?.trim()
  if (summaryKey) {
    try {
      const stack = await fetchStackByKey(config, summaryKey)
      if (stack) return stack
    } catch {
      // fall through
    }
  }

  // Detail `summary` often embeds a short stack preview — usable as last resort.
  const summary =
    asUmengText(detailRow.summary)?.trim() || asUmengText(detailRow.errorTitle)?.trim() || ''
  return summary.includes('\n') ? clipStack(summary) : ''
}

function listCacheKey(config: CrashProviderConfig, query?: CrashListQuery): string {
  const queryKey = stableCrashListQueryKey(query)
  const hash = createHash('sha256').update(queryKey).digest('hex').slice(0, 16)
  return `${config.appKey?.trim() ?? ''}|${consoleOrigin(config)}|${hash}`
}

function getCachedList(
  config: CrashProviderConfig,
  query?: CrashListQuery,
): CrashListResult | null {
  const key = listCacheKey(config, query)
  const hit = listCache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) {
    listCache.delete(key)
    return null
  }
  return hit.result
}

function setCachedList(
  config: CrashProviderConfig,
  query: CrashListQuery | undefined,
  result: CrashListResult,
): void {
  listCache.set(listCacheKey(config, query), {
    expiresAt: Date.now() + LIST_CACHE_TTL_MS,
    result,
  })
}

/** Clears in-memory list cache (tests). */
export function clearUmengListCacheForTests(): void {
  listCache.clear()
}

/** Map our errorKind filter to U-APM `metaType` (SPA filter bar). */
export function umengMetaTypeForQuery(errorKinds?: CrashListQuery['errorKinds']): string {
  if (errorKinds?.length === 1) {
    const kind = errorKinds[0]
    if (kind === 'anr') return 'anr'
    if (kind === 'error') return 'exception'
    if (kind === 'crash') return 'crash'
  }
  return 'crash'
}

function unwrapUmengData(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw
  assertUmengEnvelopeCode(raw)
  const envelope = raw as { data?: unknown }
  return envelope.data
}

function mapStringOptions(raw: unknown): CrashFilterOption[] {
  if (!Array.isArray(raw)) return []
  const out: CrashFilterOption[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const value = asUmengText(item)?.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push({
      value,
      label: value === '-1' ? '未知版本' : value,
    })
  }
  return out
}

function mapDeviceOptions(raw: unknown): CrashFilterOption[] {
  if (!Array.isArray(raw)) return []
  const out: CrashFilterOption[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as { device?: unknown; deviceName?: unknown; value?: unknown; label?: unknown }
    const value =
      asUmengText(row.device)?.trim() ||
      asUmengText(row.value)?.trim() ||
      asUmengText(row.deviceName)?.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    const label =
      asUmengText(row.deviceName)?.trim() ||
      asUmengText(row.label)?.trim() ||
      value
    out.push({ value, label })
  }
  return out
}

function metaRequestBody(config: CrashProviderConfig, metaType: string): Record<string, unknown> {
  return {
    dataSourceId: appKeyOf(config),
    appkey: appKeyOf(config),
    appType: 'app',
    type: 'app',
    metaType,
  }
}

/**
 * Fetch Umeng console filter dropdown options (version / os / device).
 * Matches SPA `listApi` calls for the error-analysis filter bar.
 */
export async function fetchUmengFilterOptions(
  config: CrashProviderConfig,
  opts?: { metaType?: string },
): Promise<CrashFilterOptions> {
  assertConsoleTransport(config)
  if (!config.appKey?.trim() || !config.cookie?.trim()) {
    throw new UmengCrashError('UMENG_AUTH', 'Umeng console requires appKey and cookie')
  }
  const metaType = (opts?.metaType?.trim() || 'crash').toLowerCase()
  const body = metaRequestBody(config, metaType)

  const settled = await Promise.allSettled([
    umengPost(config, UMENG_CONSOLE_VERSIONS_PATH, body),
    umengPost(config, UMENG_CONSOLE_DEVICES_PATH, body),
    umengPost(config, UMENG_CONSOLE_METAOS_PATH, body),
  ])

  const read = (index: number): unknown => {
    const item = settled[index]
    if (!item || item.status !== 'fulfilled') return null
    return unwrapUmengData(item.value)
  }

  const versions = mapStringOptions(read(0))
  const devices = mapDeviceOptions(read(1))
  const osVersions = mapStringOptions(read(2))
  if (!versions.length && !devices.length && !osVersions.length) {
    const firstReject = settled.find((s) => s.status === 'rejected') as
      | PromiseRejectedResult
      | undefined
    if (firstReject?.reason instanceof Error) throw firstReject.reason
    throw new UmengCrashError('UMENG_BAD_RESPONSE', 'Umeng filter option APIs returned no data')
  }

  return {
    metaType,
    versions,
    devices,
    osVersions,
  }
}

export const umengCrashProvider: CrashProvider & {
  probe(config: CrashProviderConfig): Promise<{ ok: boolean; error?: string }>
  listFilterOptions(
    config: CrashProviderConfig,
    opts?: { metaType?: string },
  ): Promise<CrashFilterOptions>
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

  async listFilterOptions(config, opts) {
    return fetchUmengFilterOptions(config, opts)
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
    const empty = (): CrashListResult => {
      const { page, pageSize } = resolveCrashListPage(query)
      return { items: [], page, pageSize, total: 0, hasMore: false }
    }
    if (config.provider !== 'umeng') return empty()
    assertConsoleTransport(config)
    if (!umengCrashProvider.isReady(config)) return empty()

    const cached = getCachedList(config, query)
    if (cached) return cached

    const { page, pageSize } = resolveCrashListPage(query)
    const raw = await fetchListJson(config, pageSize, query, page)
    const incidents = mapUmengListIncidents(raw)
    // Server already applied dateType/startDay/endDay + version/os/device +
    // errorType + errorAbstract. Do NOT re-apply those locally — list rows often
    // omit stack/os/device, and keyword re-filter against title-only would
    // incorrectly zero a successful Umeng response.
    const normalized = normalizeCrashListQuery(query)
    const localQuery: CrashListQuery = {
      sort: normalized.sort,
      page: normalized.page,
      pageSize: normalized.pageSize,
      // status is not sent on errorList yet — soft local filter only.
      statuses: normalized.statuses,
    }
    const filtered = applyCrashListQuery(incidents, localQuery)
    const items = filtered.map((row) => incidentToListSummary(row))
    // Prefer Umeng total (server-side filter count). Fall back to page size.
    const total = listTotalFromEnvelope(raw)
    const hasMore =
      total != null ? page * pageSize < total : items.length >= pageSize
    const result: CrashListResult = { items, page, pageSize, total, hasMore }
    // Avoid sticky empty cache after a bad filter combo / transient miss.
    if (items.length > 0 || (total != null && total > 0)) {
      setCachedList(config, query, result)
    }
    return result
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
    assertUmengEnvelopeCode(raw)
    const detailRow = (raw as UmengDetailEnvelope).data
    if (!detailRow || typeof detailRow !== 'object') {
      throw new UmengCrashError('UMENG_BAD_RESPONSE', 'Umeng detail response missing data')
    }
    const stackText = await fetchStackText(config, errorId, detailRow)
    const incident = mapRowToIncident({ ...detailRow, errorId: rowId(detailRow) || errorId, stackTrace: stackText })
    if (!incident.id) {
      throw new UmengCrashError('UMENG_BAD_RESPONSE', 'Umeng detail response missing errorId')
    }
    if (!incident.stackText.trim()) {
      throw new UmengCrashError(
        'UMENG_BAD_RESPONSE',
        'Umeng detail response missing stackTrace — open the error in apm.umeng.com once, or paste the stack locally',
      )
    }
    if (incident.id !== errorId) {
      return { ...incident, id: errorId }
    }
    return incident
  },
}
