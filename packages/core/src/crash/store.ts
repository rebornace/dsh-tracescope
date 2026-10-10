/**
 * Crash platform credentials (Umeng cookie / appKey) — separate from defect tracker config.
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

function asProviderId(value: unknown): CrashProviderId {
  if (value === 'umeng' || value === 'local') return value
  return 'local'
}

function normalizeEntry(raw: unknown): CrashProviderConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const provider = asProviderId(o.provider)
  const entry: CrashProviderConfig = { provider }
  if (typeof o.stackText === 'string') entry.stackText = o.stackText
  if (typeof o.title === 'string') entry.title = o.title
  if (typeof o.appKey === 'string') entry.appKey = o.appKey
  if (typeof o.appDisplayName === 'string') entry.appDisplayName = o.appDisplayName
  if (typeof o.cookie === 'string') entry.cookie = o.cookie
  if (typeof o.consoleBaseUrl === 'string') entry.consoleBaseUrl = o.consoleBaseUrl
  if (o.transport === 'console' || o.transport === 'openapi') entry.transport = o.transport
  if (o.inheritGlobalCookie === false) entry.inheritGlobalCookie = false
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
  return !token || token === MASKED_SECRET
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
  }
}

/** Resolved config for server-side provider calls (includes cookie when stored). */
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
  }
  return merged
}

export function cookiePresentLabel(config: CrashProviderConfig | null | undefined): string {
  return config?.cookie?.trim() && !isMaskedCrashSecret(config.cookie) ? 'yes' : 'no'
}

/** Public config for Host UI (cookie masked). */
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
} {
  const cfg = config ?? { provider: 'local' as const }
  const cookieRaw = typeof cfg.cookie === 'string' ? cfg.cookie.trim() : ''
  const hasCookie = Boolean(cookieRaw && !isMaskedCrashSecret(cookieRaw))
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
  }
}

function keepCookie(incoming: unknown, prev: string | undefined): string | undefined {
  const raw = typeof incoming === 'string' ? incoming.trim() : ''
  if (raw && !isMaskedCrashSecret(raw)) return raw
  return prev
}

export async function saveCrashConfig(
  cfg: CrashProviderConfig,
  options: {
    repoPath?: string | null
    remember?: boolean | string
    /** When true, persist with no cookie (do not fall back via keepCookie). */
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
      ? keepCookie(cfg.cookie, existing?.cookie)
      : undefined

  let inheritGlobalCookie = existing?.inheritGlobalCookie
  if (clearCookie && scope === 'repo') {
    inheritGlobalCookie = false
  } else if (resolvedCookie && scope === 'repo') {
    inheritGlobalCookie = true
  }

  const next: CrashProviderConfig = {
    provider: asProviderId(cfg.provider),
    stackText: typeof cfg.stackText === 'string' ? cfg.stackText : existing?.stackText,
    title: typeof cfg.title === 'string' ? cfg.title : existing?.title,
    appKey: typeof cfg.appKey === 'string' ? cfg.appKey.trim() : existing?.appKey,
    appDisplayName:
      typeof cfg.appDisplayName === 'string' ? cfg.appDisplayName.trim() : existing?.appDisplayName,
    cookie: resolvedCookie,
    consoleBaseUrl:
      typeof cfg.consoleBaseUrl === 'string' ? cfg.consoleBaseUrl.trim() : existing?.consoleBaseUrl,
    transport: cfg.transport ?? existing?.transport,
  }
  if (scope === 'repo' && inheritGlobalCookie === false) {
    next.inheritGlobalCookie = false
  }

  if (!remember) {
    if (scope === 'repo' && key && file.byRepo?.[key]) {
      const { cookie: _c, ...rest } = file.byRepo[key]!
      file.byRepo[key] = { ...rest, cookie: undefined }
    } else if (file.global) {
      const { cookie: _c, ...rest } = file.global
      file.global = { ...rest, cookie: undefined }
    }
    await writeCredentialsFile(file, options.cacheRoot)
    return loadCrashConfig(options.repoPath, options.cacheRoot)
  }

  if (scope === 'repo' && key) {
    file.byRepo = { ...(file.byRepo ?? {}), [key]: next }
    // Mirror Umeng credentials to global so they reload when repoPath changes
    // (remote URL vs local clone, or older cwd-shifted keys). Repo-only
    // clearCookie must not wipe the global cookie.
    if (!clearCookie) {
      file.global = {
        provider: next.provider,
        appKey: next.appKey ?? file.global?.appKey,
        appDisplayName: next.appDisplayName ?? file.global?.appDisplayName,
        cookie: next.cookie ?? file.global?.cookie,
        consoleBaseUrl: next.consoleBaseUrl ?? file.global?.consoleBaseUrl,
        transport: next.transport ?? file.global?.transport,
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
    const { cookie: _c, ...rest } = file.byRepo[key]!
    file.byRepo[key] = { ...rest, cookie: undefined, inheritGlobalCookie: false }
  } else if (file.global) {
    const { cookie: _c, ...rest } = file.global
    file.global = { ...rest, cookie: undefined }
  }
  await writeCredentialsFile(file, cacheRoot)
}

/** Merge persisted config with request body (body wins for non-secret fields). */
export async function resolveCrashConfigFromBody(
  body: Record<string, unknown>,
  cacheRoot?: string,
): Promise<CrashProviderConfig> {
  const repoPath = typeof body.repoPath === 'string' ? body.repoPath : undefined
  const stored = await loadCrashConfig(repoPath, cacheRoot)
  const incoming = normalizeEntry(body) ?? { provider: stored.provider ?? 'local' }
  return {
    provider: incoming.provider ?? stored.provider ?? 'local',
    stackText:
      typeof body.stackText === 'string'
        ? body.stackText
        : incoming.stackText ?? stored.stackText,
    title:
      typeof body.title === 'string' ? body.title : incoming.title ?? stored.title,
    appKey:
      typeof body.appKey === 'string'
        ? body.appKey.trim()
        : incoming.appKey ?? stored.appKey,
    appDisplayName:
      typeof body.appDisplayName === 'string'
        ? body.appDisplayName.trim()
        : incoming.appDisplayName ?? stored.appDisplayName,
    cookie: keepCookie(body.cookie, stored.cookie ?? incoming.cookie),
    consoleBaseUrl:
      typeof body.consoleBaseUrl === 'string'
        ? body.consoleBaseUrl.trim()
        : incoming.consoleBaseUrl ?? stored.consoleBaseUrl,
    transport:
      body.transport === 'console' || body.transport === 'openapi'
        ? body.transport
        : incoming.transport ?? stored.transport,
  }
}
