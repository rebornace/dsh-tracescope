/**
 * Local crash provider — multi-incident inbox on disk (test-time capture / import).
 * Legacy single `stackText` in config still surfaces as one synthetic row when inbox is empty.
 */
import {
  getInboxIncident,
  listInboxIncidents,
} from '../inbox-store.js'
import type { CrashProvider } from '../provider-types.js'
import type { CrashIncident, CrashListQuery, CrashProviderConfig } from '../types.js'
import { incidentToListSummary, resolveCrashListPage } from '../list-query.js'

/** Legacy single-paste incident id (pre-inbox). */
export const LOCAL_CRASH_INCIDENT_ID = 'local'

function resolveTitle(config: CrashProviderConfig, stackText: string): string {
  const custom = config.title?.trim()
  if (custom) return custom
  const firstLine = stackText.split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (firstLine) return firstLine
  return 'Pasted stack trace'
}

function buildLegacyIncident(config: CrashProviderConfig): CrashIncident | null {
  const stackText = config.stackText?.trim() ?? ''
  if (!stackText) return null
  return {
    id: LOCAL_CRASH_INCIDENT_ID,
    provider: 'local',
    title: resolveTitle(config, stackText),
    stackText,
    errorKind: 'crash',
    status: 'open',
  }
}

function repoOf(config: CrashProviderConfig): string {
  return typeof config.repoPath === 'string' ? config.repoPath.trim() : ''
}

export const localCrashProvider: CrashProvider = {
  id: 'local',

  isReady(config: CrashProviderConfig): boolean {
    if (config.provider !== 'local') return false
    // Inbox mode: any repo scope is ready (list may be empty).
    if (repoOf(config)) return true
    return Boolean(config.stackText?.trim())
  },

  async list(config: CrashProviderConfig, query?: CrashListQuery) {
    if (config.provider !== 'local') {
      return { items: [], page: 1, pageSize: 1, total: 0, hasMore: false }
    }
    const repo = repoOf(config)
    if (repo) {
      const page = await listInboxIncidents(repo, query, config.cacheRoot)
      if (page.total && page.total > 0) return page
      // Fall through to legacy paste when inbox empty but stackText present.
    }
    const legacy = buildLegacyIncident(config)
    if (!legacy) {
      const { page, pageSize } = resolveCrashListPage(query)
      return { items: [], page, pageSize, total: 0, hasMore: false }
    }
    const { page, pageSize } = resolveCrashListPage(query)
    return {
      items: [incidentToListSummary(legacy)],
      page,
      pageSize,
      total: 1,
      hasMore: false,
    }
  },

  async get(config: CrashProviderConfig, id: string): Promise<CrashIncident> {
    if (config.provider !== 'local') {
      throw new Error('Local crash provider requires provider: local')
    }
    const needle = id.trim()
    const repo = repoOf(config)
    if (repo && needle && needle !== LOCAL_CRASH_INCIDENT_ID) {
      const fromInbox = await getInboxIncident(repo, needle, config.cacheRoot)
      if (fromInbox) return fromInbox
      throw new Error(`Unknown local crash incident: ${needle}`)
    }
    if (needle === LOCAL_CRASH_INCIDENT_ID || (!needle && config.stackText?.trim())) {
      const legacy = buildLegacyIncident(config)
      if (legacy) return legacy
    }
    if (repo && needle === LOCAL_CRASH_INCIDENT_ID) {
      const fromInbox = await getInboxIncident(repo, needle, config.cacheRoot)
      if (fromInbox) return fromInbox
    }
    throw new Error(
      config.stackText?.trim()
        ? `Unknown local crash incident: ${needle || LOCAL_CRASH_INCIDENT_ID}`
        : 'Local crash inbox is empty — capture from a device or import a stack file',
    )
  },

  capabilities() {
    return { filters: ['keyword', 'errorKind', 'timeRange'], supportsDetail: true }
  },
}
