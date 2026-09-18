import { randomUUID } from 'node:crypto'
import type { GitAuth } from '@rebornace/tracescope-core'
import type { ImpactReport } from '@rebornace/tracescope-core'

export type TraceScopeJobStatus = 'pending' | 'published' | 'error'

export interface TraceScopeJob {
  id: string
  /** Original user input (path or remote URL). */
  repoInput: string
  /** Resolved local git work-tree path. */
  repoPath: string
  baseCommit: string
  headCommit: string
  auth?: GitAuth
  status: TraceScopeJobStatus
  report?: ImpactReport
  error?: string
  createdAt: string
  updatedAt: string
}

const jobs = new Map<string, TraceScopeJob>()

export function createJob(input: {
  repoInput: string
  repoPath: string
  baseCommit: string
  headCommit: string
  auth?: GitAuth
}): TraceScopeJob {
  const now = new Date().toISOString()
  const job: TraceScopeJob = {
    id: randomUUID(),
    repoInput: input.repoInput,
    repoPath: input.repoPath,
    baseCommit: input.baseCommit,
    headCommit: input.headCommit,
    auth: input.auth,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }
  jobs.set(job.id, job)
  return job
}

export function getJob(id: string): TraceScopeJob | undefined {
  return jobs.get(id)
}

export function publishJobReport(id: string, report: ImpactReport): TraceScopeJob {
  const job = jobs.get(id)
  if (!job) throw new Error(`找不到任务 ${id}`)
  const updated: TraceScopeJob = {
    ...job,
    status: 'published',
    report,
    error: undefined,
    updatedAt: new Date().toISOString(),
  }
  jobs.set(id, updated)
  return updated
}

export function failJob(id: string, error: string): TraceScopeJob {
  const job = jobs.get(id)
  if (!job) throw new Error(`找不到任务 ${id}`)
  const updated: TraceScopeJob = {
    ...job,
    status: 'error',
    error,
    updatedAt: new Date().toISOString(),
  }
  jobs.set(id, updated)
  return updated
}
