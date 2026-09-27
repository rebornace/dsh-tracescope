import type { CSSProperties } from 'react'

export interface HifiStyle {
  backgroundColor?: string
  color?: string
  fontSize?: number
  fontWeight?: number
  borderRadius?: number
  borderWidth?: number
  borderColor?: string
  gradient?: {
    angle: number
    startColor?: string
    endColor?: string
    centerColor?: string
  }
  opacity?: number
  textAlign?: string
}

export interface HifiNode {
  id: string
  name: string
  kind: 'frame' | 'text' | 'image' | 'view' | 'dynamic'
  text?: string
  imageUrl?: string
  x: number
  y: number
  width: number
  height: number
  dynamic?: boolean
  aiInferred?: boolean
  aiNote?: string
  style: HifiStyle
  children: HifiNode[]
}

export interface DiffBox {
  designNodeId?: string
  codeNodeId?: string
  nodeName: string
  property: string
  severity: 'high' | 'medium' | 'low'
  expected?: unknown
  actual?: unknown
  needsReview?: boolean
}

interface HifiScreenProps {
  root: HifiNode
  width: number
  height: number
  /** Which side this renders (selects whether diff uses design/code node id). */
  side: 'design' | 'code'
  diffs: DiffBox[]
  activeNodeId: string
  onSelectNode: (id: string) => void
}

const SEVERITY_COLOR: Record<DiffBox['severity'], string> = {
  high: '#e5484d',
  medium: '#f5a623',
  low: '#4c9aff',
}

/** Android gradient angle -> CSS angle. Android 0 = left→right (CSS 90deg). */
function gradientCss(g: NonNullable<HifiStyle['gradient']>): string | undefined {
  if (!g.startColor && !g.endColor) return undefined
  const cssAngle = (g.angle + 90) % 360
  const stops = [g.startColor, g.centerColor, g.endColor].filter(Boolean).join(', ')
  return `linear-gradient(${cssAngle}deg, ${stops})`
}

function nodeBaseStyle(node: HifiNode): CSSProperties {
  const s: CSSProperties = {
    position: 'absolute',
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    boxSizing: 'border-box',
  }
  const st = node.style
  if (st.backgroundColor) s.background = st.backgroundColor
  if (st.gradient) {
    const g = gradientCss(st.gradient)
    if (g) s.background = g
  }
  if (st.borderRadius) s.borderRadius = st.borderRadius
  if (st.borderWidth) {
    s.borderStyle = 'solid'
    s.borderWidth = st.borderWidth
    s.borderColor = st.borderColor
  }
  if (typeof st.opacity === 'number') s.opacity = st.opacity
  if (st.color) s.color = st.color
  if (st.fontSize) s.fontSize = st.fontSize
  if (st.fontWeight) s.fontWeight = st.fontWeight
  if (st.textAlign) s.textAlign = st.textAlign === 'right' ? 'right' : 'center'
  return s
}

/** Index diffs by the node id relevant to this side. */
function diffsByNode(diffs: DiffBox[], side: 'design' | 'code') {
  const map = new Map<string, DiffBox[]>()
  for (const d of diffs) {
    const id = side === 'design' ? d.designNodeId : d.codeNodeId
    if (!id) continue
    const list = map.get(id) ?? []
    list.push(d)
    map.set(id, list)
  }
  return map
}

export function HifiScreen({
  root,
  width,
  height,
  side,
  diffs,
  activeNodeId,
  onSelectNode,
}: HifiScreenProps) {
  const diffIndex = diffsByNode(diffs, side)

  function renderNode(node: HifiNode) {
    const nodeDiffs = diffIndex.get(node.id) ?? []
    const worst = nodeDiffs.reduce<DiffBox['severity'] | null>(
      (acc, d) => {
        if (!acc) return d.severity
        const rank = { high: 3, medium: 2, low: 1 }
        return rank[d.severity] > rank[acc] ? d.severity : acc
      },
      null,
    )
    const isActive = activeNodeId === node.id
    const outline = worst ? `2px solid ${SEVERITY_COLOR[worst]}` : isActive ? '2px solid #0f6e56' : undefined
    const base = nodeBaseStyle(node)

    return (
      <div
        key={node.id}
        style={{ ...base, outline, outlineOffset: -1 }}
        onClick={(e) => {
          e.stopPropagation()
          onSelectNode(node.id)
        }}
        title={node.name}
      >
        {node.kind === 'image' && node.imageUrl ? (
          <img
            src={node.imageUrl}
            alt={node.name}
            style={{ width: '100%', height: '100%', display: 'block', objectFit: side === 'design' ? 'fill' : 'cover' }}
          />
        ) : null}

        {node.kind === 'text' && node.text ? (
          <span style={{ display: 'inline-block', padding: '0 2px', lineHeight: 1.3 }}>{node.text}</span>
        ) : null}

        {node.dynamic ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px dashed #b9a98a',
              borderRadius: 4,
              background:
                'repeating-linear-gradient(45deg,#f3ede1,#f3ede1 8px,#efe7d6 8px,#efe7d6 16px)',
              color: '#8a7a5c',
              fontSize: 11,
            }}
          >
            运行时动态区域
          </div>
        ) : null}

        {node.aiInferred ? (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              background: '#6d4bd6',
              color: '#fff',
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: '0 0 6px 0',
              maxWidth: '100%',
            }}
            title={node.aiNote}
          >
            AI 推断{node.aiNote ? `：${node.aiNote}` : ''}
          </div>
        ) : null}

        {node.children.map(renderNode)}
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      {renderNode(root)}
    </div>
  )
}
