import { useMemo, useState } from 'react'
import { HifiScreen, type HifiNode, type DiffBox } from './HifiScreen.js'

interface HifiCompareData {
  page: { adapterId: string; relativePath: string }
  viewport: { width: number; height: number }
  designImageUrl?: string
  designHifiTree: HifiNode
  codeHifiTree: HifiNode
  aiInferenceNote?: string
  result: {
    diffs: Array<Record<string, unknown>>
    unmatched: Array<Record<string, unknown>>
    comparedPairs: number
  }
}

const SEVERITY_RANK = { high: 3, medium: 2, low: 0 } as const
const SEVERITY_LABEL = { high: '高', medium: '中', low: '低' } as const

// Property Chinese labels for the readable diff list.
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
}

function fmt(v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'number') return String(Math.round(v * 10) / 10)
  return String(v)
}

export function HifiCompareBoard({ data }: { data: HifiCompareData }) {
  const [activeId, setActiveId] = useState('')

  const diffs = data.result.diffs as unknown as DiffBox[]
  const sortedDiffs = useMemo(
    () =>
      [...diffs].sort(
        (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
      ),
    [diffs],
  )

  // Fit two screens side by side in a ~640px usable width.
  const computedScale = useMemo(() => {
    const available = 300
    const s = Math.min(1, available / data.viewport.width)
    return s
  }, [data.viewport.width])

  const w = data.viewport.width * computedScale
  const h = data.viewport.height * computedScale

  function diffIds(d: DiffBox) {
    return { design: d.designNodeId ?? '', code: d.codeNodeId ?? '' }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={COL.title}>设计稿</div>
          <div style={{ ...COL.frame, width: w, height: h }}>
            <div style={{ transform: `scale(${computedScale})`, transformOrigin: 'top left' }}>
              <HifiScreen
                root={data.designHifiTree}
                width={data.viewport.width}
                height={data.viewport.height}
                side="design"
                diffs={diffs}
                activeNodeId={activeId}
                onSelectNode={setActiveId}
              />
            </div>
          </div>
        </div>

        <div>
          <div style={COL.title}>代码高保真渲染</div>
          <div style={{ ...COL.frame, width: w, height: h }}>
            <div style={{ transform: `scale(${computedScale})`, transformOrigin: 'top left' }}>
              <HifiScreen
                root={data.codeHifiTree}
                width={data.viewport.width}
                height={data.viewport.height}
                side="code"
                diffs={diffs}
                activeNodeId={activeId}
                onSelectNode={setActiveId}
              />
            </div>
          </div>
        </div>
      </div>

      {data.aiInferenceNote ? (
        <div style={COL.aiNote}>{data.aiInferenceNote}</div>
      ) : null}

      <div style={{ marginTop: 10 }}>
        <strong style={{ fontSize: 12 }}>
          差异清单（{sortedDiffs.length}，点击可在界面上定位）
        </strong>
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sortedDiffs.slice(0, 60).map((d, i) => {
            const ids = diffIds(d)
            const isActive = activeId === ids.design || activeId === ids.code
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActiveId(ids.design || ids.code)}
                style={{
                  textAlign: 'left',
                  fontSize: 12,
                  border: '1px solid ' + (isActive ? '#0f6e56' : '#e6dfd0'),
                  background: isActive ? '#f2f8f5' : '#fff',
                  borderRadius: 7,
                  padding: '5px 8px',
                  cursor: 'pointer',
                }}
              >
                <span style={{ color: SEVERITY_TEXT[d.severity], fontWeight: 700 }}>
                  [{SEVERITY_LABEL[d.severity]}]
                </span>{' '}
                {PROP_LABEL[d.property] ?? d.property} · {d.nodeName}：
                期望 {fmt(d.expected)} / 实际 {fmt(d.actual)}
                {d.needsReview ? '（需人工确认）' : ''}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const SEVERITY_TEXT: Record<DiffBox['severity'], string> = {
  high: '#d92d20',
  medium: '#dc8a05',
  low: '#2f62b9',
}

const COL: Record<string, React.CSSProperties> = {
  title: { fontSize: 12, fontWeight: 600, color: '#5f584c', marginBottom: 4 },
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
}
