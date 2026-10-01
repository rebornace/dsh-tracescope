import { useEffect, useMemo, useState } from 'react'
import { requestPageThumbnail } from './thumb-queue.js'

interface CodeFile {
  adapterId: string
  kindLabel: string
  relativePath: string
  precise: boolean
}

interface Candidate extends CodeFile {
  score: number
  reasons: string[]
}

interface PageMapping {
  designId: string
  designName: string
  kind: 'screen' | 'list-item' | 'dialog'
  status: 'matched' | 'weak' | 'none'
  candidates: Candidate[]
}

interface GroupedPage {
  canvasId: string
  canvasName: string
  aspect: number
  mapping: PageMapping
}

interface MatchAllResponse {
  codeFiles: CodeFile[]
  canvases: Array<{ id: string; name: string; componentLibrary: boolean }>
  pages: GroupedPage[]
  totals: { pages: number; matched: number; weak: number; none: number }
  fromCache?: boolean
  savedAt?: string
  scope?: 'node' | 'file'
  focusNodeId?: string
}

export interface SelectedCodeFile {
  adapterId: string
  relativePath: string
}

/** Write-back from AI rematch publish; applied once per token. */
export interface RematchApplyPayload {
  designId: string
  candidates: Array<{
    adapterId: string
    relativePath: string
    kindLabel?: string
    score?: number
    reason?: string
    precise?: boolean
  }>
  note?: string
  token: number
}

const KIND_BADGE: Record<PageMapping['kind'], { label: string; bg: string; fg: string }> = {
  screen: { label: '整屏', bg: '#e7f0fb', fg: '#1d4e89' },
  'list-item': { label: '列表项', bg: '#ece8fa', fg: '#4a3aa0' },
  dialog: { label: '弹窗', bg: '#fdeede', fg: '#9a5b06' },
}

const STATUS_META: Record<PageMapping['status'], { dot: string; label: string }> = {
  matched: { dot: '#1a9b6e', label: '已匹配' },
  weak: { dot: '#dc8a05', label: '待确认' },
  none: { dot: '#d92d20', label: '未匹配' },
}

type StatusFilter = 'all' | PageMapping['status']

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'matched', label: '已匹配' },
  { id: 'weak', label: '待确认' },
  { id: 'none', label: '未匹配' },
]

function storageKey(repoInput: string, figmaUrl: string) {
  return 'tracescope.map.selections:' + repoInput.trim() + ':' + figmaUrl.trim()
}

/** Format an ISO timestamp as a short local "MM-DD HH:mm" for cache age. */
function formatSavedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function loadSelections(repoInput: string, figmaUrl: string): Record<string, SelectedCodeFile> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(repoInput, figmaUrl)) ?? '{}')
  } catch {
    return {}
  }
}

/** Extract page id from a design URL (Figma node-id or Lanhu image_id). */
function parseNodeIdFromFigmaUrl(url: string): string {
  try {
    if (/lanhuapp\.com|lanhu\.woa\.com/i.test(url)) {
      const u = new URL(url)
      const q = u.hash.includes('?') ? u.hash.slice(u.hash.indexOf('?') + 1) : u.search.slice(1)
      const params = new URLSearchParams(q)
      return (params.get('image_id') || params.get('imageId') || '').trim()
    }
    const u = new URL(url)
    const raw = u.searchParams.get('node-id') || ''
    return raw ? raw.replace(/-/g, ':') : ''
  } catch {
    return ''
  }
}

async function post<T = MatchAllResponse>(path: string, body: unknown) {
  const r = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  let data: Record<string, unknown> = {}
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    throw new Error(
      text
        ? `服务器返回非 JSON（HTTP ${r.status}）：${text.slice(0, 120)}`
        : `请求失败（HTTP ${r.status}）`,
    )
  }
  if (!r.ok) {
    const detail = String(data.error || '').trim()
    if (r.status === 405) {
      throw new Error(
        detail ||
          '请求失败（HTTP 405）：插件路由未加载或方法不匹配，请完全退出并重启 DeepSeek Harness 后再试',
      )
    }
    throw new Error(detail || `请求失败（HTTP ${r.status}）`)
  }
  return data as T
}

export interface PageMappingOverviewProps {
  repoInput: string
  figmaUrl: string
  figmaToken: string
  auth?: unknown
  busy: boolean
  /** Design id whose high-fidelity result is currently shown (highlights card). */
  activeDesignId?: string
  onScanStateChange: (busy: boolean, message?: string) => void
  /** Called after a successful scan so the parent can persist the design URL. */
  onDesignLinkUsed?: (url: string) => void
  onCompare: (designId: string, codeFile: SelectedCodeFile) => void
  /** Independent AI analysis: read the real layout source and ask the model. */
  onAiAnalyze: (designId: string, codeFile: SelectedCodeFile) => void
  /** Rematch via chat: fill composer with a reviewable prompt. */
  onAiRematch: (designId: string, codeFile?: SelectedCodeFile) => void | Promise<void>
  /** AI rematch publish result to apply into the card selection. */
  rematchApply?: RematchApplyPayload | null
}

export function PageMappingOverview({
  repoInput,
  figmaUrl,
  figmaToken,
  auth,
  busy,
  activeDesignId,
  onScanStateChange,
  onDesignLinkUsed,
  onCompare,
  onAiAnalyze,
  onAiRematch,
  rematchApply,
}: PageMappingOverviewProps) {
  const [overview, setOverview] = useState<MatchAllResponse | null>(null)
  const [selections, setSelections] = useState<Record<string, SelectedCodeFile>>(() =>
    loadSelections(repoInput, figmaUrl),
  )
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({})
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [localError, setLocalError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [rematchingId, setRematchingId] = useState('')
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null)

  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview])

  // Tick an elapsed-seconds counter while a scan runs so the button clearly
  // shows progress instead of looking frozen on a large file.
  useEffect(() => {
    if (!scanning) return
    const started = Date.now()
    setElapsed(0)
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [scanning])

  async function requestRematchPrompt(designId: string) {
    setLocalError('')
    setRematchingId(designId)
    try {
      await onAiRematch(designId, selections[designId])
    } catch (err) {
      setLocalError((err as Error).message || '准备推荐提示词失败')
    } finally {
      setRematchingId('')
    }
  }

  useEffect(() => {
    setOverview(null)
    setSelections(loadSelections(repoInput, figmaUrl))
    setConfirmed({})
    setStatusFilter('all')
    setQuery('')
  }, [repoInput, figmaUrl])

  function persist(next: Record<string, SelectedCodeFile>) {
    setSelections(next)
    try {
      localStorage.setItem(storageKey(repoInput, figmaUrl), JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
  }

  async function scan(force: boolean, scope: 'auto' | 'file' = 'auto') {
    setLocalError('')
    if (!figmaUrl.trim() || !figmaToken.trim()) {
      setLocalError('请填写设计稿链接和访问 Token')
      return
    }
    const linkNodeId = parseNodeIdFromFigmaUrl(figmaUrl)
    const effectiveScope = scope === 'file' ? 'file' : linkNodeId ? 'node' : 'file'
    const busyMsg =
      effectiveScope === 'node'
        ? '正在定位链接中的设计页并匹配代码…'
        : '正在扫描整个设计文件、建立页面映射…'
    onScanStateChange(true, busyMsg)
    setScanning(true)
    try {
      const res = await post<MatchAllResponse>('/tracescope/v1/match-all', {
        repoPath: repoInput,
        figmaUrl: figmaUrl.trim(),
        figmaToken: figmaToken.trim(),
        auth,
        force,
        scope: effectiveScope,
      })
      setOverview(res)
      onDesignLinkUsed?.(figmaUrl.trim())
      // Warm the first screen of thumbnails in one batch (cards then hit cache).
      const warmIds = res.pages.slice(0, 24).map((p) => p.mapping.designId)
      if (warmIds.length) {
        void Promise.allSettled(
          warmIds.map((nodeId) =>
            requestPageThumbnail({
              figmaUrl: figmaUrl.trim(),
              figmaToken: figmaToken.trim(),
              nodeId,
            }),
          ),
        )
      }
      const next = { ...selections }
      for (const p of res.pages) {
        const top = p.mapping.candidates[0]
        if (!next[p.mapping.designId] && top) {
          next[p.mapping.designId] = { adapterId: top.adapterId, relativePath: top.relativePath }
        }
      }
      persist(next)
    } catch (err) {
      setLocalError((err as Error).message)
    } finally {
      setScanning(false)
      onScanStateChange(false)
    }
  }

  /**
   * On mount (and whenever the inputs change), try to load the cached overview
   * instantly. A cache hit returns in milliseconds, so we do NOT put up the
   * heavy busy overlay for this initial load; only an explicit scan does.
   */
  useEffect(() => {
    let cancelled = false
    async function tryLoadCache() {
      if (!figmaUrl.trim() || !figmaToken.trim() || !repoInput.trim()) return
      setLocalError('')
      setScanning(true)
      try {
        const res = await post<MatchAllResponse>('/tracescope/v1/match-all', {
          repoPath: repoInput,
          figmaUrl: figmaUrl.trim(),
          figmaToken: figmaToken.trim(),
          auth,
          force: false,
        })
        if (cancelled) return
        if (res.fromCache) {
          setOverview(res)
          const next = { ...selections }
          for (const p of res.pages) {
            const top = p.mapping.candidates[0]
            if (!next[p.mapping.designId] && top) {
              next[p.mapping.designId] = { adapterId: top.adapterId, relativePath: top.relativePath }
            }
          }
          persist(next)
        }
      } catch {
        /* no usable cache: user clicks scan when ready */
      } finally {
        if (!cancelled) setScanning(false)
      }
    }
    void tryLoadCache()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoInput, figmaUrl, figmaToken])

  const codeFileMap = useMemo(() => {
    const m = new Map<string, CodeFile>()
    overview?.codeFiles.forEach((f) => m.set(f.adapterId + '::' + f.relativePath, f))
    return m
  }, [overview])

  function choose(designId: string, file: SelectedCodeFile, auto = false) {
    persist({ ...selections, [designId]: file })
    if (!auto) setConfirmed({ ...confirmed, [designId]: true })
  }

  // Apply AI rematch write-back: refresh candidates + select Top-1.
  useEffect(() => {
    if (!rematchApply || !overview) return
    const { designId, candidates, note } = rematchApply
    if (!designId || !candidates.length) return

    const mapped: Candidate[] = candidates.map((c) => {
      const known = codeFileMap.get(c.adapterId + '::' + c.relativePath)
      return {
        adapterId: c.adapterId,
        relativePath: c.relativePath,
        kindLabel: c.kindLabel || known?.kindLabel || c.adapterId,
        precise: c.precise ?? known?.precise ?? false,
        score: typeof c.score === 'number' ? c.score : 0.8,
        reasons: c.reason ? [`AI：${c.reason}`] : ['AI 推荐'],
      }
    })

    setOverview((prev) => {
      if (!prev) return prev
      const knownKeys = new Set(prev.codeFiles.map((f) => f.adapterId + '::' + f.relativePath))
      const extraFiles: CodeFile[] = []
      for (const m of mapped) {
        const key = m.adapterId + '::' + m.relativePath
        if (knownKeys.has(key)) continue
        knownKeys.add(key)
        extraFiles.push({
          adapterId: m.adapterId,
          relativePath: m.relativePath,
          kindLabel: m.kindLabel,
          precise: m.precise,
        })
      }
      return {
        ...prev,
        codeFiles: extraFiles.length ? [...prev.codeFiles, ...extraFiles] : prev.codeFiles,
        pages: prev.pages.map((p) => {
          if (p.mapping.designId !== designId) return p
          const topScore = mapped[0]?.score ?? 0
          const status: PageMapping['status'] =
            mapped.length === 0 ? 'none' : topScore >= 0.45 ? 'matched' : 'weak'
          return {
            ...p,
            mapping: {
              ...p.mapping,
              status,
              candidates: mapped,
            },
          }
        }),
      }
    })

    const top = mapped[0]
    if (top) {
      choose(designId, { adapterId: top.adapterId, relativePath: top.relativePath })
    }
    setLocalError(
      (note ? `✓ ${note}` : '✓ 已写回 AI 文件推荐并选中 Top1') +
        '。若仍不对，可在会话继续纠正后再次写回。',
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rematchApply?.token])

  // Build canvas groups with global status + query filters applied.
  const groups = useMemo(() => {
    if (!overview) return []
    const q = query.trim().toLowerCase()
    const byCanvas = new Map<string, { name: string; items: GroupedPage[] }>()
    for (const p of overview.pages) {
      if (statusFilter !== 'all' && p.mapping.status !== statusFilter) continue
      const selectedFile = selections[p.mapping.designId]
      const selPath = codeFileMap.get(
        (selectedFile?.adapterId ?? '') + '::' + (selectedFile?.relativePath ?? ''),
      )?.relativePath
      if (q) {
        const hit =
          p.mapping.designName.toLowerCase().includes(q) ||
          (selPath ?? '').toLowerCase().includes(q)
        if (!hit) continue
      }
      const g = byCanvas.get(p.canvasId) ?? { name: p.canvasName, items: [] }
      g.items.push(p)
      byCanvas.set(p.canvasId, g)
    }
    return [...byCanvas.entries()].map(([id, v]) => ({ id, ...v }))
  }, [overview, statusFilter, query, selections, codeFileMap])

  const linkHasNodeId = !!parseNodeIdFromFigmaUrl(figmaUrl)
  const scanScope = overview?.scope
  const isNodeScope = scanScope === 'node' || (!overview && linkHasNodeId)

  return (
    <div>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6b645a', lineHeight: 1.55 }}>
        {linkHasNodeId
          ? '链接含 node-id：扫描会优先定位当前页（较快）。若要一次处理文件内全部页面，可用下方「扫描整个设计文件」。'
          : '链接未指定页面：扫描会读取设计文件/项目内全部页面并自动映射。若只想对某一页，请复制带 node-id（Figma）或 image_id（蓝湖）的链接。'}
      </p>
      <button
        type="button"
        style={OV.scan}
        disabled={busy || scanning}
        onClick={() => void scan(!!overview, 'auto')}
      >
        {scanning
          ? isNodeScope
            ? `定位中… ${elapsed}s`
            : `扫描中… ${elapsed}s（页面较多时约需 20–40 秒，请勿关闭）`
          : overview
            ? linkHasNodeId
              ? '重新扫描（当前链接页面）'
              : '重新扫描设计稿'
            : linkHasNodeId
              ? '扫描当前链接页面'
              : '扫描设计稿，自动映射页面'}
      </button>
      {linkHasNodeId ? (
        <button
          type="button"
          style={{ ...OV.scanSecondary, marginTop: 6 }}
          disabled={busy || scanning}
          onClick={() => void scan(true, 'file')}
        >
          {scanning && overview?.scope === 'file' ? `全文件扫描中… ${elapsed}s` : '扫描整个设计文件'}
        </button>
      ) : null}

      {localError ? (
        <p
          style={{
            ...OV.error,
            color: localError.startsWith('✓') || localError.startsWith('ℹ') ? '#0f6e56' : '#b42318',
          }}
        >
          {localError}
        </p>
      ) : null}

      {overview ? (
        <div style={{ marginTop: 10 }}>
          <div style={OV.summary}>
            {overview.scope === 'node' ? (
              <span>
                单页模式（链接 node-id）· {overview.pages[0]?.mapping.designName || '当前节点'} ·
              </span>
            ) : (
              <span>全文件 · </span>
            )}
            共 {overview.totals.pages} 个页面 ·
            <span style={{ color: STATUS_META.matched.dot }}> 已匹配 {overview.totals.matched}</span> ·
            <span style={{ color: STATUS_META.weak.dot }}> 待确认 {overview.totals.weak}</span> ·
            <span style={{ color: STATUS_META.none.dot }}> 未匹配 {overview.totals.none}</span>
            {overview.fromCache && overview.savedAt ? (
              <span style={{ marginLeft: 6, color: '#8a7a5c' }}>
                · 读取自缓存（{formatSavedAt(overview.savedAt)}），点上方按钮可重新扫描
              </span>
            ) : null}
          </div>

          <div style={OV.chipRow}>
            {FILTERS.map((f) => {
              const count =
                f.id === 'all'
                  ? overview.totals.pages
                  : overview.totals[f.id as PageMapping['status']]
              const on = statusFilter === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  style={{
                    ...OV.chip,
                    background: on ? '#0f6e56' : '#fff',
                    color: on ? '#fff' : '#5f584c',
                    borderColor: on ? '#0f6e56' : '#d9d2c4',
                  }}
                >
                  {f.label} {count}
                </button>
              )
            })}
          </div>

          <input
            style={OV.search}
            value={query}
            placeholder="搜索页面名称或已选代码文件…"
            onChange={(e) => setQuery(e.target.value)}
          />

          {groups.length === 0 ? <div style={OV.emptyHint}>没有符合条件的页面。</div> : null}

          {groups.map((g) => {
            const isCollapsed = !!collapsed[g.id]
            return (
              <div key={g.id} style={OV.canvasCard}>
                <button
                  type="button"
                  style={OV.canvasHeader}
                  onClick={() => setCollapsed({ ...collapsed, [g.id]: !isCollapsed })}
                >
                  <span>{isCollapsed ? '▸' : '▾'}</span>
                  <strong>{g.name || '未命名画布'}</strong>
                  <span style={OV.canvasCount}>{g.items.length}</span>
                </button>
                {isCollapsed ? null : (
                  <div style={OV.grid}>
                    {g.items.map(({ mapping, thumbnailUrl, aspect }) => (
                      <PageCard
                        key={mapping.designId}
                        mapping={mapping}
                        aspect={aspect}
                        figmaUrl={figmaUrl}
                        figmaToken={figmaToken}
                        selected={selections[mapping.designId]}
                        isActive={activeDesignId === mapping.designId}
                        isConfirmed={!!confirmed[mapping.designId]}
                        allCodeFiles={overview.codeFiles}
                        codeFileMap={codeFileMap}
                        onChoose={(file) => choose(mapping.designId, file)}
                        onCompare={() => {
                          const file = selections[mapping.designId]
                          if (!file) {
                            setLocalError(
                              `「${mapping.designName || mapping.designId}」还没有指定代码文件。请先点卡片上的红色「点此指定代码文件」，选好后再点「界面对比」。`,
                            )
                            return
                          }
                          setLocalError('')
                          onCompare(mapping.designId, file)
                        }}
                        onAiAnalyze={() => {
                          const file = selections[mapping.designId]
                          if (!file) {
                            setLocalError(
                              `「${mapping.designName || mapping.designId}」还没有指定代码文件。请先指定代码文件后再「AI 协助分析」。`,
                            )
                            return
                          }
                          setLocalError('')
                          onAiAnalyze(mapping.designId, file)
                        }}
                        onAiRematch={() => {
                          void requestRematchPrompt(mapping.designId)
                        }}
                        rematching={rematchingId === mapping.designId}
                        busy={busy || scanning || !!rematchingId}
                        onOpenPreview={(url) =>
                          setPreview({ url, name: mapping.designName || mapping.designId })
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      {preview ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="设计稿原图"
          style={OV.previewOverlay}
          onClick={() => setPreview(null)}
        >
          <div style={OV.previewPanel} onClick={(e) => e.stopPropagation()}>
            <div style={OV.previewHeader}>
              <strong
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {preview.name || '设计稿原图'}
              </strong>
              <button type="button" style={OV.previewClose} onClick={() => setPreview(null)}>
                关闭
              </button>
            </div>
            <div style={OV.previewBody}>
              <img src={preview.url} alt={preview.name || '设计稿原图'} style={OV.previewImg} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

interface PageCardProps {
  mapping: PageMapping
  aspect: number
  figmaUrl: string
  figmaToken: string
  selected?: SelectedCodeFile
  isActive: boolean
  isConfirmed: boolean
  allCodeFiles: CodeFile[]
  codeFileMap: Map<string, CodeFile>
  onChoose: (file: SelectedCodeFile) => void
  onCompare: () => void
  onAiAnalyze: () => void
  onAiRematch: () => void
  rematching?: boolean
  busy?: boolean
  onOpenPreview?: (url: string) => void
}

type ThumbState = 'idle' | 'loading' | 'done' | 'error'

function PageCard({
  mapping,
  aspect,
  figmaUrl,
  figmaToken,
  selected,
  isActive,
  isConfirmed,
  allCodeFiles,
  codeFileMap,
  onChoose,
  onCompare,
  onAiAnalyze,
  onAiRematch,
  rematching,
  busy: cardBusy,
  onOpenPreview,
}: PageCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [thumbState, setThumbState] = useState<ThumbState>('idle')
  const [thumbUrl, setThumbUrl] = useState('')
  // Bumped to re-run the thumbnail fetch when the user clicks retry or when the
  // <img> itself fails to decode the returned URL.
  const [thumbNonce, setThumbNonce] = useState(0)
  const status = STATUS_META[mapping.status]
  const badge = KIND_BADGE[mapping.kind]
  const selCandidate = mapping.candidates.find(
    (c) => selected && c.adapterId === selected.adapterId && c.relativePath === selected.relativePath,
  )
  // Prefer registry metadata; fall back to selection / AI candidate so rematch
  // picks outside the initial discover set still display as selected.
  const selFile: CodeFile | undefined = selected
    ? codeFileMap.get(selected.adapterId + '::' + selected.relativePath) ||
      (selCandidate
        ? {
            adapterId: selCandidate.adapterId,
            relativePath: selCandidate.relativePath,
            kindLabel: selCandidate.kindLabel,
            precise: selCandidate.precise,
          }
        : {
            adapterId: selected.adapterId,
            relativePath: selected.relativePath,
            kindLabel: selected.adapterId,
            precise: false,
          })
    : undefined

  // Fetch this card's single-frame thumbnail only once it scrolls into view, so
  // off-screen cards never issue requests and the scan itself stays instant.
  const [thumbEl, setThumbEl] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!thumbEl || thumbState !== 'idle') return
    if (typeof IntersectionObserver === 'undefined') {
      setThumbState('loading')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setThumbState('loading')
            io.disconnect()
          }
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(thumbEl)
    return () => io.disconnect()
  }, [thumbEl, thumbState])

  useEffect(() => {
    if (thumbState !== 'loading' || thumbUrl) return
    let cancelled = false
    // Coalesce with sibling cards into a batched Figma render (see thumb-queue).
    requestPageThumbnail({
      figmaUrl,
      figmaToken,
      nodeId: mapping.designId,
    })
      .then((url) => {
        if (cancelled) return
        if (url) {
          setThumbUrl(url)
          setThumbState('done')
        } else {
          setThumbState('error')
        }
      })
      .catch(() => {
        if (!cancelled) setThumbState('error')
      })
    return () => {
      cancelled = true
    }
  }, [thumbState, thumbUrl, thumbNonce, figmaUrl, figmaToken, mapping.designId])

  // Re-run the fetch from scratch. `auto` is set for an <img> decode error,
  // which is capped so a persistently broken URL never loops forever; the manual
  // retry button always works regardless of the counter.
  function retryThumb(auto = false) {
    if (auto && thumbNonce >= 1) {
      setThumbState('error')
      return
    }
    setThumbUrl('')
    setThumbState('loading')
    setThumbNonce((n) => n + 1)
  }

  // Thumbnail fits inside a fixed card width while preserving the design ratio.
  const thumbHeight = 150 / aspect

  return (
    <div
      style={{
        ...OV.card,
        ...(isActive
          ? {
              borderColor: '#0f6e56',
              boxShadow: '0 0 0 2px rgba(15,110,86,0.35)',
            }
          : null),
      }}
    >
      <div ref={setThumbEl} style={{ ...OV.thumbWrap, height: Math.min(thumbHeight, 230) }}>
        {thumbState === 'done' && thumbUrl ? (
          <button
            type="button"
            style={OV.thumbOpenBtn}
            title="点击查看原图"
            onClick={() => onOpenPreview?.(thumbUrl)}
          >
            <img
              src={thumbUrl}
              alt={mapping.designName}
              style={OV.thumbImg}
              onError={() => retryThumb(true)}
            />
            <span style={OV.thumbOpenHint}>查看原图</span>
          </button>
        ) : thumbState === 'loading' ? (
          <div style={OV.thumbFallback}>缩略图加载中…</div>
        ) : (
          <button type="button" style={OV.thumbRetry} onClick={retryThumb}>
            缩略图加载失败，点此重试
          </button>
        )}
        <span style={{ ...OV.statusTag, color: status.dot }}>
          <span style={{ ...OV.statusDot, background: status.dot }} />
          {status.label}
        </span>
        <span style={{ ...OV.kindTag, background: badge.bg, color: badge.fg }}>{badge.label}</span>
        {isActive ? (
          <span
            style={{
              position: 'absolute',
              right: 6,
              bottom: 6,
              fontSize: 10,
              fontWeight: 700,
              color: '#fff',
              background: '#0f6e56',
              borderRadius: 99,
              padding: '2px 8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}
          >
            正在查看
          </span>
        ) : null}
      </div>

      <div style={OV.cardName} title={mapping.designName}>{mapping.designName}</div>

      <button
        type="button"
        style={OV.fileBox}
        onClick={() => setPickerOpen(true)}
        title={selFile?.relativePath || '指定代码文件'}
      >
        {selFile ? (
          <span title={selFile.relativePath}>
            {isConfirmed ? '✓ ' : ''}
            {selFile.relativePath.split('/').pop()}
            {selCandidate ? ` · ${Math.round(selCandidate.score * 100)}%` : ''}
          </span>
        ) : (
          <span style={{ color: '#b42318' }}>点此指定代码文件 →</span>
        )}
      </button>
      {selFile ? (
        <div style={OV.filePathHint} title={selFile.relativePath}>
          {selFile.relativePath}
        </div>
      ) : null}
      <button
        type="button"
        style={OV.rematchLink}
        disabled={cardBusy}
        onClick={onAiRematch}
        title="生成推荐提示词并填入当前会话；可核对后发送，也可继续对话纠正错误推荐"
      >
        {rematching ? '准备中…' : 'AI 推荐文件'}
      </button>

      {pickerOpen ? (
        <CodeFilePickerModal
          designName={mapping.designName || mapping.designId}
          candidates={mapping.candidates}
          allCodeFiles={allCodeFiles}
          selected={selected}
          onChoose={(file) => {
            onChoose(file)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      <div style={OV.actionRow}>
        <button
          type="button"
          style={{
            ...OV.compareBtn,
            ...(!selected
              ? { opacity: 0.85, background: '#667085', borderColor: '#667085' }
              : null),
          }}
          disabled={cardBusy}
          title={
            selected
              ? '对比设计稿与已选代码文件'
              : '请先点上方「点此指定代码文件」再对比'
          }
          onClick={() => {
            if (!selected) setPickerOpen(true)
            onCompare()
          }}
        >
          {selected ? '界面对比' : '先选代码文件'}
        </button>
        <button
          type="button"
          style={{
            ...OV.aiBtn,
            ...(!selected ? { opacity: 0.7 } : null),
          }}
          disabled={cardBusy}
          title={
            selected
              ? '先对比再生成 AI 分析提示词'
              : '请先点上方「点此指定代码文件」再分析'
          }
          onClick={() => {
            if (!selected) setPickerOpen(true)
            onAiAnalyze()
          }}
        >
          AI 协助分析
        </button>
      </div>
    </div>
  )
}

function fileDir(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i <= 0 ? '.' : rel.slice(0, i)
}

function fileName(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i < 0 ? rel : rel.slice(i + 1)
}

interface CodeFilePickerModalProps {
  designName: string
  candidates: Candidate[]
  allCodeFiles: CodeFile[]
  selected?: SelectedCodeFile
  onChoose: (file: SelectedCodeFile) => void
  onClose: () => void
}

function CodeFilePickerModal({
  designName,
  candidates,
  allCodeFiles,
  selected,
  onChoose,
  onClose,
}: CodeFilePickerModalProps) {
  const [query, setQuery] = useState('')
  const [collapsedDirs, setCollapsedDirs] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allCodeFiles
    return allCodeFiles.filter((f) => {
      const path = f.relativePath.toLowerCase()
      const name = fileName(f.relativePath).toLowerCase()
      const kind = (f.kindLabel || '').toLowerCase()
      return path.includes(q) || name.includes(q) || kind.includes(q)
    })
  }, [query, allCodeFiles])

  const groups = useMemo(() => {
    const map = new Map<string, CodeFile[]>()
    for (const f of filtered) {
      const dir = fileDir(f.relativePath)
      const list = map.get(dir) || []
      list.push(f)
      map.set(dir, list)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dir, files]) => ({
        dir,
        files: files.slice().sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
      }))
  }, [filtered])

  const visibleCandidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter((c) => {
      const path = c.relativePath.toLowerCase()
      const name = fileName(c.relativePath).toLowerCase()
      return path.includes(q) || name.includes(q)
    })
  }, [query, candidates])

  function isActive(adapterId: string, relativePath: string) {
    return (
      !!selected && selected.adapterId === adapterId && selected.relativePath === relativePath
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="指定代码文件"
      style={OV.pickerOverlay}
      onClick={onClose}
    >
      <div style={OV.pickerPanel} onClick={(e) => e.stopPropagation()}>
        <div style={OV.pickerHeader}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={OV.pickerTitle}>指定代码文件</div>
            <div style={OV.pickerSubtitle} title={designName}>
              {designName}
            </div>
          </div>
          <button type="button" style={OV.pickerClose} onClick={onClose}>
            关闭
          </button>
        </div>

        <div style={OV.pickerSearchRow}>
          <input
            autoFocus
            style={OV.pickerSearchInput}
            value={query}
            placeholder="搜索文件名、路径或类型…（支持部分匹配）"
            onChange={(e) => setQuery(e.target.value)}
          />
          <span style={OV.pickerCount}>
            {filtered.length}/{allCodeFiles.length}
          </span>
        </div>

        <div style={OV.pickerBody}>
          {visibleCandidates.length ? (
            <div style={OV.pickerSection}>
              <div style={OV.pickerSectionTitle}>自动建议</div>
              <div style={OV.pickerSuggestList}>
                {visibleCandidates.slice(0, 12).map((c) => {
                  const active = isActive(c.adapterId, c.relativePath)
                  return (
                    <button
                      key={'sug-' + c.adapterId + c.relativePath}
                      type="button"
                      style={{
                        ...OV.pickerFileRow,
                        ...(active ? OV.pickerFileRowActive : null),
                      }}
                      onClick={() =>
                        onChoose({ adapterId: c.adapterId, relativePath: c.relativePath })
                      }
                    >
                      <span style={OV.pickerScore}>{Math.round(c.score * 100)}%</span>
                      <span style={OV.pickerFileMeta}>
                        <span style={OV.pickerFileName}>{fileName(c.relativePath)}</span>
                        <span style={OV.pickerFileDir}>{fileDir(c.relativePath)}</span>
                      </span>
                      <span style={OV.pickerKind}>{c.kindLabel}</span>
                      {active ? <span style={OV.pickerCheck}>✓</span> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div style={OV.pickerSection}>
            <div style={OV.pickerSectionTitle}>
              全部布局文件
              {query.trim() ? ` · 匹配 ${filtered.length}` : ''}
            </div>
            {groups.length === 0 ? (
              <div style={OV.pickerEmpty}>没有匹配的文件，试试更短的关键词。</div>
            ) : (
              groups.map(({ dir, files }) => {
                const collapsed = !!collapsedDirs[dir]
                return (
                  <div key={dir} style={OV.pickerDirBlock}>
                    <button
                      type="button"
                      style={OV.pickerDirHeader}
                      onClick={() =>
                        setCollapsedDirs({ ...collapsedDirs, [dir]: !collapsed })
                      }
                    >
                      <span>{collapsed ? '▸' : '▾'}</span>
                      <span style={OV.pickerDirPath} title={dir}>
                        {dir}
                      </span>
                      <span style={OV.pickerDirCount}>{files.length}</span>
                    </button>
                    {collapsed
                      ? null
                      : files.map((f) => {
                          const active = isActive(f.adapterId, f.relativePath)
                          return (
                            <button
                              key={f.adapterId + f.relativePath}
                              type="button"
                              style={{
                                ...OV.pickerFileRow,
                                ...(active ? OV.pickerFileRowActive : null),
                              }}
                              onClick={() =>
                                onChoose({
                                  adapterId: f.adapterId,
                                  relativePath: f.relativePath,
                                })
                              }
                              title={f.relativePath}
                            >
                              <span style={OV.pickerFileMeta}>
                                <span style={OV.pickerFileName}>{fileName(f.relativePath)}</span>
                                <span style={OV.pickerFileDir}>{f.relativePath}</span>
                              </span>
                              <span style={OV.pickerKind}>{f.kindLabel}</span>
                              {active ? <span style={OV.pickerCheck}>✓</span> : null}
                            </button>
                          )
                        })}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const OV: Record<string, React.CSSProperties> = {
  scan: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #0f6e56',
    background: '#0f6e56',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  scanSecondary: {
    width: '100%',
    padding: '7px 12px',
    borderRadius: 8,
    border: '1px solid #0f6e56',
    background: '#fff',
    color: '#0f6e56',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 12,
  },
  error: { color: '#b42318', fontSize: 12, marginTop: 6 },
  summary: { fontSize: 12, color: '#5f584c', marginBottom: 8, lineHeight: 1.6 },
  chipRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  chip: {
    fontSize: 11,
    borderRadius: 99,
    padding: '3px 10px',
    border: '1px solid #d9d2c4',
    cursor: 'pointer',
    fontWeight: 600,
  },
  search: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 9px',
    border: '1px solid #d9d2c4',
    borderRadius: 8,
    fontSize: 12,
    marginBottom: 8,
  },
  emptyHint: { fontSize: 12, color: '#8a7f70', padding: '8px 0' },
  canvasCard: {
    border: '1px solid #e3dccc',
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
    background: '#fff',
  },
  canvasHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    fontWeight: 600,
    padding: '7px 10px',
    background: '#f6f2e9',
    color: '#5f584c',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  canvasCount: {
    marginLeft: 'auto',
    fontSize: 11,
    background: '#e7e0d0',
    color: '#5f584c',
    borderRadius: 99,
    padding: '0 8px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 10,
    padding: 10,
  },
  card: {
    border: '1px solid #e8e1d3',
    borderRadius: 10,
    padding: 7,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    background: '#fff',
  },
  thumbWrap: {
    position: 'relative',
    borderRadius: 7,
    overflow: 'hidden',
    background: '#f4f1ea',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  thumbOpenBtn: {
    position: 'relative',
    width: '100%',
    height: '100%',
    padding: 0,
    margin: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'zoom-in',
    display: 'block',
  },
  thumbOpenHint: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    fontSize: 10,
    fontWeight: 600,
    color: '#fff',
    background: 'rgba(0,0,0,0.55)',
    borderRadius: 99,
    padding: '2px 8px',
    pointerEvents: 'none',
  },
  thumbFallback: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    color: '#8a7f70',
    padding: 6,
    textAlign: 'center',
  },
  thumbRetry: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    color: '#b42318',
    background: 'transparent',
    border: 'none',
    padding: 6,
    cursor: 'pointer',
    textAlign: 'center',
  },
  statusTag: {
    position: 'absolute',
    top: 4,
    left: 4,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontWeight: 700,
    background: 'rgba(255,255,255,0.92)',
    borderRadius: 99,
    padding: '1px 6px',
  },
  statusDot: { width: 6, height: 6, borderRadius: 99, display: 'inline-block' },
  kindTag: {
    position: 'absolute',
    top: 4,
    right: 4,
    fontSize: 10,
    fontWeight: 600,
    borderRadius: 99,
    padding: '1px 6px',
  },
  cardName: {
    fontSize: 12,
    fontWeight: 600,
    color: '#33302a',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fileBox: {
    textAlign: 'left',
    fontSize: 11,
    border: '1px solid #d9d2c4',
    borderRadius: 7,
    padding: '5px 7px',
    background: '#fcfaf6',
    cursor: 'pointer',
    color: '#3f3a30',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rematchLink: {
    alignSelf: 'flex-start',
    border: 'none',
    background: 'transparent',
    color: '#0f6e56',
    fontSize: 11,
    padding: '0 2px',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontWeight: 600,
  },
  filePathHint: {
    fontSize: 10,
    color: '#8a7f70',
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: '0 2px',
  },
  pickerOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 10020,
    background: 'rgba(20, 18, 14, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  pickerPanel: {
    width: 'min(640px, 96vw)',
    maxHeight: '88vh',
    background: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 18px 48px rgba(0,0,0,0.35)',
  },
  pickerHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 14px',
    borderBottom: '1px solid #ece5d8',
    background: '#faf7f1',
  },
  pickerTitle: { fontSize: 14, fontWeight: 700, color: '#3f3a30' },
  pickerSubtitle: {
    fontSize: 11,
    color: '#8a7f70',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pickerClose: {
    border: '1px solid #d9d2c4',
    background: '#fff',
    color: '#5f584c',
    borderRadius: 7,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
    flexShrink: 0,
  },
  pickerSearchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderBottom: '1px solid #ece5d8',
  },
  pickerSearchInput: {
    flex: 1,
    boxSizing: 'border-box',
    padding: '8px 10px',
    border: '1px solid #d9d2c4',
    borderRadius: 8,
    fontSize: 13,
  },
  pickerCount: {
    fontSize: 11,
    color: '#8a7f70',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  pickerBody: {
    flex: 1,
    overflow: 'auto',
    padding: '8px 12px 14px',
  },
  pickerSection: { marginBottom: 12 },
  pickerSectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#8a7f70',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  pickerSuggestList: { display: 'flex', flexDirection: 'column', gap: 4 },
  pickerEmpty: { fontSize: 12, color: '#8a7f70', padding: '12px 4px' },
  pickerDirBlock: {
    border: '1px solid #ece5d8',
    borderRadius: 8,
    marginBottom: 6,
    overflow: 'hidden',
    background: '#fdfbf7',
  },
  pickerDirHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px',
    border: 'none',
    background: '#f3eee4',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
    color: '#5f584c',
    textAlign: 'left',
  },
  pickerDirPath: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  pickerDirCount: {
    fontSize: 10,
    background: '#e7e0d0',
    borderRadius: 99,
    padding: '0 7px',
    flexShrink: 0,
  },
  pickerFileRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    border: 'none',
    borderBottom: '1px solid #f0ebe1',
    background: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
  },
  pickerFileRowActive: {
    background: '#f2f8f5',
    boxShadow: 'inset 3px 0 0 #0f6e56',
  },
  pickerScore: {
    fontSize: 11,
    fontWeight: 700,
    color: '#0f6e56',
    width: 36,
    flexShrink: 0,
  },
  pickerFileMeta: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  pickerFileName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#3f3a30',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pickerFileDir: {
    fontSize: 10,
    color: '#8a7f70',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  pickerKind: {
    fontSize: 10,
    color: '#5f584c',
    background: '#f3eee4',
    borderRadius: 99,
    padding: '2px 7px',
    flexShrink: 0,
    maxWidth: 90,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pickerCheck: {
    color: '#0f6e56',
    fontWeight: 700,
    fontSize: 13,
    flexShrink: 0,
  },
  actionRow: {
    display: 'flex',
    gap: 6,
    marginTop: 2,
  },
  compareBtn: {
    flex: 1,
    fontSize: 12,
    padding: '6px 4px',
    borderRadius: 7,
    border: '1px solid #0f6e56',
    background: '#0f6e56',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  aiBtn: {
    flex: 1,
    fontSize: 12,
    padding: '6px 4px',
    borderRadius: 7,
    border: '1px solid #0f6e56',
    background: '#fff',
    color: '#0f6e56',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  previewOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    background: 'rgba(20, 18, 14, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  previewPanel: {
    width: 'min(920px, 96vw)',
    maxHeight: '92vh',
    background: '#1c1915',
    borderRadius: 12,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 18px 48px rgba(0,0,0,0.45)',
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    color: '#f4f1ea',
    fontSize: 13,
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  previewClose: {
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'transparent',
    color: '#f4f1ea',
    borderRadius: 7,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
    flexShrink: 0,
  },
  previewBody: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    background: '#11100e',
  },
  previewImg: {
    maxWidth: '100%',
    maxHeight: '78vh',
    objectFit: 'contain',
    display: 'block',
  },
}
