/**
 * Run the impact analysis (local git or Codeup), optionally fold in related
 * agile work items, export md/csv and persist the report. Used by the
 * `/analyze` route and the `/tracescope` command.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  analyzeCodeupImpact,
  analyzeImpact,
  exportReportCsv,
  exportReportMarkdown,
  mergeAgileWorkItemsIntoReport,
  parseAgileWorkItemRefs,
  saveHandtestReport,
  type GitAuth,
} from '@rebornace/tracescope-core'
import type { CodeupBodyAuth } from './request-auth.js'

export interface RunAnalyzeArgs {
  repoPath: string
  baseCommit: string
  headCommit: string
  rippleDepth?: number
  modulesConfigPath?: string
  exportDir?: string
  fetchRemote?: boolean
  auth?: GitAuth
  accessMode?: 'git' | 'codeup'
  codeup?: CodeupBodyAuth
  /** Original user input for persistence key (path or remote URL). */
  repoInput?: string
  persist?: boolean
  relatedWorkItems?: ReturnType<typeof parseAgileWorkItemRefs>
}

export async function runAnalyze(args: RunAnalyzeArgs) {
  let report =
    args.accessMode === 'codeup'
      ? await analyzeCodeupImpact({
          remote: args.repoPath,
          baseCommit: args.baseCommit,
          headCommit: args.headCommit,
          endpoint: args.codeup?.endpoint,
          token: args.codeup?.token ?? '',
          organizationId: args.codeup?.organizationId,
          repositoryId: args.codeup?.repositoryId,
          modulesConfigPath: args.modulesConfigPath,
        })
      : await analyzeImpact({
          repoPath: args.repoPath,
          baseCommit: args.baseCommit,
          headCommit: args.headCommit,
          rippleDepth: args.rippleDepth,
          modulesConfigPath: args.modulesConfigPath,
          fetchRemote: args.fetchRemote,
          auth: args.auth,
        })
  if (args.relatedWorkItems?.length) {
    report = mergeAgileWorkItemsIntoReport(report, args.relatedWorkItems)
  }
  const markdown = exportReportMarkdown(report)
  const csv = exportReportCsv(report)
  if (args.exportDir) {
    await mkdir(args.exportDir, { recursive: true })
    await writeFile(path.join(args.exportDir, 'tracescope-report.md'), markdown, 'utf8')
    await writeFile(path.join(args.exportDir, 'tracescope-report.csv'), csv, 'utf8')
  }
  let stored = null
  if (args.persist !== false) {
    stored = await saveHandtestReport({
      repoInput: args.repoInput ?? args.repoPath,
      baseCommit: args.baseCommit,
      headCommit: args.headCommit,
      report,
      source: report.modelEnriched ? 'model' : 'deterministic',
    })
  }
  return { report, markdown, csv, stored }
}
