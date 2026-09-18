/**
 * Umeng U-APM adapter stub.
 * V0.1 wires credentials + fetch error detail by version / error id in a follow-up.
 */
export interface UmengAdapterConfig {
  apiKey: string
  apiSecurity: string
  appKey: string
}

export interface CrashFetchRequest {
  appVersion?: string
  errorId?: string
  startDate?: string
  endDate?: string
}

export async function fetchCrashDetails(
  _config: UmengAdapterConfig,
  _request: CrashFetchRequest,
): Promise<{ ok: false; reason: string }> {
  return {
    ok: false,
    reason:
      'Umeng adapter stub: configure OpenAPI credentials and implement error-detail API next.',
  }
}
