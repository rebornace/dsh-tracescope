/**
 * Crash provider contract — one implementation file per data source.
 */
import type {
  CrashFilterOptions,
  CrashIncident,
  CrashListQuery,
  CrashListResult,
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
  list(config: CrashProviderConfig, query?: CrashListQuery): Promise<CrashListResult>
  get(config: CrashProviderConfig, id: string): Promise<CrashIncident>
  capabilities(): CrashProviderCapabilities
  /**
   * Optional: fetch valid filter option values (Umeng console dropdowns).
   * `metaType` mirrors U-APM error tab (crash / anr / exception).
   */
  listFilterOptions?(
    config: CrashProviderConfig,
    opts?: { metaType?: string },
  ): Promise<CrashFilterOptions>
}
