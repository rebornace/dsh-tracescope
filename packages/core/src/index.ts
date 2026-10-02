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
  gitExec,
  gitDiffFiles,
  gitDiffUnified,
  gitFetchAll,
  gitFetchRef,
  gitLogSubjects,
  gitRevParse,
  ensureReadableCheckout,
  listGitRefs,
  listRecentCommits,
  type GitCommitInfo,
  type GitRefInfo,
} from './git.js'
export {
  isGitRemoteUrl,
  normalizeRemoteUrl,
  resolveGitRepo,
  type ResolvedRepo,
  type ResolveGitRepoOptions,
} from './repo.js'
export {
  changeDataRoot,
  dataRootSync,
  defaultDataRoot,
  directorySize,
  envDataRoot,
  pointerFilePath,
  resolveDataRoot,
  setDataRootOverride,
  type ChangeDataRootResult,
} from './paths.js'
export {
  browseRoot,
  listDirectories,
  listVolumes,
  quickPlaces,
  type BrowseResult,
  type DirEntry,
} from './browse.js'
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
// Modular tracker subsystem (one adapter file per platform + registry).
export {
  trackerAdapters,
  getTrackerAdapter,
  type TrackerAdapter,
  type SubmitContext,
} from './tracker/index.js'
export {
  analyzeReportWithModel,
  enrichReportWithModel,
  extractJsonArray,
  mergeScopeItems,
  parseModelScopeDrafts,
  type ModelJsonCaller,
  type ModelScopeDraft,
} from './enrich.js'
export { buildChatAnalysisPrompt, buildVisualChatPrompt, buildCodeVisualPrompt, buildPageRematchPrompt, promptSafeImageUrl, formatDesignSnapshot, formatStaticDiffSummary } from './chat-prompt.js'
export type { VisualChatDiff, VisualChatPromptInput, CodeVisualPromptInput, CodeVisualManifestMode, PageRematchCandidate, PageRematchPromptInput } from './chat-prompt.js'

export {
  visualScanKey,
  visualDesignCompareKey,
  visualHifiKey,
  visualFindingsKey,
  visualRematchKey,
  loadVisualScan,
  saveVisualScan,
  loadVisualDesignCompare,
  saveVisualDesignCompare,
  loadVisualHifi,
  saveVisualHifi,
  loadVisualFindings,
  saveVisualFindings,
  loadVisualRematch,
  saveVisualRematch,
  fingerprintFiles,
  VISUAL_CACHE_SCHEMA_VERSION,
} from './visual-cache.js'
export type { CachedEntry } from './visual-cache.js'
export { parseVisualFindings, parseVisualRenderPatches } from './visual-findings-publish.js'
export {
  extractCandidateNodeIds,
  resolveFindingNodeId,
  designDocToFindingLocators,
  enrichVisualFindingsNodeIds,
  type FindingNodeLocator,
  type FindingNodeHints,
} from './design/resolve-finding-node.js'
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
  DesignGradient,
  DesignNode,
  DesignNodeKind,
  DesignShadow,
  DesignStyle,
  DiffSeverity,
  Edges,
  HexColor,
  UnmatchedNode,
  UnresolvedValue,
  VisualCompareResult,
  VisualFinding,
  VisualFindingSeverity,
  VisualFindingsReport,
  VisualRenderPatch,
  VisualRenderNodePatch,
  VisualProperty,
} from './design/types.js'
export {
  figmaColorToHex,
  normalizeFigmaBlendMode,
  fetchFigmaDoc,
  normalizeFigmaTree,
  parseFigmaUrl,
  parseFigmaFileKey,
  renderFigmaNode,
  renderFigmaNodesBatch,
  fetchFigmaImageFills,
  type FigmaClientOptions,
  type FigmaRenderOptions,
  type FigmaRenderResult,
  type FigmaTransportOptions,
} from './design/sources/figma.js'
export {
  isLanhuUrl,
  parseLanhuUrl,
  buildLanhuImageUrl,
  normalizeLanhuAnnotation,
  fetchLanhuDoc,
  fetchLanhuPreviewUrl,
  fetchLanhuPreviewUrls,
  fetchLanhuPreviewDataUrl,
  fetchLanhuPreviewDataUrls,
  fetchLanhuProjectInventory,
  type LanhuClientOptions,
  type LanhuUrlParts,
  type LanhuPageSummary,
  type LanhuProjectInventory,
  type LanhuTransportOptions,
} from './design/sources/lanhu.js'
export {
  buildAndroidResources,
  EMPTY_ANDROID_RESOURCES,
  normalizeAndroidLayout,
  parseAndroidDimension,
  resolveAndroidStyleAttrs,
  registerAndroidColorFile,
  androidResourceDirRank,
  loadAndroidXmlResources,
  parseConstraintDimensionRatio,
  collectConstraintGuides,
  applyConstraintChainWeights,
  applyConstraintFlowLayout,
  type AndroidResources,
  type AndroidUiMode,
  type DimensionToken,
} from './design/adapters/android-xml.js'
export {
  normalizeUIKitDoc,
  loadIosAssetCatalogColors,
  parseColorsetContents,
  extractNamedColorsFromIb,
  resolveIosDynamicTypeSize,
  IOS_DYNAMIC_TYPE_SIZES,
} from './design/adapters/ios-xib.js'
export { compareVisualDocs, type CompareOptions } from './design/compare.js'
export { heuristicCompare } from './design/heuristic-compare.js'
export {
  parseCssColor,
  parseCssLength,
  parseCssAspectRatio,
  parseCssObjectPosition,
  parseCssBoxShadowElevation,
  parseCssDeclarations,
  parseSimpleClassRules,
  parseSimpleStyleRules,
  preprocessStylesheet,
  filterPrefersColorSchemeBlocks,
  resolveCssColorSchemePrefer,
  rewriteLightDarkFunctions,
  filterContainerQueryBlocks,
  applyFlexGapLayout,
  applyDocumentOrderStack,
  containerQueryMatches,
  DEFAULT_CSS_CONTAINER,
  extractFlexGapHint,
  type SimpleStyleRules,
} from './design/adapters/web-css.js'
export { markupToDesignDoc, collectMarkupTexts, countMarkupControls } from './design/adapters/web-markup.js'
export {
  loadAssociatedStyles,
  collectStyleSpecifiers,
} from './design/adapters/load-associated-styles.js'
export { normalizeMauiXaml } from './design/adapters/maui-xaml.js'
export { analyzeAdapterBindings, type AdapterBindings } from './design/adapter-binding.js'
export { walkFiles, SKIP_DIRS } from './design/fs-walk.js'
export { SKIP_DIR_NAMES, pathHasSkippedSegment } from './skip-paths.js'
export { parseXml, decodeXmlEntities, type XmlElement } from './design/xml-lite.js'
// Adapter / page-matching API.
export {
  discoverAllPages,
  clearDiscoverPagesCache,
  resolveCodePage,
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
  adapterSpecificity,
  type PageMatch,
  type MatchOptions,
} from './design/page-fingerprint.js'
export {
  platformAdapters,
  getPlatformAdapter,
  type PlatformAdapter,
} from './design/registry.js'
export {
  fetchFigmaFileInventory,
  fetchFigmaDocsBatch,
  type FigmaFileInventory,
  type FigmaCanvasSummary,
  type FigmaPageSummary,
} from './design/sources/figma.js'
export {
  loadAndroidProjectResources,
  findResRoots,
  type AndroidProjectResources,
  type AndroidModuleResources,
  type AndroidValueResources,
  type ParsedDrawable,
} from './design/android-resources.js'
export {
  renderAndroidLayout,
  renderAndroidItemLayout,
  nodeKindOf,
  type AndroidRenderContext,
  type LayoutResult,
  type LayoutRenderNode,
  type LayoutNodeKind,
  type HifiLayoutResult,
  type HifiRenderNode,
  type RenderedAndroidItem,
  type HifiNodeKind,
} from './design/android-layout-engine.js'
export {
  pruneDesignerAnnotations,
  isDesignerAnnotationText,
  isDesignerAnnotationNode,
} from './design/annotation-filter.js'
export {
  buildAndroidRenderContext,
  type BuiltAndroidRenderContext,
} from './design/android-render-context.js'
export {
  analyzeLayoutDependencies,
  formatDependencyManifest,
  type LayoutDependencyManifest,
} from './design/deps-manifest.js'
export {
  resolveRelatedSourceFiles,
  formatRelatedSourceFilesManifest,
  relatedFromAndroidManifest,
  relatedFilesAbsolute,
  type RelatedSourceFile,
  type RelatedSourceFilesResult,
  type RelatedFileRole,
} from './design/related-source-files.js'
export {
  expandDesignDocWithRelated,
  isDesignDocCandidatePath,
  normalizeComponentKey,
  moduleKeyFromPath,
  type RelatedDesignDocInput,
} from './design/expand-related-design-doc.js'
export {
  layoutTreeToDesignDoc,
  hifiTreeToDesignDoc,
} from './design/hifi-to-design-doc.js'
export {
  applyVisualRenderPatches,
  collectDynamicRegionCatalog,
  type RenderPatchableNode,
  type ApplyRenderPatchesResult,
} from './design/apply-visual-render-patches.js'
export {
  seedDynamicFromDesign,
  seedListTilesFromDesign,
  applyDesignTextsToTiles,
  isPreviewPlaceholderText,
  collectDesignTextsSorted,
  findTiledGroups,
} from './design/seed-dynamic-from-design.js'
export {
  estimateTextAdvance,
  estimateTextBlock,
  charAdvanceUnit,
  isWideChar,
  type TextMetricOptions,
} from './design/text-metrics.js'
export {
  tileListTemplate,
  makeListFrame,
  cloneDesignNode,
  clampListTileCount,
  DEFAULT_LIST_TILE_COUNT,
  MAX_LIST_TILE_COUNT,
} from './design/list-template-expand.js'
export {
  classifyCodePage,
  classifyDesignPage,
  mapInventoryPages,
  PAGE_KIND_LABEL,
  type PageKind,
  type DesignPageMapping,
  type PageMappingCandidate,
  type InventoryMappingOptions,
} from './design/page-inventory.js'
export {
  expandFocusedDesignPages,
  looksLikeScreenFrame,
} from './design/expand-screens.js'
export type {
  AdapterId,
  AdapterCapabilities,
  CodePage,
  PageFingerprint,
  PlatformId,
} from './design/adapters/adapter-types.js'
export { resolveAdapterCapabilities } from './design/adapters/adapter-types.js'
// Legacy discovery shim (kept for older routes).
export {
  discoverLayouts,
  type DiscoveredLayout,
  type LayoutPlatform,
  type ProjectKind,
} from './design/legacy-discover.js'
export {
  diffPixelImages,
  pixelDistance,
  type PixelImage,
  type PixelDiffResult,
  type PixelDiffOptions,
  type DiffRegion,
} from './pixel-diff.js'
