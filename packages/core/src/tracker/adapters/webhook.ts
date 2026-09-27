/**
 * Generic Webhook adapter.
 *
 * Posts a structured JSON payload (subject/description plus a normalised view
 * of each failed item and attachment), rather than only the markdown body.
 */
import type { TrackerAdapter } from '../adapter-types.js'
import type { TrackerConfig, TrackerSubmitResult, WebhookTrackerConfig } from '../types.js'

export const webhookTrackerAdapter: TrackerAdapter = {
  id: 'webhook',
  label: '通用 Webhook',

  isReady(config: TrackerConfig): boolean {
    return Boolean(config.webhook?.url?.trim())
  },

  async submit(
    config: TrackerConfig,
    ctx,
    fetchImpl,
  ): Promise<TrackerSubmitResult> {
    const webhook: WebhookTrackerConfig = config.webhook!
    const payload: Record<string, unknown> = {
      source: 'tracescope',
      subject: ctx.subject,
      description: ctx.description,
      repoPath: ctx.repoPath,
      baseCommit: ctx.baseCommit,
      headCommit: ctx.headCommit,
      items: ctx.items.map((it) => ({
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
      attachments: (ctx.attachments || []).map((a) => ({
        id: a.id,
        name: a.name,
        mime: a.mime,
        size: a.size,
        addedAt: a.addedAt,
      })),
    }

    const res = await fetchImpl(webhook.url.trim(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(webhook.headers || {}),
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
  },
}
