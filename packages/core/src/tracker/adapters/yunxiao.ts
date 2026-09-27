/**
 * 阿里云效 (Yunxiao) work-item adapter.
 *
 * Creates a work item without embedded data-URL images, uploads screenshots as
 * real attachments to obtain permanent embed URLs, uploads task-level
 * videos/docs, then rewrites the description so screenshots render inline.
 */
import { readReportAttachmentFile } from '../../attachments.js'
import { handtestReportKey } from '../../report-store.js'
import {
  createYunxiaoWorkitem,
  filenameEmbedMarkdown,
  isYunxiaoConfigReady,
  normalizeYunxiaoEndpoint,
  updateYunxiaoWorkitem,
  uploadYunxiaoWorkitemAttachment,
  type YunxiaoConfig,
} from '../../yunxiao.js'
import type { TrackerAdapter } from '../adapter-types.js'
import type { TrackerConfig, TrackerSubmitResult } from '../types.js'
import {
  bufferFromDataUrl,
  buildFailFeedbackDescription,
  safeAttachLabel,
} from '../feedback.js'

export const yunxiaoTrackerAdapter: TrackerAdapter = {
  id: 'yunxiao',
  label: '阿里云效',

  isReady(config: TrackerConfig): boolean {
    return isYunxiaoConfigReady(config.yunxiao)
  },

  async submit(
    config: TrackerConfig,
    ctx,
    fetchImpl,
  ): Promise<TrackerSubmitResult> {
    const yx: YunxiaoConfig = {
      ...config.yunxiao!,
      endpoint: normalizeYunxiaoEndpoint(config.yunxiao?.endpoint),
    }
    const { subject } = ctx
    // Create without giant data-URL images; upload real files as workitem attachments.
    const createDescription = buildFailFeedbackDescription({
      repoPath: ctx.repoPath,
      baseCommit: ctx.baseCommit,
      headCommit: ctx.headCommit,
      items: ctx.items,
      attachments: ctx.attachments,
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
    const reportKey = handtestReportKey(ctx.repoPath, ctx.baseCommit, ctx.headCommit)

    // Screenshots: upload only to obtain permanent embedUrl, then show under each item in详情.
    for (let i = 0; i < ctx.items.length; i++) {
      const item = ctx.items[i]!
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
    for (const att of ctx.attachments || []) {
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
        repoPath: ctx.repoPath,
        baseCommit: ctx.baseCommit,
        headCommit: ctx.headCommit,
        items: ctx.items,
        attachments: ctx.attachments,
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
  },
}
