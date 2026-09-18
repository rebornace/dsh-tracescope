import type { ImpactReport, ReportAttachment, ScopeItem } from './types.js'
import { readReportAttachmentFile } from './attachments.js'
import { handtestReportKey } from './report-store.js'
import {
  createYunxiaoWorkitem,
  filenameEmbedMarkdown,
  isYunxiaoConfigReady,
  normalizeYunxiaoEndpoint,
  updateYunxiaoWorkitem,
  uploadYunxiaoWorkitemAttachment,
  type YunxiaoConfig,
} from './yunxiao.js'

export type TrackerProvider = 'none' | 'yunxiao' | 'github' | 'gitlab' | 'webhook'

export interface GithubTrackerConfig {
  token: string
  owner: string
  repo: string
  /** Optional comma-separated or array labels */
  labels?: string[]
}

export interface GitlabTrackerConfig {
  /** GitLab host, e.g. https://gitlab.com */
  host: string
  token: string
  /** Project id or URL-encoded path like group%2Fproject */
  projectId: string
  labels?: string[]
}

export interface WebhookTrackerConfig {
  url: string
  /** Extra headers (Authorization etc.) */
  headers?: Record<string, string>
}

export interface TrackerConfig {
  provider: TrackerProvider
  yunxiao?: YunxiaoConfig
  github?: GithubTrackerConfig
  gitlab?: GitlabTrackerConfig
  webhook?: WebhookTrackerConfig
}

export interface TrackerSubmitResult {
  ok: boolean
  provider: TrackerProvider
  id?: string
  url?: string
  error?: string
  raw?: unknown
  /** Yunxiao (and similar) attachment upload summary. */
  uploadedAttachments?: number
  failedAttachments?: number
  attachmentErrors?: string[]
}

function bufferFromDataUrl(dataUrl: string): Buffer | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim())
  if (!m) return null
  try {
    return Buffer.from(m[2]!, 'base64')
  } catch {
    return null
  }
}

function safeAttachLabel(name: string): string {
  return (name || 'file').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').slice(0, 60)
}

/** Build markdown body for a batch of failed checklist items. */
export function buildFailFeedbackDescription(input: {
  repoPath: string
  baseCommit: string
  headCommit: string
  items: ScopeItem[]
  attachments?: ReportAttachment[]
  /**
   * When true (default), embed screenshot data-URLs under each item.
   * Set false for Yunxiao create body — images are uploaded as real attachments instead.
   */
  embedScreenshotDataUrls?: boolean
  /** Optional Yunxiao embed markdown keyed by `itemIndex:shotIndex`. */
  screenshotEmbeds?: Record<string, string>
}): string {
  const embedDataUrls = input.embedScreenshotDataUrls !== false
  const lines = [
    '## TraceScope 手测失败反馈',
    '',
    `- 仓库：\`${input.repoPath}\``,
    `- 稳定版本：\`${input.baseCommit}\``,
    `- 待测版本：\`${input.headCommit}\``,
    `- 失败条目：${input.items.length}`,
    '',
  ]
  const taskAttachments = input.attachments || []
  if (taskAttachments.length) {
    lines.push('### 任务附件', '')
    taskAttachments.forEach((a, i) => {
      const sizeLabel =
        a.size >= 1024 * 1024
          ? `${(a.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.max(1, Math.round(a.size / 1024))} KB`
      lines.push(`${i + 1}. ${a.name}（${a.mime || 'file'} · ${sizeLabel}）`)
    })
    lines.push('')
  }
  input.items.forEach((item, i) => {
    lines.push(`### ${i + 1}. ${item.displayName}`)
    lines.push('')
    lines.push(`- 类型：${item.kind === 'direct' ? '直接变更' : '可能波及'}`)
    lines.push(`- 风险：${item.risk}`)
    if (item.files?.length) {
      lines.push(`- 文件：${item.files.map((f) => `\`${f}\``).join(', ')}`)
    }
    lines.push(`- 测试备注：${item.testerNote?.trim() || '（未填写）'}`)
    const shots = item.testerScreenshots || []
    if (shots.length) {
      lines.push(`- 截图（${shots.length}）：`)
      shots.forEach((s, idx) => {
        const embedKey = `${i}:${idx}`
        const yunxiaoEmbed = input.screenshotEmbeds?.[embedKey]
        if (yunxiaoEmbed) {
          // Already `![filename](embedUrl)` — show directly under this item.
          lines.push(`  ${yunxiaoEmbed}`)
        } else if (embedDataUrls) {
          lines.push(`  ![${s.name}](${s.dataUrl})`)
        } else {
          lines.push(`  ${s.name}`)
        }
      })
    }
    if (item.suggestedSteps?.length) {
      lines.push('- 建议手测：')
      item.suggestedSteps.forEach((s, idx) => lines.push(`  ${idx + 1}. ${s}`))
    }
    lines.push('')
  })
  lines.push('---')
  lines.push('_由 TraceScope 自动提交_')
  const body = lines.join('\n')
  // Soft guard for platforms that reject huge markdown bodies.
  if (body.length > 180_000 && embedDataUrls) {
    return buildFailFeedbackDescription({
      ...input,
      embedScreenshotDataUrls: false,
      screenshotEmbeds: undefined,
    })
  }
  return body
}

export function collectFailedItems(report: ImpactReport): ScopeItem[] {
  return [...report.direct, ...report.ripple].filter((i) => i.status === 'fail')
}

export function buildFailFeedbackSubject(items: ScopeItem[], repoLabel?: string): string {
  const prefix = repoLabel ? `[TraceScope][${repoLabel}] ` : '[TraceScope] '
  if (items.length === 1) {
    return `${prefix}手测失败：${items[0]!.displayName}`.slice(0, 120)
  }
  return `${prefix}手测失败 ${items.length} 项`.slice(0, 120)
}

export function isTrackerConfigReady(config: TrackerConfig | null | undefined): boolean {
  if (!config || config.provider === 'none') return false
  switch (config.provider) {
    case 'yunxiao':
      return isYunxiaoConfigReady(config.yunxiao)
    case 'github': {
      const g = config.github
      return Boolean(g?.token?.trim() && g.owner?.trim() && g.repo?.trim())
    }
    case 'gitlab': {
      const g = config.gitlab
      return Boolean(g?.token?.trim() && g.host?.trim() && g.projectId?.trim())
    }
    case 'webhook':
      return Boolean(config.webhook?.url?.trim())
    default: {
      const _exhaustive: never = config.provider
      return _exhaustive
    }
  }
}

async function submitGithub(
  config: GithubTrackerConfig,
  subject: string,
  body: string,
  fetchImpl: typeof fetch,
): Promise<TrackerSubmitResult> {
  const url = `https://api.github.com/repos/${encodeURIComponent(config.owner.trim())}/${encodeURIComponent(config.repo.trim())}/issues`
  const labels = (config.labels || []).map((l) => l.trim()).filter(Boolean)
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${config.token.trim()}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({
      title: subject,
      body,
      labels: labels.length ? labels : undefined,
    }),
  })
  const raw = await res.json().catch(() => null)
  if (!res.ok) {
    const msg =
      raw && typeof raw === 'object' && 'message' in raw
        ? String((raw as { message?: string }).message)
        : `GitHub HTTP ${res.status}`
    return { ok: false, provider: 'github', error: msg, raw }
  }
  const obj = raw as { number?: number; html_url?: string; id?: number }
  return {
    ok: true,
    provider: 'github',
    id: obj.number != null ? String(obj.number) : obj.id != null ? String(obj.id) : undefined,
    url: obj.html_url,
    raw,
  }
}

async function submitGitlab(
  config: GitlabTrackerConfig,
  subject: string,
  body: string,
  fetchImpl: typeof fetch,
): Promise<TrackerSubmitResult> {
  const host = config.host.trim().replace(/\/+$/, '') || 'https://gitlab.com'
  const project = encodeURIComponent(config.projectId.trim())
  const url = `${host}/api/v4/projects/${project}/issues`
  const labels = (config.labels || []).map((l) => l.trim()).filter(Boolean)
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'PRIVATE-TOKEN': config.token.trim(),
    },
    body: JSON.stringify({
      title: subject,
      description: body,
      labels: labels.length ? labels.join(',') : undefined,
    }),
  })
  const raw = await res.json().catch(() => null)
  if (!res.ok) {
    const msg =
      raw && typeof raw === 'object' && 'message' in raw
        ? String((raw as { message?: string }).message)
        : `GitLab HTTP ${res.status}`
    return { ok: false, provider: 'gitlab', error: msg, raw }
  }
  const obj = raw as { iid?: number; id?: number; web_url?: string }
  return {
    ok: true,
    provider: 'gitlab',
    id: obj.iid != null ? String(obj.iid) : obj.id != null ? String(obj.id) : undefined,
    url: obj.web_url,
    raw,
  }
}

async function submitWebhook(
  config: WebhookTrackerConfig,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<TrackerSubmitResult> {
  const res = await fetchImpl(config.url.trim(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.headers || {}),
    },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let raw: unknown = text
  try {
    raw = JSON.parse(text)
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    return {
      ok: false,
      provider: 'webhook',
      error: typeof raw === 'string' ? raw.slice(0, 400) : `Webhook HTTP ${res.status}`,
      raw,
    }
  }
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  return {
    ok: true,
    provider: 'webhook',
    id: obj && (obj.id != null || obj.key != null) ? String(obj.id ?? obj.key) : undefined,
    url: obj && typeof obj.url === 'string' ? obj.url : undefined,
    raw,
  }
}

/** Submit failed checklist feedback to the configured tracker. */
export async function submitFailFeedback(
  config: TrackerConfig,
  input: {
    repoPath: string
    baseCommit: string
    headCommit: string
    items: ScopeItem[]
    subject?: string
    attachments?: ReportAttachment[]
  },
  fetchImpl: typeof fetch = fetch,
): Promise<TrackerSubmitResult> {
  if (!isTrackerConfigReady(config)) {
    return { ok: false, provider: config.provider || 'none', error: '缺陷平台配置不完整或未选择平台' }
  }
  const subject =
    input.subject?.trim() || buildFailFeedbackSubject(input.items, input.repoPath)
  const description = buildFailFeedbackDescription(input)

  try {
    switch (config.provider) {
      case 'yunxiao': {
        const yx = {
          ...config.yunxiao!,
          endpoint: normalizeYunxiaoEndpoint(config.yunxiao?.endpoint),
        }
        // Create without giant data-URL images; upload real files as workitem attachments.
        const createDescription = buildFailFeedbackDescription({
          ...input,
          embedScreenshotDataUrls: false,
        })
        const result = await createYunxiaoWorkitem(
          yx,
          { subject, description: createDescription, formatType: 'MARKDOWN' },
          fetchImpl,
        )
        if (!result.ok || !result.workitemId) {
          return {
            ok: false,
            provider: 'yunxiao',
            id: result.workitemId,
            url: result.url,
            error: result.error,
            raw: result.raw,
          }
        }

        let uploaded = 0
        let failedUploads = 0
        const attachmentErrors: string[] = []
        const screenshotEmbeds: Record<string, string> = {}
        const reportKey = handtestReportKey(input.repoPath, input.baseCommit, input.headCommit)

        // Screenshots: upload only to obtain permanent embedUrl, then show under each item in详情.
        for (let i = 0; i < input.items.length; i++) {
          const item = input.items[i]!
          const shots = item.testerScreenshots || []
          for (let j = 0; j < shots.length; j++) {
            const shot = shots[j]!
            const buf = bufferFromDataUrl(shot.dataUrl)
            if (!buf) {
              failedUploads += 1
              attachmentErrors.push(`${shot.name}: 无法解析截图数据`)
              continue
            }
            const name = safeAttachLabel(shot.name) || `screenshot-${i + 1}-${j + 1}.jpg`
            const up = await uploadYunxiaoWorkitemAttachment(
              yx,
              result.workitemId,
              { name, mime: shot.mime || 'image/jpeg', data: buf },
              fetchImpl,
            )
            if (up.ok) {
              uploaded += 1
              const embed = filenameEmbedMarkdown(shot.name || name, up)
              if (embed) screenshotEmbeds[`${i}:${j}`] = embed
            } else {
              failedUploads += 1
              attachmentErrors.push(`${name}: ${up.error || '上传失败'}`)
            }
          }
        }

        // Task-level videos/docs stay as work-item attachments.
        for (const att of input.attachments || []) {
          try {
            const data = await readReportAttachmentFile({
              reportKey,
              storedName: att.storedName,
            })
            const up = await uploadYunxiaoWorkitemAttachment(
              yx,
              result.workitemId,
              { name: att.name, mime: att.mime, data },
              fetchImpl,
            )
            if (up.ok) uploaded += 1
            else {
              failedUploads += 1
              attachmentErrors.push(`${att.name}: ${up.error || '上传失败'}`)
            }
          } catch (error: unknown) {
            failedUploads += 1
            attachmentErrors.push(
              `${att.name}: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        }

        // Rewrite description so screenshots render inline under each failed item.
        if (Object.keys(screenshotEmbeds).length) {
          const finalDescription = buildFailFeedbackDescription({
            ...input,
            embedScreenshotDataUrls: false,
            screenshotEmbeds,
          })
          const updated = await updateYunxiaoWorkitem(
            yx,
            result.workitemId,
            { description: finalDescription, formatType: 'MARKDOWN' },
            fetchImpl,
          )
          if (!updated.ok) {
            attachmentErrors.push(`更新描述失败: ${updated.error || '未知错误'}`)
          }
        }

        return {
          ok: true,
          provider: 'yunxiao',
          id: result.workitemId,
          url: result.url,
          raw: result.raw,
          uploadedAttachments: uploaded,
          failedAttachments: failedUploads,
          attachmentErrors: attachmentErrors.length ? attachmentErrors.slice(0, 8) : undefined,
        }
      }
      case 'github':
        return await submitGithub(config.github!, subject, description, fetchImpl)
      case 'gitlab':
        return await submitGitlab(config.gitlab!, subject, description, fetchImpl)
      case 'webhook':
        return await submitWebhook(
          config.webhook!,
          {
            source: 'tracescope',
            subject,
            description,
            repoPath: input.repoPath,
            baseCommit: input.baseCommit,
            headCommit: input.headCommit,
            items: input.items.map((it) => ({
              displayName: it.displayName,
              kind: it.kind,
              risk: it.risk,
              files: it.files,
              testerNote: it.testerNote || '',
              suggestedSteps: it.suggestedSteps,
              screenshots: (it.testerScreenshots || []).map((s) => ({
                id: s.id,
                name: s.name,
                mime: s.mime,
                dataUrl: s.dataUrl,
              })),
            })),
            attachments: (input.attachments || []).map((a) => ({
              id: a.id,
              name: a.name,
              mime: a.mime,
              size: a.size,
              addedAt: a.addedAt,
            })),
          },
          fetchImpl,
        )
      case 'none':
        return { ok: false, provider: 'none', error: '未选择缺陷平台' }
      default: {
        const _exhaustive: never = config.provider
        return { ok: false, provider: 'none', error: `未知平台: ${String(_exhaustive)}` }
      }
    }
  } catch (error: unknown) {
    return {
      ok: false,
      provider: config.provider,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
