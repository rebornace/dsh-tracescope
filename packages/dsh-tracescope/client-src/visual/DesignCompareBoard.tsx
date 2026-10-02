import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { DiffBox } from './DesignLayerScreen.js'
import type { PageFindings } from './panel-types.js'
import { resolveFindingNodeId } from './resolve-finding-node.js'
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

function relatedRoleLabel(role: string): string {
  switch (role) {
    case 'sibling':
      return '同目录'
    case 'import':
      return '引用'
    case 'include':
      return 'include'
    case 'style':
      return '样式'
    case 'resource':
      return '资源'
    case 'entry':
      return '入口'
    default:
      return role || '关联'
  }
}

const SEVERITY_RANK = { high: 3, medium: 2, low: 0 } as const
const SEVERITY_LABEL = { high: '高', medium: '中', low: '低' } as const
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
  cornerRadii: '四角圆角',
  borderWidth: '边框粗细',
  borderColor: '边框颜色',
  borderTopWidth: '上边框宽',
  borderRightWidth: '右边框宽',
  borderBottomWidth: '下边框宽',
  borderLeftWidth: '左边框宽',
  borderTopColor: '上边框色',
  borderRightColor: '右边框色',
  borderBottomColor: '下边框色',
  borderLeftColor: '左边框色',
  fontWeight: '字重',
  opacity: '透明度',
  elevation: '阴影/海拔',
  shadow: '外阴影',
  innerShadow: '内阴影',
  insetShadow: '内阴影参数',
  shadows: '阴影叠层',
  blur: '模糊',
  blendMode: '混合模式',
  rotation: '旋转',
  scaleX: '缩放X',
  scaleY: '缩放Y',
  skewX: '倾斜X',
  skewY: '倾斜Y',
  zIndex: '层叠顺序',
  fills: '填充叠层',
  strokeAlign: '描边对齐',
  textAlign: '对齐',
  textDecoration: '文字装饰',
  textTransform: '文字大小写',
  overflow: '溢出裁剪',
  clipPath: '裁剪路径',
  aspectRatio: '宽高比',
  maxLines: '最大行数',
  textOverflow: '文本溢出',
  minWidth: '最小宽度',
  maxWidth: '最大宽度',
  minHeight: '最小高度',
  maxHeight: '最大高度',
  textAdvanceWidth: '文本固有宽',
  textBlockHeight: '文本块高',
  flexDirection: '主轴方向',
  alignItems: '交叉轴对齐',
  justifyContent: '主轴分布',
  fontStyle: '字体样式',
  textAlignVertical: '垂直对齐',
  borderStyle: '描边样式',
  strokeDashArray: '虚线间隔',
  strokeCap: '线帽',
  strokeJoin: '线连接',
  paragraphSpacing: '段间距',
  sizingHorizontal: '横向尺寸模式',
  sizingVertical: '纵向尺寸模式',
  backdropBlur: '背景模糊',
  position: '定位',
  rowGap: '行间距',
  columnGap: '列间距',
  flexWrap: '换行',
  alignContent: '多行对齐',
  order: '排列顺序',
  gridTemplate: '网格轨道',
  alignSelf: '自身对齐',
  flexGrow: '弹性放大',
  flexShrink: '弹性缩小',
  transformOrigin: '变换原点',
  visibility: '可见性',
  display: '显示',
  whiteSpace: '空白处理',
  wordBreak: '断词',
  wordSpacing: '词间距',
  textIndent: '首行缩进',
  perspective: '透视',
  rotateX: 'X轴旋转',
  rotateY: 'Y轴旋转',
  textShadow: '文字阴影',
  direction: '书写方向',
  writingMode: '书写模式',
  filter: '滤镜',
  outline: '轮廓',
  imageFit: '图片适配',
  imagePosition: '图片锚点',
  gradient: '渐变',
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
  const eraseDoneHintRef = useRef('已删除图层（可点「恢复已删除图层」撤销）。')

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
        headline: `${PROP_LABEL[d.property] ?? d.property} · ${d.nodeName}`,
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
      hint(selectedKeys.size ? '当前选中项无可复制差异' : '当前没有可复制的差异')
      return
    }
    try {
      await copyTextToClipboard(formatVisualDiffCopyText(targets, actionMeta))
      hint(`已复制 ${targets.length} 条差异`)
    } catch (err) {
      hint(`复制失败：${(err as Error).message}`)
    }
  }

  const exportDiffs = () => {
    const targets = selectedKeys.size
      ? visibleItems.filter((i) => selectedKeys.has(i.key))
      : visibleItems
    if (!targets.length) {
      hint(selectedKeys.size ? '当前选中项无可导出差异' : '当前没有可导出的差异')
      return
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `tracescope-ui-diff-${stamp}.md`
    downloadTextFile(filename, formatVisualDiffExportMarkdown(targets, actionMeta))
    hint(`已导出：${filename}`)
  }

  const submitDiffs = () => {
    const targets = selectedKeys.size
      ? visibleItems.filter((i) => selectedKeys.has(i.key))
      : visibleItems
    if (!targets.length) {
      hint(selectedKeys.size ? '当前选中项无可提交差异' : '当前没有可提交的差异')
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
      message: `将把 ${targets.length} 条 UI 差异提交到协作平台（${trackerProvider || '已配置'}）。可修改下方标题后再提交。`,
      inputLabel: '缺陷标题',
      inputValue: defaultVisualDefectSubject(targets, actionMeta),
      confirmLabel: '提交',
      onConfirm: (subject) => {
        const report = unifiedItemsToFailReport(targets, actionMeta)
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
            tip += `，共 ${data.count || targets.length} 条。`
            if (data.url) tip += ` 链接：${data.url}`
            hint(tip)
          })
          .catch((err) => {
            hint(`提交失败：${(err as Error).message}`)
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
        setPickHint('该差异缺少可定位的设计节点坐标，无法在对照图上高亮。')
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
    eraseDoneHintRef.current = '已删除图层（可点「恢复已删除图层」撤销）。'
    setPickHint('正在清理图层…')
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
    data.compareMode === 'heuristic'
      ? '启发式静态'
      : data.compareMode === 'exact'
        ? data.enrichmentApplied
          ? `属性级 · 深度增强（${data.enrichmentApplied}）`
          : '属性级'
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
          <span>读取自缓存（{formatCompareSavedAt(data.savedAt)}），可直接查看；如需最新结果请重新生成。</span>
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
      {(data.relatedFiles?.length ?? 0) > 1 ? (
        <details style={{ marginBottom: 8, fontSize: 11, color: '#5f584c' }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
            关联文件 {data.relatedFiles!.length - 1} 个（入口仍为上方单文件）
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
                  <span style={{ color: '#8a7f70' }}>[{relatedRoleLabel(f.role)}]</span>{' '}
                  {f.relativePath}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
      <div style={{ fontSize: 11, color: '#8a7f70', marginBottom: 6 }}>
        自动删除识别到的设计师备注；也可点击图上图层继续删除（从渲染图中擦除该区域像素，不是盖白块）。
        {hiddenLayerIds.length ? (
          <button
            type="button"
            style={{ ...COL.clearBtn, marginLeft: 8, padding: '1px 8px' }}
            onClick={() => {
              userEraseRef.current = true
              eraseDoneHintRef.current = '已恢复图层。'
              setPickHint('正在恢复图层…')
              setHiddenLayerIds([])
            }}
          >
            恢复已删除图层（{hiddenLayerIds.length}）
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
            差异清单（{visibleItems.length}
            {selectedKeys.size ? `，已选 ${selectedKeys.size}` : ''}
            ，点击多选 / 再点取消）
          </strong>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
            <button type="button" style={COL.aiBtn} onClick={sendToChat}>
              AI 协助分析
            </button>
            <button type="button" style={COL.clearBtn} onClick={() => void copyDiffs()}>
              {selectedKeys.size ? `复制选中(${selectedKeys.size})` : '复制差异'}
            </button>
            <button type="button" style={COL.clearBtn} onClick={submitDiffs}>
              {selectedKeys.size ? `提交选中(${selectedKeys.size})` : '提交缺陷'}
            </button>
            <button type="button" style={COL.clearBtn} onClick={exportDiffs}>
              {selectedKeys.size ? `导出选中(${selectedKeys.size})` : '导出报告'}
            </button>
            {onRegenerate ? (
              <button type="button" style={COL.clearBtn} onClick={onRegenerate}>
                重新生成
              </button>
            ) : null}
            <button
              type="button"
              style={COL.clearBtn}
              onClick={clearMarkers}
              disabled={!selectedKeys.size}
              title="清除清单选中与对照图高亮"
            >
              清除选中
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
        官方渲染图加载失败，请重新生成或检查 Figma 链接
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
          正在清理备注…
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
