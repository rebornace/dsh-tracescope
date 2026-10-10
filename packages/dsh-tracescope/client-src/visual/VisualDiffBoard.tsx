import { useEffect, useMemo, useRef, useState } from 'react'
import { getT } from '../locales/i18n.js'
import { useLocaleT } from '../locales/use-locale-t.js'
import { diffPropLabel } from './diff-i18n.js'

export interface WireNode {
  id: string
  name: string
  kind: string
  text?: string
  box: { x?: number; y?: number; width?: number; height?: number }
  style: {
    backgroundColor?: string
    color?: string
    fontSize?: number
    fontWeight?: number
    cornerRadius?: number
  }
  children: WireNode[]
}

export interface VisualDiff {
  designNodeId: string
  codeNodeId?: string
  nodeName: string
  property: string
  expected: unknown
  actual?: unknown
  severity: 'high' | 'medium' | 'low'
  needsReview?: boolean
}

export interface VisualDiffBoardData {
  designImageUrl?: string
  frameBox?: { x: number; y: number; width: number; height: number }
  designTree?: WireNode
  codeTree?: WireNode
  result: {
    diffs: VisualDiff[]
    unmatched: Array<{ id: string; name: string; side: 'design' | 'code'; text?: string }>
    comparedPairs: number
  }
  page: { kindLabel: string; relativePath: string }
}

const SEV_COLOR: Record<VisualDiff['severity'], string> = {
  high: '#d92d20',
  medium: '#dc8a05',
  low: '#1a9b6e',
}

function isUnresolvedValue(v: unknown): v is { unresolved: true; raw: string } {
  return !!v && typeof v === 'object' && 'unresolved' in (v as object)
}

function ValueView({ value }: { value: unknown }) {
  const t = getT()
  if (isUnresolvedValue(value)) return <span>{t('diff.unresolved', { raw: value.raw })}</span>
  return <span>{String(value)}</span>
}

function flattenTree(root: WireNode | undefined): Map<string, WireNode> {
  const map = new Map<string, WireNode>()
  const walk = (n: WireNode) => {
    map.set(n.id, n)
    n.children.forEach(walk)
  }
  if (root) walk(root)
  return map
}

function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

export function VisualDiffBoard({ data }: { data: VisualDiffBoardData }) {
  const t = useLocaleT()
  const { result, frameBox, designImageUrl, designTree, codeTree } = data

  const designNodes = useMemo(() => flattenTree(designTree), [designTree])
  const codeNodes = useMemo(() => flattenTree(codeTree), [codeTree])

  // Group diffs by the design node they belong to.
  const diffsByDesign = useMemo(() => {
    const map = new Map<string, VisualDiff[]>()
    for (const d of result.diffs) {
      const list = map.get(d.designNodeId) ?? []
      list.push(d)
      map.set(d.designNodeId, list)
    }
    return map
  }, [result.diffs])

  const orderedNodeIds = useMemo(
    () => [...diffsByDesign.keys()],
    [diffsByDesign],
  )

  const rank: Record<VisualDiff['severity'], number> = { high: 3, medium: 2, low: 1 }
  const topSeverity = (list: VisualDiff[]): VisualDiff['severity'] =>
    list.reduce<VisualDiff['severity']>(
      (acc, d) => (rank[d.severity] > rank[acc] ? d.severity : acc),
      'low',
    )

  const [selectedId, setSelectedId] = useState('')
  useEffect(() => {
    setSelectedId(orderedNodeIds[0] ?? '')
  }, [orderedNodeIds])

  const selectedDiffs = selectedId ? diffsByDesign.get(selectedId) ?? [] : []
  const selectedCodeId = selectedDiffs.find((d) => d.codeNodeId)?.codeNodeId

  // Fit the (often 414-wide) stage into the available column.
  const { ref: stageHostRef, width: hostWidth } = useContainerWidth<HTMLDivElement>()
  const frameW = frameBox?.width ?? 390
  const frameH = frameBox?.height ?? 800
  const fit = hostWidth ? Math.min(1, hostWidth / frameW) : 1

  const sevCounts = { high: 0, medium: 0, low: 0 }
  for (const d of result.diffs) sevCounts[d.severity] += 1

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          fontSize: 12,
          color: '#5f584c',
          marginBottom: 8,
        }}
      >
        <span>{t('diff.compare.pairs', { count: result.comparedPairs })}</span>
        <span style={{ color: SEV_COLOR.high }}>
          {t('diff.compare.severityHigh', { count: sevCounts.high })}
        </span>
        <span style={{ color: SEV_COLOR.medium }}>
          {t('diff.compare.severityMedium', { count: sevCounts.medium })}
        </span>
        <span style={{ color: SEV_COLOR.low }}>
          {t('diff.compare.severityLow', { count: sevCounts.low })}
        </span>
        <span>{t('diff.compare.unmatched', { count: result.unmatched.length })}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {/* Left: real Figma render with diff boxes overlaid */}
        <div>
          <ColumnTitle>{t('diff.column.design')}</ColumnTitle>
          <div ref={stageHostRef} style={{ width: '100%' }}>
            <div
              style={{
                position: 'relative',
                width: frameW * fit,
                height: frameH * fit,
                background: '#f1ede4',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              {designImageUrl ? (
                <img
                  src={designImageUrl}
                  alt="design"
                  style={{ width: frameW * fit, height: frameH * fit, display: 'block' }}
                />
              ) : (
                <div style={{ padding: 8, fontSize: 11, color: '#8a7f70' }}>
                  {t('diff.renderFailed')}
                </div>
              )}

              {frameBox
                ? orderedNodeIds.map((id) => {
                    const node = designNodes.get(id)
                    if (!node) return null
                    const { x, y, width, height } = node.box
                    if (
                      typeof x !== 'number' ||
                      typeof y !== 'number' ||
                      typeof width !== 'number' ||
                      typeof height !== 'number'
                    )
                      return null
                    const sev = topSeverity(diffsByDesign.get(id) ?? [])
                    const active = id === selectedId
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedId(id)}
                        title={t('diff.hotspotTitle', {
                          name: node.name,
                          count: diffsByDesign.get(id)?.length ?? 0,
                        })}
                        style={{
                          position: 'absolute',
                          left: (x - frameBox.x) * fit,
                          top: (y - frameBox.y) * fit,
                          width: width * fit,
                          height: height * fit,
                          border: `2px solid ${SEV_COLOR[sev]}`,
                          background: active
                            ? SEV_COLOR[sev] + '22'
                            : SEV_COLOR[sev] + '0d',
                          boxShadow: active ? `0 0 0 2px ${SEV_COLOR[sev]}55` : 'none',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      />
                    )
                  })
                : null}
            </div>
          </div>
        </div>

        {/* Right: code block tree */}
        <div>
          <ColumnTitle>{t('diff.column.code')}</ColumnTitle>
          <div
            style={{
              border: '1px solid var(--dsh-border,#ddd4c5)',
              borderRadius: 8,
              padding: 6,
              height: frameH * fit,
              overflow: 'auto',
              background: '#fff',
            }}
          >
            {codeTree ? (
              <CodeBlocks
                node={codeTree}
                selectedCodeId={selectedCodeId}
                onSelectCode={(codeId) => {
                  const entry = orderedNodeIds.find((id) =>
                    diffsByDesign.get(id)?.some((d) => d.codeNodeId === codeId),
                  )
                  if (entry) setSelectedId(entry)
                }}
              />
            ) : (
              <span style={{ fontSize: 11, color: '#8a7f70' }}>{t('diff.noCodeTree')}</span>
            )}
          </div>
        </div>
      </div>

      {/* Selected node diff detail */}
      <div
        style={{
          marginTop: 10,
          border: '1px solid var(--dsh-border,#ddd4c5)',
          borderRadius: 10,
          padding: 10,
          background: '#fff',
        }}
      >
        <strong style={{ fontSize: 13 }}>
          {selectedDiffs.length ? selectedDiffs[0]!.nodeName : t('diff.detailTitle')}
        </strong>
        {selectedCodeId ? (
          <span style={{ marginLeft: 8, fontSize: 12, color: '#6b645a' }}>
            {t('diff.codeNode', {
              name: codeNodes.get(selectedCodeId)?.name ?? selectedCodeId,
            })}
          </span>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {selectedDiffs.map((d, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                flexWrap: 'wrap',
                border: '1px solid #efe8da',
                borderLeft: '4px solid ' + SEV_COLOR[d.severity],
                borderRadius: 8,
                padding: '5px 8px',
                fontSize: 12,
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {diffPropLabel(t, d.property)}
                {d.needsReview ? (
                  <span style={REVIEW_BADGE}>{t('diff.needsReview')}</span>
                ) : null}
              </span>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <ValueView value={d.expected} />
                <span style={{ color: '#9a917f' }}>→</span>
                {d.actual === undefined ? (
                  <span style={{ color: '#d92d20', fontWeight: 700 }}>{t('diff.missing')}</span>
                ) : (
                  <ValueView value={d.actual} />
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {result.unmatched.length ? (
        <details
          style={{
            marginTop: 8,
            border: '1px dashed var(--dsh-border,#ddd4c5)',
            borderRadius: 10,
            padding: '8px 10px',
            fontSize: 12,
          }}
        >
          <summary style={{ cursor: 'pointer', color: '#0f6e56', fontWeight: 600 }}>
            {t('diff.unmatchedSection', { count: result.unmatched.length })}
          </summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {result.unmatched.map((u, i) => (
              <li key={i}>
                <span style={SIDE_TAG}>
                  {u.side === 'design' ? t('diff.side.designOnly') : t('diff.side.codeOnly')}
                </span>
                {u.name}
                {u.text ? `（${u.text}）` : ''}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

function ColumnTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: '#5f584c',
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  )
}

const REVIEW_BADGE: React.CSSProperties = {
  fontSize: 10,
  color: '#9a6700',
  background: '#fef0c7',
  borderRadius: 999,
  padding: '1px 6px',
  marginLeft: 6,
  fontWeight: 400,
}

const SIDE_TAG: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 10,
  borderRadius: 999,
  padding: '1px 6px',
  marginRight: 4,
  background: '#efe8da',
}

interface CodeBlocksProps {
  node: WireNode
  depth?: number
  selectedCodeId?: string
  onSelectCode: (id: string) => void
}

function CodeBlocks({ node, depth = 0, selectedCodeId, onSelectCode }: CodeBlocksProps) {
  const active = selectedCodeId === node.id
  const w = node.box.width
  const h = node.box.height
  const bg = node.style.backgroundColor
  const isText = node.kind === 'text'

  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        onSelectCode(node.id)
      }}
      style={{
        border: '1px solid ' + (active ? '#0f6e56' : '#d9d2c4'),
        outline: active ? '2px solid #0f6e5655' : 'none',
        borderRadius: 6,
        padding: 4,
        margin: 2,
        minHeight: 18,
        width: typeof w === 'number' ? `${Math.min(100, (w / 414) * 100)}%` : '100%',
        maxHeight: h ? Math.min(160, h) : undefined,
        overflow: 'hidden',
        background:
          bg && !isUnresolvedValue(bg)
            ? bg
            : isText
              ? '#faf7f0'
              : '#fcfaf6',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 10, color: '#8a7f70', lineHeight: 1.2 }}>
        {isText ? node.text || node.name : node.name}
      </div>
      {node.children.length ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {node.children.map((c) => (
            <CodeBlocks
              key={c.id}
              node={c}
              depth={depth + 1}
              selectedCodeId={selectedCodeId}
              onSelectCode={onSelectCode}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
