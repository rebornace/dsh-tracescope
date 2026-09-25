export type {
  AnalyzeImpactOptions,
  Evidence,
  ImpactKind,
  ImpactReport,
  ModuleMappingRule,
  ReportAttachment,
  RiskLevel,
  ScopeItem,
  TesterScreenshot,
  TracescopeModulesConfig,
} from './types.js'
export { analyzeImpact } from './analyze.js'
export {
  analyzeCodeupImpact,
  changedPathsFromDiffs,
  compareCodeup,
  getCodeupRepository,
  listCodeupBranches,
  listCodeupCommits,
  pageCodeupDiffs,
  parseActivityTime,
  parseCodeupRemote,
  resolveCodeupTarget,
  type CodeupCommitInfo,
  type CodeupCompare,
  type CodeupDiffFile,
  type CodeupRefInfo,
  type CodeupRequestOptions,
  type CodeupTarget,
} from './codeup.js'
export { exportReportCsv, exportReportMarkdown } from './export.js'
export { loadModulesConfig, matchModuleRule } from './modules-config.js'
export {
  extractAndroidStringTitles,
  extractKotlinUiTitles,
  extractLayoutTitles,
  extractLocalizableTitles,
  extractObjCNavTitles,
  pickBestTitle,
} from './display-names.js'
export { heuristicDisplayName, classifyFileRisk, detectLanguage } from './heuristics.js'
export {
  gitDiffFiles,
  gitDiffUnified,
  gitFetchAll,
  gitFetchRef,
  gitLogSubjects,
  gitRevParse,
  ensureReadableCheckout,
  listGitRefs,
  listRecentCommits,
} from './git.js'
export {
  isGitRemoteUrl,
  normalizeRemoteUrl,
  resolveGitRepo,
  type ResolvedRepo,
  type ResolveGitRepoOptions,
} from './repo.js'
export {
  adaptRemoteUrlForAuth,
  buildGitAuthEnv,
  parseGitAuth,
  redactSecrets,
  type GitAuth,
} from './auth.js'
export {
  loadStoredGitAuth,
  saveStoredGitAuth,
  type StoredGitAuth,
} from './auth-store.js'
export {
  handtestReportKey,
  deleteHandtestHistory,
  listHandtestHistory,
  loadHandtestHistoryEntry,
  loadHandtestReport,
  patchHandtestItemStatus,
  saveHandtestReport,
  type HandtestHistorySummary,
  type StoredHandtestReport,
} from './report-store.js'
export {
  MAX_ATTACHMENT_LOCAL_BYTES,
  MAX_ATTACHMENT_UPLOAD_BYTES,
  MAX_REPORT_ATTACHMENTS,
  deleteReportAttachmentFile,
  formatAttachmentSize,
  normalizeReportAttachments,
  readReportAttachmentFile,
  removeReportAttachmentsDir,
  reportAttachmentsDir,
  saveReportAttachmentBuffer,
  saveReportAttachmentFromLocalPath,
} from './attachments.js'
export { ensureUniqueScopeItemIds } from './scope-ids.js'
export {
  MAX_SCREENSHOT_DATA_URL_CHARS,
  MAX_TESTER_SCREENSHOTS,
  normalizeTesterScreenshots,
} from './screenshots.js'
export {
  createYunxiaoWorkitem,
  isYunxiaoConfigReady,
  listYunxiaoMembers,
  listYunxiaoOrganizations,
  listYunxiaoProjects,
  listYunxiaoWorkitemTypes,
  listYunxiaoWorkitems,
  normalizeYunxiaoEndpoint,
  filenameEmbedMarkdown,
  updateYunxiaoWorkitem,
  uploadYunxiaoWorkitemAttachment,
  type YunxiaoAttachmentUploadResult,
  type YunxiaoConfig,
  type YunxiaoCreateResult,
  type YunxiaoOption,
  type YunxiaoDebugEntry,
  type YunxiaoWorkItem,
} from './yunxiao.js'
export {
  mergeAgileWorkItemsIntoReport,
  parseAgileWorkItemRefs,
  workItemsToScopeItems,
  type AgileWorkItemRef,
} from './agile-workitems.js'
export { loadYunxiaoConfig, publicYunxiaoConfig, saveYunxiaoConfig } from './yunxiao-store.js'
export {
  buildFailFeedbackDescription,
  buildFailFeedbackSubject,
  collectFailedItems,
  isTrackerConfigReady,
  submitFailFeedback,
  type GithubTrackerConfig,
  type GitlabTrackerConfig,
  type TrackerConfig,
  type TrackerProvider,
  type TrackerSubmitResult,
  type WebhookTrackerConfig,
} from './issue-tracker.js'
export {
  isMaskedSecret,
  loadRememberedYunxiaoAccess,
  loadTrackerConfig,
  publicTrackerConfig,
  rememberYunxiaoAccess,
  saveTrackerConfig,
  type RememberedYunxiaoAccess,
} from './tracker-store.js'
/** @deprecated Use buildFailFeedbackDescription */
export { buildFailFeedbackDescription as buildYunxiaoFailDescription } from './issue-tracker.js'
/** @deprecated Use buildFailFeedbackSubject */
export { buildFailFeedbackSubject as buildYunxiaoFailSubject } from './issue-tracker.js'
export {
  analyzeReportWithModel,
  enrichReportWithModel,
  extractJsonArray,
  mergeScopeItems,
  parseModelScopeDrafts,
  type ModelJsonCaller,
  type ModelScopeDraft,
} from './enrich.js'
export { buildChatAnalysisPrompt } from './chat-prompt.js'
export {
  buildReportFromPublishedItems,
  parsePublishedHandtestItems,
  type PublishedHandtestItem,
} from './handtest-publish.js'
// ---------------------------------------------------------------------------
// Design subsystem (modular; see ./design)
// ---------------------------------------------------------------------------
export type {
  ComparedValue,
  DesignBox,
  DesignDiff,
  DesignDoc,
  DesignNode,
  DesignNodeKind,
  DesignStyle,
  DiffSeverity,
  Edges,
  HexColor,
  UnmatchedNode,
  UnresolvedValue,
  VisualCompareResult,
  VisualProperty,
} from './design/types.js'
export {
  figmaColorToHex,
  fetchFigmaDoc,
  normalizeFigmaTree,
  parseFigmaUrl,
  type FigmaClientOptions,
} from './design/sources/figma.js'
export {
  buildAndroidResources,
  normalizeAndroidLayout,
  parseAndroidDimension,
  type AndroidResources,
  type DimensionToken,
} from './design/adapters/android-xml.js'
export { normalizeUIKitDoc } from './design/adapters/ios-xib.js'
export { compareVisualDocs, type CompareOptions } from './design/compare.js'
export { parseXml, decodeXmlEntities, type XmlElement } from './design/xml-lite.js'
// Adapter / page-matching API.
export {
  discoverAllPages,
  locatePagesForDesign,
  compareDesignWithPage,
  matchPages,
  type PageComparison,
} from './design/index.js'
export {
  designFingerprint,
  normalizeText,
  scorePage,
  tokenizeName,
  type PageMatch,
  type MatchOptions,
} from './design/page-fingerprint.js'
export {
  platformAdapters,
  getPlatformAdapter,
  type PlatformAdapter,
} from './design/registry.js'
export type {
  AdapterId,
  CodePage,
  PageFingerprint,
  PlatformId,
} from './design/adapters/adapter-types.js'
// Legacy discovery shim (kept for older routes).
export {
  discoverLayouts,
  type DiscoveredLayout,
  type LayoutPlatform,
  type ProjectKind,
} from './design/legacy-discover.js'
