/**
 * `tracescope_list_commits` tool: list recent commits / refs for a repo.
 */
import type { Context } from '../dsh-shims.js'
import { defineTool } from '../dsh-shims.js'
import { listCommits, parseAuthFromToolArgs } from '../agent-api.js'
import { toolText } from './tool-helpers.js'

export function registerListCommitsTool(ctx: Context) {
  ctx.tools?.register(
    defineTool({
      name: 'tracescope_list_commits',
      description:
        'List recent git commits and refs for a local path or remote URL. Remotes are cloned/fetched under ~/.tracescope/repos.',
      parameters: {
        repoPath: {
          type: 'string',
          required: true,
          description: 'Local git path or remote URL',
        },
        limit: { type: 'number', description: 'Max commits (default 40)' },
        fetch: { type: 'boolean', description: 'Fetch remotes first (default true)' },
        authMode: { type: 'string', description: 'none | https | ssh' },
        authUsername: { type: 'string' },
        authToken: { type: 'string' },
        authPrivateKeyPath: { type: 'string' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['resolved', 'commits', 'refs'],
          properties: {
            resolved: { type: 'object', additionalProperties: true },
            commits: { type: 'array', items: { type: 'object', additionalProperties: true } },
            refs: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
        },
        render: (_args, value) => {
          const v = value as {
            commits?: Array<{ short?: string; shortSha?: string; subject?: string }>
            refs?: unknown[]
          }
          const lines = (v.commits ?? [])
            .slice(0, 20)
            .map((c) => `- ${c.short ?? c.shortSha ?? ''} ${c.subject ?? ''}`.trim())
          return toolText(
            [`提交 ${v.commits?.length ?? 0} · 引用 ${v.refs?.length ?? 0}`, '', ...lines].join(
              '\n',
            ),
          )
        },
      },
      async execute(args: Record<string, unknown>) {
        return await listCommits({
          repoPath: String(args.repoPath ?? ''),
          limit: typeof args.limit === 'number' ? args.limit : undefined,
          fetch: typeof args.fetch === 'boolean' ? args.fetch : undefined,
          auth: parseAuthFromToolArgs(args),
        })
      },
    }),
  )
}
