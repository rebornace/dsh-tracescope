import type { ImpactReport, ScopeItem } from './types.js'

/**
 * Guarantee every checklist item has a non-empty, unique `id`.
 * Duplicate / empty ids make status toggles update multiple cards at once.
 */
export function ensureUniqueScopeItemIds(report: ImpactReport): ImpactReport {
  const seen = new Set<string>()
  const fixList = (list: ScopeItem[], kind: 'direct' | 'ripple'): ScopeItem[] =>
    list.map((item, index) => {
      let id = typeof item.id === 'string' ? item.id.trim() : ''
      if (!id) id = `${kind}-${index}`
      if (seen.has(id)) {
        let n = 2
        while (seen.has(`${id}~${n}`)) n += 1
        id = `${id}~${n}`
      }
      seen.add(id)
      return id === item.id ? item : { ...item, id }
    })

  return {
    ...report,
    direct: fixList(report.direct || [], 'direct'),
    ripple: fixList(report.ripple || [], 'ripple'),
  }
}
