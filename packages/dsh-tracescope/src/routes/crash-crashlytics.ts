/**
 * Crashlytics-not-ready detection and i18n params for crash Host routes.
 */
import {
  CrashlyticsError,
  accessTokenPresentLabel,
  getCrashProvider,
  type CrashProviderConfig,
  type CrashlyticsErrorCode,
} from '@rebornace/tracescope-core'
import type { Lang } from '../i18n/lang.js'
import { I18nError, msg } from '../i18n/messages.js'

export function crashlyticsProviderI18nCode(errorCode: CrashlyticsErrorCode): string {
  switch (errorCode) {
    case 'CRASHLYTICS_AUTH':
      return 'ERR_CRASH_CRASHLYTICS_AUTH'
    case 'CRASHLYTICS_FORBIDDEN':
      return 'ERR_CRASH_CRASHLYTICS_FORBIDDEN'
    case 'CRASHLYTICS_HTTP':
      return 'ERR_CRASH_CRASHLYTICS_HTTP'
    case 'CRASHLYTICS_NOT_FOUND':
      return 'ERR_CRASH_CRASHLYTICS_HTTP'
    case 'CRASHLYTICS_NETWORK':
      return 'ERR_CRASH_CRASHLYTICS_NETWORK'
    case 'CRASHLYTICS_BAD_RESPONSE':
      return 'ERR_CRASH_CRASHLYTICS_BAD_RESPONSE'
    case 'CRASHLYTICS_CONFIG':
      return 'ERR_CRASH_CRASHLYTICS_NOT_READY'
    default: {
      const _exhaustive: never = errorCode
      throw new Error(`Unhandled Crashlytics error code: ${String(_exhaustive)}`)
    }
  }
}

/** Map Crashlytics provider failure to Host list payload (`error` + machine `errorCode`). */
export function crashlyticsCrashListFailure(
  err: unknown,
  lang: Lang,
): { error: string; errorCode: string } | null {
  if (!(err instanceof CrashlyticsError)) return null
  const i18nCode = crashlyticsProviderI18nCode(err.code)
  return {
    error: msg(i18nCode, lang, { detail: err.message }),
    errorCode: err.code,
  }
}

/** Re-throw as localized I18nError for detail/analyze routes. */
export function rethrowCrashlyticsError(err: unknown, lang: Lang): never {
  if (err instanceof CrashlyticsError) {
    throw new I18nError(crashlyticsProviderI18nCode(err.code), lang, { detail: err.message })
  }
  throw err
}

export function crashlyticsNotReadyParams(
  config: CrashProviderConfig,
  lang: Lang,
): { projectId: string; appId: string; token: string } {
  const yes = lang === 'en' ? 'yes' : '\u6709'
  const no = lang === 'en' ? 'no' : '\u65e0'
  return {
    projectId: config.projectId?.trim() ? yes : no,
    appId: config.appId?.trim() ? yes : no,
    token: accessTokenPresentLabel(config) === 'yes' ? yes : no,
  }
}

export function crashlyticsNotReadyMessage(config: CrashProviderConfig, lang: Lang): string {
  return msg('ERR_CRASH_CRASHLYTICS_NOT_READY', lang, crashlyticsNotReadyParams(config, lang))
}

/** True when provider is crashlytics and adapter is missing or config is incomplete. */
export function isCrashlyticsNotReady(config: CrashProviderConfig): boolean {
  if (config.provider !== 'crashlytics') return false
  const adapter = getCrashProvider('crashlytics')
  if (!adapter) return true
  return !adapter.isReady(config)
}
