/**
 * Shared Umeng-not-ready detection and i18n params for crash Host routes.
 */
import {
  UmengCrashError,
  cookiePresentLabel,
  getCrashProvider,
  type CrashProviderConfig,
  type UmengCrashErrorCode,
} from '@rebornace/tracescope-core'
import type { Lang } from '../i18n/lang.js'
import { I18nError, msg } from '../i18n/messages.js'

export function umengProviderI18nCode(errorCode: UmengCrashErrorCode): string {
  switch (errorCode) {
    case 'UMENG_AUTH':
      return 'ERR_CRASH_UMENG_AUTH'
    case 'UMENG_OPENAPI_UNSUPPORTED':
      return 'ERR_CRASH_UMENG_OPENAPI'
    case 'UMENG_HOST_DENIED':
      return 'ERR_CRASH_UMENG_HOST'
    case 'UMENG_HTTP':
      return 'ERR_CRASH_UMENG_HTTP'
    case 'UMENG_BAD_RESPONSE':
      return 'ERR_CRASH_UMENG_BAD_RESPONSE'
    default:
      return 'ERR_CRASH_UMENG_HTTP'
  }
}

/** Map Umeng provider failure to Host list payload (`error` + machine `errorCode`). */
export function umengCrashListFailure(
  err: unknown,
  lang: Lang,
): { error: string; errorCode: string } | null {
  if (!(err instanceof UmengCrashError)) return null
  const i18nCode = umengProviderI18nCode(err.code)
  return {
    error: msg(i18nCode, lang, { detail: err.message }),
    errorCode: err.code,
  }
}

/** Re-throw as localized I18nError for detail/analyze routes. */
export function rethrowUmengCrashError(err: unknown, lang: Lang): never {
  if (err instanceof UmengCrashError) {
    throw new I18nError(umengProviderI18nCode(err.code), lang, { detail: err.message })
  }
  throw err
}

export function umengNotReadyParams(
  config: CrashProviderConfig,
  lang: Lang,
): { appKey: string; cookie: string } {
  const hasAppKey = Boolean(config.appKey?.trim())
  return {
    appKey: hasAppKey ? (lang === 'en' ? 'yes' : '\u6709') : lang === 'en' ? 'no' : '\u65e0',
    cookie: cookiePresentLabel(config),
  }
}

export function umengNotReadyMessage(config: CrashProviderConfig, lang: Lang): string {
  return msg('ERR_CRASH_UMENG_NOT_READY', lang, umengNotReadyParams(config, lang))
}

/** True when provider is umeng and adapter is missing or config is incomplete. */
export function isUmengNotReady(config: CrashProviderConfig): boolean {
  if (config.provider !== 'umeng') return false
  const adapter = getCrashProvider('umeng')
  if (!adapter) return true
  return !adapter.isReady(config)
}
