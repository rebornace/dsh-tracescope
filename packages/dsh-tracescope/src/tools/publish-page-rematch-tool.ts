/**
 * `tracescope_publish_page_rematch` tool: write AI file-match recommendations
 * back to TraceScope so the mapping overview selects the Top-1 file.
 */
import type { Context } from '../dsh-shims.js'
import { defineTool } from '../dsh-shims.js'
import { publishPageRematch } from '../agent-api.js'
import { toolText } from './tool-helpers.js'

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
        return await publishPageRematch(args)
      },
    }),
  )
}
