/**
 * `tracescope_publish_handtest` tool: publish the final checklist for a chat
 * job so the sidebar panel refreshes and the report is persisted.
 */
import type { Context } from '../dsh-shims.js'
import { defineTool } from '../dsh-shims.js'
import {
  buildReportFromPublishedItems,
  changedPathsFromDiffs,
  compareCodeup,
  gitDiffFiles,
  parsePublishedHandtestItems,
  resolveCodeupTarget,
  saveHandtestReport,
} from '@rebornace/tracescope-core'
import { getJob, publishJobReport } from '../jobs.js'
import { toolText } from './tool-helpers.js'

export function registerPublishHandtestTool(ctx: Context) {
  ctx.tools?.register(
    defineTool({
      name: 'tracescope_publish_handtest',
      description:
        'Publish the final hand-test checklist for a TraceScope chat job. Call this once the interactive analysis is complete so the right-sidebar panel can refresh.',
      parameters: {
        jobId: {
          type: 'string',
          required: true,
          description: 'TraceScope job id from the starter prompt',
        },
        items: {
          type: 'string',
          required: true,
          description:
            'JSON array of hand-test items: [{displayName,kind,risk,files,suggestedSteps,evidence}]',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['jobId', 'status', 'directCount', 'rippleCount'],
          properties: {
            jobId: { type: 'string' },
            status: { type: 'string' },
            directCount: { type: 'integer' },
            rippleCount: { type: 'integer' },
            summary: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const v = value as { summary?: string }
          return toolText(v.summary || '已发布手测清单')
        },
      },
      async execute(args: Record<string, unknown>) {
        const jobId = String(args.jobId ?? '')
        if (!jobId) throw new Error('缺少 jobId')
        const job = getJob(jobId)
        if (!job) throw new Error(`找不到任务 ${jobId}`)

        let parsed: unknown = args.items
        if (typeof args.items === 'string') {
          try {
            parsed = JSON.parse(args.items)
          } catch {
            throw new Error('items 不是合法 JSON')
          }
        }
        const items = parsePublishedHandtestItems(parsed)
        let changedFiles: string[] = []
        try {
          if (job.accessMode === 'codeup' && job.codeup?.token) {
            const target = resolveCodeupTarget(job.repoInput, job.codeup)
            const compare = await compareCodeup(target, {
              endpoint: job.codeup.endpoint,
              token: job.codeup.token,
              base: job.baseCommit,
              head: job.headCommit,
            })
            changedFiles = changedPathsFromDiffs(compare.diffs)
          } else {
            changedFiles = await gitDiffFiles(job.repoPath, job.baseCommit, job.headCommit)
          }
        } catch {
          changedFiles = [...new Set(items.flatMap((i) => i.files))]
        }
        const report = buildReportFromPublishedItems({
          repoPath: job.repoPath,
          baseCommit: job.baseCommit,
          headCommit: job.headCommit,
          changedFiles,
          items,
        })
        const updated = publishJobReport(jobId, report)
        await saveHandtestReport({
          repoInput: job.repoPath,
          baseCommit: job.baseCommit,
          headCommit: job.headCommit,
          report,
          source: 'model',
        })
        const summary = [
          `已发布手测清单到 TraceScope 面板（任务 ${jobId}）`,
          `并已持久化到本机，重启后同一仓库与两版本会自动恢复（再次「模型对话分析」并 publish 才会覆盖）。`,
          `直接 ${report.direct.length} · 波及 ${report.ripple.length}`,
          '',
          '## 直接变更',
          ...report.direct.map((i) => `- [${i.risk}] ${i.displayName}`),
          '',
          '## 可能波及',
          ...report.ripple.map((i) => `- [${i.risk}] ${i.displayName}`),
        ].join('\n')
        return {
          jobId: updated.id,
          status: updated.status,
          directCount: report.direct.length,
          rippleCount: report.ripple.length,
          summary,
        }
      },
    }),
  )
}
