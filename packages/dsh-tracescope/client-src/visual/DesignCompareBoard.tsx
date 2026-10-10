import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { DiffBox } from './DesignLayerScreen.js'
import type { PageFindings } from './panel-types.js'
import { resolveFindingNodeId } from './resolve-finding-node.js'
import { getT, localeHeaders, withLocale } from '../locales/i18n.js'
import { useLocaleT } from '../locales/use-locale-t.js'
import { diffPropLabel, diffSeverityLabel } from './diff-i18n.js'
import {
  copyTextToClipboard,
  defaultVisualDefectSubject,
  downloadTextFile,
  formatVisualDiffCopyText,
  formatVisualDiffExportMarkdown,
  unifiedItemsToFailReport,
} from './diff-actions.js'

interface DesignCompareData {
  page: { adapterId: string; kindLabel?: string; relativePath: string }
  viewport: { width: number; height: number }
  designName?: string
  designImageUrl?: string
  designNoteMasks?: NoteMask[]
  chatPrompt?: string
  relatedFiles?: Array<{ relativePath: string; role: string; reason?: string }>
  designTree: DesignTreeNode
  /** Full design id→box table (preferred for hotspot; covers folded icon children). */
  designNodeBoxes?: Array<{
    id: string
    x: number
    y: number
    width: number
    height: number
    name?: string
    kind?: string
    text?: string
  }>
  /** Server may still return this; board focuses on design raster + diff list. */
  codeTree?: DesignTreeNode
  aiInferenceNote?: string
  /** Which enrichment ran (e.g. android-xml), if any. */
  enrichmentApplied?: string
  fromCache?: boolean
  savedAt?: string
  /** exact = property-level; heuristic = L2 static checks. */
  compareMode?: 'exact' | 'heuristic'
  result: {
    diffs: Array<Record<string, unknown>>
    unmatched: Array<Record<string, unknown>>
    comparedPairs: number
  }
}

interface DesignTreeNode {
  id: string
  name: string
  kind: string
  text?: string
  imageUrl?: string
  x: number
  y: number
  width: number
  height: number
  dynamic?: boolean
  aiInferred?: boolean
  aiNote?: string
  itemRendered?: boolean
  style?: Record<string, unknown>
  inferredChildren?: DesignTreeNode[]
  children: DesignTreeNode[]
}

function relatedRoleLabel(role: string, tr: ReturnType<typeof getT>): string {
  switch (role) {
    case 'sibling':
      return tr('diff.board.related.sibling')
    case 'import':
      return tr('diff.board.related.import')
    case 'include':
      return 'include'
    case 'style':
      return tr('diff.board.related.style')
    case 'resource':
      return tr('diff.board.related.resource')
    case 'entry':
      return tr('diff.board.related.entry')
    default:
      return role || tr('diff.board.related.default')
  }
}

const SEVERITY_RANK = { high: 3, medium: 2, low: 0 } as const
const SEVERITY_TEXT: Record<'high' | 'medium' | 'low', string> = {
  high: '#d92d20',
  medium: '#dc8a05',
  low: '#2f62b9',
}

function formatCompareSavedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface SendToChatResult {
  ok: boolean
  error?: string
}

interface DiffOverride {
  deleted?: boolean
  note?: string
  headline?: string
  expected?: string
  actual?: string
}

function diffStoreKey(data: DesignCompareData): string {
  return `tracescope.diff.edits:${data.page.adapterId}:${data.page.relativePath}:${data.designTree?.id || data.designName || ''}`
}

function loadDiffOverrides(key: string): Record<string, DiffOverride> {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') as Record<string, DiffOverride>
  } catch {
    return {}
  }
}

function loadHiddenLayers(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key + ':hidden') || '[]')
    return Array.isArray(raw) ? raw.map(String) : []
  } catch {
    return []
  }
}

export function DesignCompareBoard({
  data,
  findings,
  onAiAnalyze,
  onRegenerate,
  openConfirmDialog,
  repoInput,
  designUrl,
  trackerReady,
  trackerProvider,
  onOpenTrackerSettings,
  onActionHint,
}: {
  data: DesignCompareData
  findings?: PageFindings
  onSendToChat?: (prompt: string) => SendToChatResult
  onAiAnalyze?: (codeFile: { adapterId: string; relativePath: string }) => void
  onRegenerate?: () => void
  openConfirmDialog?: (opts: {
    title: string
    message?: string
    inputLabel?: string
    inputValue?: string
    multiline?: boolean
    fields?: Array<{ key: string; label: string; value: string }>
    confirmLabel?: string
    onConfirm: (value: string | Record<string, string> | void) => void
  }) => void
  repoInput?: string
  designUrl?: string
  trackerReady?: boolean
  trackerProvider?: string
  onOpenTrackerSettings?: () => void
  onActionHint?: (message: string) => void
}) {
  const t = useLocaleT()
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [chatNote, setChatNote] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'ai' | 'rule'>('all')
  const storeKey = useMemo(() => diffStoreKey(data), [data])
  const [overrides, setOverrides] = useState<Record<string, DiffOverride>>(() =>
    loadDiffOverrides(storeKey),
  )
  const [hiddenLayerIds, setHiddenLayerIds] = useState<string[]>(() => loadHiddenLayers(storeKey))
  const [pickHint, setPickHint] = useState('')
  const userEraseRef = useRef(false)
  const eraseDoneHintRef = useRef(t('diff.board.eraseDone'))

  useEffect(() => {
    setOverrides(loadDiffOverrides(storeKey))
    setHiddenLayerIds(loadHiddenLayers(storeKey))
    setSelectedKeys(new Set())
  }, [storeKey])

  useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(overrides))
    } catch {
      /* ignore */
    }
  }, [storeKey, overrides])

  useEffect(() => {
    try {
      localStorage.setItem(storeKey + ':hidden', JSON.stringify(hiddenLayerIds))
    } catch {
      /* ignore */
    }
  }, [storeKey, hiddenLayerIds])

  const diffs = data.result.diffs as unknown as DiffBox[]

  const designBoxById = useMemo(() => {
    const map = new Map<
      string,
      { x: number; y: number; width: number; height: number; name: string; kind: string; text?: string }
    >()
    const put = (
      idRaw: string,
      box: { x: number; y: number; width: number; height: number; name?: string; kind?: string; text?: string },
    ) => {
      const id = String(idRaw ?? '').trim()
      if (!id || map.has(id)) return
      map.set(id, {
        x: Number(box.x) || 0,
        y: Number(box.y) || 0,
        width: Number(box.width) || 0,
        height: Number(box.height) || 0,
        name: box.name || id,
        kind: box.kind || 'frame',
        text: box.text,
      })
    }
    // Prefer the full DesignDoc flat table (includes icon-group descendants).
    for (const b of data.designNodeBoxes ?? []) put(b.id, b)
    const walk = (n: DesignTreeNode): void => {
      put(n.id, {
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        name: n.name,
        kind: n.kind,
        text: n.text,
      })
      for (const c of n.inferredChildren ?? []) walk(c)
      for (const c of n.children ?? []) walk(c)
    }
    walk(data.designTree)
    for (const m of data.designNoteMasks ?? []) {
      put(String(m.nodeId ?? ''), {
        x: m.x,
        y: m.y,
        width: m.width,
        height: m.height,
        name: m.text,
        kind: 'text',
        text: m.text,
      })
    }
    return map
  }, [data.designTree, data.designNodeBoxes, data.designNoteMasks])

  /** Exact id, then digit-compact / colon-dash normalized match. */
  const resolveDesignBox = useMemo(() => {
    const compactIndex = new Map<string, string>()
    const normalizeIndex = new Map<string, string>()
    for (const id of designBoxById.keys()) {
      const compact = id.replace(/[^0-9]/g, '')
      if (compact && !compactIndex.has(compact)) compactIndex.set(compact, id)
      const norm = id.replace(/-/g, ':')
      if (!normalizeIndex.has(norm)) normalizeIndex.set(norm, id)
    }
    return (rawId: string) => {
      const id = String(rawId ?? '').trim()
      if (!id) return undefined
      const direct = designBoxById.get(id)
      if (direct) return direct
      const norm = id.replace(/-/g, ':')
      const viaNorm = normalizeIndex.get(norm)
      if (viaNorm) return designBoxById.get(viaNorm)
      const compact = id.replace(/[^0-9]/g, '')
      if (compact) {
        const viaCompact = compactIndex.get(compact)
        if (viaCompact) return designBoxById.get(viaCompact)
      }
      return undefined
    }
  }, [designBoxById])

  const aiFindings = findings?.findings ?? []

  const findingLocators = useMemo(
    () =>
      [...designBoxById.entries()].map(([id, box]) => ({
        id,
        name: box.name,
        text: box.text,
        width: box.width,
        height: box.height,
      })),
    [designBoxById],
  )

  const unifiedItems = useMemo(() => {
    const compact = (id: string) => id.replace(/[^0-9]/g, '')
    const absorbed = new Set<number>()
    const items: UnifiedItem[] = []

    for (const f of aiFindings) {
      const rawNodeId = (f.nodeId ?? '').trim()
      const haystack = `${f.title} ${f.location ?? ''} ${f.expected ?? ''} ${f.actual ?? ''} ${f.suggestion ?? ''}`.toLowerCase()
      let codeId = ''
      let linkedDesignId = ''
      diffs.forEach((d, idx) => {
        if (!d.designNodeId) return
        const sameId =
          rawNodeId &&
          compact(d.designNodeId) === compact(rawNodeId)
        const nameInFinding =
          d.nodeName &&
          (haystack.includes(String(d.nodeName).toLowerCase()) ||
            (f.location || '').toLowerCase().includes(String(d.nodeName).toLowerCase()))
        if (!sameId && !nameInFinding) return
        if (sameId && propertyCovered(d.property, haystack)) {
          absorbed.add(idx)
        }
        if (!linkedDesignId) linkedDesignId = String(d.designNodeId)
        if (!codeId && d.codeNodeId) codeId = String(d.codeNodeId)
      })

      const resolved =
        resolveFindingNodeId(
          {
            title: f.title,
            nodeId: rawNodeId || linkedDesignId || undefined,
            location: f.location,
            expected: f.expected,
            actual: f.actual,
            suggestion: f.suggestion,
          },
          findingLocators,
        ) ||
        linkedDesignId ||
        rawNodeId

      items.push({
        key: 'ai-' + items.length,
        source: 'ai',
        severity: f.severity,
        headline: f.title,
        location: f.location,
        expected: f.expected,
        actual: f.actual,
        codeSource: f.codeSource,
        suggestion: f.suggestion,
        designId: String(resolved || ''),
        codeId,
      })
    }

    diffs.forEach((d, idx) => {
      if (absorbed.has(idx)) return
      items.push({
        key: 'rule-' + idx,
        source: 'rule',
        severity: d.severity,
        headline: `${diffPropLabel(t, d.property)} · ${d.nodeName}`,
        expected: d.expected === undefined ? undefined : String(d.expected),
        actual: d.actual === undefined ? undefined : String(d.actual),
        designId: String(d.designNodeId ?? ''),
        codeId: String(d.codeNodeId ?? ''),
        needsReview: d.needsReview,
      })
    })

    items.sort((a, b) => {
      const rank = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
      if (rank !== 0) return rank
      if (a.source !== b.source) return a.source === 'ai' ? -1 : 1
      return 0
    })
    return items
  }, [aiFindings, diffs, findingLocators])

  const displayItems = useMemo(() => {
    return unifiedItems
      .map((item) => {
        const o = overrides[item.key]
        if (!o) return item
        return {
          ...item,
          headline: o.headline ?? item.headline,
          expected: o.expected ?? item.expected,
          actual: o.actual ?? item.actual,
          note: o.note,
          deleted: !!o.deleted,
        }
      })
      .filter((item) => !item.deleted)
  }, [unifiedItems, overrides])

  const deletedItems = useMemo(() => {
    return unifiedItems
      .map((item) => {
        const o = overrides[item.key]
        if (!o?.deleted) return null
        return {
          ...item,
          headline: o.headline ?? item.headline,
          expected: o.expected ?? item.expected,
          actual: o.actual ?? item.actual,
          note: o.note,
          deleted: true as const,
        }
      })
      .filter((item): item is UnifiedItem & { deleted: true } => item != null)
  }, [unifiedItems, overrides])

  const aiCount = displayItems.filter((i) => i.source === 'ai').length
  const ruleCount = displayItems.filter((i) => i.source === 'rule').length
  const visibleItems = displayItems.filter(
    (i) => sourceFilter === 'all' || i.source === sourceFilter,
  )

  const actionMeta = {
    repoPath: (repoInput || '').trim(),
    designName: data.designName || data.designTree?.name || '',
    designUrl: (designUrl || '').trim(),
    codePath: data.page.relativePath,
    platformLabel: data.page.kindLabel || data.page.adapterId,
  }

  const hint = (message: string) => {
    setChatNote(message)
    onActionHint?.(message)
  }

  const copyDiffs = async () => {
    const targets = selectedKeys.size
      ? visibleItems.filter((i) => selectedKeys.has(i.key))
      : visibleItems
    if (!targets.length) {
      hint(
        selectedKeys.size ? t('diff.board.hint.noCopySelection') : t('diff.board.hint.noCopy'),
      )
      return
    }
    try {
      await copyTextToClipboard(formatVisualDiffCopyText(targets, actionMeta, t))
      hint(t('diff.board.hint.copied', { count: targets.length }))
    } catch (err) {
      hint(t('diff.board.hint.copyFailed', { message: (err as Error).message }))
    }
  }

  const exportDiffs = () => {
    const targets = selectedKeys.size
      ? visibleItems.filter((i) => selectedKeys.has(i.key))
      : visibleItems
    if (!targets.length) {
      hint(
        selectedKeys.size ? t('diff.board.hint.noExportSelection') : t('diff.board.hint.noExport'),
      )
      return
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `tracescope-ui-diff-${stamp}.md`
    downloadTextFile(filename, formatVisualDiffExportMarkdown(targets, actionMeta, t))
    hint(t('diff.board.hint.exported', { filename }))
  }

  const submitDiffs = () => {
    const targets = selectedKeys.size
      ? visibleItems.filter((i) => selectedKeys.has(i.key))
      : visibleItems
    if (!targets.length) {
      hint(
        selectedKeys.size ? t('diff.board.hint.noSubmitSelection') : t('diff.board.hint.noSubmit'),
      )
      return
    }
    if (!trackerReady) {
      if (typeof openConfirmDialog === 'function') {
        openConfirmDialog({
          title: t('diff.board.trackerConfig.title'),
          message: t('diff.board.trackerConfig.message'),
          confirmLabel: t('diff.board.trackerConfig.confirm'),
          onConfirm: () => {
            onOpenTrackerSettings?.()
          },
        })
      } else {
        hint(t('diff.board.hint.finishTrackerConfig'))
      }
      return
    }
    if (typeof openConfirmDialog !== 'function') {
      hint(t('diff.board.hint.noHostDialog'))
      return
    }
    openConfirmDialog({
      title: t('diff.board.submit.title'),
      message: t('diff.board.submit.message', {
        count: targets.length,
        provider: trackerProvider || t('diff.board.trackerConfig.confirm'),
      }),
      inputLabel: t('diff.board.submit.inputLabel'),
      inputValue: defaultVisualDefectSubject(targets, actionMeta, t),
      confirmLabel: t('diff.board.submit.confirm'),
      onConfirm: (subject) => {
        const report = unifiedItemsToFailReport(targets, actionMeta, t)
        void fetch('/tracescope/v1/tracker-submit', {
          method: 'POST',
          credentials: 'same-origin',
          headers: localeHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify(
            withLocale({
              repoPath: actionMeta.repoPath,
              baseCommit: report.baseCommit,
              headCommit: report.headCommit,
              report,
              subject: String(subject || '').trim(),
            }),
          ),
        })
          .then(async (r) => {
            const text = await r.text()
            const data = text ? JSON.parse(text) : {}
            if (!r.ok) throw new Error(data.error || t('diff.board.submit.failed'))
            let tip = t('diff.board.submit.success', {
              provider: data.provider || trackerProvider || 'tracker',
            })
            if (data.id) tip += `（ID ${data.id}）`
            tip += t('diff.board.submit.successCount', { count: data.count || targets.length })
            if (data.url) tip += t('diff.board.submit.successLink', { url: data.url })
            hint(tip)
          })
          .catch((err) => {
            hint(t('diff.board.submit.failMessage', { message: (err as Error).message }))
          })
      },
    })
  }

  const visibleNoteMasks = useMemo(() => {
    const hidden = new Set(hiddenLayerIds)
    // Auto-detected designer notes: always erase from the raster (true removal).
    const auto = (data.designNoteMasks ?? []).filter((m) => !m.nodeId || !hidden.has(m.nodeId))
    // Manual layer deletes: erase those boxes too.
    const manual: NoteMask[] = []
    for (const id of hiddenLayerIds) {
      const box = resolveDesignBox(id)
      if (!box || box.width <= 0 || box.height <= 0) continue
      if (id === data.designTree.id) continue
      // Prefer the auto mask's fill hint when the same node was detected as a note.
      const autoHit = (data.designNoteMasks ?? []).find((m) => m.nodeId === id)
      manual.push({
        text: box.text || box.name || id,
        nodeId: id,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        maskColor: autoHit?.maskColor || 'transparent',
      })
    }
    // Deduplicate by nodeId (manual wins over auto for the same id).
    const byId = new Map<string, NoteMask>()
    for (const m of auto) {
      const key = m.nodeId || `${m.x},${m.y},${m.width},${m.height}`
      byId.set(key, m)
    }
    for (const m of manual) {
      const key = m.nodeId || `${m.x},${m.y},${m.width},${m.height}`
      byId.set(key, m)
    }
    return [...byId.values()]
  }, [data.designNoteMasks, hiddenLayerIds, resolveDesignBox, data.designTree.id])

  // Click targets must include pruned annotation boxes (they are gone from the tree).
  const pickBoxes = useMemo(() => {
    const map = new Map(designBoxById)
    for (const m of data.designNoteMasks ?? []) {
      const id = String(m.nodeId ?? '')
      if (!id || map.has(id)) continue
      map.set(id, {
        x: Number(m.x) || 0,
        y: Number(m.y) || 0,
        width: Number(m.width) || 0,
        height: Number(m.height) || 0,
        name: m.text,
        kind: 'text',
        text: m.text,
      })
    }
    return map
  }, [designBoxById, data.designNoteMasks])

  const computedScale = useMemo(() => {
    const available = 360
    return Math.min(1, available / data.viewport.width)
  }, [data.viewport.width])

  const w = data.viewport.width * computedScale
  const h = data.viewport.height * computedScale

  const selectedHotspots = useMemo(() => {
    const out: Array<{
      key: string
      color: string
      box: { x: number; y: number; width: number; height: number }
    }> = []
    const seenBoxes = new Set<string>()
    for (const item of visibleItems) {
      if (!selectedKeys.has(item.key) || !item.designId) continue
      const box = resolveDesignBox(item.designId)
      if (!box || box.width <= 0 || box.height <= 0) continue
      const boxKey = `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)}`
      // Same node may back multiple findings; keep one overlay per box, prefer higher severity.
      const existingIdx = out.findIndex((h) => {
        const k = `${Math.round(h.box.x)},${Math.round(h.box.y)},${Math.round(h.box.width)},${Math.round(h.box.height)}`
        return k === boxKey
      })
      const color = SEVERITY_TEXT[item.severity]
      if (existingIdx >= 0) {
        const prev = out[existingIdx]!
        const prevRank =
          prev.color === SEVERITY_TEXT.high ? 3 : prev.color === SEVERITY_TEXT.medium ? 2 : 1
        const nextRank = item.severity === 'high' ? 3 : item.severity === 'medium' ? 2 : 1
        if (nextRank > prevRank) out[existingIdx] = { key: item.key, color, box }
        continue
      }
      if (seenBoxes.has(boxKey)) continue
      seenBoxes.add(boxKey)
      out.push({ key: item.key, color, box })
    }
    return out
  }, [visibleItems, selectedKeys, resolveDesignBox])

  const designFrameRef = useRef<HTMLDivElement | null>(null)

  function toggleItem(item: UnifiedItem) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(item.key)) next.delete(item.key)
      else next.add(item.key)
      return next
    })
    const willSelect = !selectedKeys.has(item.key)
    if (willSelect) {
      if (item.designId && !resolveDesignBox(item.designId)) {
        setPickHint(t('diff.board.hint.noHotspot'))
      } else {
        setPickHint('')
        requestAnimationFrame(() => {
          designFrameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        })
      }
    } else {
      setPickHint('')
    }
  }

  function clearMarkers() {
    setSelectedKeys(new Set())
    setPickHint('')
  }

  function patchOverride(key: string, patch: DiffOverride) {
    setOverrides((prev) => {
      const next = { ...prev, [key]: { ...prev[key], ...patch } }
      if (patch.deleted === false && !patch.note && !patch.headline && !patch.expected && !patch.actual) {
        // cleaned
      }
      return next
    })
  }

  function hideLayer(nodeId: string) {
    if (!nodeId) return
    userEraseRef.current = true
    eraseDoneHintRef.current = t('diff.board.eraseDone')
    setPickHint(t('diff.board.erasing'))
    setHiddenLayerIds((prev) => (prev.includes(nodeId) ? prev : [...prev, nodeId]))
  }

  function findLayerAt(x: number, y: number): string {
    let bestId = ''
    let bestArea = Number.POSITIVE_INFINITY
    for (const [id, box] of pickBoxes) {
      if (hiddenLayerIds.includes(id)) continue
      if (id === data.designTree.id) continue
      if (x < box.x || y < box.y || x > box.x + box.width || y > box.y + box.height) continue
      const area = Math.max(1, box.width * box.height)
      if (area < bestArea) {
        bestArea = area
        bestId = id
      }
    }
    return bestId
  }

  function sendToChat() {
    if (typeof onAiAnalyze !== 'function') {
      setChatNote(t('diff.board.chatUnsupported'))
      return
    }
    onAiAnalyze({
      adapterId: data.page.adapterId,
      relativePath: data.page.relativePath,
    })
    setChatNote(t('diff.board.chatFilling'))
  }

  const modeLabel =
    data.compareMode === 'heuristic'
      ? t('diff.board.mode.heuristic')
      : data.compareMode === 'exact'
        ? data.enrichmentApplied
          ? t('diff.board.mode.exactDeep', { name: data.enrichmentApplied })
          : t('diff.board.mode.exact')
        : null

  return (
    <div style={{ marginTop: 12 }}>
      {data.fromCache && data.savedAt ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            fontSize: 11,
            color: '#8a7a5c',
            background: '#f7f2e9',
            border: '1px solid #e6ddcb',
            borderRadius: 6,
            padding: '4px 8px',
            marginBottom: 8,
          }}
        >
          <span>{t('diff.board.cacheHint', { time: formatCompareSavedAt(data.savedAt) })}</span>
          {onRegenerate ? (
            <button type="button" style={COL.clearBtn} onClick={onRegenerate}>
              {t('diff.board.regenerate')}
            </button>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginBottom: 6, fontSize: 12, color: '#5f584c' }}>
        <strong>{t('diff.board.title')}</strong>
        {modeLabel ? (
          <span
            style={{
              marginLeft: 8,
              fontSize: 10,
              fontWeight: 700,
              color: '#0f6e56',
              background: '#e3f1ea',
              borderRadius: 4,
              padding: '1px 6px',
            }}
          >
            {modeLabel}
          </span>
        ) : null}
        <span style={{ marginLeft: 8, color: '#8a7f70' }}>
          {data.page.kindLabel ?? data.page.adapterId} · {data.page.relativePath}
        </span>
      </div>
      {(data.relatedFiles?.length ?? 0) > 1 ? (
        <details style={{ marginBottom: 8, fontSize: 11, color: '#5f584c' }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
            {t('diff.board.relatedFiles', { count: data.relatedFiles!.length - 1 })}
          </summary>
          <ul
            style={{
              margin: '6px 0 0',
              paddingLeft: 18,
              maxHeight: 120,
              overflow: 'auto',
              lineHeight: 1.5,
            }}
          >
            {data.relatedFiles!
              .filter((f) => f.role !== 'entry')
              .map((f) => (
                <li key={f.relativePath} title={f.reason || f.role}>
                  <span style={{ color: '#8a7f70' }}>[{relatedRoleLabel(f.role, t)}]</span>{' '}
                  {f.relativePath}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
      <div style={{ fontSize: 11, color: '#8a7f70', marginBottom: 6 }}>
        {t('diff.board.eraseHint')}
        {hiddenLayerIds.length ? (
          <button
            type="button"
            style={{ ...COL.clearBtn, marginLeft: 8, padding: '1px 8px' }}
            onClick={() => {
              userEraseRef.current = true
              eraseDoneHintRef.current = t('diff.board.eraseRestored')
              setPickHint(t('diff.board.restoring'))
              setHiddenLayerIds([])
            }}
          >
            {t('diff.board.restoreLayers', { count: hiddenLayerIds.length })}
          </button>
        ) : null}
      </div>
      {pickHint ? <div style={{ fontSize: 11, color: '#0f6e56', marginBottom: 6 }}>{pickHint}</div> : null}

      <div ref={designFrameRef} style={{ ...COL.frame, width: w, height: h, position: 'relative' }}>
        <div style={{ transform: `scale(${computedScale})`, transformOrigin: 'top left' }}>
          <RasterDesignView
            imageUrl={data.designImageUrl}
            viewport={data.viewport}
            eraseRegions={visibleNoteMasks}
            onBusyChange={(busy) => {
              if (!busy && userEraseRef.current) {
                userEraseRef.current = false
                setPickHint(eraseDoneHintRef.current)
              }
            }}
            onPick={(x, y) => {
              const id = findLayerAt(x, y)
              if (!id) {
                setPickHint(t('diff.board.missLayer'))
                return
              }
              const box = pickBoxes.get(id)
              const label = box?.text || box?.name || id
              if (window.confirm(t('diff.board.confirmErase', { label }))) {
                hideLayer(id)
              }
            }}
          />
        </div>
        {selectedHotspots.map((spot) => (
          <div
            key={spot.key + ':' + Math.round(spot.box.x) + ',' + Math.round(spot.box.y)}
            aria-hidden
            style={{
              position: 'absolute',
              left: spot.box.x * computedScale,
              top: spot.box.y * computedScale,
              width: Math.max(4, spot.box.width * computedScale),
              height: Math.max(4, spot.box.height * computedScale),
              border: `2px solid ${spot.color}`,
              background: `${spot.color}33`,
              boxShadow: `0 0 0 1px #fff, 0 0 0 3px ${spot.color}`,
              boxSizing: 'border-box',
              pointerEvents: 'none',
              zIndex: 6,
              borderRadius: 2,
            }}
          />
        ))}
      </div>

      {data.aiInferenceNote ? <div style={COL.aiNote}>{data.aiInferenceNote}</div> : null}
      {chatNote ? <div style={COL.chatNote}>{chatNote}</div> : null}

      <div style={{ marginTop: 10 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <strong style={{ fontSize: 12 }}>
            {t('diff.board.diffList', {
              visible: visibleItems.length,
              selection: selectedKeys.size
                ? t('diff.board.diffListSelected', { count: selectedKeys.size })
                : '',
            })}
          </strong>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
            <button type="button" style={COL.aiBtn} onClick={sendToChat}>
              {t('diff.board.aiAnalyze')}
            </button>
            <button type="button" style={COL.clearBtn} onClick={() => void copyDiffs()}>
              {selectedKeys.size
                ? t('diff.board.copySelected', { count: selectedKeys.size })
                : t('diff.board.copyAll')}
            </button>
            <button type="button" style={COL.clearBtn} onClick={submitDiffs}>
              {selectedKeys.size
                ? t('diff.board.submitSelected', { count: selectedKeys.size })
                : t('diff.board.submitAll')}
            </button>
            <button type="button" style={COL.clearBtn} onClick={exportDiffs}>
              {selectedKeys.size
                ? t('diff.board.exportSelected', { count: selectedKeys.size })
                : t('diff.board.exportAll')}
            </button>
            {onRegenerate ? (
              <button type="button" style={COL.clearBtn} onClick={onRegenerate}>
                {t('diff.board.regenerate')}
              </button>
            ) : null}
            <button
              type="button"
              style={COL.clearBtn}
              onClick={clearMarkers}
              disabled={!selectedKeys.size}
              title={t('diff.board.clearSelectionTitle')}
            >
              {t('diff.board.clearSelection')}
            </button>
          </div>
        </div>

        <FilterTabs
          filter={sourceFilter}
          onChange={setSourceFilter}
          aiCount={aiCount}
          ruleCount={ruleCount}
        />

        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {visibleItems.slice(0, 80).map((item) => {
            const isActive = selectedKeys.has(item.key)
            return (
              <UnifiedCard
                key={item.key}
                item={item}
                active={isActive}
                onSelect={() => toggleItem(item)}
                onDelete={() => patchOverride(item.key, { deleted: true })}
                onOpenEditor={(mode) => {
                  if (typeof openConfirmDialog !== 'function') {
                    setChatNote(t('diff.board.hostDialogUnsupported'))
                    return
                  }
                  if (mode === 'note') {
                    openConfirmDialog({
                      title: t('diff.board.noteDialog.title'),
                      message: item.headline,
                      inputLabel: t('diff.board.noteDialog.inputLabel'),
                      inputValue: item.note || '',
                      multiline: true,
                      confirmLabel: t('diff.board.noteDialog.confirm'),
                      onConfirm: (value) => {
                        patchOverride(item.key, { note: String(value ?? '').trim() })
                      },
                    })
                    return
                  }
                  openConfirmDialog({
                    title: t('diff.board.editDialog.title'),
                    message: item.headline,
                    fields: [
                      { key: 'headline', label: t('diff.board.editDialog.headline'), value: item.headline },
                      {
                        key: 'expected',
                        label: t('diff.board.editDialog.expected'),
                        value: item.expected || '',
                      },
                      { key: 'actual', label: t('diff.board.editDialog.actual'), value: item.actual || '' },
                    ],
                    confirmLabel: t('diff.board.editDialog.confirm'),
                    onConfirm: (value) => {
                      const map =
                        value && typeof value === 'object' ? (value as Record<string, string>) : {}
                      patchOverride(item.key, {
                        headline: map.headline ?? item.headline,
                        expected: map.expected ?? item.expected,
                        actual: map.actual ?? item.actual,
                      })
                    },
                  })
                }}
              />
            )
          })}
          {visibleItems.length === 0 ? (
            <div style={{ fontSize: 12, color: '#8a7f70', padding: '6px 2px' }}>
              {t('diff.board.noDiffsInFilter')}
            </div>
          ) : null}
        </div>

        {deletedItems.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 6,
              }}
            >
              <strong style={{ fontSize: 12, color: '#8a7f70' }}>
                {t('diff.board.deletedSection', { count: deletedItems.length })}
              </strong>
              <button
                type="button"
                style={COL.clearBtn}
                onClick={() => {
                  setOverrides((prev) => {
                    const next = { ...prev }
                    for (const item of deletedItems) {
                      const cur = next[item.key]
                      if (!cur) continue
                      const { deleted: _d, ...rest } = cur
                      if (
                        rest.note ||
                        rest.headline ||
                        rest.expected ||
                        rest.actual
                      ) {
                        next[item.key] = rest
                      } else {
                        delete next[item.key]
                      }
                    }
                    return next
                  })
                }}
              >
                {t('diff.board.restoreAll')}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {deletedItems.slice(0, 40).map((item) => (
                <div
                  key={`del-${item.key}`}
                  style={{
                    fontSize: 12,
                    lineHeight: 1.5,
                    border: '1px dashed #d9d2c4',
                    background: '#faf8f4',
                    borderRadius: 8,
                    padding: '6px 8px',
                    color: '#8a7f70',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <span style={{ textDecoration: 'line-through' }}>{item.headline}</span>
                    {item.note ? (
                      <div style={{ fontSize: 11, marginTop: 2 }}>
                        {t('diff.board.notePrefix', { value: item.note })}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    style={COL.miniBtn}
                    onClick={() => {
                      setOverrides((prev) => {
                        const cur = prev[item.key]
                        if (!cur) return prev
                        const { deleted: _d, ...rest } = cur
                        const next = { ...prev }
                        if (rest.note || rest.headline || rest.expected || rest.actual) {
                          next[item.key] = rest
                        } else {
                          delete next[item.key]
                        }
                        return next
                      })
                    }}
                  >
                    {t('diff.board.restoreOne')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

interface UnifiedItem {
  key: string
  source: 'ai' | 'rule'
  severity: 'high' | 'medium' | 'low'
  headline: string
  location?: string
  expected?: string
  actual?: string
  codeSource?: string
  suggestion?: string
  designId: string
  codeId: string
  needsReview?: boolean
  note?: string
  deleted?: boolean
}

interface NoteMask {
  text: string
  nodeId?: string
  x: number
  y: number
  width: number
  height: number
  maskColor: string
}

function propertyCovered(property: string, aiText: string): boolean {
  const tr = getT()
  const lbl = (prop: string) => diffPropLabel(tr, prop).toLowerCase()
  const tokens: Record<string, string[]> = {
    width: [lbl('width'), 'width'],
    height: [lbl('height'), 'height'],
    marginTop: [lbl('marginTop'), 'margin-top'],
    marginBottom: [lbl('marginBottom'), 'margin-bottom'],
    marginLeft: [lbl('marginLeft'), 'margin-left'],
    marginRight: [lbl('marginRight'), 'margin-right'],
    paddingTop: [lbl('paddingTop'), 'padding-top'],
    paddingBottom: [lbl('paddingBottom'), 'padding-bottom'],
    paddingLeft: [lbl('paddingLeft'), 'padding-left'],
    paddingRight: [lbl('paddingRight'), 'padding-right'],
    backgroundColor: [lbl('backgroundColor'), 'background'],
    color: [lbl('color'), 'color'],
    fontSize: [lbl('fontSize'), 'font-size'],
    cornerRadius: [lbl('cornerRadius'), 'corner', 'radius'],
    borderWidth: [lbl('borderWidth'), 'border'],
    borderColor: [lbl('borderColor'), 'border'],
    fontWeight: [lbl('fontWeight'), 'font-weight'],
    opacity: [lbl('opacity'), 'opacity'],
    text: [lbl('text'), 'text'],
    controlCount: [lbl('controlCount'), 'control'],
  }
  const keys = tokens[property]
  if (!keys) return false
  return keys.some((k) => aiText.includes(k.toLowerCase()))
}

function FilterTabs({
  filter,
  onChange,
  aiCount,
  ruleCount,
}: {
  filter: 'all' | 'ai' | 'rule'
  onChange: (f: 'all' | 'ai' | 'rule') => void
  aiCount: number
  ruleCount: number
}) {
  const t = getT()
  const tabs: Array<['all' | 'ai' | 'rule', string]> = [
    ['all', t('diff.board.filter.all', { count: aiCount + ruleCount })],
    ['ai', t('diff.board.filter.ai', { count: aiCount })],
    ['rule', t('diff.board.filter.rule', { count: ruleCount })],
  ]
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      {tabs.map(([id, label]) => {
        const active = filter === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            style={{
              fontSize: 11,
              borderRadius: 999,
              padding: '2px 10px',
              cursor: 'pointer',
              border: '1px solid ' + (active ? '#0f6e56' : '#d9d2c4'),
              background: active ? '#0f6e56' : '#fff',
              color: active ? '#fff' : '#5f584c',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function UnifiedCard({
  item,
  active,
  onSelect,
  onDelete,
  onOpenEditor,
}: {
  item: UnifiedItem
  active: boolean
  onSelect: () => void
  onDelete: () => void
  onOpenEditor: (mode: 'edit' | 'note') => void
}) {
  const t = getT()
  const isAi = item.source === 'ai'

  return (
    <div
      style={{
        textAlign: 'left',
        fontSize: 12,
        lineHeight: 1.6,
        border: '1px solid ' + (active ? '#0f6e56' : isAi ? '#cfe0d8' : '#e6dfd0'),
        background: active ? '#f2f8f5' : isAi ? '#f7fbf9' : '#fff',
        borderRadius: 8,
        padding: '6px 8px',
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-pressed={active}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          color: 'inherit',
        }}
      >
        <div>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 14,
              height: 14,
              marginRight: 6,
              borderRadius: 3,
              border: '1px solid ' + (active ? '#0f6e56' : '#c4bba8'),
              background: active ? '#0f6e56' : '#fff',
              color: '#fff',
              fontSize: 10,
              lineHeight: '12px',
              textAlign: 'center',
              verticalAlign: 'middle',
              fontWeight: 700,
            }}
          >
            {active ? '✓' : ''}
          </span>
          <span style={{ color: SEVERITY_TEXT[item.severity], fontWeight: 700 }}>
            [{diffSeverityLabel(t, item.severity)}]
          </span>{' '}
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: isAi ? '#0f6e56' : '#8a7f70',
              background: isAi ? '#e3f1ea' : '#f1ede3',
              borderRadius: 4,
              padding: '0 5px',
              marginRight: 4,
            }}
          >
            {isAi ? t('diff.board.badge.ai') : t('diff.board.badge.rule')}
          </span>
          <strong>{item.headline}</strong>
          {item.location ? (
            <span style={{ color: '#7a8a82', fontWeight: 400 }}> · {item.location}</span>
          ) : null}
          {item.needsReview ? (
            <span style={{ color: '#9a6700' }}>{t('diff.needsReviewHint')}</span>
          ) : null}
        </div>
        {item.expected ? (
          <div style={{ color: '#335047' }}>{t('diff.board.item.design', { value: item.expected })}</div>
        ) : null}
        {item.actual ? (
          <div style={{ color: '#8a4b33' }}>{t('diff.board.item.actual', { value: item.actual })}</div>
        ) : null}
        {item.codeSource ? (
          <div style={{ color: '#8a7f60', wordBreak: 'break-all' }}>
            {t('diff.board.item.codeSource', { value: item.codeSource })}
          </div>
        ) : null}
        {item.suggestion ? (
          <div style={{ color: '#0f6e56' }}>
            {t('diff.board.item.suggestion', { value: item.suggestion })}
          </div>
        ) : null}
        {item.note ? (
          <div style={{ color: '#5f584c' }}>{t('diff.board.item.note', { value: item.note })}</div>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          style={COL.miniBtn}
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm(t('diff.board.confirmDeleteDiff'))) onDelete()
          }}
        >
          {t('diff.board.delete')}
        </button>
        <button
          type="button"
          style={COL.miniBtn}
          onClick={(e) => {
            e.stopPropagation()
            onOpenEditor('note')
          }}
        >
          {t('diff.board.note')}
        </button>
        <button
          type="button"
          style={COL.miniBtn}
          onClick={(e) => {
            e.stopPropagation()
            onOpenEditor('edit')
          }}
        >
          {t('diff.board.edit')}
        </button>
      </div>
    </div>
  )
}

function isOpaqueCssColor(color: string | undefined): boolean {
  if (!color) return false
  const c = color.trim().toLowerCase()
  if (!c || c === 'transparent' || c === 'rgba(0,0,0,0)' || c === '#00000000') return false
  return true
}

function sampleRingColor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  imgW: number,
  imgH: number,
): string {
  // One getImageData for the pad ring — per-pixel getImageData is extremely slow.
  const pad = 3
  const left = Math.max(0, Math.floor(x - pad))
  const top = Math.max(0, Math.floor(y - pad))
  const right = Math.min(imgW, Math.ceil(x + w + pad))
  const bottom = Math.min(imgH, Math.ceil(y + h + pad))
  const rw = Math.max(1, right - left)
  const rh = Math.max(1, bottom - top)
  let data: ImageData
  try {
    data = ctx.getImageData(left, top, rw, rh)
  } catch {
    return '#f5f5f5'
  }
  const innerL = Math.max(0, Math.floor(x) - left)
  const innerT = Math.max(0, Math.floor(y) - top)
  const innerR = Math.min(rw, Math.ceil(x + w) - left)
  const innerB = Math.min(rh, Math.ceil(y + h) - top)
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  const px = data.data
  for (let row = 0; row < rh; row += 2) {
    for (let col = 0; col < rw; col += 2) {
      const inside = row >= innerT && row < innerB && col >= innerL && col < innerR
      if (inside) continue
      const i = (row * rw + col) * 4
      r += px[i] ?? 0
      g += px[i + 1] ?? 0
      b += px[i + 2] ?? 0
      n += 1
    }
  }
  if (!n) return '#f5f5f5'
  return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`
}

function regionKey(r: NoteMask): string {
  return `${r.nodeId || ''}|${Math.round(r.x)}|${Math.round(r.y)}|${Math.round(r.width)}|${Math.round(r.height)}`
}

/** Proxied design rasters (original URL -> data URL). */
const proxyImageCache = new Map<string, Promise<string>>()

function loadProxiedDesignImage(imageUrl: string): Promise<string> {
  if (!imageUrl) return Promise.resolve('')
  if (imageUrl.startsWith('data:')) return Promise.resolve(imageUrl)
  const hit = proxyImageCache.get(imageUrl)
  if (hit) return hit
  const pending = fetch(`/tracescope/v1/proxy-image?url=${encodeURIComponent(imageUrl)}`, {
    credentials: 'same-origin',
  })
    .then(async (r) => {
      const data = (await r.json()) as { dataUrl?: string; error?: string }
      if (!r.ok || !data.dataUrl) throw new Error(data.error || getT()('errors.imageProxyFailed'))
      return data.dataUrl
    })
    .catch((err) => {
      proxyImageCache.delete(imageUrl)
      throw err
    })
  proxyImageCache.set(imageUrl, pending)
  return pending
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    if (!src.startsWith('data:')) el.crossOrigin = 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error(getT()('errors.designImageLoadFailed')))
    el.src = src
  })
}

type EraseSession = {
  imageUrl: string
  keys: string[]
  canvas: HTMLCanvasElement
  resultUrl: string
}

let eraseSession: EraseSession | null = null

function paintRegionsOnCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  regions: NoteMask[],
  logicalSize: { width: number; height: number },
): void {
  const sx = canvas.width / Math.max(1, logicalSize.width)
  const sy = canvas.height / Math.max(1, logicalSize.height)
  for (const region of regions) {
    const x = Math.max(0, Math.floor(region.x * sx))
    const y = Math.max(0, Math.floor(region.y * sy))
    const w = Math.max(1, Math.ceil(region.width * sx))
    const h = Math.max(1, Math.ceil(region.height * sy))
    const fill = isOpaqueCssColor(region.maskColor)
      ? region.maskColor
      : sampleRingColor(ctx, x, y, w, h, canvas.width, canvas.height)
    ctx.fillStyle = fill
    ctx.fillRect(x, y, w, h)
  }
}

/**
 * Erase note/hidden-layer rectangles. Downscales oversized rasters and reuses
 * the last canvas when only new regions are added (incremental delete is fast).
 */
async function eraseRegionsFromImage(
  imageUrl: string,
  regions: NoteMask[],
  logicalSize: { width: number; height: number },
): Promise<string> {
  if (!regions.length) {
    eraseSession = null
    return imageUrl
  }
  const source = await loadProxiedDesignImage(imageUrl)
  const keys = regions.map(regionKey)
  const keySet = new Set(keys)

  // Incremental: previous result already has a subset of these regions.
  if (
    eraseSession &&
    eraseSession.imageUrl === imageUrl &&
    eraseSession.keys.every((k) => keySet.has(k)) &&
    keys.length >= eraseSession.keys.length
  ) {
    const prevSet = new Set(eraseSession.keys)
    const added = regions.filter((r) => !prevSet.has(regionKey(r)))
    if (added.length === 0 && keys.length === eraseSession.keys.length) {
      return eraseSession.resultUrl
    }
    const canvas = eraseSession.canvas
    const ctx = canvas.getContext('2d')
    if (ctx && added.length) {
      paintRegionsOnCanvas(ctx, canvas, added, logicalSize)
      const resultUrl = canvas.toDataURL('image/jpeg', 0.82)
      eraseSession = { imageUrl, keys, canvas, resultUrl }
      return resultUrl
    }
  }

  const img = await loadHtmlImage(source)
  const natW = img.naturalWidth || img.width
  const natH = img.naturalHeight || img.height
  // Cap working resolution so first-pass toDataURL stays responsive on Retina
  // Figma exports (scale=2). Display is already scaled down in the panel.
  const maxEdge = Math.max(960, Math.round(Math.max(logicalSize.width, logicalSize.height) * 2))
  const scale = Math.min(1, maxEdge / Math.max(natW, natH, 1))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(natW * scale))
  canvas.height = Math.max(1, Math.round(natH * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return imageUrl
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  paintRegionsOnCanvas(ctx, canvas, regions, logicalSize)
  let resultUrl: string
  try {
    resultUrl = canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    return imageUrl
  }
  eraseSession = { imageUrl, keys, canvas, resultUrl }
  return resultUrl
}

function RasterDesignView({
  imageUrl,
  viewport,
  eraseRegions,
  onPick,
  onBusyChange,
}: {
  imageUrl?: string
  viewport: { width: number; height: number }
  eraseRegions?: NoteMask[]
  onPick?: (x: number, y: number) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const t = useLocaleT()
  const [displayUrl, setDisplayUrl] = useState(imageUrl || '')
  const [cleaning, setCleaning] = useState(false)
  const regionsSig = JSON.stringify(
    (eraseRegions ?? []).map((r) => [r.nodeId, r.x, r.y, r.width, r.height, r.maskColor]),
  )

  useEffect(() => {
    let cancelled = false
    if (!imageUrl) {
      setDisplayUrl('')
      setCleaning(false)
      return
    }
    const regions = eraseRegions ?? []
    // Always show the latest original first; cleanup swaps in later.
    setDisplayUrl(imageUrl)
    const needsProxy = /^https?:\/\//i.test(imageUrl)
    if (!regions.length && !needsProxy) {
      setCleaning(false)
      return
    }

    setCleaning(true)
    ;(async () => {
      try {
        if (!regions.length) {
          const url = needsProxy ? await loadProxiedDesignImage(imageUrl) : imageUrl
          if (!cancelled) setDisplayUrl(url)
          return
        }
        const url = await eraseRegionsFromImage(imageUrl, regions, viewport)
        if (!cancelled) setDisplayUrl(url)
      } catch {
        if (!cancelled) setDisplayUrl(imageUrl)
      } finally {
        if (!cancelled) {
          setCleaning(false)
          // Signal completion so parent can clear "正在清理…" hints.
          onBusyChange?.(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, viewport.width, viewport.height, regionsSig])

  if (!imageUrl) {
    return (
      <div
        style={{
          width: viewport.width,
          height: viewport.height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8a7f70',
          fontSize: 12,
        }}
      >
        {t('diff.board.renderFailed')}
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'relative',
        width: viewport.width,
        height: viewport.height,
        overflow: 'hidden',
        cursor: onPick ? 'crosshair' : 'default',
      }}
      onClick={(e) => {
        if (!onPick) return
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * viewport.width
        const y = ((e.clientY - rect.top) / rect.height) * viewport.height
        onPick(x, y)
      }}
    >
      <img
        src={displayUrl || imageUrl}
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'fill',
          display: 'block',
          pointerEvents: 'none',
        }}
      />
      {cleaning ? (
        <div
          style={{
            position: 'absolute',
            left: 8,
            bottom: 8,
            zIndex: 2,
            pointerEvents: 'none',
            background: 'rgba(16,24,40,0.72)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 6,
            padding: '4px 8px',
          }}
        >
          {t('diff.board.cleaningNotes')}
        </div>
      ) : null}
    </div>
  )
}


const COL: Record<string, CSSProperties> = {
  frame: {
    border: '1px solid var(--dsh-border,#ddd4c5)',
    borderRadius: 8,
    overflow: 'hidden',
    background: '#fff',
  },
  aiNote: {
    marginTop: 8,
    fontSize: 12,
    color: '#5b3fb0',
    background: '#f1ecfb',
    border: '1px solid #ddd2f4',
    borderRadius: 8,
    padding: '6px 10px',
  },
  chatNote: {
    marginTop: 8,
    fontSize: 12,
    color: '#0f6e56',
    background: '#eef7f2',
    border: '1px solid #cfe6da',
    borderRadius: 8,
    padding: '6px 10px',
  },
  aiBtn: {
    fontSize: 11,
    borderRadius: 7,
    border: '1px solid #0f6e56',
    background: '#0f6e56',
    color: '#fff',
    padding: '3px 10px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  clearBtn: {
    fontSize: 11,
    borderRadius: 7,
    border: '1px solid #d9d2c4',
    background: '#fff',
    color: '#5f584c',
    padding: '3px 10px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  editInput: {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 12,
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid #d9d2c4',
    fontFamily: 'inherit',
    marginTop: 4,
  },
  miniBtn: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 4,
    border: '1px solid #d9d2c4',
    background: '#fff',
    cursor: 'pointer',
    color: '#5f584c',
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(16, 24, 40, 0.45)',
    zIndex: 100000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalPanel: {
    width: 'min(420px, 100%)',
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #d9d2c4',
    padding: 14,
    boxShadow: '0 12px 40px rgba(16,24,40,0.18)',
  },
  modalLabel: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: 12,
    color: '#5f584c',
  },
}
