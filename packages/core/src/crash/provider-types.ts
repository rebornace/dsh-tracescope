/**
 * Crash provider contract — one implementation file per data source.
 */
import type {
  CrashIncident,
  CrashIncidentSummary,
  CrashProviderConfig,
  CrashProviderId,
} from './types.js'

export interface CrashProviderCapabilities {
  filters: string[]
  supportsDetail: boolean
}

export interface CrashProvider {
  id: CrashProviderId
  isReady(config: CrashProviderConfig): boolean
  list(config: CrashProviderConfig): Promise<CrashIncidentSummary[]>
  get(config: CrashProviderConfig, id: string): Promise<CrashIncident>
  capabilities(): CrashProviderCapabilities
}
