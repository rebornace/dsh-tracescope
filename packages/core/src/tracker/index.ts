/**
 * Tracker (collaboration platform) subsystem public surface.
 *
 * Modular adapters + registry; add a platform with one adapter file and one
 * registry entry.
 */
export type {
  GithubTrackerConfig,
  GitlabTrackerConfig,
  TrackerConfig,
  TrackerProvider,
  TrackerSubmitResult,
  WebhookTrackerConfig,
} from './types.js'
export type { TrackerAdapter, SubmitContext } from './adapter-types.js'
export {
  bufferFromDataUrl,
  buildFailFeedbackDescription,
  buildFailFeedbackSubject,
  normalizeFeedbackLang,
  safeAttachLabel,
} from './feedback.js'
export type { FeedbackLang } from './feedback.js'
export { buildTrackerFeedbackDescription } from './build-description.js'
export {
  buildVisualDiffFeedbackDescription,
  buildVisualDiffFeedbackSubject,
} from './visual-feedback.js'
export type { FeedbackKind, VisualDiffFeedbackMeta } from './visual-feedback.js'
export type { CrashFeedbackMeta } from '../crash/feedback.js'
export {
  collectFailedItems,
  isTrackerConfigReady,
  submitFailFeedback,
} from './orchestrator.js'
export {
  trackerAdapters,
  getTrackerAdapter,
  type TrackerAdapter as RegisteredTrackerAdapter,
} from './registry.js'
export { yunxiaoTrackerAdapter } from './adapters/yunxiao.js'
export { githubTrackerAdapter } from './adapters/github.js'
export {
  createGithubIssue,
  fetchGithubRepositoryId,
  githubAttachmentMarkdown,
  resolveGithubAttachMime,
  updateGithubIssueBody,
  uploadGithubUserAttachment,
} from './adapters/github-api.js'
export { gitlabTrackerAdapter } from './adapters/gitlab.js'
export { webhookTrackerAdapter } from './adapters/webhook.js'
