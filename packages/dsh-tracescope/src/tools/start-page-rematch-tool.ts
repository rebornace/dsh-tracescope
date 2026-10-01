/**
 * `tracescope_start_page_rematch` — create a page↔file rematch job + prompt.
 */
import type { Context } from '../dsh-shims.js'
import { defineTool } from '../dsh-shims.js'
import { startPageRematch } from '../agent-api.js'
import { toolText } from './tool-helpers.js'

export function registerStartPageRematchTool(ctx: Context) {
  ctx.tools?.register(
    defineTool({
      name: 'tracescope_start_page_rematch',
      description:
        'Start a TraceScope design page ↔ code file rematch job and return the starter prompt. Write back with tracescope_publish_page_rematch.',
      parameters: {
        repoPath: { type: 'string', required: true },
        designId: { type: 'string', required: true },
        figmaUrl: { type: 'string', description: 'Figma or Lanhu URL (alias: designUrl)' },
        designUrl: { type: 'string' },
        adapterId: { type: 'string', description: 'Current selected adapter id (optional)' },
        relativePath: { type: 'string', description: 'Current selected file (optional)' },
        figmaToken: { type: 'string' },
        lanhuCookie: { type: 'string' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['jobId', 'prompt', 'candidateCount', 'summary'],
          properties: {
            jobId: { type: 'string' },
            prompt: { type: 'string' },
            candidateCount: { type: 'integer' },
            summary: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const v = value as { summary?: string }
          return toolText(v.summary || '已创建文件匹配任务')
        },
      },
      async execute(args: Record<string, unknown>) {
        return await startPageRematch(args)
      },
    }),
  )
}
