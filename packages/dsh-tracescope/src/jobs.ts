import { randomUUID } from 'node:crypto'
import type { GitAuth } from '@rebornace/tracescope-core'
import type { ImpactReport } from '@rebornace/tracescope-core'

export type TraceScopeJobStatus = 'pending' | 'published' | 'error'

export interface TraceScopeCodeupAuth {
  endpoint?: string
  token: string
  organizationId?: string
  repositoryId?: string
}

export interface TraceScopeJob {
  id: string
  /** Original user input (path or remote URL). */
  repoInput: string
  /** Resolved local git path, or the remote URL in codeup mode. */
  repoPath: string
  baseCommit: string
  headCommit: string
  auth?: GitAuth
  /** `codeup` reads commits and diffs from the Yunxiao OpenAPI instead of local git. */
  accessMode?: 'git' | 'codeup'
  codeup?: TraceScopeCodeupAuth
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
  accessMode?: 'git' | 'codeup'
  codeup?: TraceScopeCodeupAuth
}): TraceScopeJob {
  const now = new Date().toISOString()
  const job: TraceScopeJob = {
    id: randomUUID(),
    repoInput: input.repoInput,
    repoPath: input.repoPath,
    baseCommit: input.baseCommit,
    headCommit: input.headCommit,
    auth: input.auth,
    accessMode: input.accessMode ?? 'git',
    codeup: input.codeup,
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

/** Latest chat job for this repo and commit pair (used so tools can reuse Codeup credentials). */
export function findJobForRepo(
  repoInput: string,
  baseCommit: string,
  headCommit: string,
): TraceScopeJob | undefined {
  let best: TraceScopeJob | undefined
  for (const job of jobs.values()) {
    if (job.baseCommit !== baseCommit || job.headCommit !== headCommit) continue
    if (job.repoInput !== repoInput && job.repoPath !== repoInput) continue
    if (!best || job.createdAt > best.createdAt) best = job
  }
  return best
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
