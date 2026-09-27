/**
 * Collaboration-platform adapter registry — the single horizontal extension
 * point, mirroring the design adapter registry.
 *
 * Register a new platform once here; readiness checks and feedback submission
 * pick it up automatically with no changes elsewhere.
 */
import type { TrackerAdapter } from './adapter-types.js'
import { yunxiaoTrackerAdapter } from './adapters/yunxiao.js'
import { githubTrackerAdapter } from './adapters/github.js'
import { gitlabTrackerAdapter } from './adapters/gitlab.js'
import { webhookTrackerAdapter } from './adapters/webhook.js'

const REGISTRY: TrackerAdapter[] = [
  yunxiaoTrackerAdapter,
  githubTrackerAdapter,
  gitlabTrackerAdapter,
  webhookTrackerAdapter,
]

/** All registered adapters (registration order preserved). */
export function trackerAdapters(): TrackerAdapter[] {
  return REGISTRY
}

export function getTrackerAdapter(id: string): TrackerAdapter | undefined {
  return REGISTRY.find((a) => a.id === id)
}

export { type TrackerAdapter }
