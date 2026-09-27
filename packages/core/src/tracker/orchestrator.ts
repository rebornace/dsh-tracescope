/**
 * Tracker orchestration.
 *
 * Readiness checks and feedback submission dispatch through the adapter
 * registry instead of a hard-coded switch. Unknown providers fail clearly, and
 * a newly registered platform needs no change here.
 */
import type { ImpactReport, ScopeItem } from '../types.js'
import type { TrackerConfig, TrackerProvider, TrackerSubmitResult } from './types.js'
import type { TrackerAdapter } from './adapter-types.js'
import { getTrackerAdapter } from './registry.js'
import {
  buildFailFeedbackDescription,
  buildFailFeedbackSubject,
} from './feedback.js'

export function collectFailedItems(report: ImpactReport): ScopeItem[] {
  return [...report.direct, ...report.ripple].filter((i) => i.status === 'fail')
}

export function isTrackerConfigReady(config: TrackerConfig | null | undefined): boolean {
  if (!config || config.provider === 'none') return false
  const adapter: TrackerAdapter | undefined = getTrackerAdapter(config.provider)
  if (!adapter) return false
  return adapter.isReady(config)
}

/** Submit failed-verification feedback to the configured tracker. */
export async function submitFailFeedback(
  config: TrackerConfig,
  input: {
    repoPath: string
    baseCommit: string
    headCommit: string
    items: ScopeItem[]
    subject?: string
    attachments?: import('../types.js').ReportAttachment[]
  },
  fetchImpl: typeof fetch = fetch,
): Promise<TrackerSubmitResult> {
  const provider: TrackerProvider = config.provider || 'none'
  const adapter: TrackerAdapter | undefined = getTrackerAdapter(provider)
  if (!adapter) {
    return { ok: false, provider, error: '未选择协作平台或平台不受支持' }
  }
  if (!isTrackerConfigReady(config)) {
    return { ok: false, provider, error: '协作平台配置不完整或未选择平台' }
  }

  const subject =
    input.subject?.trim() || buildFailFeedbackSubject(input.items, input.repoPath)
  const description = buildFailFeedbackDescription({
    repoPath: input.repoPath,
    baseCommit: input.baseCommit,
    headCommit: input.headCommit,
    items: input.items,
    attachments: input.attachments,
  })

  try {
    return await adapter.submit(
      config,
      {
        repoPath: input.repoPath,
        baseCommit: input.baseCommit,
        headCommit: input.headCommit,
        items: input.items,
        subject,
        description,
        attachments: input.attachments,
      },
      fetchImpl,
    )
  } catch (error: unknown) {
    return {
      ok: false,
      provider,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
