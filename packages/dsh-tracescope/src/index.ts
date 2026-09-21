import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  analyzeImpact,
  analyzeCodeupImpact,
  buildChatAnalysisPrompt,
  buildReportFromPublishedItems,
  deleteReportAttachmentFile,
  exportReportCsv,
  exportReportMarkdown,
  formatAttachmentSize,
  gitDiffFiles,
  gitDiffUnified,
  handtestReportKey,
  listGitRefs,
  listRecentCommits,
  gitFetchRef,
  loadHandtestReport,
  listHandtestHistory,
  loadHandtestHistoryEntry,
  deleteHandtestHistory,
  isMaskedSecret,
  loadRememberedYunxiaoAccess,
  loadStoredGitAuth,
  MAX_ATTACHMENT_UPLOAD_BYTES,
  MAX_REPORT_ATTACHMENTS,
  normalizeReportAttachments,
  parseGitAuth,
  parsePublishedHandtestItems,
  patchHandtestItemStatus,
  readReportAttachmentFile,
  reportAttachmentsDir,
  resolveGitRepo,
  compareCodeup,
  changedPathsFromDiffs,
  getCodeupRepository,
  listCodeupBranches,
  listCodeupCommits,
  pageCodeupDiffs,
  resolveCodeupTarget,
  saveHandtestReport,
  saveReportAttachmentBuffer,
  saveReportAttachmentFromLocalPath,
  rememberYunxiaoAccess,
  saveStoredGitAuth,
  loadTrackerConfig,
  saveTrackerConfig,
  publicTrackerConfig,
  isTrackerConfigReady,
  submitFailFeedback,
  collectFailedItems,
  listYunxiaoOrganizations,
  listYunxiaoProjects,
  listYunxiaoWorkitemTypes,
  listYunxiaoMembers,
  listYunxiaoWorkitems,
  mergeAgileWorkItemsIntoReport,
  normalizeYunxiaoEndpoint,
  parseAgileWorkItemRefs,
  type GitAuth,
  type ImpactReport,
  type TrackerConfig,
  type TrackerProvider,
} from '@rebornace/tracescope-core'
import type { Context } from './dsh-shims.js'
import { defineTool } from './dsh-shims.js'
import { createJob, findJobForRepo, getJob, publishJobReport } from './jobs.js'

export const name = 'tracescope'
export const inject = ['tools', 'commands', 'webServer']

const USAGE = [
  '打开方式：会话页右上角展开右侧栏 → 引导页点「TraceScope」。',
  '仓库可填本地路径或远端地址（https://… / git@… / github.com/org/repo）。',
  '命令行：/tracescope <repo> <baseCommit> <headCommit> [exportDir]',
  '模型分析：面板点「模型对话分析」→ 在会话里互动 → Agent 调用 tracescope_publish_handtest 后清单自动刷新。',
].join('\n')

type CommandResult =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }

interface CommandInvocation {
  rawInput: string
}

function sendJson(res: { writeHead: Function; end: Function }, status: number, payload: unknown) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function isTrustedRequest(req: { headers: Record<string, string | string[] | undefined> }) {
  const host = String(req.headers.host ?? '')
  const referer = String(req.headers.referer ?? '')
  try {
    return referer !== '' && new URL(referer).host === host
  } catch {
    return false
  }
}

function readJsonBody(
  req: {
    on: (event: string, cb: (...args: any[]) => void) => void
    destroy?: () => void
  },
  maxBytes = 8 * 1024 * 1024,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('body too large'))
        req.destroy?.()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw === '' ? {} : JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function parseFetchFlag(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  const s = String(value).toLowerCase()
  if (s === '1' || s === 'true' || s === 'yes') return true
  if (s === '0' || s === 'false' || s === 'no') return false
  return fallback
}

function parseAuthFromToolArgs(args: Record<string, unknown>): GitAuth | undefined {
  const authMode = typeof args.authMode === 'string' ? args.authMode : 'none'
  return parseGitAuth(
    authMode === 'https'
      ? {
          mode: 'https',
          username: typeof args.authUsername === 'string' ? args.authUsername : undefined,
          token: String(args.authToken ?? ''),
        }
      : authMode === 'ssh'
        ? {
            mode: 'ssh',
            privateKeyPath: String(args.authPrivateKeyPath ?? ''),
          }
        : { mode: 'none' },
  )
}

async function loadRepoHistory(
  repoInput: string,
  limit: number,
  fetchRemote: boolean,
  auth?: GitAuth,
  refName?: string,
) {
  const resolved = await resolveGitRepo(repoInput, { fetch: fetchRemote, auth })
  const ref = typeof refName === 'string' ? refName.trim() : ''
  if (ref && !/^[0-9a-f]{7,40}$/i.test(ref)) {
    try {
      await gitFetchRef(resolved.repoPath, ref, auth)
    } catch {
      /* Branch may already exist locally; listRecentCommits will surface real errors. */
    }
  }
  const [commits, refs] = await Promise.all([
    listRecentCommits(resolved.repoPath, {
      limit,
      allRefs: !ref,
      ref: ref || undefined,
    }),
    listGitRefs(resolved.repoPath),
  ])
  return { resolved, commits, refs, commitRef: ref || undefined }
}

interface CodeupBodyAuth {
  endpoint?: string
  token: string
  organizationId?: string
  repositoryId?: string
}

function readAccessMode(body: Record<string, unknown>): 'git' | 'codeup' {
  return body.accessMode === 'codeup' ? 'codeup' : 'git'
}

function readCodeupAuth(body: Record<string, unknown>): CodeupBodyAuth {
  const raw = body.codeup
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    endpoint: typeof obj.endpoint === 'string' ? obj.endpoint : undefined,
    token: String(obj.token ?? ''),
    organizationId: typeof obj.organizationId === 'string' ? obj.organizationId : undefined,
    repositoryId: typeof obj.repositoryId === 'string' ? obj.repositoryId : undefined,
  }
}

function isCodeupHttpsRemote(input: string): boolean {
  return /^https:\/\/codeup\.aliyun\.com\//i.test(input.trim())
}

/** Empty or masked panel tokens fall back to the token saved on this machine. */
async function resolveCodeupAuth(body: Record<string, unknown>): Promise<CodeupBodyAuth> {
  const parsed = readCodeupAuth(body)
  if (!isMaskedSecret(parsed.token)) return parsed
  const stored = await loadRememberedYunxiaoAccess()
  const git = await loadStoredGitAuth()
  const gitToken = git?.mode === 'https' ? git.token : ''
  return {
    ...parsed,
    endpoint: parsed.endpoint || stored.endpoint,
    organizationId: parsed.organizationId || stored.organizationId || undefined,
    token: !isMaskedSecret(stored.token) ? stored.token : gitToken,
  }
}

async function resolveRequestGitAuth(
  auth: GitAuth | undefined,
  repoInput: string,
): Promise<GitAuth | undefined> {
  if (auth?.mode === 'ssh') return auth
  if (auth?.mode === 'https' && !isMaskedSecret(auth.token)) return auth
  const stored = await loadStoredGitAuth()
  if (auth?.mode === 'https' && stored?.mode === 'https' && !isMaskedSecret(stored.token)) {
    return {
      mode: 'https',
      username: auth.username || stored.username || 'git',
      token: stored.token,
    }
  }
  if (isCodeupHttpsRemote(repoInput)) {
    const yunxiao = await loadRememberedYunxiaoAccess()
    if (!isMaskedSecret(yunxiao.token)) {
      return {
        mode: 'https',
        username: auth?.mode === 'https' ? auth.username || 'git' : 'git',
        token: yunxiao.token,
      }
    }
  }
  if (auth?.mode === 'https' && stored?.mode === 'ssh') return stored
  return auth
}

async function loadCodeupHistory(
  remote: string,
  limit: number,
  auth: CodeupBodyAuth,
  refName?: string,
) {
  const target = resolveCodeupTarget(remote, auth)
  const req = { endpoint: auth.endpoint, token: auth.token }
  const repo = await getCodeupRepository(target, req)
  const commitRef = (typeof refName === 'string' && refName.trim()) || repo.defaultBranch
  const [commits, branches] = await Promise.all([
    listCodeupCommits(target, { ...req, refName: commitRef, perPage: limit }),
    listCodeupBranches(target, req),
  ])
  const head = commits[0]
  const refs =
    branches.length > 0
      ? branches
      : [
          {
            name: repo.defaultBranch,
            sha: head?.sha ?? '',
            short: head?.short ?? '',
            kind: 'remote' as const,
          },
        ]
  return {
    resolved: {
      input: remote,
      repoPath: remote,
      source: 'codeup' as const,
      remoteUrl: remote,
      synced: false,
      authMode: 'https' as const,
    },
    commits,
    refs,
    defaultBranch: repo.defaultBranch,
    commitRef,
  }
}

async function runAnalyze(args: {
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
}) {
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

const MAX_DIFF_CHARS = 24_000

async function getDiffChunk(args: {
  repoPath: string
  baseCommit: string
  headCommit: string
  paths?: string[]
  offset?: number
  limit?: number
  auth?: GitAuth
}) {
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
    // -1 means no further pages (DSH tool schemas disallow type unions like integer|null).
    nextOffset: offset + slice.length < allFiles.length ? offset + slice.length : -1,
    files: slice,
    truncated,
    diff: parts.join('\n\n'),
  }
}

function registerRoute(
  ctx: Context,
  options: {
    path: string
    method?: string
    /** Override JSON body size limit (bytes). */
    maxBodyBytes?: number
    run: (body: Record<string, unknown>) => Promise<unknown>
  },
) {
  const method = options.method ?? 'POST'
  return ctx.effect?.(
    () =>
      ctx.webServer!.register({
        kind: 'exact',
        path: options.path,
        handler: async (req, res) => {
          if (req.method !== method) return sendJson(res, 405, { error: 'method not allowed' })
          if (!isTrustedRequest(req)) return sendJson(res, 403, { error: 'untrusted request' })
          let body: Record<string, unknown> = {}
          if (method !== 'GET') {
            try {
              body = (await readJsonBody(req, options.maxBodyBytes)) as Record<string, unknown>
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : 'invalid body'
              return sendJson(res, 400, {
                error: message === 'body too large' ? '请求体过大，请缩小清单后重试' : 'invalid body',
              })
            }
          } else {
            const host = String(req.headers.host ?? '127.0.0.1')
            const url = new URL(req.url ?? '/', `http://${host}`)
            body = Object.fromEntries(url.searchParams.entries())
          }
          try {
            sendJson(res, 200, await options.run(body))
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            sendJson(res, 400, { error: message })
          }
        },
      }),
    `tracescope: ${options.path}`,
  )
}

function toolText(text: string) {
  return [{ type: 'text' as const, text }]
}

export function apply(ctx: Context) {
  registerRoute(ctx, {
    path: '/tracescope/v1/health',
    method: 'GET',
    run: async () => ({
      ok: true,
      name: 'tracescope',
      chatDrivenModel: true,
    }),
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/resolve',
    method: 'POST',
    run: async (body) => {
      const repoPath = String(body.repoPath ?? body.repo ?? '')
      if (!repoPath) throw new Error('缺少 repoPath（本地路径或远端地址）')
      const fetchRemote = parseFetchFlag(body.fetch, true)
      const auth = parseGitAuth(body.auth)
      const resolved = await resolveGitRepo(repoPath, { fetch: fetchRemote, auth })
      return { resolved }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/commits',
    method: 'POST',
    run: async (body) => {
      const repoPath = String(body.repoPath ?? body.repo ?? '')
      const limit = Number(body.limit ?? 40)
      if (!repoPath) throw new Error('缺少 repoPath（本地路径或远端地址）')
      const fetchRemote = parseFetchFlag(body.fetch, true)
      const auth = await resolveRequestGitAuth(parseGitAuth(body.auth), repoPath)
      const refName = typeof body.refName === 'string' ? body.refName.trim() : ''
      if (readAccessMode(body) === 'codeup') {
        return await loadCodeupHistory(
          repoPath,
          Number.isFinite(limit) ? limit : 40,
          await resolveCodeupAuth(body),
          refName || undefined,
        )
      }
      return await loadRepoHistory(
        repoPath,
        Number.isFinite(limit) ? limit : 40,
        fetchRemote,
        auth,
        refName || undefined,
      )
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/analyze',
    method: 'POST',
    run: async (body) => {
      const repoPath = String(body.repoPath ?? body.repo ?? '')
      const baseCommit = String(body.baseCommit ?? '')
      const headCommit = String(body.headCommit ?? '')
      if (!repoPath || !baseCommit || !headCommit) {
        throw new Error('需要 repoPath、baseCommit、headCommit')
      }
      return await runAnalyze({
        repoPath,
        repoInput: repoPath,
        baseCommit,
        headCommit,
        rippleDepth: typeof body.rippleDepth === 'number' ? body.rippleDepth : undefined,
        modulesConfigPath:
          typeof body.modulesConfigPath === 'string' ? body.modulesConfigPath : undefined,
        exportDir: typeof body.exportDir === 'string' ? body.exportDir : undefined,
        fetchRemote:
          body.fetchRemote !== undefined || body.fetch !== undefined
            ? parseFetchFlag(body.fetchRemote ?? body.fetch, false)
            : undefined,
        auth: await resolveRequestGitAuth(parseGitAuth(body.auth), repoPath),
        accessMode: readAccessMode(body),
        codeup: readAccessMode(body) === 'codeup' ? await resolveCodeupAuth(body) : undefined,
        persist: true,
        relatedWorkItems: parseAgileWorkItemRefs(body.relatedWorkItems),
      })
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/report-load',
    method: 'POST',
    run: async (body) => {
      const repoPath = String(body.repoPath ?? body.repo ?? '')
      const baseCommit = String(body.baseCommit ?? '')
      const headCommit = String(body.headCommit ?? '')
      if (!repoPath || !baseCommit || !headCommit) {
        throw new Error('需要 repoPath、baseCommit、headCommit')
      }
      const stored = await loadHandtestReport(repoPath, baseCommit, headCommit)
      return { found: Boolean(stored), stored }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/report-history',
    method: 'POST',
    run: async (body) => {
      const repoPath = typeof body.repoPath === 'string' ? body.repoPath : typeof body.repo === 'string' ? body.repo : ''
      const limit = typeof body.limit === 'number' ? body.limit : Number(body.limit ?? 40)
      const entries = await listHandtestHistory({
        repoInput: repoPath || undefined,
        limit: Number.isFinite(limit) ? limit : 40,
      })
      return { entries }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/report-history-get',
    method: 'POST',
    run: async (body) => {
      const id = String(body.id ?? '')
      if (!id) throw new Error('缺少 id')
      const stored = await loadHandtestHistoryEntry(id)
      if (!stored) throw new Error(`找不到历史任务 ${id}`)
      return { found: true, stored }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/report-history-delete',
    method: 'POST',
    run: async (body) => {
      const id = String(body.id ?? '')
      if (!id) throw new Error('缺少 id')
      const result = await deleteHandtestHistory(id)
      if (!result.deleted) throw new Error(`找不到或无法删除历史任务 ${id}`)
      return { ok: true, ...result }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/report-save',
    method: 'POST',
    run: async (body) => {
      const repoPath = String(body.repoPath ?? body.repo ?? '')
      const baseCommit = String(body.baseCommit ?? '')
      const headCommit = String(body.headCommit ?? '')
      const report = body.report as ImpactReport | undefined
      if (!repoPath || !baseCommit || !headCommit || !report) {
        throw new Error('需要 repoPath、baseCommit、headCommit、report')
      }
      const source =
        body.source === 'model' || body.source === 'deterministic'
          ? body.source
          : report.modelEnriched
            ? 'model'
            : 'deterministic'
      const stored = await saveHandtestReport({
        repoInput: repoPath,
        baseCommit,
        headCommit,
        report,
        source,
      })
      return { ok: true, stored }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/report-status',
    method: 'POST',
    run: async (body) => {
      const repoPath = String(body.repoPath ?? body.repo ?? '')
      const baseCommit = String(body.baseCommit ?? '')
      const headCommit = String(body.headCommit ?? '')
      const itemId = String(body.itemId ?? '')
      const status = String(body.status ?? '')
      const listKindRaw = String(body.listKind ?? '')
      const listKind =
        listKindRaw === 'direct' || listKindRaw === 'ripple' ? listKindRaw : undefined
      const itemIndex =
        typeof body.itemIndex === 'number' && Number.isInteger(body.itemIndex)
          ? body.itemIndex
          : typeof body.itemIndex === 'string' && /^\d+$/.test(body.itemIndex)
            ? Number(body.itemIndex)
            : undefined
      const testerNote =
        typeof body.testerNote === 'string'
          ? body.testerNote
          : typeof body.note === 'string'
            ? body.note
            : undefined
      const hasScreenshots = Object.prototype.hasOwnProperty.call(body, 'testerScreenshots')
      if (!repoPath || !baseCommit || !headCommit || !itemId) {
        throw new Error('需要 repoPath、baseCommit、headCommit、itemId、status')
      }
      if (status !== 'pending' && status !== 'pass' && status !== 'fail' && status !== 'skip') {
        throw new Error('status 必须是 pending|pass|fail|skip')
      }
      const stored = await patchHandtestItemStatus({
        repoInput: repoPath,
        baseCommit,
        headCommit,
        itemId,
        status,
        listKind,
        itemIndex,
        testerNote,
        testerScreenshots: hasScreenshots ? body.testerScreenshots : undefined,
      })
      return { ok: Boolean(stored), stored }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/report-attachments',
    method: 'POST',
    // Base64 video/doc uploads need a larger ceiling than checklist JSON.
    maxBodyBytes: 56 * 1024 * 1024,
    run: async (body) => {
      const action = String(body.action ?? 'list')
      const repoPath = String(body.repoPath ?? body.repo ?? '')
      const baseCommit = String(body.baseCommit ?? '')
      const headCommit = String(body.headCommit ?? '')
      if (!repoPath || !baseCommit || !headCommit) {
        throw new Error('需要 repoPath、baseCommit、headCommit')
      }
      const key = handtestReportKey(repoPath, baseCommit, headCommit)
      let stored = await loadHandtestReport(repoPath, baseCommit, headCommit)
      if (!stored) {
        throw new Error('请先生成手测清单，再上传任务附件')
      }

      if (action === 'list') {
        const attachments = normalizeReportAttachments(stored.report.attachments)
        return {
          attachments,
          maxCount: MAX_REPORT_ATTACHMENTS,
          maxUploadBytes: MAX_ATTACHMENT_UPLOAD_BYTES,
        }
      }

      if (action === 'upload') {
        const current = normalizeReportAttachments(stored.report.attachments)
        if (current.length >= MAX_REPORT_ATTACHMENTS) {
          throw new Error(`任务附件最多 ${MAX_REPORT_ATTACHMENTS} 个`)
        }
        const name = String(body.name ?? '').trim()
        const mime = typeof body.mime === 'string' ? body.mime : undefined
        const localPath = typeof body.localPath === 'string' ? body.localPath.trim() : ''
        const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64.trim() : ''
        let attachment
        if (localPath) {
          attachment = await saveReportAttachmentFromLocalPath({
            reportKey: key,
            localPath,
            name: name || undefined,
            mime,
          })
        } else if (dataBase64) {
          if (!name) throw new Error('缺少附件文件名')
          const raw = dataBase64.includes(',')
            ? dataBase64.slice(dataBase64.indexOf(',') + 1)
            : dataBase64
          const data = Buffer.from(raw, 'base64')
          if (!data.length) throw new Error('附件内容为空')
          attachment = await saveReportAttachmentBuffer({
            reportKey: key,
            name,
            mime,
            data,
          })
        } else {
          throw new Error('请选择文件，或填写本机绝对路径（适合大视频）')
        }
        const next = normalizeReportAttachments([...current, attachment])
        stored = await saveHandtestReport({
          repoInput: stored.repoInput,
          baseCommit: stored.baseCommit,
          headCommit: stored.headCommit,
          report: { ...stored.report, attachments: next },
          source: stored.source,
          updateLatestOnly: true,
        })
        return {
          ok: true,
          attachment,
          attachments: normalizeReportAttachments(stored.report.attachments),
          sizeLabel: formatAttachmentSize(attachment.size),
        }
      }

      if (action === 'delete') {
        const id = String(body.id ?? body.attachmentId ?? '').trim()
        if (!id) throw new Error('缺少附件 id')
        const current = normalizeReportAttachments(stored.report.attachments)
        const target = current.find((a) => a.id === id)
        const next = current.filter((a) => a.id !== id)
        if (target) {
          await deleteReportAttachmentFile(key, target.storedName)
        }
        stored = await saveHandtestReport({
          repoInput: stored.repoInput,
          baseCommit: stored.baseCommit,
          headCommit: stored.headCommit,
          report: { ...stored.report, attachments: next },
          source: stored.source,
          updateLatestOnly: true,
        })
        return {
          ok: true,
          attachments: normalizeReportAttachments(stored.report.attachments),
        }
      }

      if (action === 'download') {
        const id = String(body.id ?? body.attachmentId ?? '').trim()
        if (!id) throw new Error('缺少附件 id')
        const current = normalizeReportAttachments(stored.report.attachments)
        const target = current.find((a) => a.id === id)
        if (!target) throw new Error('找不到该附件')
        const filePath = path.join(reportAttachmentsDir(key), target.storedName)
        if (target.size > MAX_ATTACHMENT_UPLOAD_BYTES) {
          return {
            ok: true,
            attachment: target,
            tooLarge: true,
            localPath: filePath,
            sizeLabel: formatAttachmentSize(target.size),
          }
        }
        const data = await readReportAttachmentFile({
          reportKey: key,
          storedName: target.storedName,
        })
        return {
          ok: true,
          attachment: target,
          dataBase64: data.toString('base64'),
          sizeLabel: formatAttachmentSize(target.size),
        }
      }

      throw new Error('action 必须是 list|upload|delete|download')
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/report-export',
    method: 'POST',
    run: async (body) => {
      let report = body.report as ImpactReport | undefined
      if (!report) {
        const repoPath = String(body.repoPath ?? body.repo ?? '')
        const baseCommit = String(body.baseCommit ?? '')
        const headCommit = String(body.headCommit ?? '')
        if (!repoPath || !baseCommit || !headCommit) {
          throw new Error('需要 report，或 repoPath + baseCommit + headCommit')
        }
        const stored = await loadHandtestReport(repoPath, baseCommit, headCommit)
        if (!stored?.report) throw new Error('找不到可导出的清单')
        report = stored.report
      }
      const markdown = exportReportMarkdown(report)
      const stamp = (report.generatedAt || new Date().toISOString()).replace(/[:.]/g, '-').slice(0, 19)
      const short = (sha: string) => (sha || '').slice(0, 7) || 'rev'
      const filename = `tracescope-${short(report.baseCommit)}-${short(report.headCommit)}-${stamp}.md`
      return { markdown, filename, format: 'markdown' }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/yunxiao-catalog',
    method: 'POST',
    run: async (body) => {
      const action = String(body.action ?? '')
      const existing = await loadTrackerConfig()
      const remembered = await loadRememberedYunxiaoAccess()
      const endpoint =
        typeof body.endpoint === 'string' && body.endpoint.trim()
          ? body.endpoint.trim()
          : existing.yunxiao?.endpoint || remembered.endpoint || 'https://openapi-rdc.aliyuncs.com'
      const tokenRaw = typeof body.token === 'string' ? body.token.trim() : ''
      const token = !isMaskedSecret(tokenRaw) ? tokenRaw : remembered.token
      if (!token) throw new Error('请先填写云效访问令牌并保存，或在本次请求中传入 token')

      const organizationId =
        typeof body.organizationId === 'string'
          ? body.organizationId.trim()
          : existing.yunxiao?.organizationId || remembered.organizationId || ''
      const spaceId =
        typeof body.spaceId === 'string' ? body.spaceId.trim() : existing.yunxiao?.spaceId || ''

      const wantDebug = Boolean(body.debug)
      const withDebug = (payload: Record<string, unknown>, debug: unknown) =>
        wantDebug ? { ...payload, debug } : payload

      if (action === 'organizations') {
        const result = await listYunxiaoOrganizations(endpoint, token)
        if (!result.ok) {
          if (wantDebug) return withDebug({ options: [], error: result.error }, result.debug)
          throw new Error(result.error || '获取企业列表失败')
        }
        return withDebug({ options: result.options }, result.debug)
      }
      if (action === 'projects') {
        const result = await listYunxiaoProjects(endpoint, token, organizationId)
        if (!result.ok) {
          if (wantDebug) return withDebug({ options: [], error: result.error }, result.debug)
          throw new Error(result.error || '获取项目列表失败')
        }
        return withDebug({ options: result.options, warning: result.error }, result.debug)
      }
      if (action === 'workitemTypes') {
        const category = typeof body.category === 'string' ? body.category : 'Bug'
        const result = await listYunxiaoWorkitemTypes(
          endpoint,
          token,
          organizationId,
          spaceId,
          category,
        )
        if (!result.ok) {
          if (wantDebug) return withDebug({ options: [], error: result.error }, result.debug)
          throw new Error(result.error || '获取缺陷类型失败')
        }
        return withDebug({ options: result.options }, result.debug)
      }
      if (action === 'members') {
        const result = await listYunxiaoMembers(endpoint, token, organizationId)
        if (!result.ok) {
          if (wantDebug) return withDebug({ options: [], error: result.error }, result.debug)
          throw new Error(result.error || '获取成员列表失败')
        }
        return withDebug({ options: result.options }, result.debug)
      }
      if (action === 'workitems') {
        const categoriesRaw = body.categories
        const categories = Array.isArray(categoriesRaw)
          ? categoriesRaw.map((c) => String(c).trim()).filter(Boolean)
          : typeof body.category === 'string' && body.category.trim()
            ? body.category.split(',').map((c: string) => c.trim()).filter(Boolean)
            : ['Req', 'Bug', 'Task']
        const result = await listYunxiaoWorkitems(
          endpoint,
          token,
          organizationId,
          spaceId,
          categories,
        )
        if (!result.ok) throw new Error(result.error || '获取工作项失败')
        return { items: result.items }
      }
      throw new Error('action 必须是 organizations|projects|workitemTypes|members|workitems')
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/tracker-config',
    method: 'GET',
    run: async () => {
      const config = await loadTrackerConfig()
      return { config: publicTrackerConfig(config) }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/tracker-config-save',
    method: 'POST',
    run: async (body) => {
      const provider = String(body.provider ?? 'none') as TrackerProvider
      if (provider === 'none') {
        await saveTrackerConfig({ provider: 'none' })
        return { ok: true, config: publicTrackerConfig({ provider: 'none' }) }
      }
      const existing = await loadTrackerConfig()
      const keepToken = (incoming: unknown, prev: string | undefined) => {
        const raw = typeof incoming === 'string' ? incoming.trim() : ''
        if (raw && raw !== '••••••••') return raw
        return prev || ''
      }

      const next: TrackerConfig = { provider }
      if (provider === 'yunxiao') {
        const y = (body.yunxiao && typeof body.yunxiao === 'object' ? body.yunxiao : body) as Record<
          string,
          unknown
        >
        next.yunxiao = {
          endpoint:
            typeof y.endpoint === 'string' && y.endpoint.trim()
              ? y.endpoint.trim()
              : existing.yunxiao?.endpoint || 'https://openapi-rdc.aliyuncs.com',
          token: keepToken(y.token, existing.yunxiao?.token),
          organizationId:
            typeof y.organizationId === 'string'
              ? y.organizationId.trim()
              : existing.yunxiao?.organizationId || '',
          spaceId:
            typeof y.spaceId === 'string' ? y.spaceId.trim() : existing.yunxiao?.spaceId || '',
          workitemTypeId:
            typeof y.workitemTypeId === 'string'
              ? y.workitemTypeId.trim()
              : existing.yunxiao?.workitemTypeId || '',
          assignedTo:
            typeof y.assignedTo === 'string'
              ? y.assignedTo.trim()
              : existing.yunxiao?.assignedTo || '',
        }
      } else if (provider === 'github') {
        const g = (body.github && typeof body.github === 'object' ? body.github : body) as Record<
          string,
          unknown
        >
        const labelsRaw = g.labels
        next.github = {
          token: keepToken(g.token, existing.github?.token),
          owner: typeof g.owner === 'string' ? g.owner.trim() : existing.github?.owner || '',
          repo: typeof g.repo === 'string' ? g.repo.trim() : existing.github?.repo || '',
          labels: Array.isArray(labelsRaw)
            ? labelsRaw.map(String)
            : typeof labelsRaw === 'string'
              ? labelsRaw.split(',').map((s) => s.trim()).filter(Boolean)
              : existing.github?.labels || [],
        }
      } else if (provider === 'gitlab') {
        const g = (body.gitlab && typeof body.gitlab === 'object' ? body.gitlab : body) as Record<
          string,
          unknown
        >
        const labelsRaw = g.labels
        next.gitlab = {
          host:
            typeof g.host === 'string' && g.host.trim()
              ? g.host.trim()
              : existing.gitlab?.host || 'https://gitlab.com',
          token: keepToken(g.token, existing.gitlab?.token),
          projectId:
            typeof g.projectId === 'string' ? g.projectId.trim() : existing.gitlab?.projectId || '',
          labels: Array.isArray(labelsRaw)
            ? labelsRaw.map(String)
            : typeof labelsRaw === 'string'
              ? labelsRaw.split(',').map((s) => s.trim()).filter(Boolean)
              : existing.gitlab?.labels || [],
        }
      } else if (provider === 'webhook') {
        const w = (body.webhook && typeof body.webhook === 'object' ? body.webhook : body) as Record<
          string,
          unknown
        >
        next.webhook = {
          url: typeof w.url === 'string' ? w.url.trim() : existing.webhook?.url || '',
          headers: existing.webhook?.headers,
        }
        if (typeof w.authHeader === 'string' && w.authHeader.trim()) {
          next.webhook.headers = { Authorization: w.authHeader.trim() }
        }
      } else {
        throw new Error('不支持的协作平台')
      }

      await saveTrackerConfig(next)
      if (next.yunxiao && !isMaskedSecret(next.yunxiao.token)) {
        await rememberYunxiaoAccess({
          token: next.yunxiao.token,
          endpoint: next.yunxiao.endpoint,
          organizationId: next.yunxiao.organizationId,
        })
      }
      return {
        ok: true,
        config: publicTrackerConfig(next),
        ready: isTrackerConfigReady(next),
      }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/tracker-submit',
    method: 'POST',
    run: async (body) => {
      const config = await loadTrackerConfig()
      if (!isTrackerConfigReady(config)) {
        throw new Error('请先在「仓库配置 → 协作平台」中选择平台并保存完整配置')
      }
      const report = body.report as ImpactReport | undefined
      if (!report) throw new Error('缺少 report')
      const failed = collectFailedItems(report)
      if (!failed.length) throw new Error('当前没有标记为失败的条目')
      const repoPath = String(body.repoPath ?? report.repoPath ?? '')
      const baseCommit = String(body.baseCommit ?? report.baseCommit ?? '')
      const headCommit = String(body.headCommit ?? report.headCommit ?? '')
      const result = await submitFailFeedback(config, {
        repoPath,
        baseCommit,
        headCommit,
        items: failed,
        subject: typeof body.subject === 'string' ? body.subject : undefined,
        attachments: report.attachments,
      })
      if (!result.ok) throw new Error(result.error || '提交缺陷失败')
      return {
        ok: true,
        provider: result.provider,
        id: result.id,
        url: result.url,
        count: failed.length,
        uploadedAttachments: result.uploadedAttachments ?? 0,
        failedAttachments: result.failedAttachments ?? 0,
        attachmentErrors: result.attachmentErrors,
      }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/yunxiao-token',
    method: 'GET',
    run: async () => {
      const access = await loadRememberedYunxiaoAccess()
      return {
        token: access.token,
        endpoint: access.endpoint,
        organizationId: access.organizationId,
        hasToken: !isMaskedSecret(access.token),
      }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/yunxiao-token-save',
    method: 'POST',
    run: async (body) => {
      const access = await rememberYunxiaoAccess({
        token: typeof body.token === 'string' ? body.token : '',
        endpoint: typeof body.endpoint === 'string' ? body.endpoint : undefined,
        organizationId: typeof body.organizationId === 'string' ? body.organizationId : undefined,
      })
      return {
        ok: true,
        endpoint: access.endpoint,
        organizationId: access.organizationId,
        hasToken: !isMaskedSecret(access.token),
      }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/auth',
    method: 'GET',
    run: async () => {
      const auth = await loadStoredGitAuth()
      return { auth: auth ?? { mode: 'none' } }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/auth-save',
    method: 'POST',
    run: async (body) => {
      const remember = body.remember !== false && body.remember !== 'false'
      const auth = parseGitAuth(body.auth)
      if (!remember || !auth || auth.mode === 'none') {
        await saveStoredGitAuth({ mode: 'none' })
        return { ok: true, auth: { mode: 'none' } }
      }
      await saveStoredGitAuth(auth)
      return {
        ok: true,
        auth:
          auth.mode === 'https'
            ? { mode: 'https', username: auth.username || 'git', token: auth.token }
            : { mode: 'ssh', privateKeyPath: auth.privateKeyPath },
      }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/jobs',
    method: 'POST',
    run: async (body) => {
      const repoInput = String(body.repoPath ?? body.repo ?? '')
      const baseCommit = String(body.baseCommit ?? '')
      const headCommit = String(body.headCommit ?? '')
      if (!repoInput || !baseCommit || !headCommit) {
        throw new Error('需要 repoPath、baseCommit、headCommit')
      }
      const auth = await resolveRequestGitAuth(parseGitAuth(body.auth), repoInput)
      const fetchRemote = parseFetchFlag(body.fetch, true)
      const accessMode = readAccessMode(body)
      const codeup = accessMode === 'codeup' ? await resolveCodeupAuth(body) : undefined
      const resolved =
        accessMode === 'codeup'
          ? {
              input: repoInput,
              repoPath: repoInput,
              source: 'codeup' as const,
              remoteUrl: repoInput,
              synced: false,
              authMode: 'https' as const,
            }
          : await resolveGitRepo(repoInput, { fetch: fetchRemote, auth })
      const job = createJob({
        repoInput,
        repoPath: resolved.repoPath,
        baseCommit,
        headCommit,
        auth,
        accessMode,
        codeup,
      })
      const relatedWorkItems = parseAgileWorkItemRefs(body.relatedWorkItems)
      const prompt = buildChatAnalysisPrompt({
        jobId: job.id,
        repoPath: repoInput,
        baseCommit,
        headCommit,
        relatedWorkItems,
        accessMode,
      })
      return {
        jobId: job.id,
        status: job.status,
        prompt,
        resolved,
        relatedWorkItems,
      }
    },
  })

  registerRoute(ctx, {
    path: '/tracescope/v1/job',
    method: 'GET',
    run: async (body) => {
      const id = String(body.id ?? body.jobId ?? '')
      if (!id) throw new Error('缺少 id')
      const job = getJob(id)
      if (!job) throw new Error(`找不到任务 ${id}`)
      return {
        jobId: job.id,
        status: job.status,
        error: job.error,
        report: job.report,
        updatedAt: job.updatedAt,
        repoPath: job.repoInput,
        baseCommit: job.baseCommit,
        headCommit: job.headCommit,
      }
    },
  })

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

  ctx.tools?.register(
    defineTool({
      name: 'tracescope_get_diff',
      description:
        'Fetch a chunk of unified git diff between two commits. Use offset/limit to page through files; do not request the entire tree at once.',
      parameters: {
        repoPath: {
          type: 'string',
          required: true,
          description: 'Local git path or remote URL',
        },
        baseCommit: { type: 'string', required: true },
        headCommit: { type: 'string', required: true },
        paths: {
          type: 'string',
          description: 'Optional comma-separated relative paths to limit the diff',
        },
        offset: { type: 'number', description: 'File offset (default 0)' },
        limit: { type: 'number', description: 'Max files in this chunk (default 8, max 20)' },
        authMode: { type: 'string', description: 'none | https | ssh' },
        authUsername: { type: 'string' },
        authToken: { type: 'string' },
        authPrivateKeyPath: { type: 'string' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['totalFiles', 'offset', 'files', 'diff'],
          properties: {
            repoPath: { type: 'string' },
            totalFiles: { type: 'integer' },
            offset: { type: 'integer' },
            limit: { type: 'integer' },
            nextOffset: { type: 'integer' },
            files: { type: 'array', items: { type: 'string' } },
            truncated: { type: 'boolean' },
            diff: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const v = value as {
            totalFiles?: number
            offset?: number
            nextOffset?: number
            files?: string[]
            diff?: string
          }
          return toolText(
            [
              `变更文件 ${v.totalFiles ?? 0} · 本批 offset=${v.offset ?? 0} · next=${
                v.nextOffset !== undefined && v.nextOffset >= 0 ? v.nextOffset : '无'
              }`,
              (v.files ?? []).map((f) => `- ${f}`).join('\n'),
              '',
              (v.diff ?? '').slice(0, 12_000),
            ].join('\n'),
          )
        },
      },
      async execute(args: Record<string, unknown>) {
        const pathsRaw = typeof args.paths === 'string' ? args.paths : ''
        const paths = pathsRaw
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
        return await getDiffChunk({
          repoPath: String(args.repoPath),
          baseCommit: String(args.baseCommit),
          headCommit: String(args.headCommit),
          paths: paths.length ? paths : undefined,
          offset: typeof args.offset === 'number' ? args.offset : undefined,
          limit: typeof args.limit === 'number' ? args.limit : undefined,
          auth: parseAuthFromToolArgs(args),
        })
      },
    }),
  )

  ctx.tools?.register(
    defineTool({
      name: 'tracescope_publish_handtest',
      description:
        'Publish the final hand-test checklist for a TraceScope chat job. Call this once the interactive analysis is complete so the right-sidebar panel can refresh.',
      parameters: {
        jobId: {
          type: 'string',
          required: true,
          description: 'TraceScope job id from the starter prompt',
        },
        items: {
          type: 'string',
          required: true,
          description:
            'JSON array of hand-test items: [{displayName,kind,risk,files,suggestedSteps,evidence}]',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['jobId', 'status', 'directCount', 'rippleCount'],
          properties: {
            jobId: { type: 'string' },
            status: { type: 'string' },
            directCount: { type: 'integer' },
            rippleCount: { type: 'integer' },
            summary: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const v = value as { summary?: string }
          return toolText(v.summary || '已发布手测清单')
        },
      },
      async execute(args: Record<string, unknown>) {
        const jobId = String(args.jobId ?? '')
        if (!jobId) throw new Error('缺少 jobId')
        const job = getJob(jobId)
        if (!job) throw new Error(`找不到任务 ${jobId}`)

        let parsed: unknown = args.items
        if (typeof args.items === 'string') {
          try {
            parsed = JSON.parse(args.items)
          } catch {
            throw new Error('items 不是合法 JSON')
          }
        }
        const items = parsePublishedHandtestItems(parsed)
        let changedFiles: string[] = []
        try {
          if (job.accessMode === 'codeup' && job.codeup?.token) {
            const target = resolveCodeupTarget(job.repoInput, job.codeup)
            const compare = await compareCodeup(target, {
              endpoint: job.codeup.endpoint,
              token: job.codeup.token,
              base: job.baseCommit,
              head: job.headCommit,
            })
            changedFiles = changedPathsFromDiffs(compare.diffs)
          } else {
            changedFiles = await gitDiffFiles(job.repoPath, job.baseCommit, job.headCommit)
          }
        } catch {
          changedFiles = [...new Set(items.flatMap((i) => i.files))]
        }
        const report = buildReportFromPublishedItems({
          repoPath: job.repoPath,
          baseCommit: job.baseCommit,
          headCommit: job.headCommit,
          changedFiles,
          items,
        })
        const updated = publishJobReport(jobId, report)
        await saveHandtestReport({
          repoInput: job.repoInput,
          baseCommit: job.baseCommit,
          headCommit: job.headCommit,
          report,
          source: 'model',
        })
        const summary = [
          `已发布手测清单到 TraceScope 面板（任务 ${jobId}）`,
          `并已持久化到本机，重启后同一仓库与两版本会自动恢复（再次「模型对话分析」并 publish 才会覆盖）。`,
          `直接 ${report.direct.length} · 波及 ${report.ripple.length}`,
          '',
          '## 直接变更',
          ...report.direct.map((i) => `- [${i.risk}] ${i.displayName}`),
          '',
          '## 可能波及',
          ...report.ripple.map((i) => `- [${i.risk}] ${i.displayName}`),
        ].join('\n')
        return {
          jobId: updated.id,
          status: updated.status,
          directCount: report.direct.length,
          rippleCount: report.ripple.length,
          summary,
        }
      },
    }),
  )

  ctx.commands.register({
    name: 'tracescope',
    description: '打开右侧 TraceScope 面板，或命令行生成确定性手测范围报告',
    input: { hint: '[<repo> <baseCommit> <headCommit> [exportDir]]' },
    handler: async (invocation: CommandInvocation): Promise<CommandResult> => {
      const parts = invocation.rawInput.trim().split(/\s+/).filter(Boolean)
      if (parts.length < 3) {
        return {
          kind: 'success',
          text: [
            '可视化：右侧栏会尽量在新会话就绪后自动打开 TraceScope；也可点引导页「TraceScope」。',
            '若仍看不到右侧栏，多半是 DSH 在空白首页未挂载会话栏——进入会话页后再试（不必先发消息也可以，取决于客户端版本）。',
            '模型分析请用面板「模型对话分析」，在会话里互动后再 publish。',
            '失败反馈可复制，或在配置协作平台后点「提交缺陷」。',
            '',
            USAGE,
          ].join('\n'),
        }
      }
      try {
        const [repoPath, baseCommit, headCommit, exportDir] = parts
        const result = await runAnalyze({
          repoPath: repoPath!,
          baseCommit: baseCommit!,
          headCommit: headCommit!,
          exportDir,
        })
        return {
          kind: 'success',
          text: [
            `直接变更 ${result.report.direct.length} · 可能波及 ${result.report.ripple.length}`,
            '（确定性分析）',
            '',
            result.markdown.slice(0, 12_000),
          ].join('\n'),
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { kind: 'error', text: message }
      }
    },
  })
}
