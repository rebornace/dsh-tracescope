/**
 * Shared Umeng-not-ready detection and i18n params for crash Host routes.
 */
import {
  cookiePresentLabel,
  getCrashProvider,
  type CrashProviderConfig,
} from '@rebornace/tracescope-core'
import type { Lang } from '../i18n/lang.js'
import { msg } from '../i18n/messages.js'

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
