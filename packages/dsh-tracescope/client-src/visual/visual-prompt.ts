/**
 * Client-side builder for the "ask AI about this page" prompt.
 *
 * The board already holds the page's deterministic diffs, so we format the
 * starter prompt here rather than depending on a field returned by the
 * design-compare route. This keeps the feature working even when the rendered
 * board came from an earlier compare that lacked that field.
 */
import type { DiffBox } from './DesignLayerScreen.js'
import { diffPropLabel, diffSeverityLabel, resolveT, type TranslateFn } from './diff-i18n.js'

export interface VisualPromptMeta {
  designName: string
  codeRelativePath: string
  platformLabel?: string
  viewport?: { width: number; height: number }
}

function formatValue(value: unknown, t: TranslateFn): string {
  if (value === undefined || value === null) return t('diff.valueMissing')
  if (typeof value === 'object') {
    const u = value as { unresolved?: boolean; raw?: string }
    if (u.unresolved) return t('diff.unresolved', { raw: u.raw ?? '' })
  }
  return String(value)
}

export function buildVisualPrompt(
  meta: VisualPromptMeta,
  diffs: DiffBox[],
  t?: TranslateFn,
): string {
  const tr = resolveT(t)
  const lines = diffs.map((d, i) => {
    const label = diffPropLabel(tr, d.property)
    return tr('prompt.diffLine', {
      index: i + 1,
      severity: diffSeverityLabel(tr, d.severity),
      nodeName: d.nodeName,
      property: label,
      expected: formatValue(d.expected, tr),
      actual: formatValue(d.actual, tr),
      review: d.needsReview ? tr('prompt.reviewSuffix') : '',
    })
  })
  const vp = meta.viewport
  const viewportLine = vp
    ? tr('prompt.viewport', { width: vp.width, height: vp.height })
    : ''
  return [
    tr('prompt.intro'),
    '',
    tr('prompt.designPage', { name: meta.designName }),
    tr('prompt.codeImpl', {
      platform: meta.platformLabel ?? tr('prompt.defaultPlatform'),
      path: meta.codeRelativePath,
    }),
    viewportLine,
    '',
    tr('prompt.diffSummary', { count: diffs.length }),
    lines.length ? lines.join('\n') : tr('prompt.noDeterministicDiffs'),
    '',
    tr('prompt.assistIntro'),
    tr('prompt.assistStep1'),
    tr('prompt.assistStep2'),
    tr('prompt.assistStep3'),
  ]
    .filter((l) => l !== '')
    .join('\n')
}
