/**
 * Issue-tracker (collaboration platform) types.
 *
 * Adding a platform = add one adapter file + one registry entry. These shared
 * types are the only contract every adapter speaks.
 */
import type { YunxiaoConfig } from '../yunxiao.js'

export type TrackerProvider = 'none' | 'yunxiao' | 'github' | 'gitlab' | 'webhook'

export interface GithubTrackerConfig {
  token: string
  owner: string
  repo: string
  /** Optional comma-separated or array labels */
  labels?: string[]
}

export interface GitlabTrackerConfig {
  /** GitLab host, e.g. https://gitlab.com */
  host: string
  token: string
  /** Project id or URL-encoded path like group%2Fproject */
  projectId: string
  labels?: string[]
}

export interface WebhookTrackerConfig {
  url: string
  /** Extra headers (Authorization etc.) */
  headers?: Record<string, string>
}

export interface TrackerConfig {
  provider: TrackerProvider
  yunxiao?: YunxiaoConfig
  github?: GithubTrackerConfig
  gitlab?: GitlabTrackerConfig
  webhook?: WebhookTrackerConfig
}

export interface TrackerSubmitResult {
  ok: boolean
  provider: TrackerProvider
  id?: string
  url?: string
  error?: string
  raw?: unknown
  /** Yunxiao (and similar) attachment upload summary. */
  uploadedAttachments?: number
  failedAttachments?: number
  attachmentErrors?: string[]
}
