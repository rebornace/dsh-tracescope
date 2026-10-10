/**
 * Crash provider contract — one implementation file per data source.
 */
import type {
  CrashIncident,
  CrashIncidentSummary,
  CrashListQuery,
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
  list(config: CrashProviderConfig, query?: CrashListQuery): Promise<CrashIncidentSummary[]>
  get(config: CrashProviderConfig, id: string): Promise<CrashIncident>
  capabilities(): CrashProviderCapabilities
}
