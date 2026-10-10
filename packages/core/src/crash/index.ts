/**
 * Crash analysis subsystem public surface.
 */
export type {
  CrashIncident,
  CrashIncidentSummary,
  CrashProviderConfig,
  CrashProviderId,
} from './types.js'
export type { CrashProvider, CrashProviderCapabilities } from './provider-types.js'
export {
  crashProviders,
  getCrashProvider,
  registerCrashProvider,
} from './registry.js'
export { localCrashProvider, LOCAL_CRASH_INCIDENT_ID } from './providers/local.js'
