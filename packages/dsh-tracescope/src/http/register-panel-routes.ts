/**
 * Register the same `/tracescope/v1/*` JSON APIs the DSH sidebar uses,
 * onto any Context that provides `webServer` + `effect` (Desktop or standalone).
 */
import type { Context } from '../dsh-shims.js'
import { registerRepoRoutes } from '../routes/repo.js'
import { registerAnalyzeRoutes } from '../routes/analyze.js'
import { registerReportRoutes } from '../routes/report.js'
import { registerTrackerRoutes } from '../routes/tracker.js'
import { registerAuthRoutes } from '../routes/auth.js'
import { registerDataDirRoutes } from '../routes/data-dir.js'
import { registerYunxiaoCatalogRoutes } from '../routes/yunxiao-catalog.js'
import { registerJobsRoutes } from '../routes/jobs.js'
import { registerVisualRoutes } from '../routes/visual.js'
import { registerCrashRoutes } from '../routes/crash.js'

export function registerPanelHttpRoutes(ctx: Context): void {
  registerVisualRoutes(ctx)
  registerRepoRoutes(ctx)
  registerAnalyzeRoutes(ctx)
  registerReportRoutes(ctx)
  registerTrackerRoutes(ctx)
  registerCrashRoutes(ctx)
  registerAuthRoutes(ctx)
  registerDataDirRoutes(ctx)
  registerYunxiaoCatalogRoutes(ctx)
  registerJobsRoutes(ctx)
  // self-update is DSH-plugin-only (npm install into Desktop); skip for MCP panel.
}
