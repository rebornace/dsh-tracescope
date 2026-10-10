/**
 * Crash analysis shared types — config and incident shapes for all providers.
 */
export type CrashProviderId = 'local' | 'umeng'

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
   * `global.cookie` after the user cleared cookie for that repo.
   */
  inheritGlobalCookie?: boolean
  consoleBaseUrl?: string
  transport?: 'console' | 'openapi'
}

export type CrashListSortField = 'lastSeenAt' | 'count' | 'title'

export interface CrashListQuery {
  keyword?: string
  errorKinds?: Array<'crash' | 'anr' | 'error' | 'other'>
  statuses?: Array<'open' | 'closed' | 'other'>
  appVersions?: string[]
  /** Matches incident osVersion / deviceModel (local filter). */
  osDevice?: string
  sort?: { field: CrashListSortField; direction: 'asc' | 'desc' }
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
}
