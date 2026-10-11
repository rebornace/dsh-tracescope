/**
 * Crash analysis Host routes: credentials, provider list/detail, analyze pipeline.
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute } from '../http/route-helpers.js'
import {
  analyzeCrash,
  clearCrashCookie,
  getCrashProvider,
  isMaskedCrashSecret,
  loadCrashConfig,
  publicCrashConfig,
  parseCrashListQuery,
  resolveCrashConfigFromBody,
  saveCrashConfig,
  type CrashFeedbackMeta,
  type CrashIncident,
  type CrashProviderConfig,
} from '@rebornace/tracescope-core'
import type { Lang } from '../i18n/lang.js'
import { I18nError } from '../i18n/messages.js'
import { createCrashAnalysisJob } from '../agent-api.js'
import { getCrashJob } from '../crash-jobs.js'
import {
  crashlyticsCrashListFailure,
  crashlyticsNotReadyMessage,
  crashlyticsNotReadyParams,
  isCrashlyticsNotReady,
  rethrowCrashlyticsError,
} from './crash-crashlytics.js'
import {
  isUmengNotReady,
  rethrowUmengCrashError,
  umengCrashListFailure,
  umengNotReadyMessage,
  umengNotReadyParams,
} from './crash-umeng.js'

function parseProviderId(raw: unknown, fallback: CrashProviderConfig['provider']): CrashProviderConfig['provider'] {
  if (raw === 'umeng' || raw === 'local' || raw === 'crashlytics') return raw
  return fallback
}

function providerNotReady(config: CrashProviderConfig): boolean {
  return isUmengNotReady(config) || isCrashlyticsNotReady(config)
}

function providerNotReadyMessage(config: CrashProviderConfig, lang: Lang): string {
  if (config.provider === 'crashlytics') return crashlyticsNotReadyMessage(config, lang)
  return umengNotReadyMessage(config, lang)
}

function mapProviderListFailure(
  err: unknown,
  lang: Lang,
): { error: string; errorCode: string } | null {
  return umengCrashListFailure(err, lang) ?? crashlyticsCrashListFailure(err, lang)
}

function rethrowProviderCrashError(err: unknown, lang: Lang): never {
  try {
    rethrowUmengCrashError(err, lang)
  } catch (mapped) {
    if (mapped !== err) throw mapped
  }
  rethrowCrashlyticsError(err, lang)
}

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
  const provider =
    o.provider === 'umeng' || o.provider === 'local' || o.provider === 'crashlytics'
      ? o.provider
      : 'local'
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
  const aiAnalysis = typeof o.aiAnalysis === 'string' ? o.aiAnalysis : undefined
  return { incident, matchedFiles, summary, fixHints, aiAnalysis }
}

async function runProbe(
  config: CrashProviderConfig,
  lang: Lang,
): Promise<{ ok: boolean; error?: string }> {
  if (config.provider === 'umeng' || config.provider === 'crashlytics') {
    if (providerNotReady(config)) {
      return { ok: false, error: providerNotReadyMessage(config, lang) }
    }
    const adapter = getCrashProvider(config.provider)!
    const probe = (
      adapter as { probe?: (c: CrashProviderConfig) => Promise<{ ok: boolean; error?: string }> }
    ).probe
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

async function runCrashConfigLoad(body: unknown): Promise<{ config: ReturnType<typeof publicCrashConfig> }> {
  const b = asRecord(body)
  const config = await loadCrashConfig(typeof b.repoPath === 'string' ? b.repoPath : undefined)
  return { config: publicCrashConfig(config) }
}

export function registerCrashRoutes(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/crash-config',
    method: 'GET',
    run: runCrashConfigLoad,
  })

  // Same path, POST body — method fan-out is handled in registerRoute.
  registerRoute(ctx, {
    path: '/tracescope/v1/crash-config',
    method: 'POST',
    run: runCrashConfigLoad,
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-config-save',
    method: 'POST',
    run: async (body, _ctx) => {
      const b = asRecord(body)
      const remember = b.remember !== false && b.remember !== 'false'
      const repoPath = typeof b.repoPath === 'string' ? b.repoPath : undefined
      // Only clear secrets when the client explicitly asks. Empty unused fields
      // (e.g. accessToken while using serviceAccountJson) must NOT wipe credentials —
      // that previously forced probe into local mode ("需要提供 stackText").
      const clearCookie = b.clearCookie === true
      const existing = await loadCrashConfig(repoPath)
      const provider = parseProviderId(b.provider, existing.provider)
      const projectId = typeof b.projectId === 'string' ? b.projectId.trim() : existing.projectId
      const appId = typeof b.appId === 'string' ? b.appId.trim() : existing.appId
      const accessToken = clearCookie
        ? undefined
        : typeof b.accessToken === 'string' && !isMaskedCrashSecret(b.accessToken)
          ? b.accessToken.trim()
          : existing.accessToken
      const serviceAccountJson = clearCookie
        ? undefined
        : typeof b.serviceAccountJson === 'string' && !isMaskedCrashSecret(b.serviceAccountJson)
          ? b.serviceAccountJson.trim()
          : existing.serviceAccountJson
      const resolvedProvider =
        provider === 'local' &&
        projectId?.trim() &&
        appId?.trim() &&
        (accessToken?.trim() || serviceAccountJson?.trim())
          ? 'crashlytics'
          : provider
      const incoming: CrashProviderConfig = {
        provider: resolvedProvider,
        stackText: typeof b.stackText === 'string' ? b.stackText : existing.stackText,
        title: typeof b.title === 'string' ? b.title : existing.title,
        appKey: typeof b.appKey === 'string' ? b.appKey.trim() : existing.appKey,
        appDisplayName:
          typeof b.appDisplayName === 'string' ? b.appDisplayName.trim() : existing.appDisplayName,
        cookie: clearCookie
          ? undefined
          : typeof b.cookie === 'string' && !isMaskedCrashSecret(b.cookie)
            ? b.cookie.trim()
            : existing.cookie,
        consoleBaseUrl:
          typeof b.consoleBaseUrl === 'string' ? b.consoleBaseUrl.trim() : existing.consoleBaseUrl,
        transport:
          b.transport === 'console' || b.transport === 'openapi' ? b.transport : existing.transport,
        projectId,
        appId,
        accessToken,
        serviceAccountJson,
      }
      if (clearCookie) {
        await clearCrashCookie(repoPath)
      }
      const saved = await saveCrashConfig(incoming, { repoPath, remember, clearCookie })
      return { ok: true, config: publicCrashConfig(saved) }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-cookie-clear',
    method: 'POST',
    run: async (body, _ctx) => {
      const b = asRecord(body)
      const repoPath = typeof b.repoPath === 'string' ? b.repoPath : undefined
      await clearCrashCookie(repoPath)
      const config = await loadCrashConfig(repoPath)
      return { ok: true, config: publicCrashConfig(config) }
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
    path: '/tracescope/v1/crash-filter-options',
    method: 'POST',
    run: async (body, { lang }) => {
      const b = asRecord(body)
      const config = await resolveCrashConfigFromBody(b)
      if (providerNotReady(config)) {
        return {
          versions: [],
          osVersions: [],
          devices: [],
          metaType: 'crash',
          error: providerNotReadyMessage(config, lang),
        }
      }
      const adapter = getCrashProvider(config.provider)
      if (!adapter?.listFilterOptions) {
        return {
          versions: [],
          osVersions: [],
          devices: [],
          metaType: 'crash',
          error: lang === 'en' ? 'Filter options are not supported for this provider' : '当前数据源不支持筛选选项',
        }
      }
      const metaType =
        typeof b.metaType === 'string' && b.metaType.trim()
          ? b.metaType.trim()
          : undefined
      try {
        const options = await adapter.listFilterOptions(config, { metaType })
        return options
      } catch (err) {
        const mapped = mapProviderListFailure(err, lang)
        if (mapped) {
          return {
            versions: [],
            osVersions: [],
            devices: [],
            metaType: metaType || 'crash',
            ...mapped,
          }
        }
        throw err
      }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-list',
    method: 'POST',
    run: async (body, { lang }) => {
      const config = await resolveCrashConfigFromBody(asRecord(body))
      if (providerNotReady(config)) {
        return { items: [], error: providerNotReadyMessage(config, lang) }
      }
      const adapter = getCrashProvider(config.provider)
      if (!adapter) {
        throw new I18nError('ERR_CRASH_PROVIDER', lang, { provider: config.provider })
      }
      const query = parseCrashListQuery(asRecord(body))
      try {
        const page = await adapter.list(config, query)
        return {
          items: page.items,
          page: page.page,
          pageSize: page.pageSize,
          total: page.total,
          hasMore: page.hasMore,
          capabilities: adapter.capabilities(),
        }
      } catch (err) {
        const mapped = mapProviderListFailure(err, lang)
        if (mapped) {
          return {
            items: [],
            page: query.page ?? 1,
            pageSize: query.pageSize,
            total: 0,
            hasMore: false,
            capabilities: adapter.capabilities(),
            ...mapped,
          }
        }
        throw err
      }
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
      if (providerNotReady(config)) {
        if (config.provider === 'crashlytics') {
          throw new I18nError(
            'ERR_CRASH_CRASHLYTICS_NOT_READY',
            lang,
            crashlyticsNotReadyParams(config, lang),
          )
        }
        throw new I18nError('ERR_CRASH_UMENG_NOT_READY', lang, umengNotReadyParams(config, lang))
      }
      const adapter = getCrashProvider(config.provider)
      if (!adapter) {
        throw new I18nError('ERR_CRASH_PROVIDER', lang, { provider: config.provider })
      }
      try {
        const incident = await adapter.get(config, id)
        return { incident }
      } catch (err) {
        rethrowProviderCrashError(err, lang)
      }
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

  // Create a chat job + composer prompt (includes jobId + publish-tool hint).
  registerRoute(ctx, {
    path: '/tracescope/v1/crash-ai-job',
    method: 'POST',
    run: async (body, { lang }) => {
      const b = asRecord(body)
      try {
        return createCrashAnalysisJob({ ...b, lang: typeof b.lang === 'string' ? b.lang : lang })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('repoPath')) throw new I18nError('ERR_MISSING_REPO_PATH', lang)
        throw new I18nError('ERR_CRASH_MISSING_INCIDENT', lang)
      }
    },
  })

  // Poll crash AI job while the model analyses; panel auto-applies on publish.
  registerRoute(ctx, {
    path: '/tracescope/v1/crash-job',
    method: 'POST',
    run: async (body, { lang }) => {
      const b = asRecord(body)
      const id = String(b.id ?? b.jobId ?? '').trim()
      if (!id) throw new I18nError('ERR_MISSING_ID', lang)
      const job = getCrashJob(id)
      if (!job) {
        throw new I18nError('ERR_CRASH_JOB_NOT_FOUND', lang, { id })
      }
      return {
        jobId: job.id,
        status: job.status,
        aiAnalysis: job.aiAnalysis,
        error: job.error,
        incidentId: job.incidentId,
        updatedAt: job.updatedAt,
      }
    },
  })
}

export { parseCrashMeta }
