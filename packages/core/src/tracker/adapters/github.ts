/**
 * GitHub Issues adapter.
 *
 * Mirrors the Yunxiao flow: create an issue without giant data-URL images,
 * upload screenshots (and attachable task media) via uploads.github.com
 * user-attachments, then PATCH the issue body so images render inline.
 *
 * Upload requires write access on the repository (same as `gh issue create --attach`).
 */
import { readReportAttachmentFile } from '../../attachments.js'
import { handtestReportKey } from '../../report-store.js'
import type { TrackerAdapter } from '../adapter-types.js'
import type { GithubTrackerConfig, TrackerConfig, TrackerSubmitResult } from '../types.js'
import { buildTrackerFeedbackDescription } from '../build-description.js'
import {
  bufferFromDataUrl,
  normalizeFeedbackLang,
  safeAttachLabel,
  type FeedbackLang,
} from '../feedback.js'
import {
  createGithubIssue,
  fetchGithubRepositoryId,
  githubAttachmentMarkdown,
  resolveGithubAttachMime,
  updateGithubIssueBody,
  uploadGithubRepoContent,
  uploadGithubUserAttachment,
} from './github-api.js'

function zh(en: string, zhText: string, lang: FeedbackLang): string {
  return lang === 'en' ? en : zhText
}

export const githubTrackerAdapter: TrackerAdapter = {
  id: 'github',
  label: 'GitHub Issues',

  isReady(config: TrackerConfig): boolean {
    const g = config.github
    return Boolean(g?.token?.trim() && g.owner?.trim() && g.repo?.trim())
  },

  async submit(
    config: TrackerConfig,
    ctx,
    fetchImpl,
  ): Promise<TrackerSubmitResult> {
    const github: GithubTrackerConfig = config.github!
    const ref = {
      owner: github.owner.trim(),
      repo: github.repo.trim(),
      token: github.token.trim(),
    }
    const lang = normalizeFeedbackLang(ctx.lang)
    const parseShotErr = zh(
      'could not parse screenshot data',
      '\u65e0\u6cd5\u89e3\u6790\u622a\u56fe\u6570\u636e',
      lang,
    )
    const uploadFail = zh('upload failed', '\u4e0a\u4f20\u5931\u8d25', lang)
    const unsupportedType = zh(
      'file type not supported by GitHub attachments',
      '\u6587\u4ef6\u7c7b\u578b\u4e0d\u5728 GitHub \u9644\u4ef6\u652f\u6301\u8303\u56f4\u5185',
      lang,
    )
    const updateDescFail = zh(
      'failed to update issue body',
      '\u66f4\u65b0 Issue \u6b63\u6587\u5931\u8d25',
      lang,
    )
    const unknownErr = zh('unknown error', '\u672a\u77e5\u9519\u8bef', lang)
    const repoIdFail = zh(
      'could not resolve repository id (check token and write access)',
      '\u65e0\u6cd5\u89e3\u6790\u4ed3\u5e93 ID\uff08\u8bf7\u68c0\u67e5\u4ee4\u724c\u4e0e\u5199\u5165\u6743\u9650\uff09',
      lang,
    )

    const createDescription = buildTrackerFeedbackDescription({
      kind: ctx.feedbackKind,
      repoPath: ctx.repoPath,
      baseCommit: ctx.baseCommit,
      headCommit: ctx.headCommit,
      items: ctx.items,
      attachments: ctx.attachments,
      embedScreenshotDataUrls: false,
      lang,
      visualMeta: ctx.visualMeta,
    })

    const created = await createGithubIssue(
      ref,
      {
        title: ctx.subject,
        body: createDescription,
        labels: github.labels,
      },
      fetchImpl,
    )
    if (!created.ok) {
      return { ok: false, provider: 'github', error: created.error, raw: created.raw }
    }

    let uploaded = 0
    let failedUploads = 0
    const attachmentErrors: string[] = []
    const screenshotEmbeds: Record<string, string> = {}
    const taskEmbedLines: string[] = []
    const reportKey = handtestReportKey(ctx.repoPath, ctx.baseCommit, ctx.headCommit)

    const hasShots = ctx.items.some((it) => (it.testerScreenshots || []).length > 0)
    const hasTaskAtt = (ctx.attachments || []).length > 0
    let repositoryId: number | null = null

    if (hasShots || hasTaskAtt) {
      const repoInfo = await fetchGithubRepositoryId(ref, fetchImpl)
      if (repoInfo.ok) repositoryId = repoInfo.id
      else attachmentErrors.push(`${repoIdFail}: ${repoInfo.error}`)
    }

    const uploadBytes = async (
      name: string,
      mime: string,
      data: Buffer,
    ): Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
      if (repositoryId != null) {
        const up = await uploadGithubUserAttachment(
          { token: ref.token, repositoryId, name, mime, data },
          fetchImpl,
        )
        if (up.ok) return { ok: true, url: up.url }
        const fallback = await uploadGithubRepoContent(
          ref,
          { issueNumber: created.number, name, data },
          fetchImpl,
        )
        if (fallback.ok) return { ok: true, url: fallback.url }
        return {
          ok: false,
          error: `${up.error || uploadFail}; ${fallback.error || uploadFail}`,
        }
      }
      const fallback = await uploadGithubRepoContent(
        ref,
        { issueNumber: created.number, name, data },
        fetchImpl,
      )
      if (fallback.ok) return { ok: true, url: fallback.url }
      return { ok: false, error: fallback.error || uploadFail }
    }

    if (hasShots || hasTaskAtt) {
      for (let i = 0; i < ctx.items.length; i++) {
        const item = ctx.items[i]!
        const shots = item.testerScreenshots || []
        for (let j = 0; j < shots.length; j++) {
          const shot = shots[j]!
          const buf = bufferFromDataUrl(shot.dataUrl)
          if (!buf) {
            failedUploads += 1
            attachmentErrors.push(`${shot.name}: ${parseShotErr}`)
            continue
          }
          const name = safeAttachLabel(shot.name) || `screenshot-${i + 1}-${j + 1}.jpg`
          const mime = resolveGithubAttachMime(name, shot.mime)
          if (!mime) {
            failedUploads += 1
            attachmentErrors.push(`${name}: ${unsupportedType}`)
            continue
          }
          const up = await uploadBytes(name, mime, buf)
          if (up.ok) {
            uploaded += 1
            screenshotEmbeds[`${i}:${j}`] = githubAttachmentMarkdown(
              shot.name || name,
              up.url,
              mime,
            )
          } else {
            failedUploads += 1
            attachmentErrors.push(`${name}: ${up.error}`)
          }
        }
      }

      for (const att of ctx.attachments || []) {
        const mime = resolveGithubAttachMime(att.name, att.mime)
        if (!mime) {
          failedUploads += 1
          attachmentErrors.push(`${att.name}: ${unsupportedType}`)
          continue
        }
        try {
          const data = await readReportAttachmentFile({
            reportKey,
            storedName: att.storedName,
          })
          const name = safeAttachLabel(att.name) || 'attachment'
          const up = await uploadBytes(name, mime, data)
          if (up.ok) {
            uploaded += 1
            taskEmbedLines.push(
              githubAttachmentMarkdown(att.name || name, up.url, mime),
            )
          } else {
            failedUploads += 1
            attachmentErrors.push(`${att.name}: ${up.error}`)
          }
        } catch (error: unknown) {
          failedUploads += 1
          attachmentErrors.push(
            `${att.name}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    if (Object.keys(screenshotEmbeds).length || taskEmbedLines.length) {
      let finalDescription = buildTrackerFeedbackDescription({
        kind: ctx.feedbackKind,
        repoPath: ctx.repoPath,
        baseCommit: ctx.baseCommit,
        headCommit: ctx.headCommit,
        items: ctx.items,
        attachments: ctx.attachments,
        embedScreenshotDataUrls: false,
        screenshotEmbeds,
        lang,
        visualMeta: ctx.visualMeta,
      })
      if (taskEmbedLines.length) {
        const heading =
          lang === 'en' ? '### Uploaded attachments' : '### \u5df2\u4e0a\u4f20\u9644\u4ef6'
        finalDescription = `${finalDescription}\n\n${heading}\n\n${taskEmbedLines
          .map((line) => `- ${line}`)
          .join('\n')}\n`
      }
      const updated = await updateGithubIssueBody(
        ref,
        created.number,
        finalDescription,
        fetchImpl,
      )
      if (!updated.ok) {
        attachmentErrors.push(`${updateDescFail}: ${updated.error || unknownErr}`)
      }
    }

    return {
      ok: true,
      provider: 'github',
      id: String(created.number),
      url: created.url,
      raw: created.raw,
      uploadedAttachments: uploaded,
      failedAttachments: failedUploads,
      attachmentErrors: attachmentErrors.length ? attachmentErrors.slice(0, 8) : undefined,
    }
  },
}
