/**
 * Single entry for building tracker markdown bodies so adapters that rewrite
 * the description after screenshot upload stay consistent with the orchestrator.
 */
import type { ReportAttachment, ScopeItem } from '../types.js'
import {
  buildFailFeedbackDescription,
  type FeedbackLang,
} from './feedback.js'
import { buildCrashDefectBody, type CrashFeedbackMeta } from '../crash/feedback.js'
import {
  buildVisualDiffFeedbackDescription,
  type FeedbackKind,
  type VisualDiffFeedbackMeta,
} from './visual-feedback.js'

export function buildTrackerFeedbackDescription(input: {
  kind?: FeedbackKind
  repoPath: string
  baseCommit: string
  headCommit: string
  items: ScopeItem[]
  attachments?: ReportAttachment[]
  embedScreenshotDataUrls?: boolean
  screenshotEmbeds?: Record<string, string>
  lang?: FeedbackLang | string
  visualMeta?: VisualDiffFeedbackMeta
  prebuiltDescription?: string
  crashMeta?: CrashFeedbackMeta
}): string {
  if (input.kind === 'crash') {
    const prebuilt = input.prebuiltDescription?.trim()
    if (prebuilt) return prebuilt
    if (input.crashMeta) {
      return buildCrashDefectBody({
        incident: input.crashMeta.incident,
        matchedFiles: input.crashMeta.matchedFiles,
        summary: input.crashMeta.summary,
        fixHints: input.crashMeta.fixHints,
        repoPath: input.repoPath,
        lang: input.lang,
      })
    }
    return ''
  }
  if (input.kind === 'visual-diff') {
    return buildVisualDiffFeedbackDescription({
      repoPath: input.repoPath,
      items: input.items,
      meta: input.visualMeta,
      attachments: input.attachments,
      embedScreenshotDataUrls: input.embedScreenshotDataUrls,
      screenshotEmbeds: input.screenshotEmbeds,
      lang: input.lang,
    })
  }
  return buildFailFeedbackDescription({
    repoPath: input.repoPath,
    baseCommit: input.baseCommit,
    headCommit: input.headCommit,
    items: input.items,
    attachments: input.attachments,
    embedScreenshotDataUrls: input.embedScreenshotDataUrls,
    screenshotEmbeds: input.screenshotEmbeds,
    lang: input.lang,
  })
}
