/**
 * `tracescope_start_visual_review` — create a UI review job + starter prompt.
 */
import type { Context } from '../dsh-shims.js'
import { defineTool } from '../dsh-shims.js'
import { startVisualReview } from '../agent-api.js'
import { toolText } from './tool-helpers.js'

export function registerStartVisualReviewTool(ctx: Context) {
  ctx.tools?.register(
    defineTool({
      name: 'tracescope_start_visual_review',
      description:
        'Start a TraceScope design↔code UI review job and return the starter prompt. Then use tracescope_get_design_snapshot as needed and write back with tracescope_publish_visual_findings.',
      parameters: {
        repoPath: { type: 'string', required: true },
        adapterId: {
          type: 'string',
          required: true,
          description: 'Platform adapter id, e.g. android-xml / web-react',
        },
        relativePath: {
          type: 'string',
          required: true,
          description: 'Code file relative path to compare',
        },
        figmaUrl: {
          type: 'string',
          description: 'Figma or Lanhu design URL (alias: designUrl)',
        },
        designUrl: { type: 'string' },
        designId: { type: 'string', description: 'Design node / page id when known' },
        figmaToken: { type: 'string' },
        lanhuCookie: { type: 'string' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['jobId', 'prompt', 'summary'],
          properties: {
            jobId: { type: 'string' },
            prompt: { type: 'string' },
            summary: { type: 'string' },
            designImageUrl: { type: 'string' },
            designRasterInPanel: { type: 'boolean' },
          },
        },
        render: (_args, value) => {
          const v = value as { summary?: string }
          return toolText(v.summary || '已创建 UI 走查任务')
        },
      },
      async execute(args: Record<string, unknown>) {
        return await startVisualReview(args)
      },
    }),
  )
}
