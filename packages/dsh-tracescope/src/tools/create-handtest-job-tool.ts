/**
 * `tracescope_create_handtest_job` — start an interactive hand-test chat job
 * and return the starter prompt (same as the sidebar "AI 智能分析" flow).
 */
import type { Context } from '../dsh-shims.js'
import { defineTool } from '../dsh-shims.js'
import { createHandtestJob } from '../agent-api.js'
import { toolText } from './tool-helpers.js'

export function registerCreateHandtestJobTool(ctx: Context) {
  ctx.tools?.register(
    defineTool({
      name: 'tracescope_create_handtest_job',
      description:
        'Create a TraceScope hand-test chat job and return the starter prompt. After analysis, call tracescope_publish_handtest with the same jobId.',
      parameters: {
        repoPath: {
          type: 'string',
          required: true,
          description: 'Local git path or remote URL',
        },
        baseCommit: { type: 'string', required: true },
        headCommit: { type: 'string', required: true },
        fetchRemote: { type: 'boolean' },
        accessMode: { type: 'string', description: 'git | codeup' },
        authMode: { type: 'string', description: 'none | https | ssh' },
        authUsername: { type: 'string' },
        authToken: { type: 'string' },
        authPrivateKeyPath: { type: 'string' },
        relatedWorkItems: {
          type: 'string',
          description: 'Optional related work-item refs (JSON or free text)',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['jobId', 'status', 'prompt', 'summary'],
          properties: {
            jobId: { type: 'string' },
            status: { type: 'string' },
            prompt: { type: 'string' },
            summary: { type: 'string' },
            resolved: { type: 'object', additionalProperties: true },
            relatedWorkItems: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
        },
        render: (_args, value) => {
          const v = value as { summary?: string }
          return toolText(v.summary || '已创建手测任务')
        },
      },
      async execute(args: Record<string, unknown>) {
        return await createHandtestJob(args)
      },
    }),
  )
}
