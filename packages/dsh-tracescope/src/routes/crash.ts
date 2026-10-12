/**
 * Crash analysis Host routes — thin wrappers over the shared agent-api / crash-flow layer.
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute } from '../http/route-helpers.js'
import {
  clearCrashCookie,
  isMaskedCrashSecret,
  loadCrashConfig,
  publicCrashConfig,
  saveCrashConfig,
  type CrashProviderConfig,
} from '@rebornace/tracescope-core'
import { I18nError } from '../i18n/messages.js'
import { createCrashAnalysisJob } from '../agent-api.js'
import {
  analyzeCrashTool,
  clearCrashAiCache,
  getCrashIncident,
  getCrashJobStatus,
  listCrashFilterOptions,
  listCrashIncidents,
  loadCrashAiCache,
  parseCrashMeta,
  probeCrash,
  saveCrashAiCache,
} from '../services/crash-flow.js'

function parseProviderId(raw: unknown, fallback: CrashProviderConfig['provider']): CrashProviderConfig['provider'] {
  if (raw === 'umeng' || raw === 'local' || raw === 'crashlytics') return raw
  return fallback
}

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {}
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
    run: async (body, { lang }) => probeCrash({ ...asRecord(body), lang }),
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-filter-options',
    method: 'POST',
    run: async (body, { lang }) => listCrashFilterOptions({ ...asRecord(body), lang }),
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-list',
    method: 'POST',
    run: async (body, { lang }) => listCrashIncidents({ ...asRecord(body), lang }),
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-detail',
    method: 'POST',
    run: async (body, { lang }) => getCrashIncident({ ...asRecord(body), lang }),
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-analyze',
    method: 'POST',
    run: async (body, { lang }) => {
      const result = await analyzeCrashTool({ ...asRecord(body), lang })
      return {
        report: result.report,
        aiFromCache: result.aiFromCache,
        aiCachedAt: result.aiCachedAt,
      }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-ai-cache',
    method: 'POST',
    run: async (body, { lang }) => loadCrashAiCache({ ...asRecord(body), lang }),
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-ai-cache-save',
    method: 'POST',
    run: async (body, { lang }) => saveCrashAiCache({ ...asRecord(body), lang }),
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-ai-cache-clear',
    method: 'POST',
    run: async (body, { lang }) => clearCrashAiCache({ ...asRecord(body), lang }),
  })

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

  registerRoute(ctx, {
    path: '/tracescope/v1/crash-job',
    method: 'POST',
    run: async (body, { lang }) => getCrashJobStatus({ ...asRecord(body), lang }),
  })
}

export { parseCrashMeta }
