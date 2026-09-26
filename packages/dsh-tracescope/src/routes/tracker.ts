/**
 * Tracker routes: read/save the issue-tracker (collaboration) configuration and
 * submit failed items.
 */
import type { Context } from '../dsh-shims.js'
import { registerRoute } from '../http/route-helpers.js'
import {
  collectFailedItems,
  isMaskedSecret,
  isTrackerConfigReady,
  loadTrackerConfig,
  publicTrackerConfig,
  rememberYunxiaoAccess,
  saveTrackerConfig,
  submitFailFeedback,
  type ImpactReport,
  type TrackerConfig,
  type TrackerProvider,
} from '@rebornace/tracescope-core'

export function registerTrackerRoutes(ctx: Context) {
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
}
