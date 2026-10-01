/**
 * `tracescope_get_diff` tool: page through unified diffs between two commits.
 */
import type { Context } from '../dsh-shims.js'
import { defineTool } from '../dsh-shims.js'
import { getDiffTool } from '../agent-api.js'
import { toolText } from './tool-helpers.js'

export function registerGetDiffTool(ctx: Context) {
  ctx.tools?.register(
    defineTool({
      name: 'tracescope_get_diff',
      description:
        'Fetch a chunk of unified git diff between two commits. Use offset/limit to page through files; do not request the entire tree at once.',
      parameters: {
        repoPath: {
          type: 'string',
          required: true,
          description: 'Local git path or remote URL',
        },
        baseCommit: { type: 'string', required: true },
        headCommit: { type: 'string', required: true },
        paths: {
          type: 'string',
          description: 'Optional comma-separated relative paths to limit the diff',
        },
        offset: { type: 'number', description: 'File offset (default 0)' },
        limit: { type: 'number', description: 'Max files in this chunk (default 8, max 20)' },
        authMode: { type: 'string', description: 'none | https | ssh' },
        authUsername: { type: 'string' },
        authToken: { type: 'string' },
        authPrivateKeyPath: { type: 'string' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['totalFiles', 'offset', 'files', 'diff'],
          properties: {
            repoPath: { type: 'string' },
            totalFiles: { type: 'integer' },
            offset: { type: 'integer' },
            limit: { type: 'integer' },
            nextOffset: { type: 'integer' },
            files: { type: 'array', items: { type: 'string' } },
            truncated: { type: 'boolean' },
            diff: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const v = value as {
            totalFiles?: number
            offset?: number
            nextOffset?: number
            files?: string[]
            diff?: string
          }
          return toolText(
            [
              `变更文件 ${v.totalFiles ?? 0} · 本批 offset=${v.offset ?? 0} · next=${
                v.nextOffset !== undefined && v.nextOffset >= 0 ? v.nextOffset : '无'
              }`,
              (v.files ?? []).map((f) => `- ${f}`).join('\n'),
              '',
              (v.diff ?? '').slice(0, 12_000),
            ].join('\n'),
          )
        },
      },
      async execute(args: Record<string, unknown>) {
        return await getDiffTool(args)
      },
    }),
  )
}
