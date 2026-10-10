/**
 * `tracescope_publish_crash_analysis` tool: write the model's crash conclusion
 * back so the sidebar Crash board can refresh automatically.
 */
import type { Context } from '../dsh-shims.js'
import { defineTool } from '../dsh-shims.js'
import { publishCrashAnalysis } from '../agent-api.js'
import { toolText } from './tool-helpers.js'
import { resolveHostLang } from '../i18n/lang.js'
import { ui } from '../i18n/ui.js'

export function registerPublishCrashAnalysisTool(ctx: Context) {
  ctx.tools?.register(
    defineTool({
      name: 'tracescope_publish_crash_analysis',
      description:
        'Publish the crash/ANR analysis conclusion for a TraceScope crash job. Call this once root cause / impact / fix suggestions are ready so the right-sidebar Crash analysis panel can write them back automatically.',
      parameters: {
        jobId: {
          type: 'string',
          required: true,
          description: 'TraceScope crash job id from the starter prompt',
        },
        analysis: {
          type: 'string',
          required: true,
          description:
            'Full conclusion text: root cause, impact scope, and fix suggestions (markdown ok).',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['jobId', 'status'],
          properties: {
            jobId: { type: 'string' },
            status: { type: 'string' },
            summary: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const v = value as { summary?: string }
          return toolText(v.summary || ui('TOOL_CRASH_PUBLISHED', resolveHostLang(ctx)))
        },
      },
      async execute(args: Record<string, unknown>) {
        return publishCrashAnalysis(args)
      },
    }),
  )
}
