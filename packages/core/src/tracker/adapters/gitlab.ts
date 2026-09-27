/**
 * GitLab Issues adapter.
 */
import type { TrackerAdapter } from '../adapter-types.js'
import type { GitlabTrackerConfig, TrackerConfig, TrackerSubmitResult } from '../types.js'

export const gitlabTrackerAdapter: TrackerAdapter = {
  id: 'gitlab',
  label: 'GitLab Issues',

  isReady(config: TrackerConfig): boolean {
    const g = config.gitlab
    return Boolean(g?.token?.trim() && g.host?.trim() && g.projectId?.trim())
  },

  async submit(
    config: TrackerConfig,
    ctx,
    fetchImpl,
  ): Promise<TrackerSubmitResult> {
    const gitlab: GitlabTrackerConfig = config.gitlab!
    const host = gitlab.host.trim().replace(/\/+$/, '') || 'https://gitlab.com'
    const project = encodeURIComponent(gitlab.projectId.trim())
    const url = `${host}/api/v4/projects/${project}/issues`
    const labels = (gitlab.labels || []).map((l) => l.trim()).filter(Boolean)
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'PRIVATE-TOKEN': gitlab.token.trim(),
      },
      body: JSON.stringify({
        title: ctx.subject,
        description: ctx.description,
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
  },
}
