/**
 * In-memory registry for visual (design-driven) review jobs.
 *
 * Mirrors `jobs.ts`, but a visual job is keyed by the page being reviewed
 * (design node ↔ code file) rather than a base/head commit pair. The model
 * publishes its structured findings back through
 * `tracescope_publish_visual_findings`; the panel polls the job and renders the
 * result against the right page.
 *
 * Rematch jobs (`kind: 'rematch'`) publish file picks via
 * `tracescope_publish_page_rematch` so the mapping overview can select files.
 */
import { randomUUID } from 'node:crypto'
import type { DesignDoc, VisualFindingsReport } from '@rebornace/tracescope-core'

export type VisualJobStatus = 'pending' | 'published' | 'error'
export type VisualJobKind = 'findings' | 'rematch'

export interface RematchPick {
  adapterId: string
  relativePath: string
  kindLabel?: string
  score?: number
  reason?: string
}

export interface RematchResult {
  picks: RematchPick[]
  note?: string
}

export interface VisualJob {
  id: string
  kind: VisualJobKind
  repoInput: string
  fileKey: string
  designId: string
  adapterId: string
  relativePath: string
  designName?: string
  /** In-memory design tree for on-demand `tracescope_get_design_snapshot`. */
  designDoc?: DesignDoc
  status: VisualJobStatus
  findings?: VisualFindingsReport
  rematch?: RematchResult
  error?: string
  createdAt: string
  updatedAt: string
}

const visualJobs = new Map<string, VisualJob>()

export function createVisualJob(input: {
  repoInput: string
  fileKey: string
  designId: string
  adapterId?: string
  relativePath?: string
  designName?: string
  kind?: VisualJobKind
  designDoc?: DesignDoc
}): VisualJob {
  const now = new Date().toISOString()
  const job: VisualJob = {
    id: randomUUID(),
    kind: input.kind ?? 'findings',
    repoInput: input.repoInput,
    fileKey: input.fileKey,
    designId: input.designId,
    adapterId: input.adapterId ?? '',
    relativePath: input.relativePath ?? '',
    designName: input.designName,
    designDoc: input.designDoc,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }
  visualJobs.set(job.id, job)
  return job
}

export function getVisualJob(id: string): VisualJob | undefined {
  return visualJobs.get(id)
}

/** Store published findings on the job. */
export function publishVisualJobFindings(
  id: string,
  findings: VisualFindingsReport,
): VisualJob {
  const job = visualJobs.get(id)
  if (!job) throw new Error(`找不到 UI 走查任务 ${id}`)
  const updated: VisualJob = {
    ...job,
    status: 'published',
    findings,
    error: undefined,
    updatedAt: new Date().toISOString(),
  }
  visualJobs.set(id, updated)
  return updated
}

/** Store published rematch picks on the job. */
export function publishVisualJobRematch(id: string, rematch: RematchResult): VisualJob {
  const job = visualJobs.get(id)
  if (!job) throw new Error(`找不到文件匹配任务 ${id}`)
  const top = rematch.picks[0]
  const updated: VisualJob = {
    ...job,
    status: 'published',
    rematch,
    // Mirror top pick onto the job so consumers can treat it like a selection.
    adapterId: top?.adapterId || job.adapterId,
    relativePath: top?.relativePath || job.relativePath,
    error: undefined,
    updatedAt: new Date().toISOString(),
  }
  visualJobs.set(id, updated)
  return updated
}

export function failVisualJob(id: string, error: string): VisualJob {
  const job = visualJobs.get(id)
  if (!job) throw new Error(`找不到 UI 走查任务 ${id}`)
  const updated: VisualJob = {
    ...job,
    status: 'error',
    error,
    updatedAt: new Date().toISOString(),
  }
  visualJobs.set(id, updated)
  return updated
}
