import { mergeScopeItems } from './enrich.js'
import { ensureUniqueScopeItemIds } from './scope-ids.js'
import type { ImpactReport, ScopeItem } from './types.js'

/** Lightweight ref to an agile work item selected by the tester. */
export interface AgileWorkItemRef {
  id: string
  subject: string
  category?: string
  description?: string
  url?: string
  status?: string
}

function slugId(kind: string, name: string, extra: string): string {
  const base = `${kind}:${name}:${extra}`.toLowerCase().replace(/[^a-z0-9:_./|-]+/g, '-')
  return base.slice(0, 100) || `${kind}-item`
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse request body `relatedWorkItems` into normalized refs. */
export function parseAgileWorkItemRefs(raw: unknown): AgileWorkItemRef[] {
  if (!Array.isArray(raw)) return []
  const out: AgileWorkItemRef[] = []
  const seen = new Set<string>()
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const id = String(o.id ?? o.workitemId ?? '').trim()
    const subject = String(o.subject ?? o.title ?? o.name ?? '').trim()
    if (!id || !subject || seen.has(id)) continue
    seen.add(id)
    const category = String(o.category ?? '').trim()
    const description = String(o.description ?? o.content ?? '').trim()
    const url = String(o.url ?? '').trim()
    const status = String(o.status ?? '').trim()
    out.push({
      id,
      subject,
      category: category || undefined,
      description: description || undefined,
      url: url || undefined,
      status: status || undefined,
    })
  }
  return out
}

/** Turn selected agile tasks into seed ScopeItems for the hand-test checklist. */
export function workItemsToScopeItems(items: AgileWorkItemRef[]): ScopeItem[] {
  return items.map((item) => {
    const cat = item.category || 'WorkItem'
    const displayName = `[${cat}] ${item.subject}`
    const desc = item.description ? stripHtml(item.description).slice(0, 240) : ''
    const steps = [
      `对照敏捷工作项「${item.subject}」完成验收`,
      desc ? `关注描述要点：${desc}` : '核对工作项描述 / 验收标准是否全部覆盖',
      item.status ? `当前工作项状态：${item.status}` : '确认工作项状态与本轮发布范围一致',
    ].filter(Boolean)
    return {
      id: slugId('direct', displayName, `workitem:${item.id}`),
      displayName,
      kind: 'direct' as const,
      risk: cat === 'Bug' ? ('high' as const) : ('medium' as const),
      files: [`workitem:${item.id}`],
      evidence: [
        {
          code: 'agile-workitem',
          detail: `关联敏捷任务 ${item.id}${item.url ? `（${item.url}）` : ''}`,
        },
      ],
      suggestedSteps: steps.slice(0, 6),
      status: 'pending' as const,
    }
  })
}

/** Prepend / merge selected agile tasks into a deterministic impact report. */
export function mergeAgileWorkItemsIntoReport(
  report: ImpactReport,
  items: AgileWorkItemRef[],
): ImpactReport {
  if (!items.length) return report
  const seeds = workItemsToScopeItems(items)
  const direct = mergeScopeItems([...seeds, ...report.direct])
  const directKeys = new Set(
    direct.map((i) => i.displayName.trim().toLowerCase().replace(/\s+/g, ' ')),
  )
  const ripple = report.ripple.filter(
    (i) => !directKeys.has(i.displayName.trim().toLowerCase().replace(/\s+/g, ' ')),
  )
  return ensureUniqueScopeItemIds({ ...report, direct, ripple })
}
