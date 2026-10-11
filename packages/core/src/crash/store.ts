/**
 * Crash platform credentials (Umeng cookie / Crashlytics token) — separate from defect tracker config.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { dataRootSync } from '../paths.js'
import type { CrashProviderConfig, CrashProviderId } from './types.js'

const MASKED_SECRET = '••••••••'

function credentialsPath(cacheRoot?: string): string {
  return path.join(dataRootSync(cacheRoot), 'crash-credentials.json')
}

export interface StoredCrashCredentialsFile {
  global?: CrashProviderConfig
  byRepo?: Record<string, CrashProviderConfig>
}

/**
 * Stable scope key for credentials.
 * Remote URLs must NOT go through `path.resolve` (cwd-dependent on Windows).
 * Filesystem paths stay absolute via resolve.
 */
export function crashRepoKey(repoPath: string | undefined | null): string | null {
  const raw = typeof repoPath === 'string' ? repoPath.trim() : ''
  if (!raw) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const u = new URL(raw)
      u.hash = ''
      return u.toString().replace(/\/+$/, '').toLowerCase()
    } catch {
      return raw.toLowerCase()
    }
  }
  return path.resolve(raw)
}

/** @deprecated use crashRepoKey — kept as internal alias */
function repoKey(repoPath: string | undefined | null): string | null {
  return crashRepoKey(repoPath)
}

function asProviderId(value: unknown): CrashProviderId | undefined {
  if (value === 'umeng' || value === 'local' || value === 'crashlytics') return value
  return undefined
}

function normalizeEntry(raw: unknown): CrashProviderConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const provider = asProviderId(o.provider) ?? 'local'
  const entry: CrashProviderConfig = { provider }
  if (typeof o.stackText === 'string') entry.stackText = o.stackText
  if (typeof o.title === 'string') entry.title = o.title
  if (typeof o.appKey === 'string') entry.appKey = o.appKey
  if (typeof o.appDisplayName === 'string') entry.appDisplayName = o.appDisplayName
  if (typeof o.cookie === 'string') entry.cookie = o.cookie
  if (typeof o.consoleBaseUrl === 'string') entry.consoleBaseUrl = o.consoleBaseUrl
  if (o.transport === 'console' || o.transport === 'openapi') entry.transport = o.transport
  if (o.inheritGlobalCookie === false) entry.inheritGlobalCookie = false
  if (typeof o.projectId === 'string') entry.projectId = o.projectId
  if (typeof o.appId === 'string') entry.appId = o.appId
  if (typeof o.accessToken === 'string') entry.accessToken = o.accessToken
  if (typeof o.serviceAccountJson === 'string') entry.serviceAccountJson = o.serviceAccountJson
  return entry
}

function normalizeFile(raw: unknown): StoredCrashCredentialsFile {
  if (!raw || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  const global = normalizeEntry(o.global)
  const byRepo: Record<string, CrashProviderConfig> = {}
  if (o.byRepo && typeof o.byRepo === 'object' && !Array.isArray(o.byRepo)) {
    for (const [key, value] of Object.entries(o.byRepo as Record<string, unknown>)) {
      const entry = normalizeEntry(value)
      const normalizedKey = crashRepoKey(key) ?? key
      if (entry) byRepo[normalizedKey] = entry
    }
  }
  return { global, byRepo: Object.keys(byRepo).length ? byRepo : undefined }
}

async function readCredentialsFile(cacheRoot?: string): Promise<StoredCrashCredentialsFile> {
  try {
    const raw = JSON.parse(await readFile(credentialsPath(cacheRoot), 'utf8'))
    return normalizeFile(raw)
  } catch {
    return {}
  }
}

async function writeCredentialsFile(
  file: StoredCrashCredentialsFile,
  cacheRoot?: string,
): Promise<void> {
  const target = credentialsPath(cacheRoot)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
}

export function isMaskedCrashSecret(value: string | undefined | null): boolean {
  const token = typeof value === 'string' ? value.trim() : ''
  if (!token) return true
  if (token === MASKED_SECRET) return true
  // Host UI historically used ASCII `????????` as the mask; treat as masked too
  // so a later save/probe does not overwrite the real service-account JSON.
  if (/^\?{4,}$/.test(token)) return true
  if (/^•{4,}$/.test(token)) return true
  return false
}

function hasSecret(value: string | undefined | null): boolean {
  return Boolean(value?.trim() && !isMaskedCrashSecret(value))
}

function mergeEntries(
  base: CrashProviderConfig | undefined,
  overlay: CrashProviderConfig | undefined,
): CrashProviderConfig {
  const provider = overlay?.provider ?? base?.provider ?? 'local'
  return {
    provider,
    stackText: overlay?.stackText ?? base?.stackText,
    title: overlay?.title ?? base?.title,
    appKey: overlay?.appKey ?? base?.appKey,
    appDisplayName: overlay?.appDisplayName ?? base?.appDisplayName,
    cookie: overlay?.cookie ?? base?.cookie,
    consoleBaseUrl: overlay?.consoleBaseUrl ?? base?.consoleBaseUrl,
    transport: overlay?.transport ?? base?.transport,
    projectId: overlay?.projectId ?? base?.projectId,
    appId: overlay?.appId ?? base?.appId,
    accessToken: overlay?.accessToken ?? base?.accessToken,
    serviceAccountJson: overlay?.serviceAccountJson ?? base?.serviceAccountJson,
  }
}

/** Resolved config for server-side provider calls (includes secrets when stored). */
export async function loadCrashConfig(
  repoPath?: string | null,
  cacheRoot?: string,
): Promise<CrashProviderConfig> {
  const file = await readCredentialsFile(cacheRoot)
  const key = repoKey(repoPath)
  const fromRepo = key ? file.byRepo?.[key] : undefined
  const merged = mergeEntries(file.global, fromRepo)
  if (key && fromRepo && fromRepo.inheritGlobalCookie === false) {
    merged.cookie = fromRepo.cookie
    merged.accessToken = fromRepo.accessToken
    merged.serviceAccountJson = fromRepo.serviceAccountJson
  }
  return merged
}

export function cookiePresentLabel(config: CrashProviderConfig | null | undefined): string {
  return hasSecret(config?.cookie) ? 'yes' : 'no'
}

export function accessTokenPresentLabel(config: CrashProviderConfig | null | undefined): string {
  return hasSecret(config?.accessToken) || hasSecret(config?.serviceAccountJson) ? 'yes' : 'no'
}

/** Public config for Host UI (secrets masked). */
export function publicCrashConfig(config: CrashProviderConfig | null | undefined): {
  provider: CrashProviderId
  stackText?: string
  title?: string
  appKey?: string
  appDisplayName?: string
  cookie: string
  hasCookie: boolean
  consoleBaseUrl?: string
  transport?: 'console' | 'openapi'
  projectId?: string
  appId?: string
  accessToken: string
  hasAccessToken: boolean
  serviceAccountJson: string
  hasServiceAccount: boolean
} {
  const cfg = config ?? { provider: 'local' as const }
  const cookieRaw = typeof cfg.cookie === 'string' ? cfg.cookie.trim() : ''
  const hasCookie = hasSecret(cookieRaw)
  const hasAccessToken = hasSecret(cfg.accessToken)
  const hasServiceAccount = hasSecret(cfg.serviceAccountJson)
  return {
    provider: cfg.provider ?? 'local',
    stackText: cfg.stackText,
    title: cfg.title,
    appKey: cfg.appKey,
    appDisplayName: cfg.appDisplayName,
    cookie: hasCookie ? MASKED_SECRET : '',
    hasCookie,
    consoleBaseUrl: cfg.consoleBaseUrl,
    transport: cfg.transport,
    projectId: cfg.projectId,
    appId: cfg.appId,
    accessToken: hasAccessToken ? MASKED_SECRET : '',
    hasAccessToken,
    serviceAccountJson: hasServiceAccount ? MASKED_SECRET : '',
    hasServiceAccount,
  }
}

function keepSecret(incoming: unknown, prev: string | undefined): string | undefined {
  const raw = typeof incoming === 'string' ? incoming.trim() : ''
  if (raw && !isMaskedCrashSecret(raw)) return raw
  return prev
}

function stripSecrets(entry: CrashProviderConfig): CrashProviderConfig {
  const {
    cookie: _c,
    accessToken: _a,
    serviceAccountJson: _s,
    ...rest
  } = entry
  return { ...rest, cookie: undefined, accessToken: undefined, serviceAccountJson: undefined }
}

export async function saveCrashConfig(
  cfg: CrashProviderConfig,
  options: {
    repoPath?: string | null
    remember?: boolean | string
    /** When true, persist with no secrets (do not fall back via keepSecret). */
    clearCookie?: boolean
    cacheRoot?: string
  } = {},
): Promise<CrashProviderConfig> {
  const remember = options.remember !== false && options.remember !== 'false'
  const clearCookie = options.clearCookie === true
  const file = await readCredentialsFile(options.cacheRoot)
  const key = repoKey(options.repoPath)
  const scope: 'global' | 'repo' = key ? 'repo' : 'global'
  const existing =
    scope === 'repo' && key ? file.byRepo?.[key] : file.global

  const resolvedCookie = clearCookie
    ? undefined
    : remember
      ? keepSecret(cfg.cookie, existing?.cookie)
      : undefined
  const resolvedAccessToken = clearCookie
    ? undefined
    : remember
      ? keepSecret(cfg.accessToken, existing?.accessToken)
      : undefined
  const resolvedServiceAccount = clearCookie
    ? undefined
    : remember
      ? keepSecret(cfg.serviceAccountJson, existing?.serviceAccountJson)
      : undefined

  let inheritGlobalCookie = existing?.inheritGlobalCookie
  if (clearCookie && scope === 'repo') {
    inheritGlobalCookie = false
  } else if (
    (resolvedCookie || resolvedAccessToken || resolvedServiceAccount) &&
    scope === 'repo'
  ) {
    inheritGlobalCookie = true
  }

  const next: CrashProviderConfig = {
    provider: asProviderId(cfg.provider) ?? existing?.provider ?? 'local',
    stackText: typeof cfg.stackText === 'string' ? cfg.stackText : existing?.stackText,
    title: typeof cfg.title === 'string' ? cfg.title : existing?.title,
    appKey: typeof cfg.appKey === 'string' ? cfg.appKey.trim() : existing?.appKey,
    appDisplayName:
      typeof cfg.appDisplayName === 'string' ? cfg.appDisplayName.trim() : existing?.appDisplayName,
    cookie: resolvedCookie,
    consoleBaseUrl:
      typeof cfg.consoleBaseUrl === 'string' ? cfg.consoleBaseUrl.trim() : existing?.consoleBaseUrl,
    transport: cfg.transport ?? existing?.transport,
    projectId: typeof cfg.projectId === 'string' ? cfg.projectId.trim() : existing?.projectId,
    appId: typeof cfg.appId === 'string' ? cfg.appId.trim() : existing?.appId,
    accessToken: resolvedAccessToken,
    serviceAccountJson: resolvedServiceAccount,
  }
  if (scope === 'repo' && inheritGlobalCookie === false) {
    next.inheritGlobalCookie = false
  }

  if (!remember) {
    if (scope === 'repo' && key && file.byRepo?.[key]) {
      file.byRepo[key] = stripSecrets(file.byRepo[key]!)
    } else if (file.global) {
      file.global = stripSecrets(file.global)
    }
    await writeCredentialsFile(file, options.cacheRoot)
    return loadCrashConfig(options.repoPath, options.cacheRoot)
  }

  if (scope === 'repo' && key) {
    file.byRepo = { ...(file.byRepo ?? {}), [key]: next }
    // Mirror credentials to global so they reload when repoPath changes.
    if (!clearCookie) {
      file.global = {
        provider: next.provider,
        appKey: next.appKey ?? file.global?.appKey,
        appDisplayName: next.appDisplayName ?? file.global?.appDisplayName,
        cookie: next.cookie ?? file.global?.cookie,
        consoleBaseUrl: next.consoleBaseUrl ?? file.global?.consoleBaseUrl,
        transport: next.transport ?? file.global?.transport,
        projectId: next.projectId ?? file.global?.projectId,
        appId: next.appId ?? file.global?.appId,
        accessToken: next.accessToken ?? file.global?.accessToken,
        serviceAccountJson: next.serviceAccountJson ?? file.global?.serviceAccountJson,
      }
    }
  } else {
    file.global = next
  }
  await writeCredentialsFile(file, options.cacheRoot)
  return loadCrashConfig(options.repoPath, options.cacheRoot)
}

export async function clearCrashCookie(
  repoPath?: string | null,
  cacheRoot?: string,
): Promise<void> {
  const file = await readCredentialsFile(cacheRoot)
  const key = repoKey(repoPath)
  if (key && file.byRepo?.[key]) {
    file.byRepo[key] = {
      ...stripSecrets(file.byRepo[key]!),
      inheritGlobalCookie: false,
    }
  } else if (file.global) {
    file.global = stripSecrets(file.global)
  }
  await writeCredentialsFile(file, cacheRoot)
}

/**
 * Infer Crashlytics when the body/storage clearly carries Firebase credentials.
 * Prevents a missing/invalid `provider` field from falling back to `local`
 * (which surfaces as “local 模式需要提供 stackText” on probe).
 */
export function inferCrashProviderId(
  body: Record<string, unknown>,
  stored: CrashProviderConfig,
): CrashProviderId {
  const explicit = asProviderId(body.provider)
  if (explicit) return explicit

  const projectId =
    (typeof body.projectId === 'string' ? body.projectId.trim() : '') ||
    stored.projectId?.trim() ||
    ''
  const appId =
    (typeof body.appId === 'string' ? body.appId.trim() : '') || stored.appId?.trim() || ''
  const token =
    (typeof body.accessToken === 'string' && !isMaskedCrashSecret(body.accessToken)
      ? body.accessToken.trim()
      : '') ||
    stored.accessToken?.trim() ||
    ''
  const sa =
    (typeof body.serviceAccountJson === 'string' && !isMaskedCrashSecret(body.serviceAccountJson)
      ? body.serviceAccountJson.trim()
      : '') ||
    stored.serviceAccountJson?.trim() ||
    ''
  if (projectId && appId && (token || sa)) return 'crashlytics'

  const appKey =
    (typeof body.appKey === 'string' ? body.appKey.trim() : '') || stored.appKey?.trim() || ''
  const cookie =
    (typeof body.cookie === 'string' && !isMaskedCrashSecret(body.cookie)
      ? body.cookie.trim()
      : '') ||
    stored.cookie?.trim() ||
    ''
  if (appKey && cookie) return 'umeng'

  return stored.provider ?? 'local'
}

/** Merge persisted config with request body (body wins for non-secret fields). */
export async function resolveCrashConfigFromBody(
  body: Record<string, unknown>,
  cacheRoot?: string,
): Promise<CrashProviderConfig> {
  const repoPath = typeof body.repoPath === 'string' ? body.repoPath : undefined
  const stored = await loadCrashConfig(repoPath, cacheRoot)
  const incoming = normalizeEntry(body)
  const provider = inferCrashProviderId(body, stored)
  return {
    provider,
    stackText:
      typeof body.stackText === 'string'
        ? body.stackText
        : incoming?.stackText ?? stored.stackText,
    title:
      typeof body.title === 'string' ? body.title : incoming?.title ?? stored.title,
    appKey:
      typeof body.appKey === 'string'
        ? body.appKey.trim()
        : incoming?.appKey ?? stored.appKey,
    appDisplayName:
      typeof body.appDisplayName === 'string'
        ? body.appDisplayName.trim()
        : incoming?.appDisplayName ?? stored.appDisplayName,
    cookie: keepSecret(body.cookie, stored.cookie ?? incoming?.cookie),
    consoleBaseUrl:
      typeof body.consoleBaseUrl === 'string'
        ? body.consoleBaseUrl.trim()
        : incoming?.consoleBaseUrl ?? stored.consoleBaseUrl,
    transport:
      body.transport === 'console' || body.transport === 'openapi'
        ? body.transport
        : incoming?.transport ?? stored.transport,
    projectId:
      typeof body.projectId === 'string'
        ? body.projectId.trim()
        : incoming?.projectId ?? stored.projectId,
    appId:
      typeof body.appId === 'string' ? body.appId.trim() : incoming?.appId ?? stored.appId,
    accessToken: keepSecret(body.accessToken, stored.accessToken ?? incoming?.accessToken),
    serviceAccountJson: keepSecret(
      body.serviceAccountJson,
      stored.serviceAccountJson ?? incoming?.serviceAccountJson,
    ),
  }
}
