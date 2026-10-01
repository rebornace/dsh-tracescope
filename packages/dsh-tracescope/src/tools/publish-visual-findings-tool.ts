/**
 * `tracescope_publish_visual_findings` tool: write the model's structured UI
 * review findings for one page back to TraceScope.
 */
import type { Context } from '../dsh-shims.js'
import { defineTool } from '../dsh-shims.js'
import { publishVisualFindings } from '../agent-api.js'
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
        return await publishVisualFindings(args)
      },
    }),
  )
}
