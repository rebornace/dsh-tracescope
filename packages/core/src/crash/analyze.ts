import { normalizeFeedbackLang, type FeedbackLang } from '../tracker/feedback.js'
import {
  buildCrashDefectBody,
  buildCrashPrompt,
  crashSummaryNoMatchLabel,
} from './feedback.js'
import { matchStackToRepo } from './match-repo.js'
import { parseStackText } from './parse-stack.js'
import { resolveExceptionName } from './resolve-exception.js'
import type { CrashAnalysisReport, CrashIncident, CrashMatchedFile } from './types.js'

const DEFAULT_MATCH_LIMIT = 10

export interface AnalyzeCrashOptions {
  incident: CrashIncident
  repoPath: string
  lang?: FeedbackLang | string
  matchLimit?: number
}

function buildSummary(
  incident: CrashIncident,
  exceptionName: string,
  matchedFiles: CrashMatchedFile[],
  lang: FeedbackLang,
): string {
  const t = normalizeFeedbackLang(lang)
  const noMatch = crashSummaryNoMatchLabel(lang)
  const parts: string[] = []
  parts.push(exceptionName)
  if (incident.appVersion?.trim()) {
    parts.push(
      t === 'zh'
        ? `\u7248\u672c ${incident.appVersion.trim()}`
        : `version ${incident.appVersion.trim()}`,
    )
  }
  if (incident.count != null && Number.isFinite(incident.count)) {
    parts.push(
      t === 'zh' ? `\u6b21\u6570 ${incident.count}` : `count ${incident.count}`,
    )
  }
  const topFrame = matchedFiles[0]
  if (topFrame) {
    const hint = topFrame.symbol ? ` (${topFrame.symbol})` : ''
    parts.push(
      t === 'zh'
        ? `\u9996\u5e27\u547d\u4e2d ${topFrame.path}${hint}`
        : `top frame matched ${topFrame.path}${hint}`,
    )
  } else {
    parts.push(noMatch)
  }
  return parts.join('\uff1b ')
}

function buildFixHints(
  matchedFiles: CrashMatchedFile[],
  lang: FeedbackLang,
): string[] {
  if (!matchedFiles.length) {
    return lang === 'zh'
      ? [
          '\u68c0\u67e5\u5806\u6808\u9876\u90e8\u5e27\u5bf9\u5e94\u7684\u6e90\u7801\u6587\u4ef6\u662f\u5426\u5728\u5f53\u524d\u4ed3\u5e93\u4e2d',
          '\u786e\u8ba4\u7248\u672c/\u6784\u5efa\u53f7\u4e0e\u672c\u5730\u4ee3\u7801\u4e00\u81f4',
        ]
      : [
          'Verify the source files for the top stack frames exist in this repository',
          'Confirm the app version/build matches the checked-out code',
        ]
  }
  const hints: string[] = []
  for (const hit of matchedFiles.slice(0, 3)) {
    hints.push(
      lang === 'zh'
        ? `\u9605\u8bfb \`${hit.path}\`${hit.symbol ? ` \u4e2d\u7684 ${hit.symbol}` : ''}`
        : `Review \`${hit.path}\`${hit.symbol ? ` around ${hit.symbol}` : ''}`,
    )
  }
  hints.push(
    lang === 'zh'
      ? '\u4ece\u5806\u6808\u9876\u90e8\u5f00\u59cb\u6392\u67e5\u7a7a\u6307\u9488\u3001\u672a\u521d\u59cb\u5316\u6216\u8d8a\u754c\u8bbf\u95ee'
      : 'Start from the top frames and check for null, uninitialized, or out-of-bounds access',
  )
  return hints
}

/** Parse stack, match repo files, and build bilingual prompt/defect body. */
export async function analyzeCrash(options: AnalyzeCrashOptions): Promise<CrashAnalysisReport> {
  const lang = normalizeFeedbackLang(options.lang)
  const stackText = options.incident.stackText
  const parsed = parseStackText(stackText)
  const limit = options.matchLimit ?? DEFAULT_MATCH_LIMIT
  const hits = await matchStackToRepo(options.repoPath, parsed, limit)
  const matchedFiles: CrashMatchedFile[] = hits.map((h) => ({
    path: h.path,
    reason: h.reason,
    symbol: h.symbol,
  }))
  const exceptionName = resolveExceptionName(options.incident, {
    parsedExceptionName: parsed.exceptionName,
    stackText,
  })
  const summary = buildSummary(options.incident, exceptionName, matchedFiles, lang)
  const fixHints = buildFixHints(matchedFiles, lang)
  const reportParts = {
    repoPath: options.repoPath,
    summary,
    matchedFiles,
    fixHints,
    stackText,
    incident: options.incident,
  }
  return {
    incident: options.incident,
    matchedFiles,
    summary,
    fixHints,
    prompt: buildCrashPrompt(reportParts, lang),
    defectBody: buildCrashDefectBody({
      incident: options.incident,
      matchedFiles,
      summary,
      fixHints,
      repoPath: options.repoPath,
      lang,
    }),
  }
}
