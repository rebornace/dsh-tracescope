import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { TrackerConfig, TrackerProvider } from './issue-tracker.js'
import { isTrackerConfigReady } from './issue-tracker.js'
import { normalizeYunxiaoEndpoint, type YunxiaoConfig } from './yunxiao.js'
import { loadYunxiaoConfig } from './yunxiao-store.js'

const MASKED_SECRET = '••••••••'

function tracescopeRoot(cacheRoot?: string): string {
  return cacheRoot ?? path.join(os.homedir(), '.tracescope')
}

function trackerPath(cacheRoot?: string): string {
  return path.join(tracescopeRoot(cacheRoot), 'tracker.json')
}

/** Repo access token, separate from the defect-platform provider switch. */
function codeupAuthPath(cacheRoot?: string): string {
  return path.join(tracescopeRoot(cacheRoot), 'codeup-auth.json')
}

export function isMaskedSecret(value: string | undefined | null): boolean {
  const token = typeof value === 'string' ? value.trim() : ''
  return !token || token === MASKED_SECRET
}

export interface RememberedYunxiaoAccess {
  token: string
  endpoint: string
  organizationId: string
}

async function readCodeupAuthFile(cacheRoot?: string): Promise<RememberedYunxiaoAccess | null> {
  try {
    const raw = JSON.parse(await readFile(codeupAuthPath(cacheRoot), 'utf8')) as Record<string, unknown>
    return {
      token: typeof raw.token === 'string' ? raw.token : '',
      endpoint: normalizeYunxiaoEndpoint(typeof raw.endpoint === 'string' ? raw.endpoint : undefined),
      organizationId: typeof raw.organizationId === 'string' ? raw.organizationId : '',
    }
  } catch {
    return null
  }
}

/**
 * Token used for Codeup git clone and the Codeup OpenAPI fallback.
 * Prefers the dedicated access file, then defect-platform config, then legacy yunxiao.json.
 */
export async function loadRememberedYunxiaoAccess(
  cacheRoot?: string,
): Promise<RememberedYunxiaoAccess> {
  const dedicated = await readCodeupAuthFile(cacheRoot)
  const tracker = await loadTrackerConfig(cacheRoot)
  const legacy = await loadYunxiaoConfig(cacheRoot)
  const token =
    dedicated?.token.trim() || tracker.yunxiao?.token.trim() || legacy?.token.trim() || ''
  return {
    token,
    endpoint: normalizeYunxiaoEndpoint(
      dedicated?.endpoint || tracker.yunxiao?.endpoint || legacy?.endpoint,
    ),
    organizationId:
      dedicated?.organizationId ||
      tracker.yunxiao?.organizationId ||
      legacy?.organizationId ||
      '',
  }
}

/** Remember a Yunxiao personal access token across Desktop restarts. Empty / masked keeps the previous token. */
export async function rememberYunxiaoAccess(
  input: { token?: string; endpoint?: string; organizationId?: string },
  cacheRoot?: string,
): Promise<RememberedYunxiaoAccess> {
  const current = await loadRememberedYunxiaoAccess(cacheRoot)
  const incoming = typeof input.token === 'string' ? input.token.trim() : ''
  const token = incoming && incoming !== MASKED_SECRET ? incoming : current.token
  const endpoint = input.endpoint?.trim()
    ? normalizeYunxiaoEndpoint(input.endpoint)
    : current.endpoint
  const organizationId =
    (typeof input.organizationId === 'string' && input.organizationId.trim()) ||
    current.organizationId
  if (!token) return { token: '', endpoint, organizationId }
  await mkdir(tracescopeRoot(cacheRoot), { recursive: true })
  await writeFile(
    codeupAuthPath(cacheRoot),
    `${JSON.stringify({ token, endpoint, organizationId }, null, 2)}\n`,
    'utf8',
  )
  let trackerOnDisk = false
  try {
    await readFile(trackerPath(cacheRoot), 'utf8')
    trackerOnDisk = true
  } catch {
    trackerOnDisk = false
  }
  if (trackerOnDisk) {
    const tracker = await loadTrackerConfig(cacheRoot)
    if (tracker.provider === 'yunxiao' && tracker.yunxiao) {
      await saveTrackerConfig(
        {
          ...tracker,
          yunxiao: {
            ...tracker.yunxiao,
            token,
            endpoint,
            organizationId: organizationId || tracker.yunxiao.organizationId,
          },
        },
        cacheRoot,
      )
    }
  }
  return { token, endpoint, organizationId }
}

function asProvider(value: unknown): TrackerProvider {
  if (value === 'yunxiao' || value === 'github' || value === 'gitlab' || value === 'webhook') {
    return value
  }
  return 'none'
}

function normalizeTracker(raw: unknown): TrackerConfig {
  if (!raw || typeof raw !== 'object') return { provider: 'none' }
  const o = raw as Record<string, unknown>
  const provider = asProvider(o.provider)
  const yunxiaoRaw = o.yunxiao && typeof o.yunxiao === 'object' ? (o.yunxiao as Record<string, unknown>) : o
  const yunxiao: YunxiaoConfig | undefined =
    provider === 'yunxiao' || o.yunxiao
      ? {
          endpoint: normalizeYunxiaoEndpoint(
            typeof yunxiaoRaw.endpoint === 'string' ? yunxiaoRaw.endpoint : undefined,
          ),
          token: typeof yunxiaoRaw.token === 'string' ? yunxiaoRaw.token : '',
          organizationId:
            typeof yunxiaoRaw.organizationId === 'string' ? yunxiaoRaw.organizationId : '',
          spaceId:
            typeof yunxiaoRaw.spaceId === 'string'
              ? yunxiaoRaw.spaceId
              : typeof yunxiaoRaw.spaceIdentifier === 'string'
                ? yunxiaoRaw.spaceIdentifier
                : '',
          workitemTypeId:
            typeof yunxiaoRaw.workitemTypeId === 'string'
              ? yunxiaoRaw.workitemTypeId
              : typeof yunxiaoRaw.workitemTypeIdentifier === 'string'
                ? yunxiaoRaw.workitemTypeIdentifier
                : '',
          assignedTo: typeof yunxiaoRaw.assignedTo === 'string' ? yunxiaoRaw.assignedTo : '',
        }
      : undefined

  const github =
    o.github && typeof o.github === 'object'
      ? (() => {
          const g = o.github as Record<string, unknown>
          return {
            token: typeof g.token === 'string' ? g.token : '',
            owner: typeof g.owner === 'string' ? g.owner : '',
            repo: typeof g.repo === 'string' ? g.repo : '',
            labels: Array.isArray(g.labels)
              ? g.labels.map(String)
              : typeof g.labels === 'string'
                ? g.labels.split(',').map((s) => s.trim()).filter(Boolean)
                : [],
          }
        })()
      : undefined

  const gitlab =
    o.gitlab && typeof o.gitlab === 'object'
      ? (() => {
          const g = o.gitlab as Record<string, unknown>
          return {
            host: typeof g.host === 'string' ? g.host : 'https://gitlab.com',
            token: typeof g.token === 'string' ? g.token : '',
            projectId: typeof g.projectId === 'string' ? g.projectId : '',
            labels: Array.isArray(g.labels)
              ? g.labels.map(String)
              : typeof g.labels === 'string'
                ? g.labels.split(',').map((s) => s.trim()).filter(Boolean)
                : [],
          }
        })()
      : undefined

  const webhook =
    o.webhook && typeof o.webhook === 'object'
      ? (() => {
          const w = o.webhook as Record<string, unknown>
          const headers =
            w.headers && typeof w.headers === 'object' && !Array.isArray(w.headers)
              ? Object.fromEntries(
                  Object.entries(w.headers as Record<string, unknown>).map(([k, v]) => [
                    k,
                    String(v),
                  ]),
                )
              : undefined
          return {
            url: typeof w.url === 'string' ? w.url : '',
            headers,
          }
        })()
      : undefined

  return { provider, yunxiao, github, gitlab, webhook }
}

export async function loadTrackerConfig(cacheRoot?: string): Promise<TrackerConfig> {
  try {
    const raw = JSON.parse(await readFile(trackerPath(cacheRoot), 'utf8'))
    return normalizeTracker(raw)
  } catch {
    // Migrate legacy ~/.tracescope/yunxiao.json
    const legacy = await loadYunxiaoConfig(cacheRoot)
    if (legacy && legacy.token) {
      return { provider: 'yunxiao', yunxiao: legacy }
    }
    return { provider: 'none' }
  }
}

export async function saveTrackerConfig(
  config: TrackerConfig | null | undefined,
  cacheRoot?: string,
): Promise<void> {
  const file = trackerPath(cacheRoot)
  if (!config || config.provider === 'none') {
    try {
      await unlink(file)
    } catch {
      /* ignore */
    }
    return
  }
  const normalized = normalizeTracker(config)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
}

function maskToken(token: string): string {
  return token.trim() ? MASKED_SECRET : ''
}

/** Public config for UI (secrets masked). */
export function publicTrackerConfig(config: TrackerConfig | null | undefined): {
  provider: TrackerProvider
  ready: boolean
  yunxiao?: Omit<YunxiaoConfig, 'token'> & { token: string; hasToken: boolean }
  github?: { token: string; hasToken: boolean; owner: string; repo: string; labels: string[] }
  gitlab?: {
    token: string
    hasToken: boolean
    host: string
    projectId: string
    labels: string[]
  }
  webhook?: { url: string; hasHeaders: boolean }
} {
  const cfg = config || { provider: 'none' as const }
  const ready = isTrackerConfigReady(cfg)
  return {
    provider: cfg.provider,
    ready,
    yunxiao: cfg.yunxiao
      ? {
          ...cfg.yunxiao,
          token: maskToken(cfg.yunxiao.token),
          hasToken: Boolean(cfg.yunxiao.token.trim()),
        }
      : undefined,
    github: cfg.github
      ? {
          token: maskToken(cfg.github.token),
          hasToken: Boolean(cfg.github.token.trim()),
          owner: cfg.github.owner,
          repo: cfg.github.repo,
          labels: cfg.github.labels || [],
        }
      : undefined,
    gitlab: cfg.gitlab
      ? {
          token: maskToken(cfg.gitlab.token),
          hasToken: Boolean(cfg.gitlab.token.trim()),
          host: cfg.gitlab.host,
          projectId: cfg.gitlab.projectId,
          labels: cfg.gitlab.labels || [],
        }
      : undefined,
    webhook: cfg.webhook
      ? { url: cfg.webhook.url, hasHeaders: Boolean(cfg.webhook.headers && Object.keys(cfg.webhook.headers).length) }
      : undefined,
  }
}
