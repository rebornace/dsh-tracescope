/**
 * Thin GitHub REST + user-attachment helpers for the Issues tracker adapter.
 *
 * Screenshot hosting uses the same uploads.github.com endpoint as `gh --attach`
 * (not a public REST route). Requires write access on the target repository.
 */

export interface GithubRepoRef {
  owner: string
  repo: string
  token: string
}

const GITHUB_USER_AGENT = 'dsh-tracescope (https://github.com/rebornace/dsh-tracescope)'

/** GitHub REST accepts Bearer; uploads.github.com matches `gh --attach` with `token`. */
export function githubAuthHeader(token: string): string {
  const raw = token.trim()
  if (/^(bearer|token)\s+/i.test(raw)) return raw
  return `token ${raw}`
}

export function githubApiHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
  return {
    accept: 'application/vnd.github+json',
    authorization: githubAuthHeader(token),
    'user-agent': GITHUB_USER_AGENT,
    'x-github-api-version': '2022-11-28',
    ...extra,
  }
}

function githubErrorMessage(raw: unknown, status: number, fallbackPrefix: string): string {
  if (raw && typeof raw === 'object' && 'message' in raw) {
    const msg = String((raw as { message?: string }).message || '').trim()
    const extra = (raw as { errors?: Array<{ message?: string }> }).errors
    const detail = Array.isArray(extra)
      ? extra.map((e) => e?.message).filter(Boolean).join('; ')
      : ''
    if (msg) return detail ? `${msg}: ${detail}` : msg
  }
  return `${fallbackPrefix} HTTP ${status}`
}

async function readGithubJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { message: text.slice(0, 240) }
  }
}

export function githubRepoApiBase(owner: string, repo: string): string {
  return `https://api.github.com/repos/${encodeURIComponent(owner.trim())}/${encodeURIComponent(repo.trim())}`
}

/** MIME types accepted by GitHub user-attachments (images + common video). */
const ATTACHABLE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
])

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
}

export function resolveGithubAttachMime(name: string, mime?: string): string | null {
  const raw = (mime || '').trim().toLowerCase()
  if (raw && ATTACHABLE_MIME.has(raw === 'image/jpg' ? 'image/jpeg' : raw)) {
    return raw === 'image/jpg' ? 'image/jpeg' : raw
  }
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return EXT_TO_MIME[ext] || null
}

export function isGithubVideoMime(mime: string): boolean {
  return mime.startsWith('video/')
}

export async function fetchGithubRepositoryId(
  ref: GithubRepoRef,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; id: number; raw: unknown } | { ok: false; error: string; raw?: unknown }> {
  const url = githubRepoApiBase(ref.owner, ref.repo)
  const res = await fetchImpl(url, {
    method: 'GET',
    headers: githubApiHeaders(ref.token),
  })
  const raw = await readGithubJson(res)
  if (!res.ok) {
    return { ok: false, error: githubErrorMessage(raw, res.status, 'GitHub'), raw }
  }
  const id = (raw as { id?: number })?.id
  if (typeof id !== 'number' || !Number.isFinite(id)) {
    return { ok: false, error: 'GitHub repository id missing', raw }
  }
  return { ok: true, id, raw }
}

export async function createGithubIssue(
  ref: GithubRepoRef,
  input: { title: string; body: string; labels?: string[] },
  fetchImpl: typeof fetch = fetch,
): Promise<
  | { ok: true; number: number; url?: string; id?: number; raw: unknown }
  | { ok: false; error: string; raw?: unknown }
> {
  const url = `${githubRepoApiBase(ref.owner, ref.repo)}/issues`
  const labels = (input.labels || []).map((l) => l.trim()).filter(Boolean)
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: githubApiHeaders(ref.token, {
      'content-type': 'application/json; charset=utf-8',
    }),
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      labels: labels.length ? labels : undefined,
    }),
  })
  const raw = await readGithubJson(res)
  if (!res.ok) {
    return { ok: false, error: githubErrorMessage(raw, res.status, 'GitHub'), raw }
  }
  const obj = raw as { number?: number; html_url?: string; id?: number }
  if (obj.number == null) {
    return { ok: false, error: 'GitHub issue number missing', raw }
  }
  return {
    ok: true,
    number: obj.number,
    url: obj.html_url,
    id: obj.id,
    raw,
  }
}

export async function updateGithubIssueBody(
  ref: GithubRepoRef,
  issueNumber: number,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; raw: unknown } | { ok: false; error: string; raw?: unknown }> {
  const url = `${githubRepoApiBase(ref.owner, ref.repo)}/issues/${issueNumber}`
  const res = await fetchImpl(url, {
    method: 'PATCH',
    headers: githubApiHeaders(ref.token, {
      'content-type': 'application/json; charset=utf-8',
    }),
    body: JSON.stringify({ body }),
  })
  const raw = await readGithubJson(res)
  if (!res.ok) {
    return { ok: false, error: githubErrorMessage(raw, res.status, 'GitHub'), raw }
  }
  return { ok: true, raw }
}

/**
 * Upload an image/video to GitHub user-attachments (same path as `gh --attach`).
 * Returns a stable `https://github.com/user-attachments/assets/...` URL.
 */
export async function uploadGithubUserAttachment(
  input: {
    token: string
    repositoryId: number
    name: string
    mime: string
    data: Buffer
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; url: string; raw: unknown } | { ok: false; error: string; raw?: unknown }> {
  const qs = new URLSearchParams({
    name: input.name,
    content_type: input.mime,
    repository_id: String(input.repositoryId),
  })
  const url = `https://uploads.github.com/user-attachments/assets?${qs.toString()}`
  const bytes = Uint8Array.from(input.data)
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: githubAuthHeader(input.token),
      'user-agent': GITHUB_USER_AGENT,
      'content-type': input.mime,
    },
    body: bytes,
  })
  const raw = await readGithubJson(res)
  if (!res.ok) {
    return { ok: false, error: githubErrorMessage(raw, res.status, 'GitHub upload'), raw }
  }
  const assetUrl =
    raw && typeof raw === 'object' && 'url' in raw
      ? String((raw as { url?: string }).url || '').trim()
      : ''
  if (!assetUrl) {
    return { ok: false, error: 'GitHub upload returned no asset URL', raw }
  }
  return { ok: true, url: assetUrl, raw }
}

/**
 * Fallback when user-attachments is unavailable (fine-grained PAT / GHES).
 * Commits the file under `.tracescope/issues/{issueNumber}/` and returns a raw URL.
 */
export async function uploadGithubRepoContent(
  ref: GithubRepoRef,
  input: { issueNumber: number; name: string; data: Buffer },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; url: string; raw: unknown } | { ok: false; error: string; raw?: unknown }> {
  const safeName = input.name.replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'screenshot.jpg'
  const path = `.tracescope/issues/${input.issueNumber}/${safeName}`
  const url = `${githubRepoApiBase(ref.owner, ref.repo)}/contents/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
  const res = await fetchImpl(url, {
    method: 'PUT',
    headers: githubApiHeaders(ref.token, {
      'content-type': 'application/json; charset=utf-8',
    }),
    body: JSON.stringify({
      message: `TraceScope screenshot for issue #${input.issueNumber}`,
      content: input.data.toString('base64'),
    }),
  })
  const raw = await readGithubJson(res)
  if (!res.ok) {
    return { ok: false, error: githubErrorMessage(raw, res.status, 'GitHub contents'), raw }
  }
  const content = raw as {
    content?: { download_url?: string; html_url?: string; sha?: string }
    commit?: { sha?: string }
  }
  const download =
    content.content?.download_url?.trim() ||
    (content.commit?.sha
      ? `https://github.com/${ref.owner}/${ref.repo}/raw/${content.commit.sha}/${path}`
      : '')
  if (!download) {
    return { ok: false, error: 'GitHub contents upload returned no file URL', raw }
  }
  return { ok: true, url: download, raw }
}

/** Build markdown that GitHub renders inline (image) or as a player (video). */
export function githubAttachmentMarkdown(name: string, assetUrl: string, mime: string): string {
  if (isGithubVideoMime(mime)) {
    return assetUrl
  }
  const alt = name.replace(/[[\]]/g, '') || 'screenshot'
  return `![${alt}](${assetUrl})`
}
