/**
 * Umeng U-APM adapter — re-exports console Cookie provider from core.
 */
export {
  UmengCrashError,
  mapUmengDetailResponse,
  mapUmengListResponse,
  umengCrashProvider,
  UMENG_CONSOLE_DEFAULT_ORIGIN,
  UMENG_HOST_ALLOWLIST,
  type UmengCrashErrorCode,
} from '@rebornace/tracescope-core'

/** @deprecated Use `CrashProviderConfig` + `umengCrashProvider` from core instead. */
export interface UmengAdapterConfig {
  apiKey: string
  apiSecurity: string
  appKey: string
}

/** @deprecated OpenAPI fetch remains unimplemented; use console transport via core. */
export async function fetchCrashDetails(
  _config: UmengAdapterConfig,
  _request: { appVersion?: string; errorId?: string; startDate?: string; endDate?: string },
): Promise<{ ok: false; reason: string }> {
  return {
    ok: false,
    reason:
      'Umeng OpenAPI adapter is not implemented in v1; configure console transport (appKey + cookie) via TraceScope crash settings.',
  }
}
