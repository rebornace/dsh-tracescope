/**
 * Crash analysis Host routes: credentials, provider list/detail, analyze pipeline.
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute } from '../http/route-helpers.js'
import {
  analyzeCrash,
  cookiePresentLabel,
  getCrashProvider,
  isMaskedCrashSecret,
  loadCrashConfig,
  publicCrashConfig,
  resolveCrashConfigFromBody,
  saveCrashConfig,
  type CrashFeedbackMeta,
  type CrashIncident,
  type CrashProviderConfig,
} from '@rebornace/tracescope-core'
import { I18nError } from '../i18n/messages.js'

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {}
}

function parseIncident(raw: unknown): CrashIncident | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id.trim() : ''
  const title = typeof o.title === 'string' ? o.title.trim() : ''
  const stackText = typeof o.stackText === 'string' ? o.stackText : ''
  const provider = o.provider === 'umeng' || o.provider === 'local' ? o.provider : 'local'
  if (!id || !stackText.trim()) return null
  return {
    id,
    title: title || id,
    provider,
    stackText,
    exceptionName: typeof o.exceptionName === 'string' ? o.exceptionName : undefined,
    appVersion: typeof o.appVersion === 'string' ? o.appVersion : undefined,
    buildNumber: typeof o.buildNumber === 'string' ? o.buildNumber : undefined,
    platform:
      o.platform === 'android' || o.platform === 'ios' || o.platform === 'other'
        ? o.platform
        : undefined,
    errorKind:
      o.errorKind === 'crash' ||
      o.errorKind === 'anr' ||
      o.errorKind === 'error' ||
      o.errorKind === 'other'
        ? o.errorKind
        : undefined,
    status:
      o.status === 'open' || o.status === 'closed' || o.status === 'other' ? o.status : undefined,
    count: typeof o.count === 'number' ? o.count : undefined,
    affectedUsers: typeof o.affectedUsers === 'number' ? o.affectedUsers : undefined,
    osVersion: typeof o.osVersion === 'string' ? o.osVersion : undefined,
    deviceModel: typeof o.deviceModel === 'string' ? o.deviceModel : undefined,
    occurredAt: typeof o.occurredAt === 'string' ? o.occurredAt : undefined,
    firstSeenAt: typeof o.firstSeenAt === 'string' ? o.firstSeenAt : undefined,
    lastSeenAt: typeof o.lastSeenAt === 'string' ? o.lastSeenAt : undefined,
    rawRef: typeof o.rawRef === 'string' ? o.rawRef : undefined,
  }
}

function parseCrashMeta(raw: unknown): CrashFeedbackMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const incident = parseIncident(o.incident)
  if (!incident) return undefined
  const summary = typeof o.summary === 'string' ? o.summary : ''
  const matchedFiles = Array.isArray(o.matchedFiles)
    ? o.matchedFiles
        .filter((m) => m && typeof m === 'object')
        .map((m) => {
          const row = m as Record<string, unknown>
          return {
            path: typeof row.path === 'string' ? row.path : '',
            reason: typeof row.reason === 'string' ? row.reason : '',
            symbol: typeof row.symbol === 'string' ? row.symbol : undefined,
          }
        })
        .filter((m) => m.path)
    : []
  const fixHints = Array.isArray(o.fixHints) ? o.fixHints.map(String) : undefined
  return { incident, matchedFiles, summary, fixHints }
}

function umengNotReadyMessage(config: CrashProviderConfig, lang: string): string {
  const present = cookiePresentLabel(config)
  if (lang === 'en') {
    return `Umeng console provider is not ready in this build (appKey: ${config.appKey?.trim() ? 'yes' : 'no'}, cookie present: ${present})`
  }
  return `\u53cb\u76df Console \u53d6\u6570\u6682\u672a\u5c31\u7eea\uff08appKey\uff1a${config.appKey?.trim() ? '\u6709' : '\u65e0'}\uff0c cookie present: ${present}\uff09`
}

async function runProbe(config: CrashProviderConfig, lang: string): Promise<{ ok: boolean; error?: string }> {
  if (config.provider === 'umeng') {
    const adapter = getCrashProvider('umeng')
    if (!adapter) {
      return { ok: false, error: umengNotReadyMessage(config, lang) }
    }
    if (!adapter.isReady(config)) {
      return { ok: false, error: umengNotReadyMessage(config, lang) }
    }
    const probe = (adapter as { probe?: (c: CrashProviderConfig) => Promise<{ ok: boolean; error?: string }> })
      .probe
    if (probe) return probe(config)
    return { ok: true }
  }
  const adapter = getCrashProvider(config.provider)
  if (!adapter) {
    return {
      ok: false,
      error: lang === 'en' ? 'Unsupported crash provider' : '\u4e0d\u652f\u6301\u7684\u5d29\u6e83\u6570\u636e\u6e90',
    }
  }
  if (config.provider === 'local') {
    const ready = adapter.isReady(config)
    return ready
      ? { ok: true }
      : {
          ok: false,
          error:
            lang === 'en'
              ? 'Local provider needs stackText in config or request body'
              : 'local \u6a21\u5f0f\u9700\u8981\u63d0\u4f9b stackText',
        }
  }
  return { ok: adapter.isReady(config) }
}

export function registerCrashRoutes(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/crash-config',
    method: 'GET',
    run: async (body, _ctx) => {
      const b = asRecord(body)
      const config = await loadCrashConfig(typeof b.repoPath === 'string' ? b.repoPath : undefined)
      return { config: publicCrashConfig(config) }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-config-save',
    method: 'POST',
    run: async (body, _ctx) => {
      const b = asRecord(body)
      const remember = b.remember !== false && b.remember !== 'false'
      const repoPath = typeof b.repoPath === 'string' ? b.repoPath : undefined
      const existing = await loadCrashConfig(repoPath)
      const incoming: CrashProviderConfig = {
        provider: b.provider === 'umeng' ? 'umeng' : b.provider === 'local' ? 'local' : existing.provider,
        stackText: typeof b.stackText === 'string' ? b.stackText : existing.stackText,
        title: typeof b.title === 'string' ? b.title : existing.title,
        appKey: typeof b.appKey === 'string' ? b.appKey.trim() : existing.appKey,
        appDisplayName:
          typeof b.appDisplayName === 'string' ? b.appDisplayName.trim() : existing.appDisplayName,
        cookie:
          typeof b.cookie === 'string' && !isMaskedCrashSecret(b.cookie)
            ? b.cookie.trim()
            : b.cookie === '' || b.clearCookie === true
              ? undefined
              : existing.cookie,
        consoleBaseUrl:
          typeof b.consoleBaseUrl === 'string' ? b.consoleBaseUrl.trim() : existing.consoleBaseUrl,
        transport:
          b.transport === 'console' || b.transport === 'openapi' ? b.transport : existing.transport,
      }
      const saved = await saveCrashConfig(incoming, { repoPath, remember })
      return { ok: true, config: publicCrashConfig(saved) }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-probe',
    method: 'POST',
    run: async (body, { lang }) => {
      const config = await resolveCrashConfigFromBody(asRecord(body))
      const result = await runProbe(config, lang)
      return { ...result, config: publicCrashConfig(config) }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-list',
    method: 'POST',
    run: async (body, { lang }) => {
      const config = await resolveCrashConfigFromBody(asRecord(body))
      const adapter = getCrashProvider(config.provider)
      if (!adapter) {
        throw new I18nError('ERR_CRASH_PROVIDER', lang, { provider: config.provider })
      }
      if (config.provider === 'umeng' && !adapter.isReady(config)) {
        return { items: [], error: umengNotReadyMessage(config, lang) }
      }
      const items = await adapter.list(config)
      return { items, capabilities: adapter.capabilities() }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-detail',
    method: 'POST',
    run: async (body, { lang }) => {
      const b = asRecord(body)
      const id = typeof b.id === 'string' ? b.id.trim() : ''
      if (!id) throw new I18nError('ERR_MISSING_ID', lang)
      const config = await resolveCrashConfigFromBody(b)
      const adapter = getCrashProvider(config.provider)
      if (!adapter) {
        throw new I18nError('ERR_CRASH_PROVIDER', lang, { provider: config.provider })
      }
      if (config.provider === 'umeng' && !adapter.isReady(config)) {
        throw new I18nError('ERR_CRASH_UMENG_NOT_READY', lang, {
          cookie: cookiePresentLabel(config),
        })
      }
      const incident = await adapter.get(config, id)
      return { incident }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-analyze',
    method: 'POST',
    run: async (body, { lang }) => {
      const b = asRecord(body)
      const incident = parseIncident(b.incident)
      if (!incident) throw new I18nError('ERR_CRASH_MISSING_INCIDENT', lang)
      const repoPath = typeof b.repoPath === 'string' ? b.repoPath.trim() : ''
      if (!repoPath) throw new I18nError('ERR_MISSING_REPO_PATH', lang)
      const report = await analyzeCrash({
        incident,
        repoPath,
        lang: typeof b.lang === 'string' ? b.lang : lang,
      })
      return { report }
    },
  })
}

export { parseCrashMeta }
