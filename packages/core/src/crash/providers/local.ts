/**
 * Local crash provider — analyze a pasted stack trace without remote APIs.
 */
import type { CrashProvider } from '../provider-types.js'
import type { CrashIncident, CrashProviderConfig } from '../types.js'

export const LOCAL_CRASH_INCIDENT_ID = 'local'

function resolveTitle(config: CrashProviderConfig, stackText: string): string {
  const custom = config.title?.trim()
  if (custom) return custom
  const firstLine = stackText.split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (firstLine) return firstLine
  return 'Pasted stack trace'
}

function buildIncident(config: CrashProviderConfig): CrashIncident {
  const stackText = config.stackText?.trim() ?? ''
  return {
    id: LOCAL_CRASH_INCIDENT_ID,
    provider: 'local',
    title: resolveTitle(config, stackText),
    stackText,
  }
}

export const localCrashProvider: CrashProvider = {
  id: 'local',

  isReady(config: CrashProviderConfig): boolean {
    return config.provider === 'local' && Boolean(config.stackText?.trim())
  },

  async list(config: CrashProviderConfig, _query?) {
    if (config.provider !== 'local' || !config.stackText?.trim()) {
      return { items: [], page: 1, pageSize: 1, total: 0, hasMore: false }
    }
    const incident = buildIncident(config)
    return {
      items: [{ id: incident.id, title: incident.title, provider: incident.provider }],
      page: 1,
      pageSize: 1,
      total: 1,
      hasMore: false,
    }
  },

  async get(config: CrashProviderConfig, id: string): Promise<CrashIncident> {
    if (config.provider !== 'local') {
      throw new Error('Local crash provider requires provider: local')
    }
    if (id !== LOCAL_CRASH_INCIDENT_ID) {
      throw new Error(`Unknown local crash incident: ${id}`)
    }
    if (!config.stackText?.trim()) {
      throw new Error('Local crash provider requires stackText')
    }
    return buildIncident(config)
  },

  capabilities() {
    return { filters: [], supportsDetail: true }
  },
}
