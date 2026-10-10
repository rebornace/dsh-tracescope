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
  matchedFiles: Array<{ path: string; reason: string; symbol?: string }>
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

const AI_SECTION_HEADERS = ['### AI 分析结论', '### AI analysis'] as const
const STACK_SECTION_HEADERS = ['### 堆栈', '### Stack trace'] as const

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
function mergeAiIntoReport(report: CrashAnalysisReport, aiAnalysis: string): CrashAnalysisReport {
  const text = aiAnalysis.trim()
  if (!text) return { ...report, aiAnalysis: undefined }
  const block = `### AI 分析结论\n\n${text}\n\n`
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
      lines.push(`- \`${m.path}\`${m.symbol ? ` (${m.symbol})` : ''}${m.reason ? ` — ${m.reason}` : ''}`)
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

type CrashProviderId = 'local' | 'umeng'

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
    provider: 'umeng',
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

function umengIncidentForAnalyze(
  selected: UmengIncident,
  stack: string,
  titleText: string,
): Record<string, unknown> {
  return {
    id: selected.id,
    title: defaultTitle(stack, titleText || selected.title),
    provider: 'umeng' as const,
    stackText: stack,
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

function localIncidentId(): string {
  return 'local-' + Date.now().toString(36)
}

function defaultTitle(stack: string, custom: string): string {
  const t = custom.trim()
  if (t) return t.slice(0, 200)
  const first = stack
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean)
  return (first || 'Crash').slice(0, 200)
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
        provider: o.provider === 'umeng' ? 'umeng' : 'local',
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
  if (errorCode === 'UMENG_AUTH') return true
  const m = message.toLowerCase()
  return m.includes('401') || m.includes('auth') || m.includes('cookie') || m.includes('登录')
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
  const [stackText, setStackText] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [report, setReport] = useState<CrashAnalysisReport | null>(null)
  const [umengOpen, setUmengOpen] = useState(true)
  /** Filters are uncommon — collapse by default so analysis stays above the fold. */
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)

  const [provider] = useState<CrashProviderId>('umeng')
  const [appKey, setAppKey] = useState('')
  const [appDisplayName, setAppDisplayName] = useState('')
  const [cookie, setCookie] = useState('')
  const [hasStoredCookie, setHasStoredCookie] = useState(false)
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

  const listGen = useRef(0)
  const detailPanelRef = useRef<HTMLDivElement | null>(null)
  const reportPanelRef = useRef<HTMLDivElement | null>(null)
  const aiPasteRef = useRef<HTMLDivElement | null>(null)
  const reportRef = useRef<CrashAnalysisReport | null>(null)
  reportRef.current = report

  const repo = repoPath.trim()

  const configBody = useCallback(() => {
    const body: Record<string, unknown> = {
      repoPath: repo || undefined,
      provider: 'umeng',
      appKey: appKey.trim(),
      appDisplayName: appDisplayName.trim(),
      remember,
    }
    const cookieTrim = cookie.trim()
    if (cookieTrim && cookieTrim !== MASKED_COOKIE) body.cookie = cookieTrim
    else if (hasStoredCookie) body.cookie = MASKED_COOKIE
    return body
  }, [appDisplayName, appKey, cookie, hasStoredCookie, remember, repo])

  const loadConfig = useCallback(async () => {
    try {
      const params: Record<string, string | undefined> = {}
      if (repo) params.repoPath = repo
      const data = await apiGet('/tracescope/v1/crash-config', params)
      const cfg = data.config as Record<string, unknown> | undefined
      if (!cfg) return
      if (typeof cfg.appKey === 'string') setAppKey(cfg.appKey)
      if (typeof cfg.appDisplayName === 'string') setAppDisplayName(cfg.appDisplayName)
      else setAppDisplayName('')
      setHasStoredCookie(cfg.hasCookie === true)
      if (cfg.hasCookie === true) setCookie(MASKED_COOKIE)
      else setCookie('')
    } catch (err) {
      setError((err as Error).message || String(err))
    }
  }, [apiGet, repo])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const handleAuthFailure = useCallback(
    (message: string) => {
      setError(message || t('crash.cookieExpired'))
      setPasteOpen(true)
      setUmengOpen(true)
    },
    [t],
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
        repoPath: repo || undefined,
        provider: 'umeng',
        appKey: appKey.trim(),
        appDisplayName: appDisplayName.trim(),
        cookie: '',
        clearCookie: true,
        remember,
      })
      const cfg = data.config as Record<string, unknown> | undefined
      const cleared = cfg?.hasCookie !== true
      setCookie('')
      setHasStoredCookie(!cleared)
      if (!cleared) {
        setError(t('crash.probeFail'))
        return
      }
      setListItems([])
      setSelectedId('')
      setSelectedIncident(null)
      setHint(t('crash.cookieCleared'))
    } catch (err) {
      setError((err as Error).message || String(err))
    } finally {
      setConfigBusy(false)
    }
  }, [apiPost, appDisplayName, appKey, remember, repo, t])

  const fetchList = useCallback(
    async (opts?: { page?: number; filters?: FilterState }) => {
      if (!repo) return
      if (!Boolean(appKey.trim()) || !cookieReady(hasStoredCookie, cookie)) return

      const page = opts?.page ?? listPage
      const queryFilters = opts?.filters ?? appliedFilters
      const gen = ++listGen.current
      setListBusy(true)
      setError('')
      try {
        const data = await apiPost('/tracescope/v1/crash-list', {
          ...configBody(),
          ...buildListQueryBody(queryFilters),
          page,
          pageSize: CRASH_LIST_PAGE_SIZE,
        })
        if (gen !== listGen.current) return

        const caps = parseCapabilities(data.capabilities)
        if (caps.length) setCapabilityFilters(caps)

        const errMsg = typeof data.error === 'string' ? data.error : ''
        const errCode = data.errorCode
        if (errMsg && isAuthFailure(errCode, errMsg)) {
          handleAuthFailure(t('crash.cookieExpired'))
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
        if (isAuthFailure(undefined, msg)) handleAuthFailure(t('crash.cookieExpired'))
        else setError(msg)
      } finally {
        if (gen === listGen.current) setListBusy(false)
      }
    },
    [
      apiPost,
      appKey,
      appliedFilters,
      configBody,
      cookie,
      handleAuthFailure,
      hasStoredCookie,
      listPage,
      repo,
      t,
    ],
  )

  const applyFiltersAndFetch = useCallback(() => {
    if (!repo) {
      setError(t('选择仓库 / 先在配置中添加'))
      return
    }
    if (!appKey.trim() || !cookieReady(hasStoredCookie, cookie)) {
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
  }, [appKey, cookie, fetchList, filters, hasStoredCookie, repo, t])

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
        const next = { ...filters }
        setAppliedFilters(next)
        setListPage(1)
        void fetchList({ page: 1, filters: next })
      } else {
        const msg = typeof data.error === 'string' ? data.error : t('crash.probeFail')
        if (!data.ok && isAuthFailure(undefined, msg)) handleAuthFailure(t('crash.cookieExpired'))
        else setError(msg)
      }
    } catch (err) {
      const msg = (err as Error).message || String(err)
      if (isAuthFailure(undefined, msg)) handleAuthFailure(t('crash.cookieExpired'))
      else setError(msg)
    } finally {
      setConfigBusy(false)
    }
  }, [apiPost, configBody, fetchList, filters, handleAuthFailure, remember, t])

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
        setStackText(full.stackText)
        setTitle(full.title)
      } catch (err) {
        const msg = (err as Error).message || String(err)
        if (isAuthFailure(undefined, msg)) handleAuthFailure(t('crash.cookieExpired'))
        else setError(msg)
        setSelectedIncident(null)
      } finally {
        setDetailBusy(false)
      }
    },
    [apiPost, configBody, handleAuthFailure, repo, t],
  )

  const runAnalyze = useCallback(async (): Promise<CrashAnalysisReport | null> => {
    const fromUmeng = selectedIncident?.stackText?.trim()
    const stack = (fromUmeng || stackText).trim()
    if (!stack) {
      setError(t('crash.pasteRequired'))
      return null
    }
    if (!repo) {
      setError(t('选择仓库 / 先在配置中添加'))
      return null
    }
    setBusy(true)
    setError('')
    setHint('')
    try {
      const incident = selectedIncident
        ? umengIncidentForAnalyze(selectedIncident, stack, title)
        : {
            id: localIncidentId(),
            title: defaultTitle(stack, title),
            provider: 'local' as const,
            stackText: stack,
          }
      const data = await apiPost('/tracescope/v1/crash-analyze', { repoPath: repo, incident })
      const next = data.report as CrashAnalysisReport | undefined
      if (!next || typeof next.prompt !== 'string') {
        throw new Error(t('请求失败'))
      }
      setReport(next)
      return next
    } catch (err) {
      setError((err as Error).message || String(err))
      return null
    } finally {
      setBusy(false)
    }
  }, [apiPost, repo, selectedIncident, stackText, t, title])

  async function onAnalyzeClick() {
    const r = await runAnalyze()
    if (r) {
      setHint(t('crash.analyzeLocalHint'))
      requestAnimationFrame(() => {
        reportPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    }
  }

  async function onWriteSessionClick() {
    let r = report
    if (!r) r = await runAnalyze()
    if (!r) return
    const send = onSendToChat
    if (!send) {
      setHint(t('找不到会话输入框服务'))
      return
    }
    setBusy(true)
    setError('')
    try {
      // Create chat job so the agent can publish via tracescope_publish_crash_analysis.
      const jobRes = await apiPost('/tracescope/v1/crash-ai-job', {
        repoPath: repo,
        summary: r.summary,
        stackText: r.incident.stackText,
        incident: r.incident,
        matchedFiles: r.matchedFiles,
        fixHints: r.fixHints,
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
        setHint(t('crash.writeSessionHint'))
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
  }

  function applyAiText(raw: string): boolean {
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
    const next = mergeAiIntoReport(current, text)
    setReport(next)
    reportRef.current = next
    setAiDraft(text)
    setAwaitingAiPaste(false)
    setPendingCrashJobId('')
    setHint(t('crash.aiApplied'))
    setError('')
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
        const analysis = typeof res.aiAnalysis === 'string' ? res.aiAnalysis : ''
        if (analysis.trim() && applyAiText(analysis)) return 'applied'
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
      applyAiText(draft)
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
      applyAiText(text)
    } catch {
      setError(t('crash.aiClipboardFail'))
    }
  }

  async function onCopyReportClick() {
    if (!report) {
      setError(t('crash.needAnalyzeFirst'))
      return
    }
    const ok = await copyTextToClipboard(report.defectBody || buildCrashExportMarkdown(report, repo))
    if (ok) setHint(t('crash.copied'))
    else setError(t('crash.copyFail'))
  }

  function onExportReportClick() {
    if (!report) {
      setError(t('crash.needAnalyzeFirst'))
      return
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const idPart = (report.incident.id || 'crash').replace(/[^\w.-]+/g, '_').slice(0, 40)
    const filename = `tracescope-crash-${idPart}-${stamp}.md`
    downloadTextFile(filename, buildCrashExportMarkdown(report, repo), 'text/markdown')
    setHint(t('crash.exported', { name: filename }))
  }

  function onSubmitClick() {
    if (!report) {
      setError(t('crash.needAnalyzeFirst'))
      return
    }
    if (!trackerReady) {
      setHint(t('diff.board.hint.finishTrackerConfig'))
      onOpenTrackerSettings?.()
      return
    }
    if (!onSubmitDefect) return
    const subject =
      report.incident.title ||
      defaultTitle(stackText, title) ||
      t('crash.submitDefect')
    onSubmitDefect(report, subject)
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
    if (!Boolean(appKey.trim()) || !cookieReady(hasStoredCookie, cookie)) return
    setFilterOptionsBusy(true)
    setFilterOptionsError('')
    try {
      const data = await apiPost('/tracescope/v1/crash-filter-options', {
        ...configBody(),
        metaType: filterMetaType,
      })
      const errMsg = typeof data.error === 'string' ? data.error : ''
      if (errMsg && isAuthFailure(data.errorCode, errMsg)) {
        handleAuthFailure(t('crash.cookieExpired'))
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
      if (isAuthFailure(undefined, msg)) handleAuthFailure(t('crash.cookieExpired'))
      else setFilterOptionsError(msg)
    } finally {
      setFilterOptionsBusy(false)
    }
  }, [
    apiPost,
    appKey,
    configBody,
    cookie,
    filterMetaType,
    handleAuthFailure,
    hasStoredCookie,
    repo,
    t,
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
  const appLabel = appDisplayName.trim() || appKey.trim()
  const umengHeader = appLabel
    ? `${t('crash.umengConfig')} · ${appLabel}`
    : t('crash.umengConfig')

  return (
    <section style={card}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{t('crash.mode')}</div>

      <div style={{ marginBottom: 10 }}>
        <button
          type="button"
          style={{ ...btn, width: '100%', textAlign: 'left', fontWeight: 600 }}
          onClick={() => setUmengOpen((v) => !v)}
          title={appKey.trim() ? `${t('crash.appKey')}: ${appKey.trim()}` : undefined}
        >
          {umengOpen ? '▾ ' : '▸ '}
          {umengHeader}
        </button>
        {umengOpen ? (
          <div style={{ marginTop: 8 }}>
            <p style={{ margin: '0 0 8px', color: '#6b645a', fontSize: 12, lineHeight: 1.45 }}>
              {t('crash.cookieHint')}
            </p>
            <label style={label}>
              {t('crash.provider')}
              <select style={input} value={provider} disabled={configDisabled}>
                <option value="umeng">{t('crash.providerUmeng')}</option>
              </select>
            </label>
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
                style={{ ...input, minHeight: 72, resize: 'vertical', fontFamily: 'ui-monospace, monospace' }}
                value={cookie}
                disabled={configDisabled}
                placeholder={hasStoredCookie ? MASKED_COOKIE : t('crash.cookiePlaceholder')}
                onChange={(e) => setCookie(e.target.value)}
              />
            </label>
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
              <button type="button" style={primary} disabled={configDisabled} onClick={() => void runProbe()}>
                {configBusy ? t('common.loading') : t('crash.probe')}
              </button>
              <button type="button" style={btn} disabled={configDisabled} onClick={() => void clearCookieClick()}>
                {t('crash.clearCookie')}
              </button>
              <button
                type="button"
                style={btn}
                disabled={configDisabled || listBusy}
                onClick={() => void fetchList({ page: listPage })}
              >
                {listBusy ? t('common.loading') : t('crash.refreshList')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {activeFilters.length ? (
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
          <div style={{ fontWeight: 600, fontSize: 12 }}>{t('crash.listTitle')}</div>
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
            {hasDimensionFilters ? t('crash.listEmptyFiltered') : t('crash.listEmptyHint')}
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
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={detailBusy}
                    onClick={() => void loadDetail(item.id)}
                    style={{
                      width: '100%',
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
        <button type="button" style={primary} disabled={busy || detailBusy} onClick={() => void onAnalyzeClick()}>
          {busy ? t('common.loading') : t('crash.analyze')}
        </button>
        <button type="button" style={btn} disabled={busy || detailBusy} onClick={() => void onWriteSessionClick()}>
          {t('crash.writeSession')}
        </button>
        <button type="button" style={btn} disabled={busy || !report} onClick={() => void onCopyReportClick()}>
          {t('crash.copyReport')}
        </button>
        <button type="button" style={btn} disabled={busy || !report} onClick={onExportReportClick}>
          {t('crash.exportReport')}
        </button>
        <button type="button" style={btn} disabled={busy || !report} onClick={onSubmitClick}>
          {t('crash.submitDefect')}
        </button>
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: '#6b645a', lineHeight: 1.45 }}>
        {t('crash.analyzeVsAiHint')}
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
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('crash.localSummary')}</div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{report.summary}</p>
            {noMatch ? (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#b54708' }}>{t('crash.noRepoMatch')}</p>
            ) : null}
          </div>
          {report.matchedFiles?.length ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>{t('crash.matchedFiles')}</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.45 }}>
                {report.matchedFiles.map((m) => (
                  <li key={m.path + (m.symbol || '')}>
                    <code>{m.path}</code>
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
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('crash.aiSummary')}</div>
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

      <div style={{ borderTop: '1px solid var(--dsh-border, #ddd4c5)', paddingTop: 10 }}>
        <button
          type="button"
          style={{ ...btn, width: '100%', textAlign: 'left', fontWeight: 600 }}
          onClick={() => setPasteOpen((v) => !v)}
        >
          {pasteOpen ? '▾ ' : '▸ '}
          {t('crash.pasteFallback')}
        </button>
        {pasteOpen ? (
          <>
            <label style={{ ...label, marginTop: 8 }}>
              {t('crash.pasteLabel')}
              <textarea
                style={{ ...input, minHeight: 120, resize: 'vertical', fontFamily: 'ui-monospace, monospace' }}
                value={stackText}
                disabled={busy}
                placeholder={t('crash.pasteLabel')}
                onChange={(e) => {
                  setStackText(e.target.value)
                  setSelectedIncident(null)
                  setSelectedId('')
                }}
              />
            </label>
            <label style={label}>
              {t('缺陷标题')}
              <input
                style={input}
                value={title}
                disabled={busy}
                placeholder={t('（未填写）')}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
          </>
        ) : null}
      </div>
    </section>
  )
}
