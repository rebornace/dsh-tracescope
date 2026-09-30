import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { DiffBox } from './HifiScreen.js'
import type { PageFindings } from './panel-types.js'
import {
  copyTextToClipboard,
  defaultVisualDefectSubject,
  downloadTextFile,
  formatVisualDiffCopyText,
  formatVisualDiffExportMarkdown,
  unifiedItemsToFailReport,
} from './diff-actions.js'

interface HifiCompareData {
  page: { adapterId: string; kindLabel?: string; relativePath: string }
  viewport: { width: number; height: number }
  designName?: string
  designImageUrl?: string
  designNoteMasks?: NoteMask[]
  chatPrompt?: string
  designHifiTree: HifiTreeNode
  /** Retained for API compat / AI patches; not rendered in the single-pane board. */
  codeHifiTree?: HifiTreeNode
  aiInferenceNote?: string
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

interface HifiTreeNode {
  id: string
  name: string
  kind: string
  text?: string
  x: number
  y: number
  width: number
  height: number
  children: HifiTreeNode[]
}

const SEVERITY_RANK = { high: 3, medium: 2, low: 0 } as const
const SEVERITY_LABEL = { high: '高', medium: '中', low: '低' } as const
const SEVERITY_TEXT: Record<'high' | 'medium' | 'low', string> = {
  high: '#d92d20',
  medium: '#dc8a05',
  low: '#2f62b9',
}

function formatHifiSavedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const PROP_LABEL: Record<string, string> = {
  width: '宽度',
  height: '高度',
  marginTop: '上间距',
  marginBottom: '下间距',
  marginLeft: '左间距',
  marginRight: '右间距',
  paddingTop: '上内边距',
  paddingBottom: '下内边距',
  paddingLeft: '左内边距',
  paddingRight: '右内边距',
  backgroundColor: '背景色',
  color: '文字颜色',
  fontSize: '字号',
  cornerRadius: '圆角',
  borderWidth: '边框粗细',
  borderColor: '边框颜色',
  fontWeight: '字重',
  opacity: '透明度',
  text: '文案',
  controlCount: '控件规模',
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

function diffStoreKey(data: HifiCompareData): string {
  return `tracescope.diff.edits:${data.page.adapterId}:${data.page.relativePath}:${data.designHifiTree?.id || data.designName || ''}`
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

export function HifiCompareBoard({
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
  data: HifiCompareData
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
  const [activeDesignId, setActiveDesignId] = useState('')
  const [chatNote, setChatNote] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'ai' | 'rule'>('all')
  const storeKey = useMemo(() => diffStoreKey(data), [data])
  const [overrides, setOverrides] = useState<Record<string, DiffOverride>>(() =>
    loadDiffOverrides(storeKey),
  )
  const [hiddenLayerIds, setHiddenLayerIds] = useState<string[]>(() => loadHiddenLayers(storeKey))
  const [pickHint, setPickHint] = useState('')
  const [layerBusy, setLayerBusy] = useState(false)
  const userEraseRef = useRef(false)
  const eraseDoneHintRef = useRef('已删除图层（可点「恢复已删除图层」撤销）。')

  useEffect(() => {
    setOverrides(loadDiffOverrides(storeKey))
    setHiddenLayerIds(loadHiddenLayers(storeKey))
    setActiveDesignId('')
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
    const map = new Map<string, { x: number; y: number; width: number; height: number; name: string; kind: string; text?: string }>()
    const walk = (n: HifiTreeNode): void => {
      map.set(n.id, {
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        name: n.name,
        kind: n.kind,
        text: n.text,
      })
      for (const c of n.children) walk(c)
    }
    walk(data.designHifiTree)
    return map
  }, [data.designHifiTree])

  const aiFindings = findings?.findings ?? []

  const unifiedItems = useMemo(() => {
    const compact = (id: string) => id.replace(/[^0-9]/g, '')
    const absorbed = new Set<number>()
    const items: UnifiedItem[] = []

    for (const f of aiFindings) {
      const designId = (f.nodeId ?? '').trim()
      const haystack = `${f.title} ${f.location ?? ''} ${f.expected ?? ''} ${f.actual ?? ''} ${f.suggestion ?? ''}`.toLowerCase()
      let codeId = ''
      diffs.forEach((d, idx) => {
        if (!designId || !d.designNodeId) return
        if (compact(d.designNodeId) !== compact(designId)) return
        if (propertyCovered(d.property, haystack)) {
          absorbed.add(idx)
          if (!codeId && d.codeNodeId) codeId = d.codeNodeId
        }
      })
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
        designId,
        codeId,
      })
    }

    diffs.forEach((d, idx) => {
      if (absorbed.has(idx)) return
      items.push({
        key: 'rule-' + idx,
        source: 'rule',
        severity: d.severity,
        headline: `${PROP_LABEL[d.property] ?? d.property} · ${d.nodeName}`,
        expected: d.expected === undefined ? undefined : String(d.expected),
        actual: d.actual === undefined ? undefined : String(d.actual),
        designId: d.designNodeId ?? '',
        codeId: d.codeNodeId ?? '',
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
  }, [aiFindings, diffs])

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
    designName: data.designName || data.designHifiTree?.name || '',
    designUrl: (designUrl || '').trim(),
    codePath: data.page.relativePath,
    platformLabel: data.page.kindLabel || data.page.adapterId,
  }

  const hint = (message: string) => {
    setChatNote(message)
    onActionHint?.(message)
  }

  const copyDiffs = async () => {
    if (!visibleItems.length) {
      hint('当前没有可复制的差异')
      return
    }
    try {
      await copyTextToClipboard(formatVisualDiffCopyText(visibleItems, actionMeta))
      hint(`已复制 ${visibleItems.length} 条差异`)
    } catch (err) {
      hint(`复制失败：${(err as Error).message}`)
    }
  }

  const exportDiffs = () => {
    if (!visibleItems.length) {
      hint('当前没有可导出的差异')
      return
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `tracescope-ui-diff-${stamp}.md`
    downloadTextFile(filename, formatVisualDiffExportMarkdown(visibleItems, actionMeta))
    hint(`已导出：${filename}`)
  }

  const submitDiffs = () => {
    if (!visibleItems.length) {
      hint('当前没有可提交的差异')
      return
    }
    if (!trackerReady) {
      if (typeof openConfirmDialog === 'function') {
        openConfirmDialog({
          title: '先配置协作平台？',
          message:
            '尚未配置完整的协作平台。请打开「仓库配置」选择云效 / GitHub / GitLab / Webhook 并保存。',
          confirmLabel: '打开配置',
          onConfirm: () => {
            onOpenTrackerSettings?.()
          },
        })
      } else {
        hint('请先在「仓库配置 → 协作平台」完成配置')
      }
      return
    }
    if (typeof openConfirmDialog !== 'function') {
      hint('当前宿主不支持弹窗输入，无法提交缺陷')
      return
    }
    openConfirmDialog({
      title: '提交缺陷？',
      message: `将把 ${visibleItems.length} 条 UI 差异提交到协作平台（${trackerProvider || '已配置'}）。可修改下方标题后再提交。`,
      inputLabel: '缺陷标题',
      inputValue: defaultVisualDefectSubject(visibleItems, actionMeta),
      confirmLabel: '提交',
      onConfirm: (subject) => {
        const report = unifiedItemsToFailReport(visibleItems, actionMeta)
        void fetch('/tracescope/v1/tracker-submit', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            repoPath: actionMeta.repoPath,
            baseCommit: report.baseCommit,
            headCommit: report.headCommit,
            report,
            subject: String(subject || '').trim(),
          }),
        })
          .then(async (r) => {
            const text = await r.text()
            const data = text ? JSON.parse(text) : {}
            if (!r.ok) throw new Error(data.error || '提交失败')
            let tip = `已提交到 ${data.provider || trackerProvider || '协作平台'}`
            if (data.id) tip += `（ID ${data.id}）`
            tip += `，共 ${data.count || visibleItems.length} 条。`
            if (data.url) tip += ` 链接：${data.url}`
            hint(tip)
          })
          .catch((err) => {
            hint(`提交失败：${(err as Error).message}`)
          })
      },
    })
  }

  const markerDiffs = useMemo(() => {
    const fromRules = displayItems
      .filter((i) => i.designId && designBoxById.has(i.designId))
      .map((i) => ({
        designId: i.designId,
        severity: i.severity,
        key: i.key,
      }))
    const best = new Map<string, { designId: string; severity: UnifiedItem['severity']; key: string }>()
    for (const m of fromRules) {
      const prev = best.get(m.designId)
      if (!prev || SEVERITY_RANK[m.severity] > SEVERITY_RANK[prev.severity]) {
        best.set(m.designId, m)
      }
    }
    return [...best.values()]
  }, [displayItems, designBoxById])

  const visibleNoteMasks = useMemo(() => {
    const hidden = new Set(hiddenLayerIds)
    // Auto-detected designer notes: always erase from the raster (true removal).
    const auto = (data.designNoteMasks ?? []).filter((m) => !m.nodeId || !hidden.has(m.nodeId))
    // Manual layer deletes: erase those boxes too.
    const manual: NoteMask[] = []
    for (const id of hiddenLayerIds) {
      const box = designBoxById.get(id)
      if (!box || box.width <= 0 || box.height <= 0) continue
      if (id === data.designHifiTree.id) continue
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
  }, [data.designNoteMasks, hiddenLayerIds, designBoxById, data.designHifiTree.id])

  // Click targets must include pruned annotation boxes (they are gone from the tree).
  const pickBoxes = useMemo(() => {
    const map = new Map(designBoxById)
    for (const m of data.designNoteMasks ?? []) {
      if (!m.nodeId || map.has(m.nodeId)) continue
      map.set(m.nodeId, {
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
  }, [designBoxById, data.designNoteMasks])

  const computedScale = useMemo(() => {
    const available = 360
    return Math.min(1, available / data.viewport.width)
  }, [data.viewport.width])

  const w = data.viewport.width * computedScale
  const h = data.viewport.height * computedScale

  function selectItem(designId: string) {
    setActiveDesignId(designId)
  }
  function clearMarkers() {
    setActiveDesignId('')
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
    eraseDoneHintRef.current = '已删除图层（可点「恢复已删除图层」撤销）。'
    setLayerBusy(true)
    setPickHint('正在删除图层…')
    setHiddenLayerIds((prev) => (prev.includes(nodeId) ? prev : [...prev, nodeId]))
  }

  function findLayerAt(x: number, y: number): string {
    let bestId = ''
    let bestArea = Number.POSITIVE_INFINITY
    for (const [id, box] of pickBoxes) {
      if (hiddenLayerIds.includes(id)) continue
      if (id === data.designHifiTree.id) continue
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
      setChatNote('当前客户端不支持 AI 协助分析，请手动把布局源码与设计稿链接发给会话。')
      return
    }
    onAiAnalyze({
      adapterId: data.page.adapterId,
      relativePath: data.page.relativePath,
    })
    setChatNote('正在读取代码源码、把分析提示填入当前会话输入框…')
  }

  const modeLabel =
    data.compareMode === 'heuristic' ? '启发式静态' : data.compareMode === 'exact' ? '属性级' : null

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
          <span>读取自缓存（{formatHifiSavedAt(data.savedAt)}），可直接查看；如需最新结果请重新生成。</span>
          {onRegenerate ? (
            <button type="button" style={COL.clearBtn} onClick={onRegenerate}>
              重新生成
            </button>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginBottom: 6, fontSize: 12, color: '#5f584c' }}>
        <strong>设计稿对照</strong>
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
      <div style={{ fontSize: 11, color: '#8a7f70', marginBottom: 6 }}>
        自动删除识别到的设计师备注；也可点击图上图层继续删除（从渲染图中擦除该区域像素，不是盖白块）。
        {hiddenLayerIds.length ? (
          <button
            type="button"
            style={{ ...COL.clearBtn, marginLeft: 8, padding: '1px 8px' }}
            onClick={() => {
              userEraseRef.current = true
              eraseDoneHintRef.current = '已恢复图层。'
              setLayerBusy(true)
              setPickHint('正在恢复图层…')
              setHiddenLayerIds([])
            }}
          >
            恢复已删除图层（{hiddenLayerIds.length}）
          </button>
        ) : null}
      </div>
      {pickHint ? <div style={{ fontSize: 11, color: '#0f6e56', marginBottom: 6 }}>{pickHint}</div> : null}

      <div style={{ ...COL.frame, width: w, height: h }}>
        <div style={{ transform: `scale(${computedScale})`, transformOrigin: 'top left' }}>
          <RasterDesignView
            imageUrl={data.designImageUrl}
            viewport={data.viewport}
            eraseRegions={visibleNoteMasks}
            busy={layerBusy}
            hotspot={activeDesignId ? designBoxById.get(activeDesignId) : undefined}
            hotspotColor={
              markerDiffs.find((m) => m.designId === activeDesignId)
                ? SEVERITY_TEXT[markerDiffs.find((m) => m.designId === activeDesignId)!.severity]
                : '#0f6e56'
            }
            onBusyChange={(busy) => {
              setLayerBusy(busy)
              if (!busy && userEraseRef.current) {
                userEraseRef.current = false
                setPickHint(eraseDoneHintRef.current)
              }
            }}
            onPick={(x, y) => {
              const id = findLayerAt(x, y)
              if (!id) {
                setPickHint('未点中可删除图层，请点文字/标注区域。')
                return
              }
              const box = pickBoxes.get(id)
              const label = box?.text || box?.name || id
              if (window.confirm(`从对照图中删除图层「${label}」？\n（擦除该区域像素；可随时恢复）`)) {
                hideLayer(id)
              }
            }}
          />
        </div>
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
            差异清单（{visibleItems.length}，点击可在设计稿上定位）
          </strong>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
            <button type="button" style={COL.aiBtn} onClick={sendToChat}>
              AI 协助分析
            </button>
            <button type="button" style={COL.clearBtn} onClick={() => void copyDiffs()}>
              复制差异
            </button>
            <button type="button" style={COL.clearBtn} onClick={submitDiffs}>
              提交缺陷
            </button>
            <button type="button" style={COL.clearBtn} onClick={exportDiffs}>
              导出报告
            </button>
            {onRegenerate ? (
              <button type="button" style={COL.clearBtn} onClick={onRegenerate}>
                重新生成
              </button>
            ) : null}
            <button type="button" style={COL.clearBtn} onClick={clearMarkers}>
              清除高亮
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
            const isActive = item.designId && activeDesignId === item.designId
            return (
              <UnifiedCard
                key={item.key}
                item={item}
                active={!!isActive}
                onSelect={() => selectItem(item.designId)}
                onDelete={() => patchOverride(item.key, { deleted: true })}
                onOpenEditor={(mode) => {
                  if (typeof openConfirmDialog !== 'function') {
                    setChatNote(
                      '当前宿主不支持弹窗输入。请更新插件后重试，或在 DeepSeek Harness 桌面端使用。',
                    )
                    return
                  }
                  if (mode === 'note') {
                    openConfirmDialog({
                      title: '添加备注',
                      message: item.headline,
                      inputLabel: '备注',
                      inputValue: item.note || '',
                      multiline: true,
                      confirmLabel: '保存备注',
                      onConfirm: (value) => {
                        patchOverride(item.key, { note: String(value ?? '').trim() })
                      },
                    })
                    return
                  }
                  openConfirmDialog({
                    title: '编辑差异',
                    message: item.headline,
                    fields: [
                      { key: 'headline', label: '标题', value: item.headline },
                      { key: 'expected', label: '设计稿期望', value: item.expected || '' },
                      { key: 'actual', label: '实际值', value: item.actual || '' },
                    ],
                    confirmLabel: '保存',
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
              当前筛选下没有差异项。
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
                已删除（误报）· {deletedItems.length}
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
                全部恢复
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
                      <div style={{ fontSize: 11, marginTop: 2 }}>备注：{item.note}</div>
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
                    恢复
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
  const tokens: Record<string, string[]> = {
    width: ['宽度', '宽', 'width'],
    height: ['高度', '高', 'height'],
    marginTop: ['上间距', '上边距', '顶部间距', 'margin-top'],
    marginBottom: ['下间距', '下边距', '底部间距', 'margin-bottom'],
    marginLeft: ['左间距', '左边距', 'margin-left'],
    marginRight: ['右间距', '右边距', 'margin-right'],
    paddingTop: ['上内边距', 'padding-top'],
    paddingBottom: ['下内边距', 'padding-bottom'],
    paddingLeft: ['左内边距', 'padding-left'],
    paddingRight: ['右内边距', 'padding-right'],
    backgroundColor: ['背景色', '背景', 'background'],
    color: ['文字颜色', '字色', '颜色', 'color'],
    fontSize: ['字号', '字体大小', 'font-size'],
    cornerRadius: ['圆角', '圆弧', '弧度', 'corner', 'radius'],
    borderWidth: ['边框粗细', '描边粗细', 'border'],
    borderColor: ['边框颜色', '描边颜色', 'border'],
    fontWeight: ['字重', '粗细', 'font-weight'],
    opacity: ['透明度', 'opacity'],
    text: ['文案', '文字', '文本', 'text'],
    controlCount: ['控件', '组件', 'control'],
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
  const tabs: Array<['all' | 'ai' | 'rule', string]> = [
    ['all', `全部 ${aiCount + ruleCount}`],
    ['ai', `AI 确权 ${aiCount}`],
    ['rule', `规则比对 ${ruleCount}`],
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
          <span style={{ color: SEVERITY_TEXT[item.severity], fontWeight: 700 }}>
            [{SEVERITY_LABEL[item.severity]}]
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
            {isAi ? 'AI 确权' : '规则比对'}
          </span>
          <strong>{item.headline}</strong>
          {item.location ? (
            <span style={{ color: '#7a8a82', fontWeight: 400 }}> · {item.location}</span>
          ) : null}
          {item.needsReview ? (
            <span style={{ color: '#9a6700' }}>（需人工确认）</span>
          ) : null}
        </div>
        {item.expected ? <div style={{ color: '#335047' }}>设计稿：{item.expected}</div> : null}
        {item.actual ? <div style={{ color: '#8a4b33' }}>实际：{item.actual}</div> : null}
        {item.codeSource ? (
          <div style={{ color: '#8a7f60', wordBreak: 'break-all' }}>代码来源：{item.codeSource}</div>
        ) : null}
        {item.suggestion ? (
          <div style={{ color: '#0f6e56' }}>修改建议：{item.suggestion}</div>
        ) : null}
        {item.note ? <div style={{ color: '#5f584c' }}>备注：{item.note}</div> : null}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          style={COL.miniBtn}
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm('确认删除这条差异？删除后视为误报，仅本机记住，可在下方恢复。'))
              onDelete()
          }}
        >
          删除
        </button>
        <button
          type="button"
          style={COL.miniBtn}
          onClick={(e) => {
            e.stopPropagation()
            onOpenEditor('note')
          }}
        >
          备注
        </button>
        <button
          type="button"
          style={COL.miniBtn}
          onClick={(e) => {
            e.stopPropagation()
            onOpenEditor('edit')
          }}
        >
          编辑
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
  const pad = 2
  const points: Array<[number, number]> = []
  for (let i = 0; i <= 4; i += 1) {
    const t = i / 4
    points.push([x + w * t, Math.max(0, y - pad)])
    points.push([x + w * t, Math.min(imgH - 1, y + h + pad)])
    points.push([Math.max(0, x - pad), y + h * t])
    points.push([Math.min(imgW - 1, x + w + pad), y + h * t])
  }
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (const [px, py] of points) {
    const ix = Math.round(Math.min(imgW - 1, Math.max(0, px)))
    const iy = Math.round(Math.min(imgH - 1, Math.max(0, py)))
    try {
      const d = ctx.getImageData(ix, iy, 1, 1).data
      r += d[0] ?? 0
      g += d[1] ?? 0
      b += d[2] ?? 0
      n += 1
    } catch {
      /* ignore */
    }
  }
  if (!n) return '#ffffff'
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
      if (!r.ok || !data.dataUrl) throw new Error(data.error || '图片代理失败')
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
    el.onerror = () => reject(new Error('设计稿图片加载失败'))
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
 * Erase note/hidden-layer rectangles. Caches the proxied source and reuses the
 * last canvas when only new regions are added (incremental delete is fast).
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
      const resultUrl = canvas.toDataURL('image/jpeg', 0.92)
      eraseSession = { imageUrl, keys, canvas, resultUrl }
      return resultUrl
    }
  }

  const img = await loadHtmlImage(source)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return imageUrl
  ctx.drawImage(img, 0, 0)
  paintRegionsOnCanvas(ctx, canvas, regions, logicalSize)
  let resultUrl: string
  try {
    resultUrl = canvas.toDataURL('image/jpeg', 0.92)
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
  busy,
  hotspot,
  hotspotColor,
  onPick,
  onBusyChange,
}: {
  imageUrl?: string
  viewport: { width: number; height: number }
  eraseRegions?: NoteMask[]
  busy?: boolean
  hotspot?: { x: number; y: number; width: number; height: number }
  hotspotColor?: string
  onPick?: (x: number, y: number) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const [displayUrl, setDisplayUrl] = useState(imageUrl || '')
  const [erasing, setErasing] = useState(false)
  const regionsSig = JSON.stringify(
    (eraseRegions ?? []).map((r) => [r.nodeId, r.x, r.y, r.width, r.height, r.maskColor]),
  )

  // Warm the proxy cache as soon as the raster URL is known.
  useEffect(() => {
    if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
      void loadProxiedDesignImage(imageUrl).catch(() => undefined)
    }
  }, [imageUrl])

  useEffect(() => {
    let cancelled = false
    if (!imageUrl) {
      setDisplayUrl('')
      onBusyChange?.(false)
      return
    }
    const regions = eraseRegions ?? []
    if (!regions.length) {
      setDisplayUrl(imageUrl)
      setErasing(false)
      onBusyChange?.(false)
      return
    }
    setErasing(true)
    onBusyChange?.(true)
    ;(async () => {
      try {
        const url = await eraseRegionsFromImage(imageUrl, regions, viewport)
        if (!cancelled) setDisplayUrl(url)
      } catch {
        if (!cancelled) setDisplayUrl(imageUrl)
      } finally {
        if (!cancelled) {
          setErasing(false)
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
        官方渲染图加载失败，请重新生成或检查 Figma 链接
      </div>
    )
  }

  const showBusy = erasing || !!busy

  return (
    <div
      style={{
        position: 'relative',
        width: viewport.width,
        height: viewport.height,
        overflow: 'hidden',
        cursor: onPick && !showBusy ? 'crosshair' : 'default',
      }}
      onClick={(e) => {
        if (!onPick || showBusy) return
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
          filter: showBusy ? 'brightness(0.72)' : undefined,
        }}
      />
      {showBusy ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(16,24,40,0.38)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <div
            style={{
              background: '#fff',
              color: '#101828',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: 700,
              boxShadow: '0 8px 24px rgba(16,24,40,0.2)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            正在删除图层…
            <div style={{ fontSize: 11, fontWeight: 500, color: '#667085', marginTop: 2 }}>
              首次稍慢，之后会更快
            </div>
          </div>
        </div>
      ) : null}
      {hotspot ? (
        <div
          style={{
            position: 'absolute',
            left: hotspot.x,
            top: hotspot.y,
            width: hotspot.width,
            height: hotspot.height,
            border: `2px solid ${hotspotColor ?? '#0f6e56'}`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
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
