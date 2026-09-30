/**
 * TraceScope DSH plugin entry.
 *
 * The `apply` hook stays intentionally thin: it wires the per-domain route
 * modules, the agent tools and the CLI command. HTTP plumbing lives in
 * `./http`, shared logic in `./services`, and each feature's routes in
 * `./routes`.
 */
import type { Context } from './dsh-shims.js'

import { registerRepoRoutes } from './routes/repo.js'
import { registerAnalyzeRoutes } from './routes/analyze.js'
import { registerReportRoutes } from './routes/report.js'
import { registerTrackerRoutes } from './routes/tracker.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerDataDirRoutes } from './routes/data-dir.js'
import { registerYunxiaoCatalogRoutes } from './routes/yunxiao-catalog.js'
import { registerJobsRoutes } from './routes/jobs.js'
import { registerVisualRoutes } from './routes/visual.js'

import { registerAnalyzeImpactTool } from './tools/analyze-impact-tool.js'
import { registerGetDiffTool } from './tools/get-diff-tool.js'
import { registerPublishHandtestTool } from './tools/publish-handtest-tool.js'
import { registerPublishVisualFindingsTool } from './tools/publish-visual-findings-tool.js'
import { registerPublishPageRematchTool } from './tools/publish-page-rematch-tool.js'
import { registerGetDesignSnapshotTool } from './tools/get-design-snapshot-tool.js'

import { registerCliCommand } from './commands/cli-command.js'
import { registerBuiltinSkills } from './skills/builtin-skills.js'

export const name = 'tracescope'
export const inject = ['tools', 'commands', 'webServer']

export function apply(ctx: Context) {
  // HTTP routes (same-origin JSON APIs used by the sidebar).
  registerVisualRoutes(ctx)
  registerRepoRoutes(ctx)
  registerAnalyzeRoutes(ctx)
  registerReportRoutes(ctx)
  registerTrackerRoutes(ctx)
  registerAuthRoutes(ctx)
  registerDataDirRoutes(ctx)
  registerYunxiaoCatalogRoutes(ctx)
  registerJobsRoutes(ctx)

  // Agent-facing tools.
  registerAnalyzeImpactTool(ctx)
  registerGetDiffTool(ctx)
  registerPublishHandtestTool(ctx)
  registerPublishVisualFindingsTool(ctx)
  registerPublishPageRematchTool(ctx)
  registerGetDesignSnapshotTool(ctx)

  // Built-in skills (no-op when host has no @deepseek-ai/dsh-skill).
  registerBuiltinSkills(ctx)

  // Slash command.
  registerCliCommand(ctx)
}
