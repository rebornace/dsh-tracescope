/**
 * Issue-tracker (collaboration platform) facade.
 *
 * Implementation moved to the modular {@link ./tracker} subsystem: one adapter
 * file per platform plus a registry, mirroring the design adapter architecture.
 * This file remains the stable public entry point so existing imports and the
 * on-disk config contract are unchanged.
 *
 * To add a platform (Jira, Feishu/Lark, ...): create `tracker/adapters/<id>.ts`
 * implementing `TrackerAdapter` and register it in `tracker/registry.ts`.
 */
export type {
  GithubTrackerConfig,
  GitlabTrackerConfig,
  TrackerConfig,
  TrackerProvider,
  TrackerSubmitResult,
  WebhookTrackerConfig,
} from './tracker/types.js'
export {
  buildFailFeedbackDescription,
  buildFailFeedbackSubject,
} from './tracker/feedback.js'
export {
  collectFailedItems,
  isTrackerConfigReady,
  submitFailFeedback,
} from './tracker/orchestrator.js'
