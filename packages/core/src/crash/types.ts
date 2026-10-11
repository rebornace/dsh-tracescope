/**
 * Crash analysis shared types — config and incident shapes for all providers.
 */
export type CrashProviderId = 'local' | 'umeng' | 'crashlytics'

export interface CrashProviderConfig {
  provider: CrashProviderId
  /** Pasted stack trace (local provider). */
  stackText?: string
  /** Optional display title override (local provider). */
  title?: string
  /** Umeng U-APM application key (console transport). */
  appKey?: string
  appDisplayName?: string
  /** Session cookie — server-side only; never log or expose to client in full. */
  cookie?: string
  /**
   * Repo-scoped storage only: when false, `loadCrashConfig(repo)` must not inherit
   * `global.cookie` / secrets after the user cleared them for that repo.
   */
  inheritGlobalCookie?: boolean
  consoleBaseUrl?: string
  transport?: 'console' | 'openapi'
  /** Firebase / GCP project id (Crashlytics). */
  projectId?: string
  /**
   * Firebase App id, e.g. `1:1234567890:android:abcdef`.
   * Distinct from Umeng `appKey`.
   */
  appId?: string
  /**
   * OAuth access token for Crashlytics REST API (Bearer).
   * Prefer a short-lived token from `gcloud auth print-access-token`, or mint via service account.
   */
  accessToken?: string
  /**
   * Google service-account JSON (stringified). Used to mint access tokens when
   * `accessToken` is absent. Server-side only; never log in full.
   */
  serviceAccountJson?: string
}

export type CrashListSortField = 'lastSeenAt' | 'count' | 'title'

export type CrashTimeRangePreset = '24h' | '7d' | '30d' | '90d' | 'custom'

export interface CrashListQuery {
  keyword?: string
  errorKinds?: Array<'crash' | 'anr' | 'error' | 'other'>
  statuses?: Array<'open' | 'closed' | 'other'>
  appVersions?: string[]
  /**
   * @deprecated Prefer `osVersions` + `deviceModels`.
   * Legacy single needle matched against osVersion/deviceModel jointly.
   */
  osDevice?: string
  /** OS version keywords (OR within list; AND with deviceModels when both set). */
  osVersions?: string[]
  /** Device model keywords (OR within list; AND with osVersions when both set). */
  deviceModels?: string[]
  /** Preset window; ignored when startAt/endAt are both set as a custom range. */
  timeRange?: CrashTimeRangePreset
  /** Inclusive range start (`YYYY-MM-DD` or ISO). */
  startAt?: string
  /** Inclusive range end (`YYYY-MM-DD` or ISO). */
  endAt?: string
  sort?: { field: CrashListSortField; direction: 'asc' | 'desc' }
  /** 1-based page index for remote providers. */
  page?: number
  pageSize?: number
}

export interface CrashListResult {
  items: CrashIncidentSummary[]
  page: number
  pageSize: number
  /** Total matching rows when the provider knows it. */
  total?: number
  hasMore?: boolean
}

/** Option row for Umeng-style filter dropdowns (`label` may differ from `value`). */
export interface CrashFilterOption {
  label: string
  value: string
}

/** Dimension options from the crash provider (Umeng meta APIs). */
export interface CrashFilterOptions {
  versions: CrashFilterOption[]
  osVersions: CrashFilterOption[]
  devices: CrashFilterOption[]
  /** Umeng `metaType` used for the meta calls (e.g. crash / anr / exception). */
  metaType: string
}

export interface CrashIncidentSummary {
  id: string
  title: string
  provider: CrashProviderId
  appVersion?: string
  errorKind?: 'crash' | 'anr' | 'error' | 'other'
  status?: 'open' | 'closed' | 'other'
  lastSeenAt?: string
  count?: number
  affectedUsers?: number
  osVersion?: string
  deviceModel?: string
}

export interface CrashIncident extends CrashIncidentSummary {
  stackText: string
  exceptionName?: string
  appVersion?: string
  buildNumber?: string
  platform?: 'android' | 'ios' | 'other'
  errorKind?: 'crash' | 'anr' | 'error' | 'other'
  status?: 'open' | 'closed' | 'other'
  count?: number
  affectedUsers?: number
  osVersion?: string
  deviceModel?: string
  occurredAt?: string
  firstSeenAt?: string
  lastSeenAt?: string
  rawRef?: string
}

export interface CrashMatchedFile {
  path: string
  reason: string
  symbol?: string
}

export interface CrashAnalysisReport {
  incident: CrashIncident
  matchedFiles: CrashMatchedFile[]
  summary: string
  fixHints: string[]
  prompt: string
  defectBody: string
  /**
   * Optional AI session reply pasted/written back into TraceScope.
   * Local 「分析」does not call a model; this field holds the chat outcome.
   */
  aiAnalysis?: string
}
