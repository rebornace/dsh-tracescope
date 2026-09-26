/**
 * Page through unified git diffs for a pair of commits, via either local git or
 * the recorded Codeup job. Used by the diff tool/workflow.
 */
import {
  compareCodeup,
  gitDiffFiles,
  gitDiffUnified,
  pageCodeupDiffs,
  resolveGitRepo,
  resolveCodeupTarget,
  type GitAuth,
} from '@rebornace/tracescope-core'
import { findJobForRepo } from '../jobs.js'

const MAX_DIFF_CHARS = 24_000

export interface DiffChunkArgs {
  repoPath: string
  baseCommit: string
  headCommit: string
  paths?: string[]
  offset?: number
  limit?: number
  auth?: GitAuth
}

export async function getDiffChunk(args: DiffChunkArgs) {
  const codeupJob = findJobForRepo(args.repoPath, args.baseCommit, args.headCommit)
  if (codeupJob?.accessMode === 'codeup' && codeupJob.codeup?.token) {
    const target = resolveCodeupTarget(codeupJob.repoInput, codeupJob.codeup)
    const compare = await compareCodeup(target, {
      endpoint: codeupJob.codeup.endpoint,
      token: codeupJob.codeup.token,
      base: args.baseCommit,
      head: args.headCommit,
    })
    const page = pageCodeupDiffs(compare.diffs, {
      paths: args.paths,
      offset: args.offset,
      limit: args.limit,
      maxChars: MAX_DIFF_CHARS,
    })
    return {
      repoPath: codeupJob.repoInput,
      ...page,
    }
  }

  const resolved = await resolveGitRepo(args.repoPath, { fetch: false, auth: args.auth })
  const allFiles =
    args.paths && args.paths.length > 0
      ? args.paths
      : await gitDiffFiles(resolved.repoPath, args.baseCommit, args.headCommit)
  const offset = Math.max(0, args.offset ?? 0)
  const limit = Math.min(20, Math.max(1, args.limit ?? 8))
  const slice = allFiles.slice(offset, offset + limit)
  const parts: string[] = []
  let truncated = false
  for (const file of slice) {
    let diff = ''
    try {
      diff = await gitDiffUnified(resolved.repoPath, args.baseCommit, args.headCommit, {
        paths: [file],
      })
    } catch {
      diff = `--- a/${file}\n+++ b/${file}\n@@ (无法读取该文件 diff)\n`
    }
    if (!diff.trim()) {
      diff = `--- a/${file}\n+++ b/${file}\n@@ (无文本 diff)\n`
    }
    if (parts.join('\n').length + diff.length > MAX_DIFF_CHARS) {
      truncated = true
      break
    }
    parts.push(diff)
  }
  return {
    repoPath: resolved.repoPath,
    totalFiles: allFiles.length,
    offset,
    limit,
    // -1 means no further pages (schemas disallow integer|null unions).
    nextOffset: offset + slice.length < allFiles.length ? offset + slice.length : -1,
    files: slice,
    truncated,
    diff: parts.join('\n\n'),
  }
}
