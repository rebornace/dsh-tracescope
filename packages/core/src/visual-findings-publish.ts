/**
 * Parse + validate agent-published visual review findings.
 *
 * Mirrors `parsePublishedHandtestItems`: tolerates loose model output, keeps
 * only well-formed entries and clamps field lengths so a publish call can never
 * inject malformed/oversized data into the persisted report.
 */
import type {
  VisualFinding,
  VisualFindingSeverity,
  VisualRenderNodePatch,
  VisualRenderPatch,
} from './design/types.js'

function severityOf(value: unknown): VisualFindingSeverity {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'medium'
}

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, max)
}

/** Parse loose model output into a validated, clamped `VisualFinding[]`. */
export function parseVisualFindings(raw: unknown): VisualFinding[] {
  if (!Array.isArray(raw)) throw new Error('findings 必须是数组')
  const findings: VisualFinding[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const obj = row as Record<string, unknown>
    const title = str(obj.title, 80)
    if (!title) continue
    findings.push({
      title,
      severity: severityOf(obj.severity),
      nodeId: str(obj.nodeId, 120),
      location: str(obj.location, 120),
      expected: str(obj.expected, 300),
      actual: str(obj.actual, 300),
      codeSource: str(obj.codeSource, 400),
      suggestion: str(obj.suggestion, 400),
    })
  }
  return findings
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function patchStyleOf(raw: unknown): VisualRenderNodePatch['style'] {
  if (!raw || typeof raw !== 'object') return undefined
  const obj = raw as Record<string, unknown>
  const style: NonNullable<VisualRenderNodePatch['style']> = {}
  const color = str(obj.backgroundColor, 32)
  if (color) style.backgroundColor = color
  const fg = str(obj.color, 32)
  if (fg) style.color = fg
  if (typeof obj.fontSize === 'number' || obj.fontSize !== undefined) {
    style.fontSize = num(obj.fontSize, 6, 72, 14)
  }
  if (obj.fontWeight !== undefined) {
    style.fontWeight = num(obj.fontWeight, 100, 900, 400)
  }
  if (obj.borderRadius !== undefined) {
    style.borderRadius = num(obj.borderRadius, 0, 400, 0)
  }
  if (obj.borderWidth !== undefined) {
    style.borderWidth = num(obj.borderWidth, 0, 40, 0)
  }
  const borderColor = str(obj.borderColor, 32)
  if (borderColor) style.borderColor = borderColor
  if (obj.textAlign === 'left' || obj.textAlign === 'center' || obj.textAlign === 'right') {
    style.textAlign = obj.textAlign
  }
  if (obj.imageFit === 'fill' || obj.imageFit === 'contain' || obj.imageFit === 'cover') {
    style.imageFit = obj.imageFit
  }
  return style
}

/**
 * Parse loose model output into validated visual render patches. Each patch
 * must target a code node and carry at least one well-formed inferred node.
 * Coordinates are clamped to a sane range and text length capped so a publish
 * call cannot inject malformed/off-screen content into the rendered code tree.
 */
export function parseVisualRenderPatches(raw: unknown): VisualRenderPatch[] {
  if (!Array.isArray(raw)) throw new Error('renderPatch 必须是数组')
  const patches: VisualRenderPatch[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const obj = row as Record<string, unknown>
    const targetNodeId = str(obj.targetNodeId, 120)
    if (!targetNodeId) continue
    if (!Array.isArray(obj.nodes)) continue

    const nodes: VisualRenderNodePatch[] = []
    for (const nRow of obj.nodes) {
      if (!nRow || typeof nRow !== 'object') continue
      const nObj = nRow as Record<string, unknown>
      const width = num(nObj.width, 1, 2000, 0)
      const height = num(nObj.height, 1, 4000, 0)
      if (width === 0 || height === 0) continue
      const kind =
        nObj.kind === 'text' || nObj.kind === 'image' || nObj.kind === 'view'
          ? nObj.kind
          : nObj.kind === 'frame' || nObj.kind === 'icon'
            ? nObj.kind
            : 'text'
      const imageUrl = str(nObj.imageUrl, 2000)
      const text = str(nObj.text, 300)
      if (kind === 'image' && !imageUrl) continue
      if (kind !== 'image' && !text) continue
      nodes.push({
        kind,
        text,
        imageUrl,
        rx: num(nObj.rx, -200, 2000, 0),
        ry: num(nObj.ry, -200, 4000, 0),
        width,
        height,
        style: patchStyleOf(nObj.style),
      })
    }
    if (!nodes.length) continue
    patches.push({
      targetNodeId,
      targetLabel: str(obj.targetLabel, 120),
      nodes,
    })
  }
  return patches
}
