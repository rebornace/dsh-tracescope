/**
 * `tracescope_publish_handtest` tool: publish the final checklist for a chat
 * job so the sidebar panel refreshes and the report is persisted.
 */
import type { Context } from '../dsh-shims.js'
import { defineTool } from '../dsh-shims.js'
import { publishHandtest } from '../agent-api.js'
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
            markdown: { type: 'string' },
            csv: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const v = value as { summary?: string }
          return toolText(v.summary || '已发布验证清单')
        },
      },
      async execute(args: Record<string, unknown>) {
        return await publishHandtest(args)
      },
    }),
  )
}
