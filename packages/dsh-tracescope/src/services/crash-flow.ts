/**
 * Crash analysis execute layer shared by Host routes and MCP (via agent-api).
 */
import {
  analyzeCrash,
  applyAiAnalysisToReport,
  clearCrashAiAnalysis,
  getCrashProvider,
  loadCrashAiAnalysis,
  parseCrashListQuery,
  publicCrashConfig,
  resolveCrashConfigFromBody,
  saveCrashAiAnalysis,
  saveCrashConfig,
  type CrashFeedbackMeta,
  type CrashIncident,
  type CrashProviderConfig,
} from '@rebornace/tracescope-core'
import { getCrashJob } from '../crash-jobs.js'
import type { Lang } from '../i18n/lang.js'
import { I18nError } from '../i18n/messages.js'
import {
  crashlyticsCrashListFailure,
  crashlyticsNotReadyMessage,
  crashlyticsNotReadyParams,
  isCrashlyticsNotReady,
  rethrowCrashlyticsError,
} from '../routes/crash-crashlytics.js'
import {
  isUmengNotReady,
  rethrowUmengCrashError,
  umengCrashListFailure,
  umengNotReadyMessage,
  umengNotReadyParams,
} from '../routes/crash-umeng.js'

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {}
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

export function parseCrashIncident(raw: unknown): CrashIncident | null {
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

export function parseCrashMeta(raw: unknown): CrashFeedbackMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const incident = parseCrashIncident(o.incident)
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

async function runProbeInner(
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
      error: lang === 'en' ? 'Unsupported crash provider' : '不支持的崩溃数据源',
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
              : 'local 模式需要提供 stackText',
        }
  }
  return { ok: adapter.isReady(config) }
}

function langOf(args: Record<string, unknown>, fallback: Lang = 'zh'): Lang {
  const raw = args.lang ?? args.locale
  if (raw === 'en' || raw === 'zh') return raw
  if (typeof raw === 'string' && raw.toLowerCase().startsWith('en')) return 'en'
  return fallback
}

/** Probe credentials; optional `remember: true` persists via saveCrashConfig. */
export async function probeCrash(args: Record<string, unknown>) {
  const lang = langOf(args)
  const body = asRecord(args)
  const config = await resolveCrashConfigFromBody(body)
  const result = await runProbeInner(config, lang)
  if (result.ok && (body.remember === true || body.remember === 'true')) {
    const repoPath = typeof body.repoPath === 'string' ? body.repoPath : undefined
    await saveCrashConfig(config, { repoPath, remember: true })
  }
  return { ...result, config: publicCrashConfig(config) }
}

export async function listCrashFilterOptions(args: Record<string, unknown>) {
  const lang = langOf(args)
  const b = asRecord(args)
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
    typeof b.metaType === 'string' && b.metaType.trim() ? b.metaType.trim() : undefined
  try {
    return await adapter.listFilterOptions(config, { metaType })
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
}

function coerceListBody(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body }
  // MCP may pass scalar strings; Host parseCrashListQuery expects arrays for kinds/statuses.
  if (typeof out.errorKind === 'string' && out.errorKind.trim() && out.errorKinds == null) {
    out.errorKinds = [out.errorKind.trim()]
  }
  if (typeof out.status === 'string' && out.status.trim() && out.statuses == null) {
    out.statuses = [out.status.trim()]
  }
  for (const key of ['appVersion', 'appVersions', 'osVersions', 'deviceModels'] as const) {
    const raw = out[key]
    if (typeof raw === 'string' && raw.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) out[key] = parsed
      } catch {
        /* keep string — asStringArray will split */
      }
    }
  }
  return out
}

export async function listCrashIncidents(args: Record<string, unknown>) {
  const lang = langOf(args)
  const body = coerceListBody(asRecord(args))
  const config = await resolveCrashConfigFromBody(body)
  if (providerNotReady(config)) {
    return { items: [], error: providerNotReadyMessage(config, lang) }
  }
  const adapter = getCrashProvider(config.provider)
  if (!adapter) {
    throw new I18nError('ERR_CRASH_PROVIDER', lang, { provider: config.provider })
  }
  const query = parseCrashListQuery(body)
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
}

export async function getCrashIncident(args: Record<string, unknown>) {
  const lang = langOf(args)
  const b = asRecord(args)
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
}

export async function analyzeCrashTool(args: Record<string, unknown>) {
  const lang = langOf(args)
  const b = asRecord(args)
  let incident = parseCrashIncident(b.incident)
  if (!incident && typeof b.stackText === 'string' && b.stackText.trim()) {
    incident = parseCrashIncident({
      id: typeof b.id === 'string' && b.id.trim() ? b.id.trim() : 'local-paste',
      title: typeof b.title === 'string' ? b.title : 'pasted stack',
      provider: 'local',
      stackText: b.stackText,
    })
  }
  if (!incident) throw new I18nError('ERR_CRASH_MISSING_INCIDENT', lang)
  const repoPath = typeof b.repoPath === 'string' ? b.repoPath.trim() : ''
  if (!repoPath) throw new I18nError('ERR_MISSING_REPO_PATH', lang)
  const baseReport = await analyzeCrash({
    incident,
    repoPath,
    lang: typeof b.lang === 'string' ? b.lang : lang,
  })
  // Restore persisted AI conclusion when present (avoids re-calling the model).
  const skipCache = b.skipAiCache === true || b.skipAiCache === 'true'
  let aiFromCache = false
  let aiCachedAt: string | undefined
  let report = baseReport
  if (!skipCache) {
    const cached = await loadCrashAiAnalysis(repoPath, incident.id)
    const text = cached?.payload.aiAnalysis?.trim()
    if (text) {
      const merged = applyAiAnalysisToReport(baseReport, text, { repoPath, lang })
      report = {
        ...baseReport,
        ...merged,
        fixHints: merged.fixHints ?? baseReport.fixHints,
      }
      aiFromCache = true
      aiCachedAt = cached?.savedAt
    }
  }
  return {
    report,
    aiFromCache,
    aiCachedAt,
    summary:
      typeof report.summary === 'string' && report.summary.trim()
        ? report.summary
        : lang === 'en'
          ? 'Crash local analysis complete'
          : '崩溃本地分析完成',
  }
}

/** Persist AI conclusion for repo + incident (tool publish / sidebar paste). */
export async function saveCrashAiCache(args: Record<string, unknown>) {
  const lang = langOf(args)
  const b = asRecord(args)
  const repoPath = typeof b.repoPath === 'string' ? b.repoPath.trim() : ''
  const incidentId = String(b.incidentId ?? b.id ?? '').trim()
  const aiAnalysis = String(b.aiAnalysis ?? b.analysis ?? '').trim()
  if (!repoPath) throw new I18nError('ERR_MISSING_REPO_PATH', lang)
  if (!incidentId) throw new I18nError('ERR_MISSING_ID', lang)
  if (!aiAnalysis) {
    throw new Error(lang === 'en' ? 'Missing analysis' : '缺少 analysis')
  }
  const entry = await saveCrashAiAnalysis(repoPath, incidentId, aiAnalysis, {
    summary: typeof b.summary === 'string' ? b.summary : undefined,
  })
  return {
    ok: Boolean(entry),
    savedAt: entry?.savedAt,
    incidentId,
  }
}

export async function loadCrashAiCache(args: Record<string, unknown>) {
  const lang = langOf(args)
  const b = asRecord(args)
  const repoPath = typeof b.repoPath === 'string' ? b.repoPath.trim() : ''
  const incidentId = String(b.incidentId ?? b.id ?? '').trim()
  if (!repoPath) throw new I18nError('ERR_MISSING_REPO_PATH', lang)
  if (!incidentId) throw new I18nError('ERR_MISSING_ID', lang)
  const entry = await loadCrashAiAnalysis(repoPath, incidentId)
  if (!entry) return { ok: false as const, aiAnalysis: undefined as string | undefined }
  return {
    ok: true as const,
    aiAnalysis: entry.payload.aiAnalysis,
    savedAt: entry.savedAt,
    incidentId: entry.payload.incidentId,
  }
}

export async function clearCrashAiCache(args: Record<string, unknown>) {
  const lang = langOf(args)
  const b = asRecord(args)
  const repoPath = typeof b.repoPath === 'string' ? b.repoPath.trim() : ''
  const incidentId = String(b.incidentId ?? b.id ?? '').trim()
  if (!repoPath) throw new I18nError('ERR_MISSING_REPO_PATH', lang)
  if (!incidentId) throw new I18nError('ERR_MISSING_ID', lang)
  const cleared = await clearCrashAiAnalysis(repoPath, incidentId)
  return { ok: cleared, incidentId }
}

export function getCrashJobStatus(args: Record<string, unknown>) {
  const lang = langOf(args)
  const b = asRecord(args)
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
}
