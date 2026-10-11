/**
 * Firebase Crashlytics provider — official REST API (v1alpha).
 *
 * Auth: Bearer access token, or Google service-account JSON (JWT → token).
 * List: reports/topIssues; Detail: issues.get + events (sample / list).
 * Filter options: reports/topVersions|topDevices|topOperatingSystems.
 *
 * @see https://firebase.google.com/docs/reference/crashlytics/rest
 */
import { execFileSync } from 'node:child_process'
import { createHash, createSign } from 'node:crypto'
import {
  incidentToListSummary,
  normalizeCrashListQuery,
  resolveCrashListPage,
  resolveCrashTimeWindow,
  stableCrashListQueryKey,
} from '../list-query.js'
import type { CrashProvider } from '../provider-types.js'
import { formatProxyHint, proxyAwareFetch, resolveOutboundProxyUrl } from '../proxy-fetch.js'
import type {
  CrashFilterOption,
  CrashFilterOptions,
  CrashIncident,
  CrashIncidentSummary,
  CrashListQuery,
  CrashListResult,
  CrashProviderConfig,
} from '../types.js'

export const CRASHLYTICS_API_ORIGIN = 'https://firebasecrashlytics.googleapis.com'
export const CRASHLYTICS_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const CRASHLYTICS_OAUTH_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

export const CRASHLYTICS_REPORT_TOP_ISSUES = 'topIssues'
export const CRASHLYTICS_REPORT_TOP_VERSIONS = 'topVersions'
export const CRASHLYTICS_REPORT_TOP_DEVICES = 'topDevices'
export const CRASHLYTICS_REPORT_TOP_APPLE_DEVICES = 'topAppleDevices'
export const CRASHLYTICS_REPORT_TOP_OS = 'topOperatingSystems'

export type CrashlyticsErrorCode =
  | 'CRASHLYTICS_AUTH'
  | 'CRASHLYTICS_FORBIDDEN'
  | 'CRASHLYTICS_HTTP'
  | 'CRASHLYTICS_NOT_FOUND'
  | 'CRASHLYTICS_NETWORK'
  | 'CRASHLYTICS_BAD_RESPONSE'
  | 'CRASHLYTICS_CONFIG'

export class CrashlyticsError extends Error {
  readonly code: CrashlyticsErrorCode

  constructor(code: CrashlyticsErrorCode, message: string) {
    super(message)
    this.name = 'CrashlyticsError'
    this.code = code
  }
}

type CrashlyticsIssue = {
  id?: string
  title?: string
  subtitle?: string
  errorType?: string
  sampleEvent?: string
  uri?: string
  firstSeenVersion?: string
  lastSeenVersion?: string
  firstSeenTime?: string
  lastSeenTime?: string
  state?: string
  name?: string
}

type IntervalMetrics = {
  eventsCount?: string | number
  impactedUsersCount?: string | number
  startTime?: string
  endTime?: string
}

type ReportGroup = {
  issue?: CrashlyticsIssue
  version?: { displayName?: string; displayVersion?: string; buildVersion?: string }
  device?: { displayName?: string; manufacturer?: string; model?: string; marketingName?: string }
  operatingSystem?: { displayName?: string; os?: string; displayVersion?: string }
  metrics?: IntervalMetrics[]
}

type ReportResponse = {
  groups?: ReportGroup[]
  nextPageToken?: string
  totalSize?: number
  name?: string
}

type CrashlyticsFrame = {
  symbol?: string
  file?: string
  line?: string | number
  library?: string
  offset?: string | number
  address?: string | number
  blamed?: boolean
}

type CrashlyticsException = {
  type?: string
  exceptionMessage?: string
  title?: string
  subtitle?: string
  blamed?: boolean
  frames?: CrashlyticsFrame[]
}

type CrashlyticsThread = {
  name?: string
  crashed?: boolean
  blamed?: boolean
  title?: string
  subtitle?: string
  signal?: string
  frames?: CrashlyticsFrame[]
}

type CrashlyticsEvent = {
  name?: string
  eventId?: string
  eventTime?: string
  platform?: string
  issue?: CrashlyticsIssue
  issueTitle?: string
  issueSubtitle?: string
  version?: { displayVersion?: string; buildVersion?: string; displayName?: string }
  device?: { displayName?: string; model?: string; marketingName?: string; manufacturer?: string }
  operatingSystem?: { displayName?: string; os?: string; displayVersion?: string }
  exceptions?: CrashlyticsException[]
  errors?: Array<{ title?: string; subtitle?: string; frames?: CrashlyticsFrame[] }>
  threads?: CrashlyticsThread[]
  blameFrame?: CrashlyticsFrame
}

type ServiceAccountJson = {
  client_email?: string
  private_key?: string
  token_uri?: string
  project_id?: string
}

const LIST_CACHE_TTL_MS = 30_000
const TOKEN_SKEW_MS = 60_000
const MAX_STACK_CHARS = 200_000
const GCLOUD_TOKEN_TTL_MS = 50 * 60_000
const GCLOUD_MISS_TTL_MS = 60_000

const listCache = new Map<string, { expiresAt: number; result: CrashListResult }>()
const tokenCache = new Map<string, { expiresAt: number; token: string }>()

type CrashlyticsTokenKind = 'user' | 'gcloud' | 'sa'
type ResolvedCrashlyticsAuth = { token: string; kind: CrashlyticsTokenKind }

let gcloudTokenCache: { token: string; expiresAt: number } | null = null
let gcloudMissUntil = 0
let gcloudAccessTokenForTests: (() => string | null) | null = null

/** Injectable fetch for tests. Default: proxy-aware fetch (Windows system proxy / HTTPS_PROXY). */
let crashlyticsFetch: typeof fetch = proxyAwareFetch as unknown as typeof fetch

export function setCrashlyticsFetchForTests(fn: typeof fetch | null): void {
  crashlyticsFetch = (fn ?? (proxyAwareFetch as unknown as typeof fetch))
}

/** Injectable gcloud token source for tests (`null` restores real gcloud lookup). */
export function setGcloudAccessTokenForTests(fn: (() => string | null) | null): void {
  gcloudAccessTokenForTests = fn
  gcloudTokenCache = null
  gcloudMissUntil = 0
}

/**
 * Read a live user access token from the local `gcloud` CLI (cached ~50m).
 * Honors HTTPS_PROXY / system proxy so China Clash users can refresh.
 */
export function tryGcloudAccessToken(): string | null {
  if (gcloudAccessTokenForTests) return gcloudAccessTokenForTests()
  if (gcloudTokenCache && Date.now() < gcloudTokenCache.expiresAt) return gcloudTokenCache.token
  if (Date.now() < gcloudMissUntil) return null
  try {
    const proxy = resolveOutboundProxyUrl()
    const env = { ...process.env }
    if (proxy) {
      env.HTTPS_PROXY = env.HTTPS_PROXY || proxy
      env.HTTP_PROXY = env.HTTP_PROXY || proxy
      env.https_proxy = env.https_proxy || proxy
      env.http_proxy = env.http_proxy || proxy
    }
    const bin = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud'
    const out = execFileSync(bin, ['auth', 'print-access-token'], {
      encoding: 'utf8',
      timeout: 25_000,
      windowsHide: true,
      env,
    }).trim()
    const token = out.split(/\r?\n/).filter(Boolean).pop()?.trim() || ''
    if (token.length < 20) {
      gcloudMissUntil = Date.now() + GCLOUD_MISS_TTL_MS
      return null
    }
    gcloudTokenCache = { token, expiresAt: Date.now() + GCLOUD_TOKEN_TTL_MS }
    gcloudMissUntil = 0
    return token
  } catch {
    gcloudMissUntil = Date.now() + GCLOUD_MISS_TTL_MS
    return null
  }
}

function wrapNetworkError(err: unknown, target: string): CrashlyticsError {
  if (err instanceof CrashlyticsError) return err
  const nested =
    err && typeof err === 'object' && 'cause' in err
      ? (err as { cause?: unknown }).cause
      : undefined
  const root = nested instanceof Error ? nested : err instanceof Error ? err : undefined
  const code =
    root && 'code' in root && typeof (root as { code?: unknown }).code === 'string'
      ? (root as { code: string }).code
      : ''
  const detail = root?.message || (err instanceof Error ? err.message : String(err))
  const timeout = /TIMEOUT|timeout|UND_ERR_CONNECT/i.test(`${code} ${detail}`)
  const failed = /fetch failed|ECONNRESET|ENOTFOUND|ECONNREFUSED|socket/i.test(
    `${code} ${detail}`,
  )
  if (timeout || failed) {
    return new CrashlyticsError(
      'CRASHLYTICS_NETWORK',
      `无法连接 Google API（${target}）。${formatProxyHint()}。原始错误: ${detail}`,
    )
  }
  return new CrashlyticsError('CRASHLYTICS_HTTP', `Crashlytics request failed: ${detail}`)
}

async function crashlyticsFetchJson(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await crashlyticsFetch(url, init)
  } catch (err) {
    throw wrapNetworkError(err, url)
  }
}

export function clearCrashlyticsCachesForTests(): void {
  listCache.clear()
  tokenCache.clear()
  gcloudTokenCache = null
  gcloudMissUntil = 0
}

function asText(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function asInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.trunc(n)
  }
  return undefined
}

function clipStack(stack: string): string {
  if (stack.length <= MAX_STACK_CHARS) return stack
  return `${stack.slice(0, MAX_STACK_CHARS)}\n…[truncated ${stack.length - MAX_STACK_CHARS} chars]`
}

function projectIdOf(config: CrashProviderConfig): string {
  return config.projectId?.trim() || ''
}

function appIdOf(config: CrashProviderConfig): string {
  return config.appId?.trim() || ''
}

/** Firebase App ID embeds project number: `1:{projectNumber}:{platform}:{hash}`. */
export function projectNumberFromAppId(appId: string): string | undefined {
  const m = /^1:(\d+):/i.exec(appId.trim())
  return m?.[1]
}

/**
 * Crashlytics REST paths use `projects/{project}/…`. Working clients use the
 * numeric project number (from App ID); project ID strings often 404 as
 * "Requested entity was not found".
 */
export function crashlyticsProjectRef(config: CrashProviderConfig): string {
  const projectId = projectIdOf(config)
  if (/^\d+$/.test(projectId)) return projectId
  const fromApp = projectNumberFromAppId(appIdOf(config))
  if (fromApp) return fromApp
  return projectId
}

/** Path parent: projects/{projectNumber|id}/apps/{appId} — keep colons in appId. */
export function crashlyticsAppParent(config: CrashProviderConfig): string {
  const projectRef = crashlyticsProjectRef(config)
  const appId = appIdOf(config)
  if (!projectRef || !appId) {
    throw new CrashlyticsError(
      'CRASHLYTICS_CONFIG',
      'Crashlytics requires projectId and appId (Firebase App ID)',
    )
  }
  return `projects/${projectRef}/apps/${appId}`
}

export function parseServiceAccountJson(raw: string | undefined): ServiceAccountJson | null {
  const text = raw?.trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as ServiceAccountJson
    if (typeof parsed.client_email === 'string' && typeof parsed.private_key === 'string') {
      return parsed
    }
  } catch {
    return null
  }
  return null
}

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

export function mintServiceAccountJwt(
  sa: ServiceAccountJson,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  if (!sa.client_email?.trim() || !sa.private_key?.trim()) {
    throw new CrashlyticsError('CRASHLYTICS_AUTH', 'Service account JSON missing client_email/private_key')
  }
  const header = base64urlJson({ alg: 'RS256', typ: 'JWT' })
  const claim = base64urlJson({
    iss: sa.client_email.trim(),
    scope: CRASHLYTICS_OAUTH_SCOPE,
    aud: sa.token_uri?.trim() || CRASHLYTICS_OAUTH_TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  })
  const unsigned = `${header}.${claim}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  // JSON paste sometimes keeps literal "\n" sequences; PEM needs real newlines.
  const privateKey = (sa.private_key || '').replace(/\\n/g, '\n')
  const signature = signer.sign(privateKey).toString('base64url')
  return `${unsigned}.${signature}`
}

async function exchangeJwtForAccessToken(jwt: string, tokenUri: string): Promise<{
  accessToken: string
  expiresInSec: number
}> {
  const res = await crashlyticsFetchJson(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  })
  const text = await res.text()
  let json: { access_token?: string; expires_in?: number; error?: string; error_description?: string }
  try {
    json = JSON.parse(text) as typeof json
  } catch {
    throw new CrashlyticsError(
      'CRASHLYTICS_AUTH',
      `OAuth token exchange returned non-JSON (HTTP ${res.status})`,
    )
  }
  if (!res.ok || !json.access_token) {
    const detail = json.error_description || json.error || text.slice(0, 200)
    throw new CrashlyticsError(
      res.status === 401 || res.status === 403 ? 'CRASHLYTICS_AUTH' : 'CRASHLYTICS_HTTP',
      `OAuth token exchange failed (HTTP ${res.status}): ${detail}`,
    )
  }
  return {
    accessToken: json.access_token,
    expiresInSec: typeof json.expires_in === 'number' ? json.expires_in : 3600,
  }
}

async function resolveServiceAccountAuth(
  config: CrashProviderConfig,
): Promise<ResolvedCrashlyticsAuth | null> {
  const sa = parseServiceAccountJson(config.serviceAccountJson)
  if (!sa) return null
  const privateKey = sa.private_key?.trim() || ''
  const cacheKey = createHash('sha256')
    .update(`${sa.client_email}|${privateKey.slice(0, 64)}`)
    .digest('hex')
    .slice(0, 24)
  const hit = tokenCache.get(cacheKey)
  if (hit && Date.now() < hit.expiresAt) return { token: hit.token, kind: 'sa' }

  const jwt = mintServiceAccountJwt(sa)
  const tokenUri = sa.token_uri?.trim() || CRASHLYTICS_OAUTH_TOKEN_URL
  const { accessToken, expiresInSec } = await exchangeJwtForAccessToken(jwt, tokenUri)
  tokenCache.set(cacheKey, {
    token: accessToken,
    expiresAt: Date.now() + Math.max(60, expiresInSec) * 1000 - TOKEN_SKEW_MS,
  })
  return { token: accessToken, kind: 'sa' }
}

/**
 * Prefer a live `gcloud` session over a pasted ya29 token (those expire in ~1h).
 * Fall back to pasted accessToken, then service-account JSON.
 */
export async function resolveCrashlyticsAuth(
  config: CrashProviderConfig,
): Promise<ResolvedCrashlyticsAuth> {
  const fromGcloud = tryGcloudAccessToken()
  if (fromGcloud) return { token: fromGcloud, kind: 'gcloud' }

  const direct = config.accessToken?.trim()
  if (direct) return { token: direct, kind: 'user' }

  const saAuth = await resolveServiceAccountAuth(config)
  if (saAuth) return saAuth

  throw new CrashlyticsError(
    'CRASHLYTICS_AUTH',
    'Crashlytics requires accessToken、serviceAccountJson，或本机已 gcloud auth login',
  )
}

export async function resolveCrashlyticsAccessToken(
  config: CrashProviderConfig,
): Promise<string> {
  return (await resolveCrashlyticsAuth(config)).token
}

function mapHttpError(status: number, body: string): CrashlyticsError {
  const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 280)
  const apiDisabled =
    status === 403 &&
    /Firebase Crashlytics API has not been used|it is disabled|Enable it by visiting/i.test(
      body,
    )
  if (apiDisabled) {
    const projectMatch = body.match(/project[= ](\d+)/i)
    const projectNum = projectMatch?.[1]
    const enableUrl = projectNum
      ? `https://console.developers.google.com/apis/api/firebasecrashlytics.googleapis.com/overview?project=${projectNum}`
      : 'https://console.cloud.google.com/apis/library/firebasecrashlytics.googleapis.com'
    return new CrashlyticsError(
      'CRASHLYTICS_FORBIDDEN',
      `未启用 Firebase Crashlytics API。请打开 ${enableUrl} 启用后重试；并为服务账号授予 Firebase Crashlytics Viewer（或 Admin）。`,
    )
  }
  if (status === 403 && /quota project/i.test(body)) {
    return new CrashlyticsError(
      'CRASHLYTICS_FORBIDDEN',
      '用户 Access Token 缺少配额项目（quota project）。请确认侧栏已填写 Firebase 项目 ID；或执行 gcloud auth application-default set-quota-project <项目ID> 后重新 print-access-token。',
    )
  }
  const permissionDenied =
    status === 403 &&
    /PERMISSION_DENIED|does not have permission|caller does not have permission/i.test(body)
  if (permissionDenied) {
    return new CrashlyticsError(
      'CRASHLYTICS_FORBIDDEN',
      '当前凭证没有 Crashlytics 读权限（PERMISSION_DENIED）。若用服务账号：在 IAM 授予「Firebase Crashlytics Viewer」。若用 Access Token：确认 gcloud 登录的 Google 账号能打开该 Firebase 项目，并已填写正确的项目 ID。',
    )
  }
  if (status === 401) {
    return new CrashlyticsError(
      'CRASHLYTICS_AUTH',
      'Access Token 已失效（HTTP 401）。请新开终端执行：gcloud auth print-access-token（需代理时先设 HTTPS_PROXY），把新 token 粘贴到侧栏并保存；若本机已 gcloud login，重新加载插件后会自动刷新。',
    )
  }
  if (status === 403) {
    return new CrashlyticsError(
      'CRASHLYTICS_FORBIDDEN',
      `Crashlytics API HTTP 403${snippet ? `: ${snippet}` : ''}`,
    )
  }
  if (status === 404) {
    if (/Method not found/i.test(body)) {
      return new CrashlyticsError(
        'CRASHLYTICS_AUTH',
        'Crashlytics v1alpha 当前对「服务账号」鉴权常返回 Method not found。请改用用户 Access Token：本机执行 gcloud auth login 后用 gcloud auth print-access-token，或 firebase login:ci 的 token，粘贴到侧栏「Access Token」后再拉取。',
      )
    }
    if (/Requested entity was not found|NOT_FOUND/i.test(body)) {
      return new CrashlyticsError(
        'CRASHLYTICS_NOT_FOUND',
        'Crashlytics API HTTP 404: Requested entity was not found.',
      )
    }
  }
  return new CrashlyticsError(
    'CRASHLYTICS_HTTP',
    `Crashlytics API HTTP ${status}${snippet ? `: ${snippet}` : ''}`,
  )
}

/**
 * User / gcloud OAuth tokens require a quota project header.
 * Service-account tokens do not — and some Crashlytics paths misbehave if it is set.
 */
function crashlyticsRequestHeaders(
  config: CrashProviderConfig,
  auth: ResolvedCrashlyticsAuth,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
    Accept: 'application/json',
  }
  if (auth.kind === 'user' || auth.kind === 'gcloud') {
    const quota = projectIdOf(config) || crashlyticsProjectRef(config)
    if (quota) headers['x-goog-user-project'] = quota
  }
  return headers
}

async function crashlyticsGet(
  config: CrashProviderConfig,
  pathAndQuery: string,
): Promise<unknown> {
  const url = pathAndQuery.startsWith('http')
    ? pathAndQuery
    : `${CRASHLYTICS_API_ORIGIN}/v1alpha/${pathAndQuery.replace(/^\//, '')}`

  let auth = await resolveCrashlyticsAuth(config)
  let res = await crashlyticsFetchJson(url, {
    method: 'GET',
    headers: crashlyticsRequestHeaders(config, auth),
  })
  let text = await res.text()

  // Pasted ya29 tokens expire ~1h — retry once with live gcloud / service account.
  if (res.status === 401 && auth.kind === 'user') {
    gcloudMissUntil = 0
    const fromGcloud = tryGcloudAccessToken()
    if (fromGcloud) {
      auth = { token: fromGcloud, kind: 'gcloud' }
      res = await crashlyticsFetchJson(url, {
        method: 'GET',
        headers: crashlyticsRequestHeaders(config, auth),
      })
      text = await res.text()
    } else {
      const saAuth = await resolveServiceAccountAuth(config)
      if (saAuth) {
        auth = saAuth
        res = await crashlyticsFetchJson(url, {
          method: 'GET',
          headers: crashlyticsRequestHeaders(config, auth),
        })
        text = await res.text()
      }
    }
  }

  if (!res.ok) throw mapHttpError(res.status, text)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new CrashlyticsError('CRASHLYTICS_BAD_RESPONSE', 'Crashlytics returned non-JSON body')
  }
}

function toRfc3339(ms: number): string {
  return new Date(ms).toISOString()
}

/** Map TraceScope error kinds → Crashlytics ErrorType enums. */
export function crashlyticsErrorTypes(
  errorKinds?: CrashListQuery['errorKinds'],
): string[] {
  if (!errorKinds?.length) return []
  const out = new Set<string>()
  for (const kind of errorKinds) {
    if (kind === 'crash') out.add('FATAL')
    else if (kind === 'anr') out.add('ANR')
    else if (kind === 'error') out.add('NON_FATAL')
  }
  return [...out]
}

export function crashlyticsIssueStates(
  statuses?: CrashListQuery['statuses'],
): string[] {
  if (!statuses?.length) return []
  const out = new Set<string>()
  for (const status of statuses) {
    if (status === 'open') out.add('OPEN')
    else if (status === 'closed') {
      out.add('CLOSED')
      out.add('MUTED')
    }
  }
  return [...out]
}

export function mapCrashlyticsErrorType(
  errorType: string | undefined,
): CrashIncident['errorKind'] {
  switch ((errorType || '').toUpperCase()) {
    case 'FATAL':
      return 'crash'
    case 'ANR':
      return 'anr'
    case 'NON_FATAL':
      return 'error'
    default:
      return 'other'
  }
}

export function mapCrashlyticsState(state: string | undefined): CrashIncident['status'] {
  switch ((state || '').toUpperCase()) {
    case 'OPEN':
      return 'open'
    case 'CLOSED':
    case 'MUTED':
      return 'closed'
    default:
      return 'other'
  }
}

function platformFromAppId(appId: string): CrashIncident['platform'] {
  const lower = appId.toLowerCase()
  if (lower.includes(':ios:') || lower.includes(':apple:')) return 'ios'
  if (lower.includes(':android:')) return 'android'
  return 'other'
}

function formatFrame(frame: CrashlyticsFrame): string {
  const symbol = asText(frame.symbol)?.trim() || '(unknown)'
  const file = asText(frame.file)?.trim()
  const line = asText(frame.line)?.trim()
  const library = asText(frame.library)?.trim()
  const loc =
    file && line ? `${file}:${line}` : file || (line ? `line ${line}` : '')
  const lib = library ? ` [${library}]` : ''
  const blamed = frame.blamed ? '  ← blamed' : ''
  return loc ? `    at ${symbol} (${loc})${lib}${blamed}` : `    at ${symbol}${lib}${blamed}`
}

/** Build a readable stack string from a Crashlytics Event. */
export function formatCrashlyticsEventStack(event: CrashlyticsEvent): string {
  const lines: string[] = []
  const title = asText(event.issueTitle)?.trim() || asText(event.issue?.title)?.trim()
  const subtitle =
    asText(event.issueSubtitle)?.trim() || asText(event.issue?.subtitle)?.trim()
  if (title) lines.push(title)
  if (subtitle && subtitle !== title) lines.push(subtitle)

  const exceptions = Array.isArray(event.exceptions) ? event.exceptions : []
  if (exceptions.length) {
    for (const ex of exceptions) {
      const type = asText(ex.type)?.trim() || asText(ex.title)?.trim() || 'Exception'
      const msg = asText(ex.exceptionMessage)?.trim() || asText(ex.subtitle)?.trim() || ''
      lines.push(msg ? `${type}: ${msg}` : type)
      for (const frame of ex.frames ?? []) lines.push(formatFrame(frame))
    }
  }

  const errors = Array.isArray(event.errors) ? event.errors : []
  if (!exceptions.length && errors.length) {
    for (const err of errors) {
      const head =
        [asText(err.title)?.trim(), asText(err.subtitle)?.trim()].filter(Boolean).join(': ') ||
        'Error'
      lines.push(head)
      for (const frame of err.frames ?? []) lines.push(formatFrame(frame))
    }
  }

  const threads = Array.isArray(event.threads) ? event.threads : []
  const blamedThreads = threads.filter((t) => t.blamed || t.crashed)
  const threadList = blamedThreads.length ? blamedThreads : threads.slice(0, 1)
  if (!exceptions.length && !errors.length) {
    for (const thread of threadList) {
      const name = asText(thread.name)?.trim() || 'Thread'
      const signal = asText(thread.signal)?.trim()
      lines.push(signal ? `Thread ${name} (${signal})` : `Thread ${name}`)
      for (const frame of thread.frames ?? []) lines.push(formatFrame(frame))
    }
  } else if (threadList.length && threadList[0]?.frames?.length) {
    // Append blamed thread when exceptions already present (iOS often uses threads).
    const thread = threadList[0]!
    if (!exceptions.some((ex) => (ex.frames?.length ?? 0) > 0)) {
      const name = asText(thread.name)?.trim() || 'Thread'
      lines.push(`Thread ${name}`)
      for (const frame of thread.frames ?? []) lines.push(formatFrame(frame))
    }
  }

  if (lines.length <= 2 && event.blameFrame) {
    lines.push(formatFrame(event.blameFrame))
  }

  return clipStack(lines.join('\n').trim())
}

function metricsOf(group: ReportGroup): IntervalMetrics | undefined {
  return Array.isArray(group.metrics) && group.metrics.length ? group.metrics[0] : undefined
}

export function mapCrashlyticsReportGroup(
  group: ReportGroup,
  appId: string,
): CrashIncident | null {
  const issue = group.issue
  const id = asText(issue?.id)?.trim()
  if (!id) return null
  const titleParts = [asText(issue?.title)?.trim(), asText(issue?.subtitle)?.trim()].filter(
    Boolean,
  )
  const metrics = metricsOf(group)
  return {
    id,
    title: titleParts.join(' — ') || id,
    provider: 'crashlytics',
    stackText: '',
    exceptionName: asText(issue?.subtitle)?.trim() || asText(issue?.title)?.trim(),
    appVersion: asText(issue?.lastSeenVersion)?.trim() || asText(issue?.firstSeenVersion)?.trim(),
    platform: platformFromAppId(appId),
    errorKind: mapCrashlyticsErrorType(issue?.errorType),
    status: mapCrashlyticsState(issue?.state),
    count: asInt(metrics?.eventsCount),
    affectedUsers: asInt(metrics?.impactedUsersCount),
    firstSeenAt: asText(issue?.firstSeenTime)?.trim(),
    lastSeenAt: asText(issue?.lastSeenTime)?.trim() || asText(metrics?.endTime)?.trim(),
    occurredAt: asText(issue?.lastSeenTime)?.trim(),
    rawRef: asText(issue?.uri)?.trim() || asText(issue?.sampleEvent)?.trim() || asText(issue?.name)?.trim(),
  }
}

export function mapCrashlyticsTopIssuesReport(
  raw: unknown,
  appId: string,
): { items: CrashIncidentSummary[]; total?: number; nextPageToken?: string } {
  if (!raw || typeof raw !== 'object') {
    throw new CrashlyticsError('CRASHLYTICS_BAD_RESPONSE', 'topIssues response is not an object')
  }
  const report = raw as ReportResponse
  const groups = Array.isArray(report.groups) ? report.groups : []
  const items: CrashIncidentSummary[] = []
  for (const group of groups) {
    const incident = mapCrashlyticsReportGroup(group, appId)
    if (incident) items.push(incidentToListSummary(incident))
  }
  return {
    items,
    total: typeof report.totalSize === 'number' ? report.totalSize : undefined,
    nextPageToken: asText(report.nextPageToken)?.trim() || undefined,
  }
}

function appendQuery(params: URLSearchParams, key: string, values: string[]): void {
  for (const value of values) {
    if (value.trim()) params.append(key, value.trim())
  }
}

export function buildCrashlyticsReportQuery(
  query: CrashListQuery | undefined,
  pageSize: number,
  pageToken?: string,
): string {
  const params = new URLSearchParams()
  // firebase-tools uses snake_case page_size; keep pageSize for discovery-doc clients.
  params.set('page_size', String(pageSize))
  params.set('pageSize', String(pageSize))
  if (pageToken) {
    params.set('page_token', pageToken)
    params.set('pageToken', pageToken)
  }

  const normalized = normalizeCrashListQuery(query)
  const { startMs, endMs } = resolveCrashTimeWindow(
    normalized.timeRange || normalized.startAt || normalized.endAt
      ? normalized
      : { ...normalized, timeRange: '7d' },
  )
  if (startMs != null) params.set('filter.interval.startTime', toRfc3339(startMs))
  if (endMs != null) params.set('filter.interval.endTime', toRfc3339(endMs))

  if (normalized.appVersions?.length) {
    appendQuery(params, 'filter.version.displayNames', normalized.appVersions)
  }
  if (normalized.osVersions?.length) {
    appendQuery(params, 'filter.operatingSystem.displayNames', normalized.osVersions)
  }
  if (normalized.deviceModels?.length) {
    appendQuery(params, 'filter.device.displayNames', normalized.deviceModels)
  }
  const errorTypes = crashlyticsErrorTypes(normalized.errorKinds)
  if (errorTypes.length) appendQuery(params, 'filter.issue.errorTypes', errorTypes)
  const states = crashlyticsIssueStates(normalized.statuses)
  if (states.length) appendQuery(params, 'filter.issue.states', states)
  if (normalized.keyword) params.set('filter.issue.content', normalized.keyword)

  return params.toString()
}

function mapDisplayNameOptions(
  groups: ReportGroup[],
  pick: (g: ReportGroup) => string | undefined,
): CrashFilterOption[] {
  const out: CrashFilterOption[] = []
  const seen = new Set<string>()
  for (const group of groups) {
    const value = pick(group)?.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push({ value, label: value })
  }
  return out
}

function isCrashlyticsNotFound(err: unknown): boolean {
  return err instanceof CrashlyticsError && err.code === 'CRASHLYTICS_NOT_FOUND'
}

/** List available report definitions (works with service accounts; no computed groups). */
export async function listCrashlyticsReports(
  config: CrashProviderConfig,
): Promise<{ name?: string; displayName?: string }[]> {
  const parent = crashlyticsAppParent(config)
  const raw = await crashlyticsGet(config, `${parent}/reports`)
  const reports = (raw as { reports?: { name?: string; displayName?: string }[] }).reports
  return Array.isArray(reports) ? reports : []
}

function emptyReport(config: CrashProviderConfig, reportName: string): ReportResponse {
  return {
    name: `${crashlyticsAppParent(config)}/reports/${reportName}`,
    groups: [],
    totalSize: 0,
  }
}

/** When App exists but topIssues FULL returns entity-not-found, treat as empty (no crashes yet). */
async function resolveTopIssuesNotFound(
  config: CrashProviderConfig,
  reportName: string,
): Promise<ReportResponse> {
  try {
    const reports = await listCrashlyticsReports(config)
    if (
      reports.some(
        (r) =>
          (r.name || '').endsWith(`/reports/${reportName}`) ||
          (reportName === CRASHLYTICS_REPORT_TOP_ISSUES && r.displayName === 'Top Issues'),
      )
    ) {
      return emptyReport(config, reportName)
    }
  } catch {
    // listReports failed — fall through
  }
  throw new CrashlyticsError(
    'CRASHLYTICS_NOT_FOUND',
    '找不到 Firebase 项目或 App（HTTP 404）。请核对：① App ID 是否与 Firebase 控制台「项目设置 → 您的应用」完全一致（形如 1:数字:ios/android:xxx）；② 该应用已接入 Crashlytics；③ 项目 ID 与 App 属于同一项目（请求会优先使用 App ID 中的项目编号）。',
  )
}

function devicesReportName(appId: string): string {
  return platformFromAppId(appId) === 'ios'
    ? CRASHLYTICS_REPORT_TOP_APPLE_DEVICES
    : CRASHLYTICS_REPORT_TOP_DEVICES
}

async function fetchReport(
  config: CrashProviderConfig,
  reportName: string,
  queryString: string,
): Promise<ReportResponse> {
  const parent = crashlyticsAppParent(config)
  const path = `${parent}/reports/${reportName}${queryString ? `?${queryString}` : ''}`
  try {
    const raw = await crashlyticsGet(config, path)
    if (!raw || typeof raw !== 'object') {
      throw new CrashlyticsError('CRASHLYTICS_BAD_RESPONSE', `Report ${reportName} returned non-object`)
    }
    return raw as ReportResponse
  } catch (err) {
    if (
      isCrashlyticsNotFound(err) &&
      (reportName === CRASHLYTICS_REPORT_TOP_ISSUES ||
        reportName === CRASHLYTICS_REPORT_TOP_VERSIONS)
    ) {
      return resolveTopIssuesNotFound(config, reportName)
    }
    throw err
  }
}

async function fetchReportOptional(
  config: CrashProviderConfig,
  reportName: string,
  queryString: string,
): Promise<ReportResponse | null> {
  try {
    return await fetchReport(config, reportName, queryString)
  } catch (err) {
    if (isCrashlyticsNotFound(err) || (err instanceof CrashlyticsError && err.code === 'CRASHLYTICS_HTTP')) {
      return null
    }
    throw err
  }
}

export async function fetchCrashlyticsFilterOptions(
  config: CrashProviderConfig,
): Promise<CrashFilterOptions> {
  const q = buildCrashlyticsReportQuery({ timeRange: '30d' }, 50)
  const deviceReport = devicesReportName(appIdOf(config))
  const [versionsRaw, devicesRaw, osRaw] = await Promise.all([
    fetchReportOptional(config, CRASHLYTICS_REPORT_TOP_VERSIONS, q),
    fetchReportOptional(config, deviceReport, q),
    fetchReportOptional(config, CRASHLYTICS_REPORT_TOP_OS, q),
  ])
  return {
    metaType: 'crash',
    versions: mapDisplayNameOptions(versionsRaw?.groups ?? [], (g) =>
      asText(g.version?.displayName) || asText(g.version?.displayVersion),
    ),
    devices: mapDisplayNameOptions(devicesRaw?.groups ?? [], (g) => {
      const display = asText(g.device?.displayName)?.trim()
      if (display) return display
      const manufacturer = asText(g.device?.manufacturer)?.trim()
      const model = asText(g.device?.model)?.trim()
      if (manufacturer && model) return `${manufacturer} (${model})`
      return asText(g.device?.marketingName)?.trim() || model || manufacturer
    }),
    osVersions: mapDisplayNameOptions(osRaw?.groups ?? [], (g) => {
      const display = asText(g.operatingSystem?.displayName)?.trim()
      if (display) return display
      const os = asText(g.operatingSystem?.os)?.trim()
      const ver = asText(g.operatingSystem?.displayVersion)?.trim()
      return [os, ver].filter(Boolean).join(' ') || undefined
    }),
  }
}

async function fetchIssue(config: CrashProviderConfig, issueId: string): Promise<CrashlyticsIssue> {
  const parent = crashlyticsAppParent(config)
  const raw = await crashlyticsGet(config, `${parent}/issues/${encodeURIComponent(issueId)}`)
  if (!raw || typeof raw !== 'object') {
    throw new CrashlyticsError('CRASHLYTICS_BAD_RESPONSE', 'Issue get returned non-object')
  }
  const issue = raw as CrashlyticsIssue
  if (!asText(issue.id)?.trim()) {
    throw new CrashlyticsError('CRASHLYTICS_BAD_RESPONSE', 'Issue response missing id')
  }
  return issue
}

async function fetchEventByName(
  config: CrashProviderConfig,
  eventName: string,
): Promise<CrashlyticsEvent | null> {
  const parent = crashlyticsAppParent(config)
  const params = new URLSearchParams()
  params.append('names', eventName)
  const raw = await crashlyticsGet(config, `${parent}/events:batchGet?${params.toString()}`)
  const events = (raw as { events?: CrashlyticsEvent[] }).events
  return Array.isArray(events) && events[0] ? events[0]! : null
}

async function fetchLatestEventForIssue(
  config: CrashProviderConfig,
  issueId: string,
): Promise<CrashlyticsEvent | null> {
  const parent = crashlyticsAppParent(config)
  const params = new URLSearchParams()
  params.set('pageSize', '1')
  params.set('filter.issue.id', issueId)
  const { startMs, endMs } = resolveCrashTimeWindow({ timeRange: '90d' })
  if (startMs != null) params.set('filter.interval.startTime', toRfc3339(startMs))
  if (endMs != null) params.set('filter.interval.endTime', toRfc3339(endMs))
  const raw = await crashlyticsGet(config, `${parent}/events?${params.toString()}`)
  const events = (raw as { events?: CrashlyticsEvent[] }).events
  return Array.isArray(events) && events[0] ? events[0]! : null
}

function listCacheKey(config: CrashProviderConfig, query?: CrashListQuery): string {
  const queryKey = stableCrashListQueryKey(query)
  const hash = createHash('sha256').update(queryKey).digest('hex').slice(0, 16)
  return `${projectIdOf(config)}|${appIdOf(config)}|${hash}`
}

async function fetchTopIssuesPage(
  config: CrashProviderConfig,
  query: CrashListQuery | undefined,
  page: number,
  pageSize: number,
): Promise<{ items: CrashIncidentSummary[]; total?: number; hasMore: boolean }> {
  let pageToken: string | undefined
  let last: { items: CrashIncidentSummary[]; total?: number; nextPageToken?: string } = {
    items: [],
  }
  for (let i = 1; i <= page; i++) {
    const qs = buildCrashlyticsReportQuery(query, pageSize, pageToken)
    const raw = await fetchReport(config, CRASHLYTICS_REPORT_TOP_ISSUES, qs)
    last = mapCrashlyticsTopIssuesReport(raw, appIdOf(config))
    if (i < page) {
      if (!last.nextPageToken) {
        return { items: [], total: last.total, hasMore: false }
      }
      pageToken = last.nextPageToken
    }
  }
  return {
    items: last.items,
    total: last.total,
    hasMore: Boolean(last.nextPageToken) || (last.total != null && page * pageSize < last.total),
  }
}

export const crashlyticsCrashProvider: CrashProvider & {
  probe(config: CrashProviderConfig): Promise<{ ok: boolean; error?: string }>
  listFilterOptions(
    config: CrashProviderConfig,
    opts?: { metaType?: string },
  ): Promise<CrashFilterOptions>
} = {
  id: 'crashlytics',

  isReady(config: CrashProviderConfig): boolean {
    if (config.provider !== 'crashlytics') return false
    if (!projectIdOf(config) || !appIdOf(config)) return false
    return Boolean(config.accessToken?.trim() || parseServiceAccountJson(config.serviceAccountJson))
  },

  capabilities() {
    return {
      filters: [
        'timeRange',
        'appVersion',
        'errorKind',
        'osDevice',
        'status',
        'keyword',
      ],
      supportsDetail: true,
    }
  },

  async listFilterOptions(config) {
    return fetchCrashlyticsFilterOptions(config)
  },

  async probe(config) {
    try {
      if (!crashlyticsCrashProvider.isReady(config)) {
        return {
          ok: false,
          error: 'Crashlytics requires projectId, appId, and accessToken or serviceAccountJson',
        }
      }
      await fetchReport(config, CRASHLYTICS_REPORT_TOP_ISSUES, buildCrashlyticsReportQuery({ timeRange: '7d' }, 1))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  async list(config, query) {
    const { page, pageSize } = resolveCrashListPage(query)
    const empty = (): CrashListResult => ({
      items: [],
      page,
      pageSize,
      total: 0,
      hasMore: false,
    })
    if (config.provider !== 'crashlytics') return empty()
    if (!crashlyticsCrashProvider.isReady(config)) return empty()

    const cached = listCache.get(listCacheKey(config, query))
    if (cached && Date.now() <= cached.expiresAt) return cached.result

    const pageResult = await fetchTopIssuesPage(config, query, page, pageSize)
    const result: CrashListResult = {
      items: pageResult.items,
      page,
      pageSize,
      total: pageResult.total,
      hasMore: pageResult.hasMore,
    }
    if (result.items.length > 0 || (result.total != null && result.total > 0)) {
      listCache.set(listCacheKey(config, query), {
        expiresAt: Date.now() + LIST_CACHE_TTL_MS,
        result,
      })
    }
    return result
  },

  async get(config, id) {
    if (config.provider !== 'crashlytics') {
      throw new Error('Crashlytics provider requires provider: crashlytics')
    }
    if (!crashlyticsCrashProvider.isReady(config)) {
      throw new CrashlyticsError(
        'CRASHLYTICS_CONFIG',
        'Crashlytics requires projectId, appId, and accessToken or serviceAccountJson',
      )
    }
    const issueId = id.trim()
    if (!issueId) {
      throw new CrashlyticsError('CRASHLYTICS_BAD_RESPONSE', 'Missing crash incident id')
    }

    const issue = await fetchIssue(config, issueId)
    let event: CrashlyticsEvent | null = null
    const sample = asText(issue.sampleEvent)?.trim()
    if (sample) {
      try {
        event = await fetchEventByName(config, sample)
      } catch {
        event = null
      }
    }
    if (!event) {
      event = await fetchLatestEventForIssue(config, issueId)
    }
    if (!event) {
      throw new CrashlyticsError(
        'CRASHLYTICS_BAD_RESPONSE',
        'No Crashlytics events found for this issue — open it in Firebase console or paste the stack locally',
      )
    }

    const stackText = formatCrashlyticsEventStack(event)
    if (!stackText.trim()) {
      throw new CrashlyticsError(
        'CRASHLYTICS_BAD_RESPONSE',
        'Crashlytics event has no stack frames — paste the stack locally',
      )
    }

    const titleParts = [
      asText(issue.title)?.trim() || asText(event.issueTitle)?.trim(),
      asText(issue.subtitle)?.trim() || asText(event.issueSubtitle)?.trim(),
    ].filter(Boolean)

    return {
      id: issueId,
      title: titleParts.join(' — ') || issueId,
      provider: 'crashlytics',
      stackText,
      exceptionName:
        asText(event.exceptions?.[0]?.type)?.trim() ||
        asText(issue.subtitle)?.trim() ||
        asText(issue.title)?.trim(),
      appVersion:
        asText(event.version?.displayVersion)?.trim() ||
        asText(issue.lastSeenVersion)?.trim() ||
        asText(issue.firstSeenVersion)?.trim(),
      buildNumber: asText(event.version?.buildVersion)?.trim(),
      platform: platformFromAppId(appIdOf(config)),
      errorKind: mapCrashlyticsErrorType(issue.errorType || event.issue?.errorType),
      status: mapCrashlyticsState(issue.state || event.issue?.state),
      deviceModel:
        asText(event.device?.displayName)?.trim() ||
        asText(event.device?.marketingName)?.trim() ||
        asText(event.device?.model)?.trim(),
      osVersion:
        asText(event.operatingSystem?.displayName)?.trim() ||
        asText(event.operatingSystem?.displayVersion)?.trim(),
      occurredAt: asText(event.eventTime)?.trim() || asText(issue.lastSeenTime)?.trim(),
      firstSeenAt: asText(issue.firstSeenTime)?.trim(),
      lastSeenAt: asText(issue.lastSeenTime)?.trim(),
      rawRef: asText(issue.uri)?.trim() || asText(event.name)?.trim() || sample,
    } satisfies CrashIncident
  },
}
