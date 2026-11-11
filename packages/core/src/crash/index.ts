/**
 * Crash analysis subsystem public surface.
 */
export type {
  CrashAnalysisKind,
  CrashAnalysisReport,
  CrashFilterOption,
  CrashFilterOptions,
  CrashIncident,
  CrashIncidentSummary,
  CrashListQuery,
  CrashListResult,
  CrashListSortField,
  CrashMatchedFile,
  CrashProviderConfig,
  CrashProviderId,
  CrashTimeRangePreset,
} from './types.js'
export { normalizeCrashAnalysisKind } from './types.js'
export {
  DEFAULT_CRASH_LIST_PAGE_SIZE,
  MAX_CRASH_LIST_PAGE_SIZE,
  applyCrashListQuery,
  incidentToListSummary,
  normalizeCrashListQuery,
  parseCrashFilterDate,
  parseCrashListQuery,
  resolveCrashListPage,
  resolveCrashTimeWindow,
  splitCrashFilterTokens,
  stableCrashListQueryKey,
} from './list-query.js'
export { analyzeCrash, type AnalyzeCrashOptions } from './analyze.js'
export {
  applyAiAnalysisToReport,
  buildCrashDefectBody,
  buildCrashDefectSubject,
  buildCrashPrompt,
  crashAiSectionTitle,
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
  appendInboxIncident,
  crashInboxDir,
  deleteInboxIncident,
  getInboxIncident,
  importInboxStack,
  listInboxIncidents,
  type AppendInboxOptions,
  type CrashInboxEntry,
  type CrashInboxSource,
} from './inbox-store.js'
export {
  extractAndroidLogcatHits,
  type AndroidLogcatHit,
  type AndroidLogcatHitKind,
} from './capture/android-logcat-parse.js'
export {
  connectAdbTarget,
  listAdbDevices,
  startAndroidAdbCapture,
  type AdbDevice,
  type AndroidCaptureHandle,
  type StartAndroidCaptureOptions,
} from './capture/android-adb.js'
export { connectCaptureAdbTarget } from './capture/session-manager.js'
export {
  clearEnsureAdbCacheForTests,
  ensureAdb,
  getAdbPrepProgress,
  platformToolsDownloadUrls,
  type AdbPrepPhase,
  type AdbPrepProgress,
  type EnsureAdbResult,
} from './capture/ensure-adb.js'
export {
  getIosCaptureSupport,
  listIosDevices,
  startIosMacosCapture,
  type IosCaptureHandle,
  type IosCaptureSupport,
  type IosDevice,
  type StartIosCaptureOptions,
} from './capture/ios-macos.js'
export {
  getCaptureSessionStatus,
  listCaptureDevices,
  startCaptureSession,
  stopCaptureSession,
  type CapturePlatform,
  type CaptureSessionStatus,
} from './capture/session-manager.js'
export {
  UmengCrashError,
  assertUmengEnvelopeCode,
  clearUmengListCacheForTests,
  defaultUmengDateRange,
  fetchUmengFilterOptions,
  mapUmengDetailResponse,
  mapUmengListIncidents,
  mapUmengListResponse,
  resolveUmengDateRange,
  umengCrashProvider,
  umengMetaTypeForQuery,
  UMENG_API_SUCCESS_CODE,
  UMENG_CONSOLE_DEFAULT_ORIGIN,
  UMENG_CONSOLE_DEVICES_PATH,
  UMENG_CONSOLE_METAOS_PATH,
  UMENG_CONSOLE_VERSIONS_PATH,
  UMENG_HOST_ALLOWLIST,
  type UmengCrashErrorCode,
} from './providers/umeng-console.js'
export {
  CrashlyticsError,
  CRASHLYTICS_API_ORIGIN,
  CRASHLYTICS_OAUTH_SCOPE,
  CRASHLYTICS_OAUTH_TOKEN_URL,
  CRASHLYTICS_REPORT_TOP_DEVICES,
  CRASHLYTICS_REPORT_TOP_ISSUES,
  CRASHLYTICS_REPORT_TOP_OS,
  CRASHLYTICS_REPORT_TOP_VERSIONS,
  buildCrashlyticsReportQuery,
  clearCrashlyticsCachesForTests,
  crashlyticsAppParent,
  crashlyticsCrashProvider,
  crashlyticsErrorTypes,
  crashlyticsIssueStates,
  fetchCrashlyticsFilterOptions,
  formatCrashlyticsEventStack,
  mapCrashlyticsErrorType,
  mapCrashlyticsReportGroup,
  mapCrashlyticsState,
  mapCrashlyticsTopIssuesReport,
  mintServiceAccountJwt,
  parseServiceAccountJson,
  resolveCrashlyticsAccessToken,
  setCrashlyticsFetchForTests,
  type CrashlyticsErrorCode,
} from './providers/crashlytics.js'
export {
  accessTokenPresentLabel,
  clearCrashCookie,
  cookiePresentLabel,
  crashRepoKey,
  inferCrashProviderId,
  isMaskedCrashSecret,
  loadCrashConfig,
  publicCrashConfig,
  resolveCrashConfigFromBody,
  saveCrashConfig,
  type StoredCrashCredentialsFile,
} from './store.js'
export {
  clearCrashAiAnalysis,
  crashAiAnalysisKey,
  loadCrashAiAnalysis,
  saveCrashAiAnalysis,
  type CrashAiAnalysisEntry,
  type CrashAiAnalysisPayload,
} from './ai-cache.js'
