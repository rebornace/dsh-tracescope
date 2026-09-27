/**
 * Shared feedback construction for every tracker adapter.
 *
 * Platform adapters only speak HTTP; how a batch of failed verification items
 * is rendered into a subject / markdown body lives here so the wording and the
 * oversized-body guard stay consistent across providers.
 */
import type { ReportAttachment, ScopeItem } from '../types.js'

export function bufferFromDataUrl(dataUrl: string): Buffer | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim())
  if (!m) return null
  try {
    return Buffer.from(m[2]!, 'base64')
  } catch {
    return null
  }
}

export function safeAttachLabel(name: string): string {
  return (name || 'file').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').slice(0, 60)
}

/** Build markdown body for a batch of failed verification items. */
export function buildFailFeedbackDescription(input: {
  repoPath: string
  baseCommit: string
  headCommit: string
  items: ScopeItem[]
  attachments?: ReportAttachment[]
  /**
   * When true (default), embed screenshot data-URLs under each item.
   * Set false for Yunxiao create body  images are uploaded as real attachments instead.
   */
  embedScreenshotDataUrls?: boolean
  /** Optional Yunxiao embed markdown keyed by `itemIndex:shotIndex`. */
  screenshotEmbeds?: Record<string, string>
}): string {
  const embedDataUrls = input.embedScreenshotDataUrls !== false
  const lines = [
    '## TraceScope ØôŒÁ1%Íˆ',
    '',
    `- Ó“\`${input.repoPath}\``,
    `- 3šH,\`${input.baseCommit}\``,
    `- …KH,\`${input.headCommit}\``,
    `- 1%aî${input.items.length}`,
    '',
  ]
  const taskAttachments = input.attachments || []
  if (taskAttachments.length) {
    lines.push('### û¡Dö', '')
    taskAttachments.forEach((a, i) => {
      const sizeLabel =
        a.size >= 1024 * 1024
          ? `${(a.size / 1024 / 1024).toFixed(1)} MB`
          : `${Math.max(1, Math.round(a.size / 1024))} KB`
      lines.push(`${i + 1}. ${a.name}${a.mime || 'file'} · ${sizeLabel}	`)
    })
    lines.push('')
  }
  input.items.forEach((item, i) => {
    lines.push(`### ${i + 1}. ${item.displayName}`)
    lines.push('')
    lines.push(`- {‹${item.kind === 'direct' ? 'ô¥Øô' : 'ïýâÊ'}`)
    lines.push(`- Îi${item.risk}`)
    if (item.files?.length) {
      lines.push(`- ‡ö${item.files.map((f) => `\`${f}\``).join(', ')}`)
    }
    lines.push(`- ŒÁè${item.testerNote?.trim() || '*k™	'}`)
    const shots = item.testerScreenshots || []
    if (shots.length) {
      lines.push(`- *þ${shots.length}	`)
      shots.forEach((s, idx) => {
        const embedKey = `${i}:${idx}`
        const yunxiaoEmbed = input.screenshotEmbeds?.[embedKey]
        if (yunxiaoEmbed) {
          // Already `![filename](embedUrl)`  show directly under this item.
          lines.push(`  ${yunxiaoEmbed}`)
        } else if (embedDataUrls) {
          lines.push(`  ![${s.name}](${s.dataUrl})`)
        } else {
          lines.push(`  ${s.name}`)
        }
      })
    }
    if (item.suggestedSteps?.length) {
      lines.push('- ú®ŒÁ')
      item.suggestedSteps.forEach((s, idx) => lines.push(`  ${idx + 1}. ${s}`))
    }
    lines.push('')
  })
  lines.push('---')
  lines.push('_1 TraceScope ê¨Ð¤_')
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

export function buildFailFeedbackSubject(items: ScopeItem[], repoLabel?: string): string {
  const prefix = repoLabel ? `[TraceScope][${repoLabel}] ` : '[TraceScope] '
  if (items.length === 1) {
    return `${prefix}ŒÁ1%${items[0]!.displayName}`.slice(0, 120)
  }
  return `${prefix}ŒÁ1% ${items.length} y`.slice(0, 120)
}
