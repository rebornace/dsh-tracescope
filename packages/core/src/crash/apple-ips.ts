/**
 * Apple .ips crash report helpers (iOS 15+ JSON two-part format).
 * Line 1 = metadata header JSON; remaining lines = crash body JSON.
 */

export type AppleIpsMeta = {
  app_name?: string
  name?: string
  bundleID?: string
  bug_type?: string | number
  incident_id?: string
  timestamp?: string
}

export type AppleIpsBundleInfo = {
  CFBundleShortVersionString?: string
  CFBundleVersion?: string
  CFBundleIdentifier?: string
}

export type AppleIpsBody = {
  exception?: {
    type?: string
    signal?: string
    codes?: string
  }
  termination?: {
    indicator?: string
    namespace?: string
    byProc?: string
  }
  asi?: Record<string, string[] | string>
  faultingThread?: number
  bundleInfo?: AppleIpsBundleInfo
  /** Some reports nest bundle fields under `frontmost` / `appBundle` variants. */
  appBundleID?: string
  bundleID?: string
  osVersion?: {
    train?: string
    isEmbeddedOS?: boolean
  } | string
  deviceType?: string
  modelCode?: string
  threads?: Array<{
    frames?: Array<{
      imageOffset?: number
      symbol?: string
      symbolLocation?: number
      imageIndex?: number
      sourceFile?: string
      sourceLine?: number
    }>
  }>
  usedImages?: Array<{
    name?: string
    path?: string
    base?: number
    size?: number
    uuid?: string
  }>
}

/** App / build identity extracted from an .ips report for binary correlation. */
export type AppleIpsCaptureMeta = {
  packageName?: string
  appVersion?: string
  buildNumber?: string
  buildId?: string
  osVersion?: string
  deviceModel?: string
  /** ISO-ish timestamp from the report when present. */
  occurredAt?: string
  clockSource: 'report' | 'host-utc'
}

function asTrimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t ? t : undefined
}

/** Pull package / build / device fields from a parsed .ips report. */
export function extractAppleIpsCaptureMeta(parsed: ParsedAppleIps): AppleIpsCaptureMeta {
  const bundle = parsed.body.bundleInfo
  const packageName =
    asTrimmed(parsed.meta.bundleID) ||
    asTrimmed(bundle?.CFBundleIdentifier) ||
    asTrimmed(parsed.body.appBundleID) ||
    asTrimmed(parsed.body.bundleID)
  const appVersion = asTrimmed(bundle?.CFBundleShortVersionString)
  const buildNumber = asTrimmed(bundle?.CFBundleVersion)
  const buildId = buildNumber || appVersion
  const osRaw = parsed.body.osVersion
  const osVersion =
    typeof osRaw === 'string'
      ? asTrimmed(osRaw)
      : asTrimmed(osRaw?.train)
  const deviceModel =
    asTrimmed(parsed.body.modelCode) || asTrimmed(parsed.body.deviceType)
  const reportTs = asTrimmed(parsed.meta.timestamp)
  let occurredAt: string | undefined
  let clockSource: AppleIpsCaptureMeta['clockSource'] = 'host-utc'
  if (reportTs) {
    const ms = Date.parse(reportTs)
    if (Number.isFinite(ms)) {
      occurredAt = new Date(ms).toISOString()
      clockSource = 'report'
    } else {
      occurredAt = reportTs
      clockSource = 'report'
    }
  }
  return {
    packageName,
    appVersion,
    buildNumber,
    buildId,
    osVersion,
    deviceModel,
    occurredAt,
    clockSource,
  }
}

export type ParsedAppleIps = {
  meta: AppleIpsMeta
  body: AppleIpsBody
}

/** Detect and parse the two-part Apple .ips JSON format. */
export function parseAppleIpsText(text: string): ParsedAppleIps | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return null
  const nl = trimmed.indexOf('\n')
  if (nl <= 0) return null
  const headerRaw = trimmed.slice(0, nl).trim()
  const bodyRaw = trimmed.slice(nl + 1).trim()
  if (!headerRaw.startsWith('{') || !bodyRaw.startsWith('{')) return null
  try {
    const meta = JSON.parse(headerRaw) as AppleIpsMeta
    const body = JSON.parse(bodyRaw) as AppleIpsBody
    if (!meta || typeof meta !== 'object' || !body || typeof body !== 'object') return null
    // Require at least one IPS marker so random JSON stacks are ignored.
    if (
      meta.bug_type == null &&
      !meta.incident_id &&
      !meta.bundleID &&
      !body.exception &&
      body.faultingThread == null
    ) {
      return null
    }
    return { meta, body }
  } catch {
    return null
  }
}

/** Short list/inbox title from an .ips report. */
export function titleFromAppleIps(parsed: ParsedAppleIps, fileName?: string): string {
  const app = (parsed.meta.app_name || parsed.meta.name || '').trim()
  const excType = parsed.body.exception?.type?.trim()
  const signal = parsed.body.exception?.signal?.trim()
  const indicator = parsed.body.termination?.indicator?.trim()
  const parts: string[] = []
  if (app) parts.push(app)
  if (excType && signal) parts.push(`${excType} (${signal})`)
  else if (excType) parts.push(excType)
  else if (signal) parts.push(signal)
  else if (indicator) parts.push(indicator)
  if (parts.length) return parts.join(' · ').slice(0, 200)
  if (fileName) {
    return fileName.replace(/\.ips$/i, '').replace(/\.crash$/i, '').slice(0, 200)
  }
  return 'iOS crash'
}

/** Stable identity for dedupe across pulls (prefer incident_id). */
export function appleIpsIdentity(parsed: ParsedAppleIps | null, fileName: string): string {
  const id = parsed?.meta.incident_id?.trim()
  if (id) return `ips:${id}`
  return `file:${fileName}`
}

/**
 * Render faulting-thread frames as classic iOS crash lines so existing
 * frame parsers / matchers keep working.
 */
export function renderAppleIpsAsClassicStack(parsed: ParsedAppleIps): string {
  const app = parsed.meta.app_name || parsed.meta.name || 'App'
  const exc = parsed.body.exception
  const term = parsed.body.termination
  const lines: string[] = []
  const excLabel = [exc?.type, exc?.signal].filter(Boolean).join(' / ') || 'Crash'
  lines.push(`${app}: ${excLabel}`)
  if (exc?.codes) lines.push(`Exception Codes: ${exc.codes}`)
  if (term?.indicator) lines.push(`Termination: ${term.indicator}`)
  const asi = parsed.body.asi
  if (asi && typeof asi === 'object') {
    for (const [lib, msgs] of Object.entries(asi)) {
      const list = Array.isArray(msgs) ? msgs : [String(msgs)]
      for (const m of list) lines.push(`ASI (${lib}): ${m}`)
    }
  }
  const images = parsed.body.usedImages || []
  const ft = parsed.body.faultingThread
  const thread =
    typeof ft === 'number' && parsed.body.threads?.[ft]
      ? parsed.body.threads[ft]
      : parsed.body.threads?.[0]
  const frames = thread?.frames || []
  frames.forEach((fr, idx) => {
    const image = typeof fr.imageIndex === 'number' ? images[fr.imageIndex] : undefined
    const library = (image?.name || image?.path || '???').split('/').pop() || '???'
    const base = typeof image?.base === 'number' ? image.base : 0
    const offset = typeof fr.imageOffset === 'number' ? fr.imageOffset : 0
    const address = `0x${(base + offset).toString(16).padStart(16, '0')}`
    const load = `0x${base.toString(16).padStart(16, '0')}`
    const symbol = (fr.symbol || '').trim()
    const loc =
      fr.sourceFile && fr.sourceLine != null
        ? ` (${fr.sourceFile}:${fr.sourceLine})`
        : ''
    if (symbol) {
      const symLoc =
        typeof fr.symbolLocation === 'number' ? ` + ${fr.symbolLocation}` : ''
      lines.push(`${idx}   ${library}  ${address} ${symbol}${symLoc}${loc}`)
    } else {
      lines.push(`${idx}   ${library}  ${address} ${load} + ${offset}`)
    }
  })
  return lines.join('\n')
}
