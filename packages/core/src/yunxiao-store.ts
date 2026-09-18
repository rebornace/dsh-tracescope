import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { YunxiaoConfig } from './yunxiao.js'
import { normalizeYunxiaoEndpoint } from './yunxiao.js'

function configPath(cacheRoot?: string): string {
  const root = cacheRoot ?? path.join(os.homedir(), '.tracescope')
  return path.join(root, 'yunxiao.json')
}

function normalizeConfig(raw: unknown): YunxiaoConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  return {
    endpoint: normalizeYunxiaoEndpoint(typeof o.endpoint === 'string' ? o.endpoint : undefined),
    token: typeof o.token === 'string' ? o.token : '',
    organizationId: typeof o.organizationId === 'string' ? o.organizationId : '',
    spaceId: typeof o.spaceId === 'string' ? o.spaceId : typeof o.spaceIdentifier === 'string' ? o.spaceIdentifier : '',
    workitemTypeId:
      typeof o.workitemTypeId === 'string'
        ? o.workitemTypeId
        : typeof o.workitemTypeIdentifier === 'string'
          ? o.workitemTypeIdentifier
          : '',
    assignedTo: typeof o.assignedTo === 'string' ? o.assignedTo : '',
  }
}

export async function loadYunxiaoConfig(cacheRoot?: string): Promise<YunxiaoConfig | null> {
  try {
    const raw = JSON.parse(await readFile(configPath(cacheRoot), 'utf8'))
    return normalizeConfig(raw)
  } catch {
    return null
  }
}

export async function saveYunxiaoConfig(
  config: YunxiaoConfig | null | undefined,
  cacheRoot?: string,
): Promise<void> {
  const file = configPath(cacheRoot)
  if (!config) {
    try {
      await unlink(file)
    } catch {
      /* ignore */
    }
    return
  }
  const normalized = normalizeConfig(config)
  if (!normalized) return
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
}

/** Return config safe for the UI (token masked unless includeSecret). */
export function publicYunxiaoConfig(
  config: YunxiaoConfig | null,
  options?: { includeSecret?: boolean },
): (Omit<YunxiaoConfig, 'token'> & { token: string; hasToken: boolean }) | null {
  if (!config) return null
  const hasToken = Boolean(config.token.trim())
  return {
    ...config,
    token: options?.includeSecret ? config.token : hasToken ? '••••••••' : '',
    hasToken,
  }
}
