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
}
