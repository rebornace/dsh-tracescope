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

type FilterState = {
  timeRange: '' | '24h' | '7d' | '30d'
  appVersion: string
  errorKinds: Array<'crash' | 'anr' | 'error' | 'other'>
  osDevice: string
  sortField: 'count' | 'lastSeenAt' | 'title'
  sortDir: 'asc' | 'desc'
  statuses: Array<'open' | 'closed' | 'other'>
  keyword: string
}

const MASKED_COOKIE = '••••••••'

const defaultFilters = (): FilterState => ({
  timeRange: '',
  appVersion: '',
  errorKinds: [],
  osDevice: '',
  sortField: 'count',
  sortDir: 'desc',
  statuses: [],
  keyword: '',
})

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

function timeRangeCutoff(range: FilterState['timeRange']): number | null {
  if (!range) return null
  const now = Date.now()
  if (range === '24h') return now - 24 * 3600 * 1000
  if (range === '7d') return now - 7 * 24 * 3600 * 1000
  if (range === '30d') return now - 30 * 24 * 3600 * 1000
  return null
}

function applyClientFilters(items: CrashListItem[], filters: FilterState): CrashListItem[] {
  let rows = items
  const cutoff = timeRangeCutoff(filters.timeRange)
  if (cutoff != null) {
    rows = rows.filter((row) => {
      const ts = Date.parse(row.lastSeenAt ?? '')
      return Number.isFinite(ts) ? ts >= cutoff : true
    })
  }
  return rows
}

function buildListQueryBody(filters: FilterState): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const kw = filters.keyword.trim()
  if (kw) body.keyword = kw
  if (filters.errorKinds.length) body.errorKinds = filters.errorKinds
  if (filters.statuses.length) body.statuses = filters.statuses
  const versions = filters.appVersion
    .split(/[,;|\s]+/)
    .map((v) => v.trim())
    .filter(Boolean)
  if (versions.length) body.appVersions = versions
  const osDevice = filters.osDevice.trim()
  if (osDevice) body.osDevice = osDevice
  body.sort = { field: filters.sortField, direction: filters.sortDir }
  return body
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
  const [pasteOpen, setPasteOpen] = useState(false)

  const [provider] = useState<CrashProviderId>('umeng')
  const [appKey, setAppKey] = useState('')
  const [cookie, setCookie] = useState('')
  const [hasStoredCookie, setHasStoredCookie] = useState(false)
  const [remember, setRemember] = useState(true)
  const [configBusy, setConfigBusy] = useState(false)

  const [filters, setFilters] = useState<FilterState>(() => defaultFilters())
  const [capabilityFilters, setCapabilityFilters] = useState<FilterKey[]>([])
  const [listItems, setListItems] = useState<CrashListItem[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [selectedIncident, setSelectedIncident] = useState<UmengIncident | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)

  const keywordTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listGen = useRef(0)

  const repo = repoPath.trim()

  const configBody = useCallback(() => {
    const body: Record<string, unknown> = {
      repoPath: repo || undefined,
      provider: 'umeng',
      appKey: appKey.trim(),
      remember,
    }
    const cookieTrim = cookie.trim()
    if (cookieTrim && cookieTrim !== MASKED_COOKIE) body.cookie = cookieTrim
    else if (hasStoredCookie) body.cookie = MASKED_COOKIE
    return body
  }, [appKey, cookie, hasStoredCookie, remember, repo])

  const loadConfig = useCallback(async () => {
    try {
      const params: Record<string, string | undefined> = {}
      if (repo) params.repoPath = repo
      const data = await apiGet('/tracescope/v1/crash-config', params)
      const cfg = data.config as Record<string, unknown> | undefined
      if (!cfg) return
      if (typeof cfg.appKey === 'string') setAppKey(cfg.appKey)
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
  }, [apiPost, appKey, remember, repo, t])

  const fetchList = useCallback(async () => {
    if (!repo) return
    if (!Boolean(appKey.trim()) || !cookieReady(hasStoredCookie, cookie)) return

    const gen = ++listGen.current
    setListBusy(true)
    setError('')
    try {
      const data = await apiPost('/tracescope/v1/crash-list', {
        ...configBody(),
        ...buildListQueryBody(filters),
      })
      if (gen !== listGen.current) return

      const caps = parseCapabilities(data.capabilities)
      if (caps.length) setCapabilityFilters(caps)

      const errMsg = typeof data.error === 'string' ? data.error : ''
      const errCode = data.errorCode
      if (errMsg && isAuthFailure(errCode, errMsg)) {
        handleAuthFailure(t('crash.cookieExpired'))
        setListItems([])
        return
      }
      if (errMsg) setError(errMsg)

      const items = applyClientFilters(parseListItems(data.items), filters)
      setListItems(items)
    } catch (err) {
      const msg = (err as Error).message || String(err)
      if (isAuthFailure(undefined, msg)) handleAuthFailure(t('crash.cookieExpired'))
      else setError(msg)
    } finally {
      if (gen === listGen.current) setListBusy(false)
    }
  }, [apiPost, appKey, configBody, cookie, filters, handleAuthFailure, hasStoredCookie, repo, t])

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
        void fetchList()
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
  }, [apiPost, configBody, fetchList, handleAuthFailure, remember, t])

  useEffect(() => {
    if (!repo || !appKey.trim() || !cookieReady(hasStoredCookie, cookie)) return
    const draftCookieEdit =
      !hasStoredCookie && cookie.trim().length > 0 && cookie.trim() !== MASKED_COOKIE
    const debounceMs = filters.keyword.trim() || draftCookieEdit ? 400 : 0
    if (keywordTimer.current) clearTimeout(keywordTimer.current)
    keywordTimer.current = setTimeout(() => {
      void fetchList()
    }, debounceMs)
    return () => {
      if (keywordTimer.current) clearTimeout(keywordTimer.current)
    }
  }, [repo, appKey, hasStoredCookie, cookie, filters, fetchList])

  const onKeywordChange = useCallback((value: string) => {
    setFilters((f) => ({ ...f, keyword: value }))
  }, [])

  const loadDetail = useCallback(
    async (id: string) => {
      if (!id || !repo) return
      setDetailBusy(true)
      setError('')
      setSelectedId(id)
      setReport(null)
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
    await runAnalyze()
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
    const result = send(r.prompt)
    if (result.ok) {
      setHint(t('diff.board.chatFilling'))
    } else {
      setError(result.error || t('无法写入当前会话输入框'))
    }
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

  const versionOptions = useMemo(() => {
    const set = new Set<string>()
    for (const row of listItems) {
      if (row.appVersion) set.add(row.appVersion)
    }
    return [...set].sort()
  }, [listItems])

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

  const configDisabled = busy || configBusy || listBusy || detailBusy

  return (
    <section style={card}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{t('crash.mode')}</div>

      <div style={{ marginBottom: 10 }}>
        <button
          type="button"
          style={{ ...btn, width: '100%', textAlign: 'left', fontWeight: 600 }}
          onClick={() => setUmengOpen((v) => !v)}
        >
          {umengOpen ? '▾ ' : '▸ '}
          {t('crash.umengConfig')}
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
              {t('crash.appKey')}
              <input
                style={input}
                value={appKey}
                disabled={configDisabled}
                placeholder={t('crash.appKey')}
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
              <button type="button" style={btn} disabled={configDisabled || listBusy} onClick={() => void fetchList()}>
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
            padding: 10,
            borderRadius: 8,
            border: '1px solid var(--dsh-border, #ddd4c5)',
            background: '#faf8f3',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 12 }}>{t('crash.filters')}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {activeFilters.includes('timeRange') ? (
              <label style={{ ...label, marginBottom: 0 }}>
                {t('crash.filter.timeRange')}
                <select
                  style={input}
                  value={filters.timeRange}
                  disabled={configDisabled}
                  onChange={(e) => {
                    setFilters((f) => ({ ...f, timeRange: e.target.value as FilterState['timeRange'] }))
                  }}
                >
                  <option value="">{t('crash.timeRange.all')}</option>
                  <option value="24h">{t('crash.timeRange.24h')}</option>
                  <option value="7d">{t('crash.timeRange.7d')}</option>
                  <option value="30d">{t('crash.timeRange.30d')}</option>
                </select>
              </label>
            ) : null}
            {activeFilters.includes('appVersion') ? (
              <label style={{ ...label, marginBottom: 0 }}>
                {t('crash.filter.appVersion')}
                <input
                  style={input}
                  list="crash-app-versions"
                  value={filters.appVersion}
                  disabled={configDisabled}
                  placeholder={t('crash.filter.appVersionHint')}
                  onChange={(e) => setFilters((f) => ({ ...f, appVersion: e.target.value }))}
                />
                <datalist id="crash-app-versions">
                  {versionOptions.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </label>
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
            {activeFilters.includes('osDevice') ? (
              <label style={{ ...label, marginBottom: 0 }}>
                {t('crash.filter.osDevice')}
                <input
                  style={input}
                  value={filters.osDevice}
                  disabled={configDisabled}
                  placeholder={t('crash.filter.osDeviceHint')}
                  onChange={(e) => setFilters((f) => ({ ...f, osDevice: e.target.value }))}
                />
              </label>
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
                />
              </label>
            ) : null}
          </div>
        </div>
      ) : null}

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>{t('crash.listTitle')}</div>
        {listBusy && !listItems.length ? (
          <p style={{ margin: 0, fontSize: 12, color: '#6b645a' }}>{t('crash.listLoading')}</p>
        ) : null}
        {!listBusy && !listItems.length ? (
          <p style={{ margin: 0, fontSize: 12, color: '#6b645a' }}>{t('crash.listEmpty')}</p>
        ) : null}
        {listItems.length ? (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
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
      </div>

      {selectedIncident ? (
        <div style={{ marginBottom: 10 }}>
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
              maxHeight: 160,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
            }}
          >
            {detailBusy ? t('common.loading') : selectedIncident.stackText}
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
        <button type="button" style={btn} disabled={busy || !report} onClick={onSubmitClick}>
          {t('crash.submitDefect')}
        </button>
      </div>

      {error ? (
        <p style={{ margin: '0 0 8px', color: '#b42318', fontSize: 12, lineHeight: 1.45 }}>{error}</p>
      ) : null}
      {hint ? (
        <p style={{ margin: '0 0 8px', color: '#6b645a', fontSize: 12, lineHeight: 1.45 }}>{hint}</p>
      ) : null}
      {report ? (
        <div style={{ marginTop: 4, marginBottom: 10 }}>
          <div
            style={{
              padding: '10px 12px',
              background: '#f7f4ee',
              borderRadius: 8,
              border: '1px solid var(--dsh-border, #ddd4c5)',
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('AI 分析')}</div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{report.summary}</p>
            {noMatch ? (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#b54708' }}>{t('crash.noRepoMatch')}</p>
            ) : null}
          </div>
          {report.matchedFiles?.length ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>{t('- 相关文件：')}</div>
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
