/**
 * In-memory registry for crash-analysis chat jobs.
 *
 * Panel creates a job when filling the composer; the agent publishes the
 * conclusion via `tracescope_publish_crash_analysis`; the sidebar polls and
 * merges `aiAnalysis` into the in-panel report.
 */
import { randomUUID } from 'node:crypto'

export type CrashJobStatus = 'pending' | 'published' | 'error'

export interface CrashJob {
  id: string
  repoPath: string
  incidentId: string
  status: CrashJobStatus
  aiAnalysis?: string
  error?: string
  createdAt: string
  updatedAt: string
}

const crashJobs = new Map<string, CrashJob>()

export function createCrashJob(input: {
  repoPath: string
  incidentId?: string
}): CrashJob {
  const now = new Date().toISOString()
  const job: CrashJob = {
    id: randomUUID(),
    repoPath: input.repoPath.trim(),
    incidentId: (input.incidentId || '').trim(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }
  crashJobs.set(job.id, job)
  return job
}

export function getCrashJob(id: string): CrashJob | undefined {
  return crashJobs.get(id)
}

export function publishCrashJobAnalysis(id: string, aiAnalysis: string): CrashJob {
  const job = crashJobs.get(id)
  if (!job) throw new Error(`找不到崩溃分析任务 ${id}`)
  const text = aiAnalysis.trim()
  if (!text) throw new Error('analysis 不能为空')
  const updated: CrashJob = {
    ...job,
    status: 'published',
    aiAnalysis: text,
    error: undefined,
    updatedAt: new Date().toISOString(),
  }
  crashJobs.set(id, updated)
  return updated
}

/** Test helper. */
export function clearCrashJobsForTests(): void {
  crashJobs.clear()
}
