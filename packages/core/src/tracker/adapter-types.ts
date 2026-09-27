/**
 * Collaboration-platform adapter contract.
 *
 * Each platform (阿里云效, GitHub, GitLab, Webhook, Jira, Feishu, ...) is one
 * adapter file implementing this interface and registered once in the
 * registry. The orchestrator then submits feedback through this single
 * contract, so adding a platform is one file plus one registry entry — no
 * changes to the switch / routes / store.
 */
import type { ImpactReport, ReportAttachment, ScopeItem } from '../types.js'
import type {
  TrackerConfig,
  TrackerProvider,
  TrackerSubmitResult,
} from './types.js'

export interface SubmitContext {
  repoPath: string
  baseCommit: string
  headCommit: string
  items: ScopeItem[]
  subject: string
  /** Markdown body built from the shared feedback layer. */
  description: string
  /** Whole persisted report, when adapters need attachments beyond the items. */
  report?: ImpactReport
  attachments?: ReportAttachment[]
}

export interface TrackerAdapter {
  /** Stable provider id, matches `TrackerConfig.provider`. */
  id: TrackerProvider
  /** Human-facing platform name (Chinese UI). */
  label: string
  /** Whether the per-platform slice of the config is complete. */
  isReady(config: TrackerConfig): boolean
  /** Submit the failed-verification feedback. */
  submit(
    config: TrackerConfig,
    ctx: SubmitContext,
    fetchImpl: typeof fetch,
  ): Promise<TrackerSubmitResult>
}
