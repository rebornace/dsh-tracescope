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
  safeAttachLabel,
} from './feedback.js'
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
export { gitlabTrackerAdapter } from './adapters/gitlab.js'
export { webhookTrackerAdapter } from './adapters/webhook.js'
