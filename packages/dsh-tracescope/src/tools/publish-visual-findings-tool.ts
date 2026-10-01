/**
 * `tracescope_publish_visual_findings` tool: write the model's structured UI
 * review findings for one page back to TraceScope, so the right-sidebar panel
 * refreshes and the result is persisted. Mirrors `publish-handtest-tool`.
 */
import type { Context } from '../dsh-shims.js'
import { defineTool } from '../dsh-shims.js'
import {
  parseVisualFindings,
  parseVisualRenderPatches,
  saveVisualFindings,
  visualFindingsKey,
  designDocToFindingLocators,
  enrichVisualFindingsNodeIds,
} from '@rebornace/tracescope-core'
import { getVisualJob, publishVisualJobFindings } from '../visual-jobs.js'
import { toolText } from './tool-helpers.js'

export function registerPublishVisualFindingsTool(ctx: Context) {
  ctx.tools?.register(
    defineTool({
      name: 'tracescope_publish_visual_findings',
      description:
        'Publish the structured visual (design vs code) review findings for a TraceScope UI review job. Call this once the comparison is complete so the right-sidebar UI-testing panel can refresh and show the findings against the page.',
      parameters: {
        jobId: {
          type: 'string',
          required: true,
          description: 'TraceScope UI review job id from the starter prompt',
        },
        findings: {
          type: 'string',
          required: true,
          description:
            'JSON array of findings: [{title,severity,nodeId,location,expected,actual,codeSource,suggestion}]',
        },
        renderPatch: {
          type: 'string',
          required: false,
          description:
            'Optional (usually omit). Legacy JSON for experimental visual patches; the panel focuses on findings diffs, not code UI restore.',
        },
        summary: {
          type: 'string',
          required: false,
          description: 'Optional one-paragraph overall summary.',
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
            summary: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const v = value as { summary?: string }
          return toolText(v.summary || '已写回 UI 走查结论')
        },
      },
      async execute(args: Record<string, unknown>) {
        const jobId = String(args.jobId ?? '')
        if (!jobId) throw new Error('缺少 jobId')
        const job = getVisualJob(jobId)
        if (!job) throw new Error(`找不到 UI 走查任务 ${jobId}`)

        let parsed: unknown = args.findings
        if (typeof args.findings === 'string') {
          try {
            parsed = JSON.parse(args.findings)
          } catch {
            throw new Error('findings 不是合法 JSON')
          }
        }
        const findingsRaw = parseVisualFindings(parsed)
        const findings =
          job.designDoc?.root
            ? enrichVisualFindingsNodeIds(
                findingsRaw,
                designDocToFindingLocators(job.designDoc.root),
              )
            : findingsRaw

        // Optional visual reconstruction of the code render (runtime/sparse
        // regions). Parse + validate before attaching; a malformed patch is
        // dropped rather than failing the whole write-back.
        let renderPatch: ReturnType<typeof parseVisualRenderPatches> | undefined
        if (args.renderPatch !== undefined) {
          let patchRaw: unknown = args.renderPatch
          if (typeof args.renderPatch === 'string') {
            try {
              patchRaw = JSON.parse(args.renderPatch)
            } catch {
              throw new Error('renderPatch 不是合法 JSON')
            }
          }
          renderPatch = parseVisualRenderPatches(patchRaw)
        }

        const summary =
          typeof args.summary === 'string' && args.summary.trim()
            ? args.summary.trim().slice(0, 600)
            : undefined

        const report = {
          repoInput: job.repoInput,
          fileKey: job.fileKey,
          designId: job.designId,
          adapterId: job.adapterId,
          relativePath: job.relativePath,
          designName: job.designName,
          findings,
          renderPatch: renderPatch && renderPatch.length ? renderPatch : undefined,
          summary,
          source: 'model' as const,
          savedAt: new Date().toISOString(),
        }

        const updated = publishVisualJobFindings(jobId, report)
        await saveVisualFindings(
          visualFindingsKey(job.repoInput, job.fileKey, job.designId, job.relativePath),
          report,
        )

        const text = [
          `已把 UI 走查结论写回 TraceScope 面板（任务 ${jobId}），并持久化到本机，重开后同一页面自动恢复。`,
          `共 ${findings.length} 条：`,
          ...findings.map(
            (f) => `- [${f.severity}] ${f.title}${f.suggestion ? `：${f.suggestion}` : ''}`,
          ),
          renderPatch && renderPatch.length
            ? `（另收到 ${renderPatch.length} 组实验性 renderPatch，侧栏以差异清单为准，不再做代码还原预览。）`
            : '',
        ]
          .filter((l) => l !== '')
          .join('\n')

        return {
          jobId: updated.id,
          status: updated.status,
          count: findings.length,
          summary: text,
        }
      },
    }),
  )
}
