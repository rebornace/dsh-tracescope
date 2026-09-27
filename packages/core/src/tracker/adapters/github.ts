/**
 * GitHub Issues adapter.
 */
import type { TrackerAdapter } from '../adapter-types.js'
import type { GithubTrackerConfig, TrackerConfig, TrackerSubmitResult } from '../types.js'

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
    const url = `https://api.github.com/repos/${encodeURIComponent(github.owner.trim())}/${encodeURIComponent(github.repo.trim())}/issues`
    const labels = (github.labels || []).map((l) => l.trim()).filter(Boolean)
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${github.token.trim()}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({
        title: ctx.subject,
        body: ctx.description,
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
  },
}
