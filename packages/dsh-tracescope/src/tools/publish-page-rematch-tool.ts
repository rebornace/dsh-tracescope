/**
 * `tracescope_publish_page_rematch` tool: write AI file-match recommendations
 * back to TraceScope so the mapping overview selects the Top-1 file.
 */
import { saveVisualRematch, visualRematchKey } from '@rebornace/tracescope-core'
import type { Context } from '../dsh-shims.js'
import { defineTool } from '../dsh-shims.js'
import { getVisualJob, publishVisualJobRematch, type RematchPick } from '../visual-jobs.js'
import { toolText } from './tool-helpers.js'

function parsePicks(raw: unknown): RematchPick[] {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      throw new Error('picks 不是合法 JSON')
    }
  }
  if (!Array.isArray(value)) throw new Error('picks 必须是数组')
  const picks: RematchPick[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const relativePath = String(row.relativePath ?? row.path ?? '').trim().replace(/\\/g, '/')
    if (!relativePath) continue
    const adapterId = String(row.adapterId ?? row.adapter ?? 'android-xml').trim() || 'android-xml'
    const kindLabel =
      typeof row.kindLabel === 'string' && row.kindLabel.trim()
        ? row.kindLabel.trim()
        : undefined
    let score: number | undefined
    const scoreRaw = row.score ?? row.confidence
    if (typeof scoreRaw === 'number' && Number.isFinite(scoreRaw)) {
      score = Math.max(0, Math.min(1, scoreRaw))
    } else if (typeof scoreRaw === 'string' && scoreRaw.trim()) {
      const n = Number(scoreRaw)
      if (Number.isFinite(n)) score = Math.max(0, Math.min(1, n))
    }
    const reason =
      typeof row.reason === 'string' && row.reason.trim()
        ? row.reason.trim().slice(0, 200)
        : undefined
    picks.push({ adapterId, relativePath, kindLabel, score, reason })
  }
  if (!picks.length) throw new Error('picks 为空或缺少 relativePath')
  return picks.slice(0, 8)
}

export function registerPublishPageRematchTool(ctx: Context) {
  ctx.tools?.register(
    defineTool({
      name: 'tracescope_publish_page_rematch',
      description:
        'Publish AI page↔file rematch recommendations for a TraceScope rematch job. Call this after choosing the best code files so the right-sidebar mapping cards update their selected file.',
      parameters: {
        jobId: {
          type: 'string',
          required: true,
          description: 'TraceScope rematch job id from the starter prompt',
        },
        picks: {
          type: 'string',
          required: true,
          description:
            'JSON array: [{adapterId,relativePath,kindLabel?,score?,reason?}]. score may be confidence 0..1.',
        },
        note: {
          type: 'string',
          required: false,
          description: 'Optional one-line summary of the recommendation.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['jobId', 'status', 'count'],
          properties: {
            jobId: { type: 'string' },
            status: { type: 'string' },
            count: { type: 'integer' },
            topPath: { type: 'string' },
            summary: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const v = value as { summary?: string }
          return toolText(v.summary || '已写回文件匹配推荐')
        },
      },
      async execute(args: Record<string, unknown>) {
        const jobId = String(args.jobId ?? '')
        if (!jobId) throw new Error('缺少 jobId')
        const job = getVisualJob(jobId)
        if (!job) throw new Error(`找不到文件匹配任务 ${jobId}`)
        if (job.kind !== 'rematch') {
          throw new Error(`任务 ${jobId} 不是文件匹配任务（kind=${job.kind}）`)
        }

        const picks = parsePicks(args.picks)
        const note =
          typeof args.note === 'string' && args.note.trim()
            ? args.note.trim().slice(0, 400)
            : undefined

        const updated = publishVisualJobRematch(jobId, { picks, note })
        const top = picks[0]!
        const report = {
          designId: job.designId,
          picks,
          note,
          source: 'model' as const,
          savedAt: new Date().toISOString(),
        }
        try {
          await saveVisualRematch(
            visualRematchKey(job.repoInput, job.fileKey, job.designId),
            report,
          )
        } catch {
          /* disk write failure must not block the in-memory write-back */
        }
        return {
          jobId,
          status: updated.status,
          count: picks.length,
          topPath: top.relativePath,
          summary: `已写回 ${picks.length} 个推荐并持久化；侧栏将选中 ${top.relativePath}，重启后仍可恢复`,
        }
      },
    }),
  )
}
