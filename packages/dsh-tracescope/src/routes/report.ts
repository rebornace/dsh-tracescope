/**
 * Report routes: load/persist/save/export the hand-test checklist, history
 * management, per-item status patching and task attachments.
 */
import path from 'node:path'
import type { Context } from '../dsh-shims.js'
import { registerRoute } from '../http/route-helpers.js'
import {
  deleteHandtestHistory,
  deleteReportAttachmentFile,
  exportReportMarkdown,
  formatAttachmentSize,
  handtestReportKey,
  loadHandtestHistoryEntry,
  loadHandtestReport,
  listHandtestHistory,
  MAX_ATTACHMENT_UPLOAD_BYTES,
  MAX_REPORT_ATTACHMENTS,
  normalizeReportAttachments,
  patchHandtestItemStatus,
  readReportAttachmentFile,
  reportAttachmentsDir,
  saveHandtestReport,
  saveReportAttachmentBuffer,
  saveReportAttachmentFromLocalPath,
  type ImpactReport,
} from '@rebornace/tracescope-core'

export function registerReportRoutes(ctx: Context) {
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
      const repoPath =
        typeof body.repoPath === 'string'
          ? body.repoPath
          : typeof body.repo === 'string'
            ? body.repo
            : ''
      const limit =
        typeof body.limit === 'number' ? body.limit : Number(body.limit ?? 40)
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
      if (!stored) throw new Error('请先生成手测清单，再上传任务附件')

      if (action === 'list') {
        return {
          attachments: normalizeReportAttachments(stored.report.attachments),
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
        if (target) await deleteReportAttachmentFile(key, target.storedName)
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
}
