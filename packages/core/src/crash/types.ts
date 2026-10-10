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
}

export interface CrashIncidentSummary {
  id: string
  title: string
  provider: CrashProviderId
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
