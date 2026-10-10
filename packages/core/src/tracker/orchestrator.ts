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
import { buildTrackerFeedbackDescription } from './build-description.js'
import {
  buildFailFeedbackSubject,
  normalizeFeedbackLang,
  type FeedbackLang,
} from './feedback.js'
import { buildCrashDefectSubject, type CrashFeedbackMeta } from '../crash/feedback.js'
import {
  buildVisualDiffFeedbackSubject,
  type FeedbackKind,
  type VisualDiffFeedbackMeta,
} from './visual-feedback.js'

export function collectFailedItems(report: ImpactReport): ScopeItem[] {
  return [...report.direct, ...report.ripple].filter((i) => i.status === 'fail')
}

export function isTrackerConfigReady(config: TrackerConfig | null | undefined): boolean {
  if (!config || config.provider === 'none') return false
  const adapter: TrackerAdapter | undefined = getTrackerAdapter(config.provider)
  if (!adapter) return false
  return adapter.isReady(config)
}

function orchError(lang: FeedbackLang, code: 'unsupported' | 'incomplete'): string {
  if (lang === 'en') {
    return code === 'unsupported'
      ? 'No collaboration platform selected, or the platform is not supported'
      : 'Collaboration platform configuration is incomplete or no platform is selected'
  }
  return code === 'unsupported'
    ? '\u672a\u9009\u62e9\u534f\u4f5c\u5e73\u53f0\u6216\u5e73\u53f0\u4e0d\u53d7\u652f\u6301'
    : '\u534f\u4f5c\u5e73\u53f0\u914d\u7f6e\u4e0d\u5b8c\u6574\u6216\u672a\u9009\u62e9\u5e73\u53f0'
}

function normalizeFeedbackKind(raw: unknown): FeedbackKind {
  if (raw === 'visual-diff') return 'visual-diff'
  if (raw === 'crash') return 'crash'
  return 'impact'
}

/** Submit failed-verification or UI-review feedback to the configured tracker. */
export async function submitFailFeedback(
  config: TrackerConfig,
  input: {
    repoPath: string
    baseCommit: string
    headCommit: string
    items: ScopeItem[]
    subject?: string
    attachments?: import('../types.js').ReportAttachment[]
    /** Host UI language for subject/body wording. */
    lang?: FeedbackLang | string
    /** Defaults to impact verification wording. */
    feedbackKind?: FeedbackKind | string
    visualMeta?: VisualDiffFeedbackMeta
    /** Pre-built markdown body (e.g. crash defect from analysis). */
    prebuiltDescription?: string
    crashMeta?: CrashFeedbackMeta
  },
  fetchImpl: typeof fetch = fetch,
): Promise<TrackerSubmitResult> {
  const lang = normalizeFeedbackLang(input.lang)
  const feedbackKind = normalizeFeedbackKind(input.feedbackKind)
  const provider: TrackerProvider = config.provider || 'none'
  const adapter: TrackerAdapter | undefined = getTrackerAdapter(provider)
  if (!adapter) {
    return { ok: false, provider, error: orchError(lang, 'unsupported') }
  }
  if (!isTrackerConfigReady(config)) {
    return { ok: false, provider, error: orchError(lang, 'incomplete') }
  }

  const subject =
    input.subject?.trim() ||
    (feedbackKind === 'visual-diff'
      ? buildVisualDiffFeedbackSubject(input.items, input.visualMeta, lang)
      : feedbackKind === 'crash' && input.crashMeta
        ? buildCrashDefectSubject(input.crashMeta.incident, lang)
        : buildFailFeedbackSubject(input.items, input.repoPath, lang))
  const description = buildTrackerFeedbackDescription({
    kind: feedbackKind,
    repoPath: input.repoPath,
    baseCommit: input.baseCommit,
    headCommit: input.headCommit,
    items: input.items,
    attachments: input.attachments,
    lang,
    visualMeta: input.visualMeta,
    prebuiltDescription: input.prebuiltDescription,
    crashMeta: input.crashMeta,
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
        lang,
        feedbackKind,
        visualMeta: input.visualMeta,
        prebuiltDescription: input.prebuiltDescription,
        crashMeta: input.crashMeta,
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
