import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useLocaleT } from '../locales/use-locale-t.js'

export interface CrashAnalysisReport {
  incident: {
    id: string
    title: string
    provider: string
    stackText: string
    exceptionName?: string
  }
  matchedFiles: Array<{ path: string; reason: string; symbol?: string; line?: number }>
  summary: string
  fixHints?: string[]
  prompt: string
  defectBody: string
  /** AI session reply written back into this board (not produced by local Analyze). */
  aiAnalysis?: string
}

const CRASH_LIST_PAGE_SIZE = 20

function downloadTextFile(filename: string, text: string, mime = 'text/markdown'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  return false
}

const AI_SECTION_HEADERS = [
  '### AI 分析结论',
  '### AI analysis',
  '### 复现方式',
  '### Reproduction steps',
] as const
const STACK_SECTION_HEADERS = ['### 堆栈', '### Stack trace'] as const

type CrashAnalysisKind = 'reproduce' | 'fix'

function aiSectionHeader(kind: CrashAnalysisKind): string {
  return kind === 'reproduce' ? '### 复现方式' : '### AI 分析结论'
}

/** Remove a previous AI section from defect markdown (header → next ###/---). */
function stripAiSection(defectBody: string): string {
  let body = defectBody
  for (const header of AI_SECTION_HEADERS) {
    const start = body.indexOf(header)
    if (start < 0) continue
    const fromContent = start + header.length
    const rest = body.slice(fromContent)
    const rel = rest.search(/\n### |\n---/)
    const end = rel >= 0 ? fromContent + rel : body.length
    body = `${body.slice(0, start).replace(/\s+$/, '\n\n')}${body.slice(end).replace(/^\s+/, '')}`
    break
  }
  return body
}

function insertBeforeStackOrFooter(defectBody: string, block: string): string {
  for (const header of STACK_SECTION_HEADERS) {
    const idx = defectBody.indexOf(header)
    if (idx >= 0) {
      const left = defectBody.slice(0, idx).replace(/\s+$/, '\n\n')
      const right = defectBody.slice(idx)
      return `${left}${block}${right}`
    }
  }
  const foot = defectBody.lastIndexOf('\n---')
  if (foot >= 0) {
    const left = defectBody.slice(0, foot).replace(/\s+$/, '\n\n')
    return `${left}${block}${defectBody.slice(foot + 1)}`
  }
  return `${defectBody.trim()}\n\n${block}`
}

/**
 * Write AI reply into the in-panel report.
 * Uses indexOf/slice (not String.replace) so `$` / `$1` in model output cannot corrupt the body.
 */
function mergeAiIntoReport(
  report: CrashAnalysisReport,
  aiAnalysis: string,
  kind: CrashAnalysisKind = 'fix',
): CrashAnalysisReport {
  const text = aiAnalysis.trim()
  if (!text) return { ...report, aiAnalysis: undefined }
  const block = `${aiSectionHeader(kind)}\n\n${text}\n\n`
  const body = insertBeforeStackOrFooter(stripAiSection(report.defectBody || ''), block)
  return { ...report, aiAnalysis: text, defectBody: body }
}

function buildCrashExportMarkdown(report: CrashAnalysisReport, repoPath: string): string {
  const lines = [
    '# TraceScope crash analysis report',
    '',
    `- Repo: \`${repoPath}\``,
    `- Title: ${report.incident.title}`,
    `- Exception: ${report.incident.exceptionName || '—'}`,
    `- Summary: ${report.summary}`,
    '',
    '## Matched files',
    '',
  ]
  if (report.matchedFiles?.length) {
    for (const m of report.matchedFiles) {
      const line = m.line != null ? `:${m.line}` : ''
      lines.push(`- \`${m.path}${line}\`${m.symbol ? ` (${m.symbol})` : ''}${m.reason ? ` — ${m.reason}` : ''}`)
    }
  } else {
    lines.push('_None_')
  }
  if (report.aiAnalysis?.trim()) {
    lines.push('', '## AI analysis', '', report.aiAnalysis.trim())
  }
  if (report.fixHints?.length) {
    lines.push('', '## Fix hints', '')
    for (const h of report.fixHints) lines.push(`- ${h}`)
  }
  lines.push('', '## Defect body', '', report.defectBody, '', '## Stack', '', '```', report.incident.stackText, '```', '')
  return lines.join('\n')
}

type ApiPost = (path: string, body: unknown) => Promise<Record<string, unknown>>
type ApiGet = (path: string, params?: Record<string, string | undefined>) => Promise<Record<string, unknown>>

export interface SendToChatResult {
  ok: boolean
  error?: string
}

type CrashProviderId = 'local' | 'umeng' | 'crashlytics'

type CrashListItem = {
  id: string
  title: string
  provider: CrashProviderId
  appVersion?: string
  errorKind?: string
  status?: string
  lastSeenAt?: string
  count?: number
  affectedUsers?: number
  osVersion?: string
  deviceModel?: string
}

type UmengIncident = CrashListItem & {
  stackText: string
  exceptionName?: string
  buildNumber?: string
  platform?: 'android' | 'ios' | 'other'
  occurredAt?: string
  firstSeenAt?: string
  rawRef?: string
}

function parseUmengIncident(inc: Record<string, unknown>, fallbackId: string): UmengIncident {
  const platform = inc.platform
  return {
    id: typeof inc.id === 'string' ? inc.id : fallbackId,
    title: typeof inc.title === 'string' ? inc.title : fallbackId,
    provider: parseProviderId(inc.provider),
    stackText: typeof inc.stackText === 'string' ? inc.stackText : '',
    exceptionName: typeof inc.exceptionName === 'string' ? inc.exceptionName : undefined,
    appVersion: typeof inc.appVersion === 'string' ? inc.appVersion : undefined,
    buildNumber: typeof inc.buildNumber === 'string' ? inc.buildNumber : undefined,
    platform:
      platform === 'android' || platform === 'ios' || platform === 'other' ? platform : undefined,
    errorKind:
      inc.errorKind === 'crash' ||
      inc.errorKind === 'anr' ||
      inc.errorKind === 'error' ||
      inc.errorKind === 'other'
        ? inc.errorKind
        : undefined,
    status:
      inc.status === 'open' || inc.status === 'closed' || inc.status === 'other'
        ? inc.status
        : undefined,
    count: typeof inc.count === 'number' ? inc.count : undefined,
    affectedUsers: typeof inc.affectedUsers === 'number' ? inc.affectedUsers : undefined,
    osVersion: typeof inc.osVersion === 'string' ? inc.osVersion : undefined,
    deviceModel: typeof inc.deviceModel === 'string' ? inc.deviceModel : undefined,
    occurredAt: typeof inc.occurredAt === 'string' ? inc.occurredAt : undefined,
    firstSeenAt: typeof inc.firstSeenAt === 'string' ? inc.firstSeenAt : undefined,
    lastSeenAt: typeof inc.lastSeenAt === 'string' ? inc.lastSeenAt : undefined,
    rawRef: typeof inc.rawRef === 'string' ? inc.rawRef : undefined,
  }
}

function umengIncidentForAnalyze(selected: UmengIncident): Record<string, unknown> {
  return {
    id: selected.id,
    title: selected.title,
    provider: selected.provider,
    stackText: selected.stackText,
    exceptionName: selected.exceptionName,
    appVersion: selected.appVersion,
    buildNumber: selected.buildNumber,
    platform: selected.platform,
    count: selected.count,
    affectedUsers: selected.affectedUsers,
    status: selected.status,
    errorKind: selected.errorKind,
    osVersion: selected.osVersion,
    deviceModel: selected.deviceModel,
    occurredAt: selected.occurredAt,
    firstSeenAt: selected.firstSeenAt,
    lastSeenAt: selected.lastSeenAt,
    rawRef: selected.rawRef,
  }
}

type FilterKey =
  | 'timeRange'
  | 'appVersion'
  | 'errorKind'
  | 'osDevice'
  | 'sort'
  | 'status'
  | 'keyword'

type TimeRangePreset = '' | '24h' | '7d' | '30d' | '90d' | 'custom'

type FilterOption = { label: string; value: string }

type FilterState = {
  timeRange: TimeRangePreset
  /** YYYY-MM-DD */
  startAt: string
  /** YYYY-MM-DD */
  endAt: string
  /** Selected Umeng `version` values (exact option values). */
  appVersions: string[]
  errorKinds: Array<'crash' | 'anr' | 'error' | 'other'>
  /** Selected Umeng `os` values. */
  osVersions: string[]
  /** Selected Umeng `device` values. */
  deviceModels: string[]
  sortField: 'count' | 'lastSeenAt' | 'title'
  sortDir: 'asc' | 'desc'
  statuses: Array<'open' | 'closed' | 'other'>
  keyword: string
}

const MASKED_COOKIE = '••••••••'

function padDatePart(n: number): string {
  return String(n).padStart(2, '0')
}

function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${padDatePart(d.getMonth() + 1)}-${padDatePart(d.getDate())}`
}

function rangeDatesForPreset(preset: TimeRangePreset, now = new Date()): { startAt: string; endAt: string } {
  const end = new Date(now)
  const start = new Date(now)
  if (preset === '24h') {
    /* same calendar day */
  } else if (preset === '30d') {
    start.setDate(end.getDate() - 29)
  } else if (preset === '90d') {
    start.setDate(end.getDate() - 89)
  } else if (preset === '7d' || preset === '') {
    start.setDate(end.getDate() - 6)
  } else {
    start.setDate(end.getDate() - 6)
  }
  return { startAt: toDateInputValue(start), endAt: toDateInputValue(end) }
}

const defaultFilters = (): FilterState => {
  const { startAt, endAt } = rangeDatesForPreset('7d')
  return {
    timeRange: '7d',
    startAt,
    endAt,
    appVersions: [],
    errorKinds: [],
    osVersions: [],
    deviceModels: [],
    sortField: 'count',
    sortDir: 'desc',
    statuses: [],
    keyword: '',
  }
}

function metaTypeFromFilters(filters: FilterState): string {
  if (filters.errorKinds.length === 1) {
    const kind = filters.errorKinds[0]
    if (kind === 'anr') return 'anr'
    if (kind === 'error') return 'exception'
    if (kind === 'crash') return 'crash'
  }
  return 'crash'
}

function pruneSelected(selected: string[], options: FilterOption[]): string[] {
  if (!options.length) return selected
  const allowed = new Set(options.map((o) => o.value))
  return selected.filter((v) => allowed.has(v))
}

function toggleSelectedValue(selected: string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]
}

const card: CSSProperties = {
  border: '1px solid var(--dsh-border, #ddd4c5)',
  borderRadius: 12,
  padding: 12,
  background: 'var(--dsh-card, #fffdf8)',
}

const label: CSSProperties = { display: 'grid', gap: 4, marginBottom: 8, fontWeight: 600 }

const input: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--dsh-border, #ddd4c5)',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  fontSize: 13,
}

const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }

const btn: CSSProperties = {
  border: 0,
  borderRadius: 999,
  padding: '8px 12px',
  cursor: 'pointer',
  background: 'var(--dsh-accent-soft, #efe8da)',
}

const primary: CSSProperties = {
  ...btn,
  background: 'var(--dsh-accent, #0f6e56)',
  color: '#fff',
  fontWeight: 700,
}

function parseListItems(raw: unknown): CrashListItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x) => x && typeof x === 'object')
    .map((x) => {
      const o = x as Record<string, unknown>
      return {
        id: typeof o.id === 'string' ? o.id : '',
        title: typeof o.title === 'string' ? o.title : '',
        provider: parseProviderId(o.provider),
        appVersion: typeof o.appVersion === 'string' ? o.appVersion : undefined,
        errorKind: typeof o.errorKind === 'string' ? o.errorKind : undefined,
        status: typeof o.status === 'string' ? o.status : undefined,
        lastSeenAt: typeof o.lastSeenAt === 'string' ? o.lastSeenAt : undefined,
        count: typeof o.count === 'number' ? o.count : undefined,
        affectedUsers: typeof o.affectedUsers === 'number' ? o.affectedUsers : undefined,
        osVersion: typeof o.osVersion === 'string' ? o.osVersion : undefined,
        deviceModel: typeof o.deviceModel === 'string' ? o.deviceModel : undefined,
      }
    })
    .filter((x) => x.id && x.title)
}

function cookieReady(hasStoredCookie: boolean, cookieValue: string): boolean {
  const trimmed = cookieValue.trim()
  return hasStoredCookie || (Boolean(trimmed) && trimmed !== MASKED_COOKIE)
}

function parseCapabilities(raw: unknown): FilterKey[] {
  if (!raw || typeof raw !== 'object') return []
  const filters = (raw as { filters?: unknown }).filters
  if (!Array.isArray(filters)) return []
  const allowed = new Set<FilterKey>([
    'timeRange',
    'appVersion',
    'errorKind',
    'osDevice',
    'sort',
    'status',
    'keyword',
  ])
  return filters.filter((f): f is FilterKey => typeof f === 'string' && allowed.has(f as FilterKey))
}

function buildListQueryBody(filters: FilterState): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const kw = filters.keyword.trim()
  if (kw) body.keyword = kw
  if (filters.errorKinds.length) body.errorKinds = filters.errorKinds
  if (filters.statuses.length) body.statuses = filters.statuses
  if (filters.appVersions.length) body.appVersions = [...filters.appVersions]
  if (filters.osVersions.length) body.osVersions = [...filters.osVersions]
  if (filters.deviceModels.length) body.deviceModels = [...filters.deviceModels]
  if (filters.timeRange && filters.timeRange !== 'custom') {
    body.timeRange = filters.timeRange
    // Preset ranges: do not send startAt/endAt — synced display dates used to force
    // invalid Umeng `dateType: custom` and trigger “请求中含有不正确参数”.
  } else if (filters.timeRange === 'custom') {
    body.timeRange = 'custom'
    if (filters.startAt.trim()) body.startAt = filters.startAt.trim()
    if (filters.endAt.trim()) body.endAt = filters.endAt.trim()
  }
  body.sort = { field: filters.sortField, direction: filters.sortDir }
  return body
}

/** U-APM SPA hard-limit: each dimension supports at most 10 selected values. */
const UMENG_FILTER_MAX_PER_DIMENSION = 10

function FilterOptionPicker(props: {
  title: string
  options: FilterOption[]
  selected: string[]
  disabled?: boolean
  loading?: boolean
  searchPlaceholder: string
  emptyText: string
  loadingText: string
  clearLabel: string
  selectedCountLabel: string
  maxSelected?: number
  maxSelectedHint?: string
  onChange: (next: string[]) => void
}) {
  const {
    title,
    options,
    selected,
    disabled,
    loading,
    searchPlaceholder,
    emptyText,
    loadingText,
    clearLabel,
    selectedCountLabel,
    maxSelected = UMENG_FILTER_MAX_PER_DIMENSION,
    maxSelectedHint,
    onChange,
  } = props
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle),
    )
  }, [options, query])
  const atMax = selected.length >= maxSelected

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ ...row, justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
        <span style={{ fontSize: 11, color: atMax ? '#b42318' : '#6b645a' }}>
          {selectedCountLabel
            .replace('{count}', String(selected.length))
            .replace('{max}', String(maxSelected))}
        </span>
      </div>
      {atMax && maxSelectedHint ? (
        <span style={{ fontSize: 11, color: '#b42318' }}>{maxSelectedHint}</span>
      ) : null}
      <input
        style={input}
        value={query}
        disabled={disabled || loading}
        placeholder={searchPlaceholder}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div
        style={{
          maxHeight: 160,
          overflow: 'auto',
          border: '1px solid var(--dsh-border, #ddd4c5)',
          borderRadius: 8,
          padding: 8,
          background: '#fff',
          display: 'grid',
          gap: 4,
        }}
      >
        {loading ? (
          <span style={{ fontSize: 12, color: '#6b645a' }}>{loadingText}</span>
        ) : filtered.length === 0 ? (
          <span style={{ fontSize: 12, color: '#6b645a' }}>{emptyText}</span>
        ) : (
          filtered.map((opt) => {
            const checked = selected.includes(opt.value)
            const checkboxDisabled = Boolean(disabled || (!checked && atMax))
            return (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'flex-start',
                fontWeight: 400,
                fontSize: 12,
                lineHeight: 1.35,
                opacity: checkboxDisabled && !checked ? 0.55 : 1,
              }}
              title={opt.value !== opt.label ? opt.value : undefined}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={checkboxDisabled}
                onChange={() => onChange(toggleSelectedValue(selected, opt.value))}
              />
              <span>{opt.label}</span>
            </label>
            )
          })
        )}
      </div>
      {selected.length ? (
        <button
          type="button"
          disabled={disabled}
          style={{ ...btn, padding: '4px 8px', fontSize: 11, justify: 'fit-content' }}
          onClick={() => onChange([])}
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  )
}

function isAuthFailure(errorCode: unknown, message: string): boolean {
  if (errorCode === 'UMENG_AUTH' || errorCode === 'CRASHLYTICS_AUTH') return true
  // Do not treat FORBIDDEN / NOT_FOUND / generic HTTP as "token expired"
  // (those messages often mention Access Token / quota project).
  if (
    errorCode === 'CRASHLYTICS_FORBIDDEN' ||
    errorCode === 'CRASHLYTICS_HTTP' ||
    errorCode === 'CRASHLYTICS_NOT_FOUND' ||
    errorCode === 'CRASHLYTICS_NETWORK' ||
    errorCode === 'CRASHLYTICS_BAD_RESPONSE' ||
    errorCode === 'CRASHLYTICS_CONFIG'
  ) {
    return false
  }
  const m = message.toLowerCase()
  return (
    m.includes('401') ||
    m.includes('unauthenticated') ||
    m.includes('invalid_token') ||
    m.includes('cookie') ||
    m.includes('已失效') ||
    m.includes('登录')
  )
}

function parseProviderId(raw: unknown): CrashProviderId {
  if (raw === 'umeng' || raw === 'crashlytics' || raw === 'local') return raw
  return 'umeng'
}

export function CrashBoard({
  repoPath,
  trackerReady,
  onSendToChat,
  onSubmitDefect,
  apiPost,
  apiGet,
  onOpenTrackerSettings,
}: {
  repoPath: string
  lang?: string
  trackerReady?: boolean
  onSendToChat?: (prompt: string) => SendToChatResult
  onSubmitDefect?: (report: CrashAnalysisReport, subject: string) => void
  apiPost: ApiPost
  apiGet: ApiGet
  onOpenTrackerSettings?: () => void
}) {
  const t = useLocaleT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [report, setReport] = useState<CrashAnalysisReport | null>(null)
  const [umengOpen, setUmengOpen] = useState(true)
  /** Filters are uncommon — collapse by default so analysis stays above the fold. */
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [provider, setProvider] = useState<CrashProviderId>('umeng')
  const [appKey, setAppKey] = useState('')
  const [appDisplayName, setAppDisplayName] = useState('')
  const [cookie, setCookie] = useState('')
  const [hasStoredCookie, setHasStoredCookie] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [appId, setAppId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [hasStoredAccessToken, setHasStoredAccessToken] = useState(false)
  const [serviceAccountJson, setServiceAccountJson] = useState('')
  const [hasStoredServiceAccount, setHasStoredServiceAccount] = useState(false)
  const [remember, setRemember] = useState(true)
  const [configBusy, setConfigBusy] = useState(false)

  /** Draft filters edited in the form — do not fetch until applied. */
  const [filters, setFilters] = useState<FilterState>(() => defaultFilters())
  /** Last confirmed filters used for list/detail queries. */
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(() => defaultFilters())
  const [capabilityFilters, setCapabilityFilters] = useState<FilterKey[]>([])
  const [filterOptions, setFilterOptions] = useState<{
    versions: FilterOption[]
    osVersions: FilterOption[]
    devices: FilterOption[]
  }>({ versions: [], osVersions: [], devices: [] })
  const [filterOptionsBusy, setFilterOptionsBusy] = useState(false)
  const [filterOptionsError, setFilterOptionsError] = useState('')
  const [listItems, setListItems] = useState<CrashListItem[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [listPage, setListPage] = useState(1)
  const [listTotal, setListTotal] = useState<number | undefined>(undefined)
  const [listHasMore, setListHasMore] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [selectedIncident, setSelectedIncident] = useState<UmengIncident | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [aiDraft, setAiDraft] = useState('')
  const [awaitingAiPaste, setAwaitingAiPaste] = useState(false)
  /** Crash AI chat job — panel polls until agent publishes analysis. */
  const [pendingCrashJobId, setPendingCrashJobId] = useState('')
  /** Active write-session mode: reproduce (primary) or fix. */
  const [analysisKind, setAnalysisKind] = useState<CrashAnalysisKind>('reproduce')
  const analysisKindRef = useRef<CrashAnalysisKind>('reproduce')
  /** Kind that the in-memory report / AI cache was prepared for. */
  const reportKindRef = useRef<CrashAnalysisKind | null>(null)

  /** Local inbox USB capture */
  const [capturePlatform, setCapturePlatform] = useState<'android' | 'ios'>('android')
  const [captureDevices, setCaptureDevices] = useState<Array<{ id: string; label: string; state?: string }>>(
    [],
  )
  const [captureDeviceId, setCaptureDeviceId] = useState('')
  const [captureActive, setCaptureActive] = useState(false)
  const [captureHitCount, setCaptureHitCount] = useState(0)
  const [captureBusy, setCaptureBusy] = useState(false)
  const [iosCaptureSupported, setIosCaptureSupported] = useState(true)
  const [iosCaptureReason, setIosCaptureReason] = useState('')
  const [adbPrep, setAdbPrep] = useState<{
    phase: string
    percent: number | null
    message: string
  } | null>(null)
  const [iosPrep, setIosPrep] = useState<{
    phase: string
    percent: number | null
    message: string
    installCommand?: string
  } | null>(null)
  const [wirelessTarget, setWirelessTarget] = useState('')

  const listGen = useRef(0)
  const lastCaptureHitRef = useRef(0)
  const detailPanelRef = useRef<HTMLDivElement | null>(null)
  const reportPanelRef = useRef<HTMLDivElement | null>(null)
  const aiPasteRef = useRef<HTMLDivElement | null>(null)
  const reportRef = useRef<CrashAnalysisReport | null>(null)
  reportRef.current = report

  const repo = repoPath.trim()

  const remoteReady = useCallback(() => {
    if (provider === 'local') return Boolean(repo)
    if (provider === 'crashlytics') {
      return (
        Boolean(projectId.trim() && appId.trim()) &&
        (cookieReady(hasStoredAccessToken, accessToken) ||
          cookieReady(hasStoredServiceAccount, serviceAccountJson))
      )
    }
    return Boolean(appKey.trim()) && cookieReady(hasStoredCookie, cookie)
  }, [
    accessToken,
    appId,
    appKey,
    cookie,
    hasStoredAccessToken,
    hasStoredCookie,
    hasStoredServiceAccount,
    projectId,
    provider,
    repo,
    serviceAccountJson,
  ])

  const authExpiredMessage = useCallback(() => {
    return provider === 'crashlytics' ? t('crash.tokenExpired') : t('crash.cookieExpired')
  }, [provider, t])

  const configBody = useCallback(() => {
    const body: Record<string, unknown> = {
      repoPath: repo || undefined,
      provider,
      appDisplayName: appDisplayName.trim(),
      remember,
    }
    if (provider === 'local') {
      return body
    }
    if (provider === 'crashlytics') {
      body.projectId = projectId.trim()
      body.appId = appId.trim()
      // Only send freshly pasted secrets. Masked / empty fields are omitted so the
      // server keeps the previously stored service-account JSON / token.
      const tokenTrim = accessToken.trim()
      if (tokenTrim && tokenTrim !== MASKED_COOKIE && !/^\?{4,}$/.test(tokenTrim)) {
        body.accessToken = tokenTrim
      }
      const saTrim = serviceAccountJson.trim()
      if (saTrim && saTrim !== MASKED_COOKIE && !/^\?{4,}$/.test(saTrim)) {
        body.serviceAccountJson = saTrim
      }
    } else {
      body.appKey = appKey.trim()
      const cookieTrim = cookie.trim()
      if (cookieTrim && cookieTrim !== MASKED_COOKIE && !/^\?{4,}$/.test(cookieTrim)) {
        body.cookie = cookieTrim
      }
    }
    return body
  }, [
    accessToken,
    appDisplayName,
    appId,
    appKey,
    cookie,
    projectId,
    provider,
    remember,
    repo,
    serviceAccountJson,
  ])

  const loadConfig = useCallback(async () => {
    try {
      const params: Record<string, string | undefined> = {}
      if (repo) params.repoPath = repo
      const data = await apiGet('/tracescope/v1/crash-config', params)
      const cfg = data.config as Record<string, unknown> | undefined
      if (!cfg) return
      setProvider(parseProviderId(cfg.provider))
      setAppKey(typeof cfg.appKey === 'string' ? cfg.appKey : '')
      setAppDisplayName(typeof cfg.appDisplayName === 'string' ? cfg.appDisplayName : '')
      setProjectId(typeof cfg.projectId === 'string' ? cfg.projectId : '')
      setAppId(typeof cfg.appId === 'string' ? cfg.appId : '')
      setHasStoredCookie(cfg.hasCookie === true)
      if (cfg.hasCookie === true) setCookie(MASKED_COOKIE)
      else setCookie('')
      setHasStoredAccessToken(cfg.hasAccessToken === true)
      if (cfg.hasAccessToken === true) setAccessToken(MASKED_COOKIE)
      else setAccessToken('')
      setHasStoredServiceAccount(cfg.hasServiceAccount === true)
      if (cfg.hasServiceAccount === true) setServiceAccountJson(MASKED_COOKIE)
      else setServiceAccountJson('')
    } catch (err) {
      setError((err as Error).message || String(err))
    }
  }, [apiGet, repo])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const handleAuthFailure = useCallback(
    (message: string) => {
      setError(message || authExpiredMessage())
      setUmengOpen(true)
    },
    [authExpiredMessage],
  )

  const saveCredentials = useCallback(async () => {
    setConfigBusy(true)
    setError('')
    try {
      const data = await apiPost('/tracescope/v1/crash-config-save', configBody())
      const cfg = data.config as Record<string, unknown> | undefined
      if (cfg?.hasCookie === true) {
        setHasStoredCookie(true)
        setCookie(MASKED_COOKIE)
      }
      if (cfg?.hasAccessToken === true) {
        setHasStoredAccessToken(true)
        setAccessToken(MASKED_COOKIE)
      }
      if (cfg?.hasServiceAccount === true) {
        setHasStoredServiceAccount(true)
        setServiceAccountJson(MASKED_COOKIE)
      }
      setHint(t('crash.credentialsSaved'))
    } catch (err) {
      setError((err as Error).message || String(err))
    } finally {
      setConfigBusy(false)
    }
  }, [apiPost, configBody, t])

  const clearCookieClick = useCallback(async () => {
    setConfigBusy(true)
    setError('')
    try {
      const data = await apiPost('/tracescope/v1/crash-config-save', {
        ...configBody(),
        cookie: '',
        accessToken: '',
        serviceAccountJson: '',
        clearCookie: true,
      })
      const cfg = data.config as Record<string, unknown> | undefined
      const cleared =
        cfg?.hasCookie !== true &&
        cfg?.hasAccessToken !== true &&
        cfg?.hasServiceAccount !== true
      setCookie('')
      setHasStoredCookie(false)
      setAccessToken('')
      setHasStoredAccessToken(false)
      setServiceAccountJson('')
      setHasStoredServiceAccount(false)
      if (!cleared) {
        setError(t('crash.probeFail'))
        return
      }
      setListItems([])
      setSelectedId('')
      setSelectedIncident(null)
      setHint(provider === 'crashlytics' ? t('crash.tokenCleared') : t('crash.cookieCleared'))
    } catch (err) {
      setError((err as Error).message || String(err))
    } finally {
      setConfigBusy(false)
    }
  }, [apiPost, configBody, provider, t])

  const fetchList = useCallback(
    async (opts?: { page?: number; filters?: FilterState }) => {
      if (!repo) return
      if (!remoteReady()) return

      const page = opts?.page ?? listPage
      const queryFilters = opts?.filters ?? appliedFilters
      const gen = ++listGen.current
      setListBusy(true)
      setError('')
      try {
        const listQuery =
          provider === 'local'
            ? (() => {
                const kw = queryFilters.keyword.trim()
                return {
                  ...(kw ? { keyword: kw } : {}),
                  ...(queryFilters.errorKinds.length
                    ? { errorKinds: queryFilters.errorKinds }
                    : {}),
                }
              })()
            : buildListQueryBody(queryFilters)
        const data = await apiPost('/tracescope/v1/crash-list', {
          ...configBody(),
          ...listQuery,
          page,
          pageSize: CRASH_LIST_PAGE_SIZE,
        })
        if (gen !== listGen.current) return

        const caps = parseCapabilities(data.capabilities)
        if (caps.length) setCapabilityFilters(caps)

        const errMsg = typeof data.error === 'string' ? data.error : ''
        const errCode = data.errorCode
        if (errMsg && isAuthFailure(errCode, errMsg)) {
          handleAuthFailure(authExpiredMessage())
          setListItems([])
          setListTotal(0)
          setListHasMore(false)
          return
        }
        if (errMsg) setError(errMsg)

        const items = parseListItems(data.items)
        setListItems(items)
        setListTotal(typeof data.total === 'number' ? data.total : undefined)
        setListHasMore(
          data.hasMore === true ||
            (typeof data.total === 'number' && page * CRASH_LIST_PAGE_SIZE < data.total) ||
            items.length >= CRASH_LIST_PAGE_SIZE,
        )
      } catch (err) {
        const msg = (err as Error).message || String(err)
        if (isAuthFailure(undefined, msg)) handleAuthFailure(authExpiredMessage())
        else setError(msg)
      } finally {
        if (gen === listGen.current) setListBusy(false)
      }
    },
    [
      apiPost,
      appliedFilters,
      authExpiredMessage,
      configBody,
      handleAuthFailure,
      listPage,
      provider,
      remoteReady,
      repo,
      t,
    ],
  )

  const applyFiltersAndFetch = useCallback(() => {
    if (!repo) {
      setError(t('选择仓库 / 先在配置中添加'))
      return
    }
    if (!remoteReady()) {
      setError(t('crash.probeFail'))
      setUmengOpen(true)
      return
    }
    const next = { ...filters }
    setAppliedFilters(next)
    setListPage(1)
    setFiltersOpen(false)
    setHint(t('crash.filtersApplied'))
    void fetchList({ page: 1, filters: next })
  }, [fetchList, filters, remoteReady, repo, t])

  const goListPage = useCallback(
    (page: number) => {
      const next = Math.max(1, page)
      setListPage(next)
      void fetchList({ page: next })
    },
    [fetchList],
  )

  const runProbe = useCallback(async () => {
    setConfigBusy(true)
    setError('')
    setHint('')
    try {
      if (provider === 'local') {
        if (remember) {
          await apiPost('/tracescope/v1/crash-config-save', configBody())
        }
        setHint(t('crash.inboxListRefreshed'))
        const next = { ...filters }
        setAppliedFilters(next)
        setListPage(1)
        void fetchList({ page: 1, filters: next })
        return
      }
      if (remember) {
        await apiPost('/tracescope/v1/crash-config-save', configBody())
      }
      const data = await apiPost('/tracescope/v1/crash-probe', configBody())
      if (data.ok === true) {
        setHint(t('crash.probeOk'))
        const cfg = data.config as Record<string, unknown> | undefined
        if (cfg?.hasCookie === true) {
          setHasStoredCookie(true)
          setCookie(MASKED_COOKIE)
        }
        if (cfg?.hasAccessToken === true) {
          setHasStoredAccessToken(true)
          setAccessToken(MASKED_COOKIE)
        }
        if (cfg?.hasServiceAccount === true) {
          setHasStoredServiceAccount(true)
          setServiceAccountJson(MASKED_COOKIE)
        }
        const next = { ...filters }
        setAppliedFilters(next)
        setListPage(1)
        void fetchList({ page: 1, filters: next })
      } else {
        const msg = typeof data.error === 'string' ? data.error : t('crash.probeFail')
        if (!data.ok && isAuthFailure(undefined, msg)) handleAuthFailure(authExpiredMessage())
        else setError(msg)
      }
    } catch (err) {
      const msg = (err as Error).message || String(err)
      if (isAuthFailure(undefined, msg)) handleAuthFailure(authExpiredMessage())
      else setError(msg)
    } finally {
      setConfigBusy(false)
    }
  }, [
    apiPost,
    authExpiredMessage,
    configBody,
    fetchList,
    filters,
    handleAuthFailure,
    provider,
    remember,
    t,
  ])

  const refreshCaptureDevices = useCallback(async (options?: { force?: boolean }) => {
    if (!repo || provider !== 'local') return
    setCaptureBusy(true)
    setError('')
    let pollTimer: ReturnType<typeof setInterval> | null = null
    const stopPoll = () => {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }
    const readPrep = async () => {
      try {
        const st = await apiPost('/tracescope/v1/crash-inbox-adb-status', { repoPath: repo })
        const progress = st.progress as Record<string, unknown> | undefined
        if (!progress || typeof progress !== 'object') return
        const phase = typeof progress.phase === 'string' ? progress.phase : 'idle'
        const message = typeof progress.message === 'string' ? progress.message : ''
        const percent = typeof progress.percent === 'number' ? progress.percent : null
        if (phase !== 'idle' && message) {
          setAdbPrep({ phase, percent, message })
          setHint(message)
        }
      } catch {
        /* ignore poll errors */
      }
    }
    const readIosPrep = async () => {
      try {
        const st = await apiPost('/tracescope/v1/crash-inbox-ios-status', { repoPath: repo })
        const progress = st.progress as Record<string, unknown> | undefined
        if (!progress || typeof progress !== 'object') return
        const phase = typeof progress.phase === 'string' ? progress.phase : 'idle'
        const message = typeof progress.message === 'string' ? progress.message : ''
        const percent = typeof progress.percent === 'number' ? progress.percent : null
        const installCommand =
          typeof progress.installCommand === 'string' ? progress.installCommand : undefined
        if (phase !== 'idle' && message) {
          setIosPrep({ phase, percent, message, installCommand })
          setHint(message)
        }
      } catch {
        /* ignore poll errors */
      }
    }
    try {
      if (capturePlatform === 'android') {
        setIosPrep(null)
        setAdbPrep({ phase: 'checking', percent: null, message: t('crash.inboxPreparingAdb') })
        setHint(t('crash.inboxPreparingAdb'))
        pollTimer = setInterval(() => {
          void readPrep()
        }, 400)
        void readPrep()
        // Ensure runs with live progress; devices list follows.
        const ensured = await apiPost('/tracescope/v1/crash-inbox-adb-ensure', { repoPath: repo })
        const ensuredProgress = ensured.progress as Record<string, unknown> | undefined
        if (ensuredProgress && typeof ensuredProgress.message === 'string') {
          setAdbPrep({
            phase: typeof ensuredProgress.phase === 'string' ? ensuredProgress.phase : 'ready',
            percent: typeof ensuredProgress.percent === 'number' ? ensuredProgress.percent : 100,
            message: ensuredProgress.message,
          })
          setHint(ensuredProgress.message)
        }
        if (ensured.ok === false) {
          const msg =
            typeof ensured.error === 'string'
              ? ensured.error
              : typeof ensuredProgress?.error === 'string'
                ? ensuredProgress.error
                : t('crash.inboxAdbPrepareFail')
          setError(msg)
          return
        }
      } else {
        setAdbPrep(null)
        setIosPrep({ phase: 'checking', percent: null, message: t('crash.inboxPreparingIos') })
        setHint(t('crash.inboxPreparingIos'))
        pollTimer = setInterval(() => {
          void readIosPrep()
        }, 400)
        void readIosPrep()
        const ensured = await apiPost('/tracescope/v1/crash-inbox-ios-ensure', {
          repoPath: repo,
          force: Boolean(options?.force),
        })
        const ensuredProgress = ensured.progress as Record<string, unknown> | undefined
        if (ensuredProgress && typeof ensuredProgress.message === 'string') {
          setIosPrep({
            phase: typeof ensuredProgress.phase === 'string' ? ensuredProgress.phase : 'ready',
            percent: typeof ensuredProgress.percent === 'number' ? ensuredProgress.percent : 100,
            message: ensuredProgress.message,
            installCommand:
              typeof ensuredProgress.installCommand === 'string'
                ? ensuredProgress.installCommand
                : typeof ensured.installCommand === 'string'
                  ? ensured.installCommand
                  : undefined,
          })
          setHint(ensuredProgress.message)
        }
        if (ensured.ok === false) {
          const installCommand =
            typeof ensured.installCommand === 'string'
              ? ensured.installCommand
              : typeof ensuredProgress?.installCommand === 'string'
                ? ensuredProgress.installCommand
                : undefined
          const msg =
            typeof ensured.error === 'string'
              ? ensured.error
              : typeof ensuredProgress?.error === 'string'
                ? ensuredProgress.error
                : t('crash.inboxIosPrepareFail')
          setIosCaptureSupported(false)
          setIosCaptureReason(msg)
          setIosPrep({
            phase: 'error',
            percent: null,
            message:
              typeof ensuredProgress?.message === 'string'
                ? ensuredProgress.message
                : t('crash.inboxIosPrepareFail'),
            installCommand,
          })
          setError(msg)
          return
        }
        setIosCaptureSupported(true)
        setIosCaptureReason('')
        setHint(t('crash.inboxIosReady'))
        setIosPrep({ phase: 'ready', percent: 100, message: t('crash.inboxIosReady') })
      }
      const data = await apiPost('/tracescope/v1/crash-inbox-devices', {
        repoPath: repo,
        platform: capturePlatform,
      })
      const devices = Array.isArray(data.devices)
        ? data.devices
            .filter((d): d is Record<string, unknown> => Boolean(d) && typeof d === 'object')
            .map((d) => ({
              id: typeof d.id === 'string' ? d.id : '',
              label: typeof d.label === 'string' ? d.label : String(d.id ?? ''),
              state: typeof d.state === 'string' ? d.state : undefined,
            }))
            .filter((d) => d.id)
        : []
      setCaptureDevices(devices)
      if (capturePlatform === 'ios') {
        setIosCaptureSupported(data.iosSupported !== false)
        setIosCaptureReason(
          typeof data.iosSupportReason === 'string'
            ? data.iosSupportReason
            : typeof data.error === 'string'
              ? data.error
              : '',
        )
      } else {
        setIosCaptureSupported(true)
        setIosCaptureReason('')
        if (data.adbDownloaded === true) {
          setHint(t('crash.inboxAdbDownloaded'))
          setAdbPrep({ phase: 'ready', percent: 100, message: t('crash.inboxAdbDownloaded') })
        } else if (data.adbPath) {
          setHint(t('crash.inboxAdbReady'))
          setAdbPrep({ phase: 'ready', percent: 100, message: t('crash.inboxAdbReady') })
        }
      }
      if (typeof data.error === 'string' && data.error && !devices.length) {
        setError(data.error)
      }
      if (!captureDeviceId && devices[0]) setCaptureDeviceId(devices[0].id)
      else if (captureDeviceId && !devices.some((d) => d.id === captureDeviceId)) {
        setCaptureDeviceId(devices[0]?.id || '')
      }
    } catch (err) {
      setError((err as Error).message || String(err))
    } finally {
      stopPoll()
      setCaptureBusy(false)
    }
  }, [apiPost, captureDeviceId, capturePlatform, provider, repo, t])

  const recheckIosTools = useCallback(() => {
    void refreshCaptureDevices({ force: true })
  }, [refreshCaptureDevices])

  const copyIosInstallCommand = useCallback(async () => {
    const cmd = iosPrep?.installCommand?.trim()
    if (!cmd) return
    try {
      await navigator.clipboard.writeText(cmd)
      setHint(t('crash.inboxIosCopied'))
    } catch {
      setError(cmd)
    }
  }, [iosPrep?.installCommand, t])

  const syncCaptureStatus = useCallback(async () => {
    try {
      const data = await apiPost('/tracescope/v1/crash-inbox-capture-status', { repoPath: repo })
      const status = data.status as Record<string, unknown> | undefined
      const active = status?.active === true
      const hits = typeof status?.hitCount === 'number' ? status.hitCount : 0
      setCaptureActive(active)
      setCaptureHitCount(hits)
      if (typeof status?.lastError === 'string' && status.lastError.trim()) {
        setError(status.lastError.trim())
      }
      if (hits > lastCaptureHitRef.current) {
        lastCaptureHitRef.current = hits
        void fetchList({ page: 1 })
      }
    } catch {
      /* ignore status poll errors */
    }
  }, [apiPost, fetchList, repo])

  const connectWirelessAdb = useCallback(async () => {
    if (!repo) {
      setError(t('选择仓库 / 先在配置中添加'))
      return
    }
    const target = wirelessTarget.trim()
    if (!target) {
      setError(t('crash.inboxWirelessPlaceholder'))
      return
    }
    setCaptureBusy(true)
    setError('')
    try {
      const data = await apiPost('/tracescope/v1/crash-inbox-adb-connect', {
        repoPath: repo,
        target,
      })
      const message = typeof data.message === 'string' ? data.message : ''
      if (data.ok) {
        setHint(message || t('crash.inboxAdbReady'))
        await refreshCaptureDevices()
      } else {
        setError(message || t('crash.inboxCaptureFail'))
      }
    } catch (err) {
      setError((err as Error).message || String(err))
    } finally {
      setCaptureBusy(false)
    }
  }, [apiPost, refreshCaptureDevices, repo, t, wirelessTarget])

  const startInboxCapture = useCallback(async () => {
    if (!repo) {
      setError(t('选择仓库 / 先在配置中添加'))
      return
    }
    if (capturePlatform === 'ios' && !iosCaptureSupported) {
      setError(iosCaptureReason || t('crash.inboxIosUnsupported'))
      return
    }
    if (capturePlatform === 'android' && !captureDeviceId.trim()) {
      setError(t('crash.inboxNeedDevice'))
      return
    }
    setCaptureBusy(true)
    setError('')
    try {
      if (capturePlatform === 'ios') {
        const ensured = await apiPost('/tracescope/v1/crash-inbox-ios-ensure', {
          repoPath: repo,
          force: false,
        })
        if (ensured.ok === false) {
          const ensuredProgress = ensured.progress as Record<string, unknown> | undefined
          setIosCaptureSupported(false)
          setIosCaptureReason(typeof ensured.error === 'string' ? ensured.error : '')
          setIosPrep({
            phase: 'error',
            percent: null,
            message:
              typeof ensuredProgress?.message === 'string'
                ? ensuredProgress.message
                : t('crash.inboxIosPrepareFail'),
            installCommand:
              typeof ensured.installCommand === 'string'
                ? ensured.installCommand
                : typeof ensuredProgress?.installCommand === 'string'
                  ? ensuredProgress.installCommand
                  : undefined,
          })
          setError(
            typeof ensured.error === 'string' ? ensured.error : t('crash.inboxIosPrepareFail'),
          )
          return
        }
      }
      const data = await apiPost('/tracescope/v1/crash-inbox-capture-start', {
        repoPath: repo,
        platform: capturePlatform,
        deviceId: captureDeviceId.trim() || undefined,
      })
      if (data.ok === false) {
        setError(typeof data.error === 'string' ? data.error : t('crash.inboxCaptureFail'))
        return
      }
      setCaptureActive(true)
      setHint(t('crash.inboxCaptureStarted'))
      void syncCaptureStatus()
    } catch (err) {
      setError((err as Error).message || String(err))
    } finally {
      setCaptureBusy(false)
    }
  }, [
    apiPost,
    captureDeviceId,
    capturePlatform,
    iosCaptureReason,
    iosCaptureSupported,
    repo,
    syncCaptureStatus,
    t,
  ])

  const stopInboxCapture = useCallback(async () => {
    setCaptureBusy(true)
    try {
      await apiPost('/tracescope/v1/crash-inbox-capture-stop', { repoPath: repo })
      setCaptureActive(false)
      setHint(t('crash.inboxCaptureStopped'))
      void fetchList({ page: 1 })
    } catch (err) {
      setError((err as Error).message || String(err))
    } finally {
      setCaptureBusy(false)
    }
  }, [apiPost, fetchList, repo, t])

  const deleteInboxItem = useCallback(
    async (id: string) => {
      if (!repo || !id) return
      setBusy(true)
      try {
        await apiPost('/tracescope/v1/crash-inbox-delete', { repoPath: repo, id })
        if (selectedId === id) {
          setSelectedId('')
          setSelectedIncident(null)
          setReport(null)
        }
        void fetchList({ page: listPage })
      } catch (err) {
        setError((err as Error).message || String(err))
      } finally {
        setBusy(false)
      }
    },
    [apiPost, fetchList, listPage, repo, selectedId],
  )

  useEffect(() => {
    if (provider !== 'local' || !repo) return
    void refreshCaptureDevices()
    void syncCaptureStatus()
  }, [provider, repo, capturePlatform]) // eslint-disable-line react-hooks/exhaustive-deps -- refresh on provider/platform only

  /** Local inbox: auto-load history so users see items without clicking refresh. */
  useEffect(() => {
    if (provider !== 'local' || !repo) return
    void fetchList({ page: 1 })
  }, [provider, repo]) // eslint-disable-line react-hooks/exhaustive-deps -- hydrate when entering local inbox

  useEffect(() => {
    if (provider !== 'local' || !captureActive) return
    const timer = setInterval(() => {
      void syncCaptureStatus()
    }, 4000)
    return () => clearInterval(timer)
  }, [captureActive, provider, syncCaptureStatus])

  const filtersDirty = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(appliedFilters),
    [appliedFilters, filters],
  )
  const hasDimensionFilters = useMemo(
    () =>
      appliedFilters.appVersions.length > 0 ||
      appliedFilters.osVersions.length > 0 ||
      appliedFilters.deviceModels.length > 0 ||
      appliedFilters.statuses.length > 0 ||
      Boolean(appliedFilters.keyword.trim()),
    [appliedFilters],
  )

  const onKeywordChange = useCallback((value: string) => {
    setFilters((f) => ({ ...f, keyword: value }))
  }, [])

  useEffect(() => {
    if (!selectedIncident || detailBusy) return
    const el = detailPanelRef.current
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedIncident, detailBusy])

  const loadDetail = useCallback(
    async (id: string) => {
      if (!id || !repo) return
      setDetailBusy(true)
      setError('')
      setSelectedId(id)
      setReport(null)
      reportRef.current = null
      reportKindRef.current = null
      setAiDraft('')
      setAwaitingAiPaste(false)
      setUmengOpen(false)
      try {
        const data = await apiPost('/tracescope/v1/crash-detail', {
          ...configBody(),
          id,
        })
        const inc = data.incident as Record<string, unknown> | undefined
        if (!inc || typeof inc.stackText !== 'string') {
          throw new Error(t('crash.detailMissing'))
        }
        const full = parseUmengIncident(inc, id)
        if (!full.stackText.trim()) {
          throw new Error(t('crash.detailMissing'))
        }
        setSelectedIncident(full)
      } catch (err) {
        const msg = (err as Error).message || String(err)
        if (isAuthFailure(undefined, msg)) handleAuthFailure(authExpiredMessage())
        else setError(msg)
        setSelectedIncident(null)
      } finally {
        setDetailBusy(false)
      }
    },
    [apiPost, configBody, handleAuthFailure, repo, t],
  )

  /** Quiet local prep used by write-session / copy / export / submit. Not a user-facing analyze step. */
  const ensureReport = useCallback(
    async (
      override?: UmengIncident,
      kind: CrashAnalysisKind = analysisKindRef.current,
    ): Promise<CrashAnalysisReport | null> => {
      const selected = override ?? selectedIncident
      if (!selected?.stackText?.trim()) {
        setError(t('crash.selectDetailFirst'))
        return null
      }
      if (!repo) {
        setError(t('选择仓库 / 先在配置中添加'))
        return null
      }
      const current = reportRef.current
      if (
        current &&
        current.incident.id === selected.id &&
        current.incident.stackText === selected.stackText &&
        reportKindRef.current === kind
      ) {
        // Reuse only when same incident + same analysis kind; AI cache differs by kind.
        return current
      }
      const incident = umengIncidentForAnalyze(selected)
      const data = await apiPost('/tracescope/v1/crash-analyze', {
        repoPath: repo,
        incident,
        analysisKind: kind,
      })
      const next = data.report as CrashAnalysisReport | undefined
      if (!next || typeof next.prompt !== 'string') {
        throw new Error(t('请求失败'))
      }
      setReport(next)
      reportRef.current = next
      reportKindRef.current = kind
      return next
    },
    [apiPost, repo, selectedIncident, t],
  )

  const writeSessionFor = useCallback(
    async (override?: UmengIncident, kind: CrashAnalysisKind = 'reproduce') => {
      setAnalysisKind(kind)
      analysisKindRef.current = kind
      setBusy(true)
      setError('')
      setHint('')
      try {
        const r = await ensureReport(override, kind)
        if (!r) return
        if (r.aiAnalysis?.trim()) {
          setHint(
            kind === 'reproduce'
              ? t('crash.writeReproduceCachedHint')
              : t('crash.writeFixCachedHint'),
          )
        }
        requestAnimationFrame(() => {
          reportPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        })
        const send = onSendToChat
        if (!send) {
          setHint(t('crash.writeSessionNoComposer'))
          return
        }
        // Create chat job so the agent can publish via tracescope_publish_crash_analysis.
        const jobRes = await apiPost('/tracescope/v1/crash-ai-job', {
          repoPath: repo,
          summary: r.summary,
          stackText: r.incident.stackText,
          incident: r.incident,
          matchedFiles: r.matchedFiles,
          fixHints: r.fixHints,
          analysisKind: kind,
        })
        const jobId = typeof jobRes.jobId === 'string' ? jobRes.jobId.trim() : ''
        const prompt = typeof jobRes.prompt === 'string' ? jobRes.prompt : r.prompt
        if (!jobId || !prompt.trim()) {
          throw new Error(t('crash.aiJobFail'))
        }
        const result = send(prompt)
        if (result.ok) {
          setPendingCrashJobId(jobId)
          setAwaitingAiPaste(true)
          setHint(
            r.aiAnalysis?.trim()
              ? kind === 'reproduce'
                ? t('crash.writeReproduceCachedHint')
                : t('crash.writeFixCachedHint')
              : kind === 'reproduce'
                ? t('crash.writeReproduceHint')
                : t('crash.writeFixHint'),
          )
          requestAnimationFrame(() => {
            aiPasteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          })
        } else {
          setError(result.error || t('无法写入当前会话输入框'))
        }
      } catch (err) {
        setError((err as Error).message || String(err))
      } finally {
        setBusy(false)
      }
    },
    [apiPost, ensureReport, onSendToChat, repo, t],
  )

  async function applyAiText(raw: string): Promise<boolean> {
    const text = raw.trim()
    if (!text) {
      setError(t('crash.aiPasteRequired'))
      return false
    }
    const current = reportRef.current
    if (!current) {
      setError(t('crash.needAnalyzeFirst'))
      return false
    }
    const kind = analysisKindRef.current
    const next = mergeAiIntoReport(current, text, kind)
    setReport(next)
    reportRef.current = next
    setAiDraft(text)
    setAwaitingAiPaste(false)
    setPendingCrashJobId('')
    setHint(kind === 'reproduce' ? t('crash.aiReproduceApplied') : t('crash.aiApplied'))
    setError('')
    try {
      await apiPost('/tracescope/v1/crash-ai-cache-save', {
        repoPath: repo,
        incidentId: current.incident.id,
        aiAnalysis: text,
        summary: current.summary,
        analysisKind: kind,
      })
    } catch {
      /* panel still has the conclusion; persistence is best-effort */
    }
    requestAnimationFrame(() => {
      reportPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
    return true
  }

  async function pullCrashJobOnce(jobId: string): Promise<'applied' | 'pending' | 'missing' | 'error'> {
    const id = jobId.trim()
    if (!id) return 'missing'
    try {
      const res = await apiPost('/tracescope/v1/crash-job', { id })
      const status = typeof res.status === 'string' ? res.status : ''
      if (status === 'published') {
        const kindRaw = res.analysisKind
        if (kindRaw === 'reproduce' || kindRaw === 'fix') {
          setAnalysisKind(kindRaw)
          analysisKindRef.current = kindRaw
        }
        const analysis = typeof res.aiAnalysis === 'string' ? res.aiAnalysis : ''
        if (analysis.trim() && (await applyAiText(analysis))) return 'applied'
        return 'error'
      }
      if (status === 'error') return 'error'
      return 'pending'
    } catch {
      return 'missing'
    }
  }

  async function onApplyAiClick() {
    const draft = aiDraft.trim()
    if (draft) {
      await applyAiText(draft)
      return
    }
    if (pendingCrashJobId) {
      const state = await pullCrashJobOnce(pendingCrashJobId)
      if (state === 'applied') return
      if (state === 'pending') {
        setError(t('crash.aiJobPending'))
        return
      }
      setError(t('crash.aiJobNotReady'))
      return
    }
    setError(t('crash.aiPasteRequired'))
  }

  async function onClearAiCacheClick() {
    const current = reportRef.current
    if (!current?.incident?.id) return
    setBusy(true)
    setError('')
    try {
      await apiPost('/tracescope/v1/crash-ai-cache-clear', {
        repoPath: repo,
        incidentId: current.incident.id,
      })
      const next: CrashAnalysisReport = {
        ...current,
        aiAnalysis: undefined,
        defectBody: stripAiSection(current.defectBody || ''),
      }
      setReport(next)
      reportRef.current = next
      setAiDraft('')
      setHint(t('crash.aiCacheCleared'))
    } catch (err) {
      setError((err as Error).message || String(err))
    } finally {
      setBusy(false)
    }
  }

  // Auto write-back when the agent publishes tracescope_publish_crash_analysis.
  useEffect(() => {
    if (!pendingCrashJobId) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    const startedAt = Date.now()
    const MAX_WAIT_MS = 180_000
    const tick = async () => {
      const state = await pullCrashJobOnce(pendingCrashJobId)
      if (cancelled) return
      if (state === 'applied') return
      if (state === 'error') {
        setPendingCrashJobId('')
        setError(t('crash.aiJobNotReady'))
        return
      }
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        setPendingCrashJobId('')
        setHint(t('crash.aiJobTimeout'))
        return
      }
      timer = setTimeout(() => {
        void tick()
      }, 2000)
    }
    timer = setTimeout(() => {
      void tick()
    }, 2500)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll only while job id changes
  }, [pendingCrashJobId])

  async function onPasteAiFromClipboard() {
    try {
      const text = await navigator.clipboard?.readText?.()
      if (!text?.trim()) {
        setError(t('crash.aiPasteRequired'))
        return
      }
      setAiDraft(text)
      // Clipboard action should complete write-back, not only fill the textarea.
      await applyAiText(text)
    } catch {
      setError(t('crash.aiClipboardFail'))
    }
  }

  async function onCopyReportClick() {
    setBusy(true)
    setError('')
    try {
      const r = await ensureReport()
      if (!r) return
      const ok = await copyTextToClipboard(r.defectBody || buildCrashExportMarkdown(r, repo))
      if (ok) setHint(t('crash.copied'))
      else setError(t('crash.copyFail'))
    } catch (err) {
      setError((err as Error).message || String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onExportReportClick() {
    setBusy(true)
    setError('')
    try {
      const r = await ensureReport()
      if (!r) return
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const idPart = (r.incident.id || 'crash').replace(/[^\w.-]+/g, '_').slice(0, 40)
      const filename = `tracescope-crash-${idPart}-${stamp}.md`
      downloadTextFile(filename, buildCrashExportMarkdown(r, repo), 'text/markdown')
      setHint(t('crash.exported', { name: filename }))
    } catch (err) {
      setError((err as Error).message || String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onSubmitClick() {
    setBusy(true)
    setError('')
    try {
      const r = await ensureReport()
      if (!r) return
      if (!trackerReady) {
        setHint(t('diff.board.hint.finishTrackerConfig'))
        onOpenTrackerSettings?.()
        return
      }
      if (!onSubmitDefect) return
      const subject = r.incident.title || t('crash.submitDefect')
      onSubmitDefect(r, subject)
    } catch (err) {
      setError((err as Error).message || String(err))
    } finally {
      setBusy(false)
    }
  }

  const totalPages =
    typeof listTotal === 'number' && listTotal > 0
      ? Math.max(1, Math.ceil(listTotal / CRASH_LIST_PAGE_SIZE))
      : undefined

  const noMatch = report && (!report.matchedFiles || !report.matchedFiles.length)

  const activeFilters = capabilityFilters.length
    ? capabilityFilters
    : ([
        'timeRange',
        'appVersion',
        'errorKind',
        'osDevice',
        'sort',
        'status',
        'keyword',
      ] as FilterKey[])

  const filterMetaType = useMemo(() => metaTypeFromFilters(filters), [filters])

  const fetchFilterOptions = useCallback(async () => {
    if (!repo) return
    if (!remoteReady()) return
    setFilterOptionsBusy(true)
    setFilterOptionsError('')
    try {
      const data = await apiPost('/tracescope/v1/crash-filter-options', {
        ...configBody(),
        metaType: filterMetaType,
      })
      const errMsg = typeof data.error === 'string' ? data.error : ''
      if (errMsg && isAuthFailure(data.errorCode, errMsg)) {
        handleAuthFailure(authExpiredMessage())
        return
      }
      if (errMsg) {
        setFilterOptionsError(errMsg)
        return
      }
      const toOpts = (raw: unknown): FilterOption[] => {
        if (!Array.isArray(raw)) return []
        return raw
          .map((row) => {
            if (!row || typeof row !== 'object') return null
            const o = row as Record<string, unknown>
            const value = typeof o.value === 'string' ? o.value.trim() : ''
            const label = typeof o.label === 'string' ? o.label.trim() : value
            if (!value) return null
            return { value, label: label || value }
          })
          .filter((x): x is FilterOption => Boolean(x))
      }
      const versions = toOpts(data.versions)
      const osVersions = toOpts(data.osVersions)
      const devices = toOpts(data.devices)
      setFilterOptions({ versions, osVersions, devices })
      setFilters((f) => ({
        ...f,
        appVersions: pruneSelected(f.appVersions, versions),
        osVersions: pruneSelected(f.osVersions, osVersions),
        deviceModels: pruneSelected(f.deviceModels, devices),
      }))
      setAppliedFilters((f) => ({
        ...f,
        appVersions: pruneSelected(f.appVersions, versions),
        osVersions: pruneSelected(f.osVersions, osVersions),
        deviceModels: pruneSelected(f.deviceModels, devices),
      }))
    } catch (err) {
      const msg = (err as Error).message || String(err)
      if (isAuthFailure(undefined, msg)) handleAuthFailure(authExpiredMessage())
      else setFilterOptionsError(msg)
    } finally {
      setFilterOptionsBusy(false)
    }
  }, [
    apiPost,
    authExpiredMessage,
    configBody,
    filterMetaType,
    handleAuthFailure,
    remoteReady,
    repo,
  ])

  useEffect(() => {
    void fetchFilterOptions()
  }, [fetchFilterOptions])

  function toggleInList<T extends string>(key: 'errorKinds' | 'statuses', value: T) {
    setFilters((f) => {
      const cur = f[key] as T[]
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
      return { ...f, [key]: next }
    })
  }

  function statusLabel(s: string | undefined): string {
    if (s === 'open') return t('crash.status.open')
    if (s === 'closed') return t('crash.status.closed')
    if (s === 'other') return t('crash.status.other')
    return s || '—'
  }

  function errorKindLabel(k: string | undefined): string {
    if (k === 'crash') return t('crash.errorKind.crash')
    if (k === 'anr') return t('crash.errorKind.anr')
    if (k === 'error') return t('crash.errorKind.error')
    if (k === 'other') return t('crash.errorKind.other')
    return k || '—'
  }

  /** Compact one-line summary of applied filters for the collapsed header. */
  const filtersSummary = useMemo(() => {
    const parts: string[] = []
    const tr = appliedFilters.timeRange
    if (tr === '24h') parts.push(t('crash.timeRange.24h'))
    else if (tr === '30d') parts.push(t('crash.timeRange.30d'))
    else if (tr === '90d') parts.push(t('crash.timeRange.90d'))
    else if (tr === 'custom') {
      const range = [appliedFilters.startAt, appliedFilters.endAt].filter(Boolean).join(' ~ ')
      parts.push(range || t('crash.timeRange.custom'))
    } else {
      parts.push(t('crash.timeRange.7d'))
    }
    if (appliedFilters.errorKinds.length) {
      parts.push(appliedFilters.errorKinds.map((k) => errorKindLabel(k)).join('/'))
    }
    if (appliedFilters.appVersions.length) {
      parts.push(`${t('crash.filter.appVersion')}×${appliedFilters.appVersions.length}`)
    }
    if (appliedFilters.osVersions.length) {
      parts.push(`${t('crash.filter.osVersions')}×${appliedFilters.osVersions.length}`)
    }
    if (appliedFilters.deviceModels.length) {
      parts.push(`${t('crash.filter.deviceModels')}×${appliedFilters.deviceModels.length}`)
    }
    if (appliedFilters.statuses.length) {
      parts.push(appliedFilters.statuses.map((s) => statusLabel(s)).join('/'))
    }
    if (appliedFilters.keyword.trim()) {
      parts.push(`${t('crash.filter.keyword')}: ${appliedFilters.keyword.trim()}`)
    }
    return parts.join(' · ')
  }, [appliedFilters, t])

  const configDisabled = busy || configBusy || listBusy || detailBusy
  const appLabel =
    provider === 'local'
      ? capturePlatform === 'ios'
        ? t('crash.inboxPlatformIos')
        : t('crash.inboxPlatformAndroid')
      : appDisplayName.trim() ||
        (provider === 'crashlytics' ? projectId.trim() || appId.trim() : appKey.trim())
  const configHeaderLabel =
    provider === 'local'
      ? t('crash.inboxConfig')
      : provider === 'crashlytics'
        ? t('crash.crashlyticsConfig')
        : t('crash.umengConfig')
  const umengHeader = appLabel ? `${configHeaderLabel} · ${appLabel}` : configHeaderLabel
  const configTitle =
    provider === 'local'
      ? t('crash.inboxHint')
      : provider === 'crashlytics'
        ? appId.trim()
          ? `${t('crash.appId')}: ${appId.trim()}`
          : undefined
        : appKey.trim()
          ? `${t('crash.appKey')}: ${appKey.trim()}`
          : undefined

  return (
    <section style={card}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{t('crash.mode')}</div>

      <label style={{ ...label, marginBottom: 10 }}>
        {t('crash.provider')}
        <select
          style={input}
          value={provider}
          disabled={configDisabled}
          onChange={(e) => {
            const next = parseProviderId(e.target.value)
            setProvider(next)
            setListItems([])
            setListTotal(undefined)
            setSelectedId('')
            setSelectedIncident(null)
            setReport(null)
            reportRef.current = null
            reportKindRef.current = null
            setUmengOpen(true)
          }}
        >
          <option value="local">{t('crash.providerLocal')}</option>
          <option value="umeng">{t('crash.providerUmeng')}</option>
          <option value="crashlytics">{t('crash.providerCrashlytics')}</option>
        </select>
      </label>
      {provider === 'local' ? (
        <p style={{ margin: '0 0 10px', color: '#6b645a', fontSize: 12, lineHeight: 1.45 }}>
          {t('crash.inboxHint')}
        </p>
      ) : null}

      <div style={{ marginBottom: 10 }}>
        <button
          type="button"
          style={{ ...btn, width: '100%', textAlign: 'left', fontWeight: 600 }}
          onClick={() => setUmengOpen((v) => !v)}
          title={configTitle}
        >
          {umengOpen ? '▾ ' : '▸ '}
          {umengHeader}
        </button>
        {umengOpen ? (
          <div style={{ marginTop: 8 }}>
            {provider !== 'local' ? (
              <p style={{ margin: '0 0 8px', color: '#6b645a', fontSize: 12, lineHeight: 1.45 }}>
                {provider === 'crashlytics' ? t('crash.crashlyticsHint') : t('crash.cookieHint')}
              </p>
            ) : null}
            {provider !== 'local' ? (
            <label style={label}>
              {t('crash.appDisplayName')}
              <input
                style={input}
                value={appDisplayName}
                disabled={configDisabled}
                placeholder={t('crash.appDisplayNamePlaceholder')}
                onChange={(e) => setAppDisplayName(e.target.value)}
              />
            </label>
            ) : null}
            {provider === 'local' ? (
              <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
                <label style={label}>
                  {t('crash.inboxCapturePlatform')}
                  <select
                    style={input}
                    value={capturePlatform}
                    disabled={configDisabled || captureActive}
                    onChange={(e) => {
                      const next = e.target.value === 'ios' ? 'ios' : 'android'
                      setCapturePlatform(next)
                      setCaptureDeviceId('')
                      setCaptureDevices([])
                      if (next === 'android') setIosPrep(null)
                      else setAdbPrep(null)
                    }}
                  >
                    <option value="android">{t('crash.inboxPlatformAndroid')}</option>
                    <option value="ios">{t('crash.inboxPlatformIos')}</option>
                  </select>
                </label>
                {capturePlatform === 'ios' &&
                !iosCaptureSupported &&
                iosPrep?.phase !== 'checking' &&
                iosPrep?.phase !== 'error' ? (
                  <p style={{ margin: 0, fontSize: 12, color: '#b54708', lineHeight: 1.45 }}>
                    {iosCaptureReason || t('crash.inboxIosUnsupported')}
                  </p>
                ) : null}
                <div style={{ ...row, alignItems: 'flex-end' }}>
                  <label style={{ ...label, marginBottom: 0, flex: 1 }}>
                    {t('crash.inboxDevice')}
                    <select
                      style={input}
                      value={captureDeviceId}
                      disabled={configDisabled || captureActive || captureBusy}
                      onChange={(e) => setCaptureDeviceId(e.target.value)}
                    >
                      <option value="">{t('crash.inboxDeviceNone')}</option>
                      {captureDevices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                          {d.state ? ` · ${d.state}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    style={btn}
                    disabled={configDisabled || captureBusy}
                    onClick={() => void refreshCaptureDevices()}
                  >
                    {captureBusy ? t('common.loading') : t('crash.inboxRefreshDevices')}
                  </button>
                </div>
                {capturePlatform === 'ios' && iosPrep ? (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--dsh-border, #ddd4c5)',
                      background: '#fff',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                      {t('crash.inboxIosProgressTitle')}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b645a', lineHeight: 1.45, marginBottom: 8 }}>
                      {iosPrep.message}
                    </div>
                    {iosPrep.phase === 'checking' ? (
                      <div
                        style={{
                          height: 8,
                          borderRadius: 999,
                          background: '#eee6da',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width:
                              iosPrep.percent != null
                                ? `${Math.max(4, Math.min(100, iosPrep.percent))}%`
                                : captureBusy
                                  ? '40%'
                                  : '100%',
                            background: 'var(--dsh-accent, #0f6e56)',
                            borderRadius: 999,
                            transition: 'width 0.25s ease',
                          }}
                        />
                      </div>
                    ) : null}
                    {iosPrep.phase === 'error' && iosPrep.installCommand ? (
                      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                        <pre
                          style={{
                            margin: 0,
                            padding: '8px 10px',
                            fontSize: 11,
                            lineHeight: 1.45,
                            borderRadius: 6,
                            background: '#f5f0e8',
                            overflowX: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {iosPrep.installCommand}
                        </pre>
                        <button type="button" style={btn} onClick={() => void copyIosInstallCommand()}>
                          {t('crash.inboxIosCopyInstall')}
                        </button>
                      </div>
                    ) : null}
                    {iosPrep.phase === 'error' ? (
                      <button
                        type="button"
                        style={{ ...btn, marginTop: iosPrep.installCommand ? 8 : 0 }}
                        disabled={captureBusy}
                        onClick={recheckIosTools}
                      >
                        {t('crash.inboxIosRecheck')}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {capturePlatform === 'android' &&
                adbPrep &&
                (adbPrep.phase === 'checking' ||
                  adbPrep.phase === 'downloading' ||
                  adbPrep.phase === 'extracting' ||
                  captureBusy) ? (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--dsh-border, #ddd4c5)',
                      background: '#fff',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                      {t('crash.inboxAdbProgressTitle')}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b645a', lineHeight: 1.45, marginBottom: 8 }}>
                      {adbPrep.message || t('crash.inboxPreparingAdb')}
                    </div>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 999,
                        background: '#eee6da',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width:
                            adbPrep.percent != null
                              ? `${Math.max(4, Math.min(100, adbPrep.percent))}%`
                              : captureBusy
                                ? '40%'
                                : '100%',
                          background: 'var(--dsh-accent, #0f6e56)',
                          borderRadius: 999,
                          transition: 'width 0.25s ease',
                        }}
                      />
                    </div>
                    {adbPrep.percent != null ? (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#6b645a' }}>
                        {adbPrep.percent}%
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {capturePlatform === 'android' ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ ...label, marginBottom: 0 }}>
                      {t('crash.inboxWireless')}
                      <div style={{ ...row, marginTop: 4, alignItems: 'flex-end' }}>
                        <input
                          style={{ ...input, flex: 1, marginBottom: 0 }}
                          value={wirelessTarget}
                          disabled={configDisabled || captureBusy}
                          placeholder={t('crash.inboxWirelessPlaceholder')}
                          onChange={(e) => setWirelessTarget(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              void connectWirelessAdb()
                            }
                          }}
                        />
                        <button
                          type="button"
                          style={btn}
                          disabled={configDisabled || captureBusy || !wirelessTarget.trim()}
                          onClick={() => void connectWirelessAdb()}
                        >
                          {t('crash.inboxWirelessConnect')}
                        </button>
                      </div>
                    </label>
                    <p style={{ margin: 0, fontSize: 11, color: '#6b645a', lineHeight: 1.45 }}>
                      {t('crash.inboxWirelessHint')}
                    </p>
                  </div>
                ) : null}
                <div style={row}>
                  {captureActive ? (
                    <button
                      type="button"
                      style={primary}
                      disabled={captureBusy}
                      onClick={() => void stopInboxCapture()}
                    >
                      {t('crash.inboxStopCapture')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      style={primary}
                      disabled={
                        captureBusy ||
                        (capturePlatform === 'ios' &&
                          (!iosCaptureSupported || iosPrep?.phase === 'checking')) ||
                        (capturePlatform === 'android' && !captureDeviceId)
                      }
                      onClick={() => void startInboxCapture()}
                    >
                      {t('crash.inboxStartCapture')}
                    </button>
                  )}
                  {captureActive ? (
                    <span style={{ fontSize: 12, color: '#3d6b4f' }}>
                      {t('crash.inboxCapturing', { count: String(captureHitCount) })}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : provider === 'crashlytics' ? (
              <>
                <label style={label}>
                  {t('crash.projectId')}
                  <input
                    style={input}
                    value={projectId}
                    disabled={configDisabled}
                    placeholder={t('crash.projectIdPlaceholder')}
                    onChange={(e) => setProjectId(e.target.value)}
                  />
                </label>
                <label style={label}>
                  {t('crash.appId')}
                  <input
                    style={input}
                    value={appId}
                    disabled={configDisabled}
                    placeholder={t('crash.appIdPlaceholder')}
                    onChange={(e) => setAppId(e.target.value)}
                  />
                </label>
                <label style={label}>
                  {t('crash.accessToken')}
                  <textarea
                    style={{
                      ...input,
                      minHeight: 56,
                      resize: 'vertical',
                      fontFamily: 'ui-monospace, monospace',
                    }}
                    value={accessToken}
                    disabled={configDisabled}
                    placeholder={
                      hasStoredAccessToken ? MASKED_COOKIE : t('crash.accessTokenPlaceholder')
                    }
                    onChange={(e) => setAccessToken(e.target.value)}
                  />
                </label>
                <label style={label}>
                  {t('crash.serviceAccountJson')}
                  <textarea
                    style={{
                      ...input,
                      minHeight: 72,
                      resize: 'vertical',
                      fontFamily: 'ui-monospace, monospace',
                    }}
                    value={serviceAccountJson}
                    disabled={configDisabled}
                    placeholder={
                      hasStoredServiceAccount
                        ? MASKED_COOKIE
                        : t('crash.serviceAccountJsonPlaceholder')
                    }
                    onChange={(e) => setServiceAccountJson(e.target.value)}
                  />
                </label>
                {hasStoredServiceAccount ? (
                  <p style={{ margin: '0 0 8px', color: '#3d6b4f', fontSize: 12, lineHeight: 1.45 }}>
                    {t('crash.serviceAccountSaved')}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <label style={label}>
                  {t('crash.appKey')}
                  <input
                    style={input}
                    value={appKey}
                    disabled={configDisabled}
                    placeholder={t('crash.appKeyPlaceholder')}
                    onChange={(e) => setAppKey(e.target.value)}
                  />
                </label>
                <label style={label}>
                  {t('crash.cookie')}
                  <textarea
                    style={{
                      ...input,
                      minHeight: 72,
                      resize: 'vertical',
                      fontFamily: 'ui-monospace, monospace',
                    }}
                    value={cookie}
                    disabled={configDisabled}
                    placeholder={hasStoredCookie ? MASKED_COOKIE : t('crash.cookiePlaceholder')}
                    onChange={(e) => setCookie(e.target.value)}
                  />
                </label>
              </>
            )}
            {provider !== 'local' ? (
              <>
            <label style={{ ...row, marginBottom: 8, fontWeight: 600, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={remember}
                disabled={configDisabled}
                onChange={(e) => setRemember(e.target.checked)}
              />
              {t('crash.rememberCredentials')}
            </label>
            <div style={{ ...row, marginBottom: 4 }}>
              <button type="button" style={btn} disabled={configDisabled} onClick={() => void saveCredentials()}>
                {t('crash.saveCredentials')}
              </button>
              <button type="button" style={btn} disabled={configDisabled} onClick={() => void clearCookieClick()}>
                {provider === 'crashlytics' ? t('crash.clearToken') : t('crash.clearCookie')}
              </button>
            </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        style={{
          marginBottom: 10,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          style={primary}
          disabled={configDisabled || listBusy}
          onClick={() => void runProbe()}
          title={provider === 'local' ? t('crash.inboxRefreshList') : t('crash.probeHint')}
        >
          {configBusy || listBusy
            ? t('common.loading')
            : provider === 'local'
              ? t('crash.inboxRefreshList')
              : t('crash.fetchList')}
        </button>
        <span style={{ color: '#6b645a', fontSize: 12, lineHeight: 1.45 }}>
          {provider === 'local' ? t('crash.inboxFetchHint') : t('crash.fetchListHint')}
        </span>
      </div>

      {provider !== 'local' && activeFilters.length ? (
        <div
          style={{
            marginBottom: 10,
            borderRadius: 8,
            border: '1px solid var(--dsh-border, #ddd4c5)',
            background: '#faf8f3',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            style={{
              ...btn,
              width: '100%',
              textAlign: 'left',
              fontWeight: 600,
              borderRadius: 0,
              background: 'transparent',
              padding: '8px 10px',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            <span style={{ flexShrink: 0 }}>{filtersOpen ? '▾' : '▸'}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12 }}>{t('crash.filters')}</span>
              {!filtersOpen ? (
                <span
                  style={{
                    display: 'block',
                    marginTop: 2,
                    fontSize: 11,
                    fontWeight: 400,
                    color: filtersDirty ? '#b54708' : '#6b645a',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={filtersSummary}
                >
                  {filtersDirty ? `${t('crash.filtersDirty')} · ` : ''}
                  {filtersSummary || t('crash.filtersCollapsedHint')}
                </span>
              ) : null}
            </span>
          </button>
          {filtersOpen ? (
          <div style={{ display: 'grid', gap: 8, padding: '0 10px 10px' }}>
            {activeFilters.includes('timeRange') ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ ...label, marginBottom: 0 }}>
                  {t('crash.filter.timeRange')}
                  <select
                    style={input}
                    value={filters.timeRange}
                    disabled={configDisabled}
                    onChange={(e) => {
                      const next = e.target.value as TimeRangePreset
                      if (next === 'custom') {
                        setFilters((f) => ({
                          ...f,
                          timeRange: 'custom',
                          startAt: f.startAt || rangeDatesForPreset('7d').startAt,
                          endAt: f.endAt || rangeDatesForPreset('7d').endAt,
                        }))
                        return
                      }
                      const dates = rangeDatesForPreset(next || '7d')
                      setFilters((f) => ({
                        ...f,
                        timeRange: next,
                        startAt: dates.startAt,
                        endAt: dates.endAt,
                      }))
                    }}
                  >
                    <option value="24h">{t('crash.timeRange.24h')}</option>
                    <option value="7d">{t('crash.timeRange.7d')}</option>
                    <option value="30d">{t('crash.timeRange.30d')}</option>
                    <option value="90d">{t('crash.timeRange.90d')}</option>
                    <option value="custom">{t('crash.timeRange.custom')}</option>
                  </select>
                </label>
                <div style={{ ...row, alignItems: 'flex-end' }}>
                  <label style={{ ...label, marginBottom: 0, flex: 1 }}>
                    {t('crash.filter.startAt')}
                    <input
                      type="date"
                      style={input}
                      value={filters.startAt}
                      disabled={configDisabled}
                      max={filters.endAt || undefined}
                      onChange={(e) => {
                        const startAt = e.target.value
                        setFilters((f) => ({
                          ...f,
                          timeRange: 'custom',
                          startAt,
                          endAt: f.endAt && startAt && f.endAt < startAt ? startAt : f.endAt,
                        }))
                      }}
                    />
                  </label>
                  <label style={{ ...label, marginBottom: 0, flex: 1 }}>
                    {t('crash.filter.endAt')}
                    <input
                      type="date"
                      style={input}
                      value={filters.endAt}
                      disabled={configDisabled}
                      min={filters.startAt || undefined}
                      onChange={(e) => {
                        const endAt = e.target.value
                        setFilters((f) => ({
                          ...f,
                          timeRange: 'custom',
                          endAt,
                          startAt: f.startAt && endAt && f.startAt > endAt ? endAt : f.startAt,
                        }))
                      }}
                    />
                  </label>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: '#6b645a', lineHeight: 1.45 }}>
                  {t('crash.filter.timeRangeHelp')}
                </p>
              </div>
            ) : null}
            {activeFilters.includes('errorKind') ? (
              <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
                <legend style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                  {t('crash.filter.errorKind')}
                </legend>
                <div style={row}>
                  {(['crash', 'anr', 'error', 'other'] as const).map((k) => (
                    <label key={k} style={{ display: 'flex', gap: 4, alignItems: 'center', fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        checked={filters.errorKinds.includes(k)}
                        disabled={configDisabled}
                        onChange={() => toggleInList('errorKinds', k)}
                      />
                      {errorKindLabel(k)}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {activeFilters.includes('appVersion') || activeFilters.includes('osDevice') ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ ...row, justifyContent: 'space-between' }}>
                  <p style={{ margin: 0, fontSize: 11, color: '#6b645a', lineHeight: 1.45, flex: 1 }}>
                    {t('crash.filter.optionsHelp')}
                  </p>
                  <button
                    type="button"
                    disabled={configDisabled || filterOptionsBusy}
                    style={{ ...btn, padding: '4px 8px', fontSize: 11 }}
                    onClick={() => void fetchFilterOptions()}
                  >
                    {filterOptionsBusy ? t('crash.filter.optionsLoading') : t('crash.filter.optionsReload')}
                  </button>
                </div>
                {filterOptionsError ? (
                  <p style={{ margin: 0, fontSize: 11, color: '#b42318' }}>{filterOptionsError}</p>
                ) : null}
                {activeFilters.includes('appVersion') ? (
                  <FilterOptionPicker
                    title={t('crash.filter.appVersion')}
                    options={filterOptions.versions}
                    selected={filters.appVersions}
                    disabled={configDisabled}
                    loading={filterOptionsBusy}
                    searchPlaceholder={t('crash.filter.optionsSearch')}
                    emptyText={t('crash.filter.optionsEmpty')}
                    loadingText={t('crash.filter.optionsLoading')}
                    clearLabel={t('crash.filter.osDeviceClear')}
                    selectedCountLabel={t('crash.filter.optionsSelected')}
                    maxSelectedHint={t('crash.filter.optionsMaxHint')}
                    onChange={(next) => setFilters((f) => ({ ...f, appVersions: next }))}
                  />
                ) : null}
                {activeFilters.includes('osDevice') ? (
                  <>
                    <FilterOptionPicker
                      title={t('crash.filter.osVersions')}
                      options={filterOptions.osVersions}
                      selected={filters.osVersions}
                      disabled={configDisabled}
                      loading={filterOptionsBusy}
                      searchPlaceholder={t('crash.filter.optionsSearch')}
                      emptyText={t('crash.filter.optionsEmpty')}
                      loadingText={t('crash.filter.optionsLoading')}
                      clearLabel={t('crash.filter.osDeviceClear')}
                      selectedCountLabel={t('crash.filter.optionsSelected')}
                      maxSelectedHint={t('crash.filter.optionsMaxHint')}
                      onChange={(next) => setFilters((f) => ({ ...f, osVersions: next }))}
                    />
                    <FilterOptionPicker
                      title={t('crash.filter.deviceModels')}
                      options={filterOptions.devices}
                      selected={filters.deviceModels}
                      disabled={configDisabled}
                      loading={filterOptionsBusy}
                      searchPlaceholder={t('crash.filter.optionsSearch')}
                      emptyText={t('crash.filter.optionsEmpty')}
                      loadingText={t('crash.filter.optionsLoading')}
                      clearLabel={t('crash.filter.osDeviceClear')}
                      selectedCountLabel={t('crash.filter.optionsSelected')}
                      maxSelectedHint={t('crash.filter.optionsMaxHint')}
                      onChange={(next) => setFilters((f) => ({ ...f, deviceModels: next }))}
                    />
                  </>
                ) : null}
              </div>
            ) : null}
            {activeFilters.includes('sort') ? (
              <div style={row}>
                <label style={{ ...label, marginBottom: 0, flex: 1 }}>
                  {t('crash.filter.sort')}
                  <select
                    style={input}
                    value={filters.sortField}
                    disabled={configDisabled}
                    onChange={(e) => {
                      setFilters((f) => ({
                        ...f,
                        sortField: e.target.value as FilterState['sortField'],
                      }))
                    }}
                  >
                    <option value="count">{t('crash.sort.count')}</option>
                    <option value="lastSeenAt">{t('crash.sort.lastSeen')}</option>
                    <option value="title">{t('crash.sort.title')}</option>
                  </select>
                </label>
                <label style={{ ...label, marginBottom: 0, flex: 1 }}>
                  {t('crash.filter.sortDir')}
                  <select
                    style={input}
                    value={filters.sortDir}
                    disabled={configDisabled}
                    onChange={(e) => {
                      setFilters((f) => ({
                        ...f,
                        sortDir: e.target.value as 'asc' | 'desc',
                      }))
                    }}
                  >
                    <option value="desc">{t('crash.sort.desc')}</option>
                    <option value="asc">{t('crash.sort.asc')}</option>
                  </select>
                </label>
              </div>
            ) : null}
            {activeFilters.includes('status') ? (
              <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
                <legend style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                  {t('crash.filter.status')}
                </legend>
                <div style={row}>
                  {(['open', 'closed', 'other'] as const).map((k) => (
                    <label key={k} style={{ display: 'flex', gap: 4, alignItems: 'center', fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        checked={filters.statuses.includes(k)}
                        disabled={configDisabled}
                        onChange={() => toggleInList('statuses', k)}
                      />
                      {statusLabel(k)}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {activeFilters.includes('keyword') ? (
              <label style={{ ...label, marginBottom: 0 }}>
                {t('crash.filter.keyword')}
                <input
                  style={input}
                  value={filters.keyword}
                  disabled={configDisabled}
                  placeholder={t('crash.filter.keywordHint')}
                  onChange={(e) => onKeywordChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      applyFiltersAndFetch()
                    }
                  }}
                />
              </label>
            ) : null}
            <div style={{ ...row, marginTop: 4, justifyContent: 'space-between' }}>
              <p style={{ margin: 0, fontSize: 11, color: filtersDirty ? '#b54708' : '#6b645a', lineHeight: 1.45 }}>
                {filtersDirty ? t('crash.filtersDirty') : t('crash.filtersIdle')}
              </p>
              <button
                type="button"
                style={primary}
                disabled={configDisabled || listBusy}
                onClick={() => applyFiltersAndFetch()}
              >
                {listBusy ? t('common.loading') : t('crash.applyFilters')}
              </button>
            </div>
          </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginBottom: 10 }}>
        <div style={{ ...row, justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontWeight: 600, fontSize: 12 }}>
            {provider === 'local' ? t('crash.inboxListTitle') : t('crash.listTitle')}
            {provider === 'local' && typeof listTotal === 'number' && !listBusy
              ? t('crash.inboxListCount', { count: String(listTotal) })
              : null}
          </div>
          {listItems.length || listBusy ? (
            <div style={{ fontSize: 11, color: '#6b645a' }}>
              {typeof listTotal === 'number'
                ? t('crash.pageStatusTotal', {
                    page: String(listPage),
                    totalPages: String(totalPages ?? '—'),
                    total: String(listTotal),
                  })
                : t('crash.pageStatus', { page: String(listPage) })}
            </div>
          ) : null}
        </div>
        {listBusy && !listItems.length ? (
          <p style={{ margin: 0, fontSize: 12, color: '#6b645a' }}>{t('crash.listLoading')}</p>
        ) : null}
        {!listBusy && !listItems.length ? (
          <p style={{ margin: 0, fontSize: 12, color: '#6b645a' }}>
            {provider === 'local'
              ? t('crash.inboxListEmpty')
              : hasDimensionFilters
                ? t('crash.listEmptyFiltered')
                : t('crash.listEmptyHint')}
          </p>
        ) : null}
        {listItems.length ? (
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'grid',
              gap: 6,
              maxHeight: 280,
              overflow: 'auto',
            }}
          >
            {listItems.map((item) => {
              const active = item.id === selectedId
              return (
                <li key={item.id} style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                  <button
                    type="button"
                    disabled={detailBusy}
                    onClick={() => void loadDetail(item.id)}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: active
                        ? '2px solid var(--dsh-accent, #0f6e56)'
                        : '1px solid var(--dsh-border, #ddd4c5)',
                      background: active ? '#eef7f3' : '#fff',
                      cursor: 'pointer',
                      fontSize: 12,
                      lineHeight: 1.45,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div style={{ color: '#6b645a', marginTop: 2 }}>
                      {t('crash.col.version')}: {item.appVersion || '—'} · {t('crash.col.count')}:{' '}
                      {item.count ?? '—'} · {t('crash.col.affectedUsers')}: {item.affectedUsers ?? '—'} ·{' '}
                      {t('crash.col.status')}: {statusLabel(item.status)}
                    </div>
                  </button>
                  {provider === 'local' ? (
                    <button
                      type="button"
                      style={{ ...btn, alignSelf: 'center' }}
                      disabled={busy || detailBusy}
                      title={t('crash.inboxDelete')}
                      onClick={() => void deleteInboxItem(item.id)}
                    >
                      {t('crash.inboxDelete')}
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}
        {listItems.length || listPage > 1 ? (
          <div style={{ ...row, marginTop: 8, justifyContent: 'space-between' }}>
            <button
              type="button"
              style={btn}
              disabled={configDisabled || listBusy || listPage <= 1}
              onClick={() => goListPage(listPage - 1)}
            >
              {t('crash.prevPage')}
            </button>
            <button
              type="button"
              style={btn}
              disabled={
                configDisabled ||
                listBusy ||
                (totalPages != null ? listPage >= totalPages : !listHasMore)
              }
              onClick={() => goListPage(listPage + 1)}
            >
              {t('crash.nextPage')}
            </button>
          </div>
        ) : null}
      </div>

      {selectedIncident || detailBusy ? (
        <div ref={detailPanelRef} style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>{t('crash.detailStack')}</div>
          <pre
            style={{
              margin: 0,
              padding: 10,
              background: '#fff',
              border: '1px solid var(--dsh-border, #ddd4c5)',
              borderRadius: 8,
              fontSize: 11,
              lineHeight: 1.4,
              maxHeight: 200,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
            }}
          >
            {detailBusy ? t('common.loading') : selectedIncident?.stackText}
          </pre>
        </div>
      ) : null}

      <div style={{ ...row, marginBottom: 10 }}>
        <button
          type="button"
          style={primary}
          disabled={busy || detailBusy}
          title={t('crash.writeReproduceTitle')}
          onClick={() => void writeSessionFor(undefined, 'reproduce')}
        >
          {busy && analysisKind === 'reproduce' ? t('common.loading') : t('crash.writeReproduce')}
        </button>
        <button
          type="button"
          style={btn}
          disabled={busy || detailBusy}
          title={t('crash.writeFixTitle')}
          onClick={() => void writeSessionFor(undefined, 'fix')}
        >
          {busy && analysisKind === 'fix' ? t('common.loading') : t('crash.writeFix')}
        </button>
        <button type="button" style={btn} disabled={busy || detailBusy} onClick={() => void onCopyReportClick()}>
          {t('crash.copyReport')}
        </button>
        <button type="button" style={btn} disabled={busy || detailBusy} onClick={() => void onExportReportClick()}>
          {t('crash.exportReport')}
        </button>
        <button type="button" style={btn} disabled={busy || detailBusy} onClick={() => void onSubmitClick()}>
          {t('crash.submitDefect')}
        </button>
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: '#6b645a', lineHeight: 1.45 }}>
        {t('crash.writeSessionHintShort')}
      </p>

      {error ? (
        <p style={{ margin: '0 0 8px', color: '#b42318', fontSize: 12, lineHeight: 1.45 }}>{error}</p>
      ) : null}
      {hint ? (
        <p style={{ margin: '0 0 8px', color: '#6b645a', fontSize: 12, lineHeight: 1.45 }}>{hint}</p>
      ) : null}
      {report ? (
        <div ref={reportPanelRef} style={{ marginTop: 4, marginBottom: 10 }}>
          <div
            style={{
              padding: '10px 12px',
              background: '#f7f4ee',
              borderRadius: 8,
              border: '1px solid var(--dsh-border, #ddd4c5)',
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('crash.prepSummary')}</div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{report.summary}</p>
            {noMatch ? (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b645a' }}>{t('crash.noRepoMatch')}</p>
            ) : null}
          </div>
          {report.matchedFiles?.length ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>{t('crash.matchedFiles')}</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.45 }}>
                {report.matchedFiles.map((m) => (
                  <li key={m.path + (m.symbol || '') + String(m.line ?? '')}>
                    <code>{`${m.path}${m.line != null ? `:${m.line}` : ''}`}</code>
                    {m.symbol ? ` · ${m.symbol}` : ''}
                    {m.reason ? ` — ${m.reason}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.aiAnalysis?.trim() ? (
            <div
              style={{
                padding: '10px 12px',
                background: '#eef7f3',
                borderRadius: 8,
                border: '1px solid var(--dsh-border, #ddd4c5)',
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {analysisKind === 'reproduce' ? t('crash.aiReproduceSummary') : t('crash.aiSummary')}
                  <span
                    style={{
                      marginLeft: 8,
                      fontWeight: 500,
                      fontSize: 11,
                      color: '#0f6e56',
                    }}
                  >
                    {t('crash.aiCachedBadge')}
                  </span>
                </div>
                <button
                  type="button"
                  style={{ ...btn, fontSize: 11, padding: '4px 8px' }}
                  disabled={busy}
                  onClick={() => void onClearAiCacheClick()}
                >
                  {t('crash.clearAiCache')}
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {report.aiAnalysis}
              </p>
            </div>
          ) : null}
          <div
            ref={aiPasteRef}
            style={{
              marginBottom: 8,
              padding: 10,
              borderRadius: 8,
              border: awaitingAiPaste
                ? '2px solid var(--dsh-accent, #0f6e56)'
                : '1px dashed var(--dsh-border, #ddd4c5)',
              background: awaitingAiPaste ? '#eef7f3' : '#fff',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>{t('crash.aiPasteTitle')}</div>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: '#6b645a', lineHeight: 1.45 }}>
              {t('crash.aiPasteHint')}
            </p>
            <textarea
              style={{ ...input, minHeight: 96, resize: 'vertical', fontFamily: 'ui-monospace, monospace' }}
              value={aiDraft}
              disabled={busy}
              placeholder={t('crash.aiPastePlaceholder')}
              onChange={(e) => {
                setAiDraft(e.target.value)
                setAwaitingAiPaste(true)
              }}
            />
            <div style={{ ...row, marginTop: 8 }}>
              <button
                type="button"
                style={primary}
                disabled={busy || (!aiDraft.trim() && !pendingCrashJobId)}
                onClick={() => void onApplyAiClick()}
              >
                {t('crash.aiApply')}
              </button>
              <button type="button" style={btn} disabled={busy} onClick={() => void onPasteAiFromClipboard()}>
                {t('crash.aiFromClipboard')}
              </button>
              {pendingCrashJobId ? (
                <span style={{ fontSize: 11, color: '#0f6e56' }}>{t('crash.aiJobWaiting')}</span>
              ) : null}
            </div>
          </div>
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
              {t('crash.promptPreview')}
            </summary>
            <pre
              style={{
                margin: '8px 0 0',
                padding: 10,
                background: '#fff',
                border: '1px solid var(--dsh-border, #ddd4c5)',
                borderRadius: 8,
                fontSize: 11,
                lineHeight: 1.4,
                maxHeight: 200,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {report.prompt}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  )
}
