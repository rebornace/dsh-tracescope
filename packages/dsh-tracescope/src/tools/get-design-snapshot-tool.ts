/**
 * `tracescope_get_design_snapshot` — on-demand design tree for UI review jobs.
 * Keeps the starter prompt free of large Figma trees; the model asks when needed.
 */
import { formatDesignSnapshot } from '@rebornace/tracescope-core'
import type { Context } from '../dsh-shims.js'
import { defineTool } from '../dsh-shims.js'
import { getVisualJob } from '../visual-jobs.js'
import { toolText } from './tool-helpers.js'

type DesignNodeLike = {
  id: string
  name: string
  kind: string
  text?: string
  box: { x?: number; y?: number; width?: number; height?: number }
  style: Record<string, unknown>
  children: Array<unknown>
}

function findNode(root: DesignNodeLike, nodeId: string): DesignNodeLike | null {
  if (root.id === nodeId) return root
  const alt = nodeId.replace(/-/g, ':')
  if (root.id === alt) return root
  for (const child of root.children || []) {
    const hit = findNode(child as DesignNodeLike, nodeId)
    if (hit) return hit
  }
  return null
}

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
        const jobId = String(args.jobId ?? '').trim()
        if (!jobId) throw new Error('缺少 jobId')
        const job = getVisualJob(jobId)
        if (!job) throw new Error(`找不到 UI 走查任务 ${jobId}`)
        if (!job.designDoc?.root) {
          throw new Error(`任务 ${jobId} 没有挂载设计树；请重新从面板发起「AI 协助分析」`)
        }

        const maxRaw = typeof args.maxNodes === 'number' ? args.maxNodes : Number(args.maxNodes)
        const maxNodes = Number.isFinite(maxRaw)
          ? Math.max(8, Math.min(120, Math.floor(maxRaw)))
          : 40

        const root = job.designDoc.root as DesignNodeLike
        const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : ''
        let target = root
        if (nodeId) {
          const found = findNode(root, nodeId)
          if (!found) throw new Error(`设计树中找不到节点 ${nodeId}`)
          target = found
        }

        const snapshot = formatDesignSnapshot(target as never, { maxNodes })
        const designName = job.designName || root.name || job.designId
        const summary = [
          `设计快照 · ${designName}`,
          `根节点：${target.id} ${target.name || ''}`.trim(),
          `最多 ${maxNodes} 个节点（结构化文本，非 Figma API）`,
          '',
          snapshot,
        ].join('\n')

        return {
          jobId,
          designName,
          rootId: target.id,
          nodeCountHint: maxNodes,
          snapshot,
          summary,
        }
      },
    }),
  )
}
