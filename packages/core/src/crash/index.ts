/**
 * Crash analysis subsystem public surface.
 */
export type {
  CrashAnalysisReport,
  CrashIncident,
  CrashIncidentSummary,
  CrashMatchedFile,
  CrashProviderConfig,
  CrashProviderId,
} from './types.js'
export { analyzeCrash, type AnalyzeCrashOptions } from './analyze.js'
export {
  buildCrashDefectBody,
  buildCrashDefectSubject,
  buildCrashPrompt,
  type CrashFeedbackMeta,
  type CrashReportParts,
} from './feedback.js'
export { parseStackText, type ParsedStack, type StackFrame } from './parse-stack.js'
export { matchStackToRepo, type RepoStackHit } from './match-repo.js'
export type { CrashProvider, CrashProviderCapabilities } from './provider-types.js'
export {
  crashProviders,
  getCrashProvider,
  registerCrashProvider,
} from './registry.js'
export { localCrashProvider, LOCAL_CRASH_INCIDENT_ID } from './providers/local.js'
export {
  clearCrashCookie,
  cookiePresentLabel,
  isMaskedCrashSecret,
  loadCrashConfig,
  publicCrashConfig,
  resolveCrashConfigFromBody,
  saveCrashConfig,
  type StoredCrashCredentialsFile,
} from './store.js'
