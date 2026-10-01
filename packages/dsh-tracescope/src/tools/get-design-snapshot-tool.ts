/**
 * `tracescope_get_design_snapshot` — on-demand design tree for UI review jobs.
 */
import type { Context } from '../dsh-shims.js'
import { defineTool } from '../dsh-shims.js'
import { getDesignSnapshot } from '../agent-api.js'
import { toolText } from './tool-helpers.js'

export function registerGetDesignSnapshotTool(ctx: Context) {
  ctx.tools?.register(
    defineTool({
      name: 'tracescope_get_design_snapshot',
      description:
        'Load a compact text snapshot of the design tree for a TraceScope UI review job. Call when the render image / static diffs are not enough and you need node structure, texts, or sizes. Prefer a specific nodeId over the whole page.',
      parameters: {
        jobId: {
          type: 'string',
          required: true,
          description: 'TraceScope UI review job id from the starter prompt',
        },
        nodeId: {
          type: 'string',
          required: false,
          description: 'Optional design node id; omit to snapshot from the page root',
        },
        maxNodes: {
          type: 'integer',
          required: false,
          description: 'Max nodes to include (default 40, max 120)',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['jobId', 'designName', 'snapshot'],
          properties: {
            jobId: { type: 'string' },
            designName: { type: 'string' },
            rootId: { type: 'string' },
            nodeCountHint: { type: 'integer' },
            snapshot: { type: 'string' },
            summary: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const v = value as { summary?: string; snapshot?: string }
          return toolText(v.summary || v.snapshot || '设计快照')
        },
      },
      async execute(args: Record<string, unknown>) {
        return await getDesignSnapshot(args)
      },
    }),
  )
}
