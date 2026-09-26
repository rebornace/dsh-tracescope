/**
 * `tracescope_analyze_impact` tool: deterministic git-diff impact analysis.
 */
import type { Context } from '../dsh-shims.js'
import { defineTool } from '../dsh-shims.js'
import { runAnalyze } from '../services/run-analyze.js'
import { parseAuthFromToolArgs, toolText } from './tool-helpers.js'
import { findJobForRepo } from '../jobs.js'

export function registerAnalyzeImpactTool(ctx: Context) {
  ctx.tools?.register(
    defineTool({
      name: 'tracescope_analyze_impact',
      description:
        'Deterministic git-diff impact analysis for manual-test scope. Prefer chat + tracescope_publish_handtest for interactive model analysis; use this as a baseline.',
      parameters: {
        repoPath: {
          type: 'string',
          required: true,
          description: 'Local git path or remote URL (https://… / git@… / github.com/org/repo)',
        },
        baseCommit: { type: 'string', required: true, description: 'Stable baseline commit/ref' },
        headCommit: { type: 'string', required: true, description: 'Under-test commit/ref' },
        rippleDepth: { type: 'number', description: 'Reverse-dep BFS depth (default 2)' },
        modulesConfigPath: { type: 'string', description: 'Optional tracescope.modules.yml path' },
        exportDir: { type: 'string', description: 'Optional directory to write md/csv' },
        fetchRemote: { type: 'boolean', description: 'Fetch remotes before analyze (default for URLs)' },
        authMode: {
          type: 'string',
          description: 'none | https | ssh — private remote authentication mode',
        },
        authUsername: { type: 'string', description: 'HTTPS username (default git)' },
        authToken: { type: 'string', description: 'HTTPS personal access token / password' },
        authPrivateKeyPath: { type: 'string', description: 'Absolute path to SSH private key' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: [
            'summary',
            'directCount',
            'rippleCount',
            'changedFileCount',
            'markdown',
            'csv',
            'repoPath',
            'baseCommit',
            'headCommit',
            'modelEnriched',
          ],
          properties: {
            summary: { type: 'string' },
            directCount: { type: 'integer' },
            rippleCount: { type: 'integer' },
            changedFileCount: { type: 'integer' },
            markdown: { type: 'string' },
            csv: { type: 'string' },
            repoPath: { type: 'string' },
            baseCommit: { type: 'string' },
            headCommit: { type: 'string' },
            modelEnriched: { type: 'boolean' },
          },
        },
        render: (_args, value) => {
          const v = value as { summary?: string; markdown?: string }
          return toolText([v.summary, '', v.markdown?.slice(0, 12_000)].filter(Boolean).join('\n'))
        },
      },
      async execute(args: Record<string, unknown>) {
        const repoPath = String(args.repoPath)
        const baseCommit = String(args.baseCommit)
        const headCommit = String(args.headCommit)
        const job = findJobForRepo(repoPath, baseCommit, headCommit)
        const result = await runAnalyze({
          repoPath: job?.accessMode === 'codeup' ? job.repoInput : repoPath,
          baseCommit,
          headCommit,
          rippleDepth: typeof args.rippleDepth === 'number' ? args.rippleDepth : undefined,
          modulesConfigPath:
            typeof args.modulesConfigPath === 'string' ? args.modulesConfigPath : undefined,
          exportDir: typeof args.exportDir === 'string' ? args.exportDir : undefined,
          fetchRemote: typeof args.fetchRemote === 'boolean' ? args.fetchRemote : undefined,
          auth: parseAuthFromToolArgs(args),
          accessMode: job?.accessMode,
          codeup: job?.codeup,
        })
        const summary = [
          `直接变更 ${result.report.direct.length} · 可能波及 ${result.report.ripple.length}`,
          '（确定性分析；对话结论请用 tracescope_publish_handtest 回写面板）',
          '',
          '## 直接变更',
          ...result.report.direct.map((i) => `- [${i.risk}] ${i.displayName}`),
          '',
          '## 可能波及',
          ...result.report.ripple.map((i) => `- [${i.risk}] ${i.displayName}`),
        ].join('\n')
        return {
          summary,
          directCount: result.report.direct.length,
          rippleCount: result.report.ripple.length,
          changedFileCount: result.report.changedFiles.length,
          markdown: result.markdown,
          csv: result.csv,
          repoPath: result.report.repoPath,
          baseCommit: result.report.baseCommit,
          headCommit: result.report.headCommit,
          modelEnriched: result.report.modelEnriched,
        }
      },
    }),
  )
}
