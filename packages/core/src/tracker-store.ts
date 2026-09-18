import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { TrackerConfig, TrackerProvider } from './issue-tracker.js'
import { isTrackerConfigReady } from './issue-tracker.js'
import { normalizeYunxiaoEndpoint, type YunxiaoConfig } from './yunxiao.js'
import { loadYunxiaoConfig } from './yunxiao-store.js'

function trackerPath(cacheRoot?: string): string {
  const root = cacheRoot ?? path.join(os.homedir(), '.tracescope')
  return path.join(root, 'tracker.json')
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
  return token.trim() ? '••••••••' : ''
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
