/**
 * Resolve AI finding → design node id for raster hotspot highlighting.
 *
 * Models often omit nodeId, invent ids, or only write human location/expected
 * text. This module recovers a real DesignDoc / hifi-tree id when possible.
 */
import type { DesignNode, VisualFinding } from './types.js'

export interface FindingNodeLocator {
  id: string
  name?: string
  text?: string
  width?: number
  height?: number
}

export interface FindingNodeHints {
  title?: string
  nodeId?: string
  location?: string
  expected?: string
  actual?: string
  suggestion?: string
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[“”"']/g, '')
}

/** Figma-style `12:345` / `12-345` and bare numeric ids embedded in free text. */
export function extractCandidateNodeIds(...parts: Array<string | undefined>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (id: string) => {
    const t = id.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
    const alt = t.includes('-') ? t.replace(/-/g, ':') : t.replace(/:/g, '-')
    if (alt !== t && !seen.has(alt)) {
      seen.add(alt)
      out.push(alt)
    }
  }
  for (const part of parts) {
    if (!part) continue
    for (const m of part.matchAll(/\b\d+:\d+\b/g)) push(m[0]!)
    for (const m of part.matchAll(/\b\d+-\d+\b/g)) push(m[0]!)
    const trimmed = part.trim()
    // Whole-field id (AI sometimes puts only the id in nodeId).
    if (/^\d+:\d+$/.test(trimmed) || /^\d+-\d+$/.test(trimmed)) push(trimmed)
    if (/^[A-Za-z0-9_.-]{6,80}$/.test(trimmed) && !/\s/.test(trimmed)) push(trimmed)
  }
  return out
}

function compactId(id: string): string {
  return id.replace(/[^0-9]/g, '')
}

function buildIdIndexes(nodes: FindingNodeLocator[]) {
  const byId = new Map<string, FindingNodeLocator>()
  const byCompact = new Map<string, FindingNodeLocator>()
  const byNorm = new Map<string, FindingNodeLocator>()
  for (const n of nodes) {
    const id = String(n.id ?? '').trim()
    if (!id) continue
    if (!byId.has(id)) byId.set(id, n)
    const c = compactId(id)
    if (c && !byCompact.has(c)) byCompact.set(c, n)
    const norm = id.replace(/-/g, ':')
    if (!byNorm.has(norm)) byNorm.set(norm, n)
  }
  return { byId, byCompact, byNorm }
}

function lookupId(
  indexes: ReturnType<typeof buildIdIndexes>,
  raw: string,
): FindingNodeLocator | undefined {
  const id = raw.trim()
  if (!id) return undefined
  return (
    indexes.byId.get(id) ||
    indexes.byNorm.get(id.replace(/-/g, ':')) ||
    indexes.byCompact.get(compactId(id))
  )
}

function scoreNode(node: FindingNodeLocator, hints: FindingNodeHints): number {
  const name = normalize(node.name || '')
  const text = normalize(node.text || '')
  const loc = normalize(hints.location || '')
  const title = normalize(hints.title || '')
  const expected = normalize(hints.expected || '')
  let score = 0

  if (expected && text) {
    if (text === expected) score += 100
    else if (expected.length >= 2 && (text.includes(expected) || expected.includes(text))) {
      score += 70
    }
  }
  if (loc && name) {
    if (name === loc) score += 90
    else if (loc.length >= 2 && (name.includes(loc) || loc.includes(name))) score += 50
  }
  if (title && name && name.length >= 2 && title.includes(name)) score += 35
  if (title && text && text.length >= 2 && title.includes(text)) score += 40
  if (loc && text && text.length >= 2 && (loc.includes(text) || text.includes(loc))) score += 25

  const w = Math.max(1, Number(node.width) || 1)
  const h = Math.max(1, Number(node.height) || 1)
  const area = w * h
  // Prefer tighter boxes when scores tie-ish.
  score += Math.max(0, 8 - Math.log10(area))
  return score
}

/**
 * Best-effort design node id for a finding. Returns undefined when confidence
 * is too low (caller should leave hotspot empty rather than highlight wrong).
 */
export function resolveFindingNodeId(
  hints: FindingNodeHints,
  nodes: FindingNodeLocator[],
  options?: { minScore?: number },
): string | undefined {
  if (!nodes.length) return undefined
  const minScore = options?.minScore ?? 40
  const indexes = buildIdIndexes(nodes)

  const directCandidates = extractCandidateNodeIds(
    hints.nodeId,
    hints.location,
    hints.title,
    hints.expected,
    hints.suggestion,
  )
  for (const cand of directCandidates) {
    const hit = lookupId(indexes, cand)
    if (hit) return hit.id
  }

  // Explicit nodeId that already exists (even if not Figma-shaped).
  if (hints.nodeId) {
    const hit = lookupId(indexes, hints.nodeId)
    if (hit) return hit.id
  }

  let best: FindingNodeLocator | undefined
  let bestScore = 0
  for (const n of nodes) {
    const s = scoreNode(n, hints)
    if (s > bestScore) {
      bestScore = s
      best = n
    }
  }
  if (best && bestScore >= minScore) return best.id
  return undefined
}

/** Flatten a DesignDoc tree into locator rows for {@link resolveFindingNodeId}. */
export function designDocToFindingLocators(root: DesignNode): FindingNodeLocator[] {
  const out: FindingNodeLocator[] = []
  const walk = (n: DesignNode): void => {
    out.push({
      id: String(n.id ?? ''),
      name: n.name,
      text: n.text,
      width: typeof n.box.width === 'number' ? n.box.width : undefined,
      height: typeof n.box.height === 'number' ? n.box.height : undefined,
    })
    for (const c of n.children) walk(c)
  }
  walk(root)
  return out.filter((n) => n.id)
}

/** Fill missing / invented nodeIds on publish so the panel can highlight. */
export function enrichVisualFindingsNodeIds(
  findings: VisualFinding[],
  nodes: FindingNodeLocator[],
): VisualFinding[] {
  if (!findings.length || !nodes.length) return findings
  return findings.map((f) => {
    const resolved = resolveFindingNodeId(
      {
        title: f.title,
        nodeId: f.nodeId,
        location: f.location,
        expected: f.expected,
        actual: f.actual,
        suggestion: f.suggestion,
      },
      nodes,
    )
    if (!resolved || resolved === f.nodeId) return f
    return { ...f, nodeId: resolved }
  })
}
