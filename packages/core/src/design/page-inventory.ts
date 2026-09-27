/**
 * Whole-file page mapping.
 *
 * A Figma file holds many screens; an Android project holds many layout files.
 * Instead of locating one manually selected node, this module classifies every
 * design page and every code page by *kind* (full screen / list item / dialog)
 * and then matches them within the same kind, so each design screen maps to the
 * layout that implements it. Fully deterministic; no model involved.
 */
import type { DesignDoc } from './types.js'
import { designFingerprint, scorePage } from './page-fingerprint.js'
import type { CodePage } from './adapters/adapter-types.js'
import type { FigmaPageSummary } from './sources/figma.js'

export type PageKind = 'screen' | 'list-item' | 'dialog'

export const PAGE_KIND_LABEL: Record<PageKind, string> = {
  screen: '整屏页面',
  'list-item': '列表/卡片项',
  dialog: '弹窗',
}

// Full-screen height on the target platform (logical units). Pages shorter than
// a fraction of it are dialogs; narrow small ones are list/card items.
const SCREEN_LONG_EDGE = 896

/** Classify a design page from its size + content fingerprint. */
export function classifyDesignPage(
  summary: FigmaPageSummary,
  doc: DesignDoc,
): PageKind {
  const fp = designFingerprint(doc)
  const { width, height } = summary.box
  const long = Math.max(width, height)
  const short = Math.min(width, height)

  // Full phone-size surface -> screen.
  if (long >= SCREEN_LONG_EDGE * 0.82 && short >= 300) return 'screen'
  // Small height, phone width, usually short content count -> dialog.
  if (long < SCREEN_LONG_EDGE * 0.55 && fp.controlCount <= 14) return 'dialog'
  // Narrow / small content block -> a reusable list or card item.
  if (short < 300 || fp.controlCount <= 10) return 'list-item'
  return 'screen'
}

const ITEM_NAME = /(^|[_])(item|cell|row|card|holder|entry|bean)([_]|$)/i
const DIALOG_NAME = /(^|[_])(dialog|popup|pop|modal|alert|sheet|bottom|window|tip|toast)([_]|$)/i
const SCREEN_NAME =
  /(^|[_])(activity|act|fragment|fm|page|screen|view|layout|container|home)([_]|$)/i

/** Classify a code layout file from its file name. */
export function classifyCodePage(page: CodePage): PageKind {
  const base = page.relativePath.split('/').pop() ?? ''
  if (ITEM_NAME.test(base)) return 'list-item'
  if (DIALOG_NAME.test(base)) return 'dialog'
  if (SCREEN_NAME.test(base)) return 'screen'
  // Fall back to size: tiny layouts are usually items.
  if (page.fingerprint.controlCount <= 5) return 'list-item'
  return 'screen'
}

export interface PageMappingCandidate {
  adapterId: string
  kindLabel: string
  relativePath: string
  precise: boolean
  score: number
  reasons: string[]
}

export interface DesignPageMapping {
  designId: string
  designName: string
  kind: PageKind
  box: FigmaPageSummary['box']
  candidates: PageMappingCandidate[]
  status: 'matched' | 'weak' | 'none'
}

export interface InventoryMappingOptions {
  /** Require at least this score for a confident match (default 0.15). */
  minScore?: number
  /** Score below which a result is not even a weak guess (default 0.1). */
  weakFloor?: number
  /** Max code candidates kept per design page (default 6). */
  limit?: number
}

/**
 * Map every design page to code pages of the same kind.
 *
 * @param designDocs id -> normalised doc for each design page
 * @param pages      all discovered code pages
 */
export function mapInventoryPages(
  pages: Array<{ summary: FigmaPageSummary; doc: DesignDoc }>,
  codePages: CodePage[],
  options: InventoryMappingOptions = {},
): DesignPageMapping[] {
  const minScore = options.minScore ?? 0.15
  const weakFloor = options.weakFloor ?? 0.1
  const limit = options.limit ?? 6

  // Bucket code pages by kind once.
  const byKind: Record<PageKind, CodePage[]> = {
    screen: [],
    'list-item': [],
    dialog: [],
  }
  for (const code of codePages) byKind[classifyCodePage(code)].push(code)

  const mappings: DesignPageMapping[] = []
  for (const { summary, doc } of pages) {
    const kind = classifyDesignPage(summary, doc)
    const pool = byKind[kind]

    const scored = pool
      .map((code) => scorePage(designFingerprint(doc), code))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    const confident = scored.filter((m) => m.score >= minScore)
    const weak = scored.filter((m) => m.score >= weakFloor && m.score < minScore)

    let status: DesignPageMapping['status']
    let chosen: typeof scored
    if (confident.length) {
      status = 'matched'
      chosen = confident
    } else if (weak.length) {
      status = 'weak'
      chosen = weak
    } else {
      status = 'none'
      chosen = []
    }

    mappings.push({
      designId: summary.id,
      designName: summary.name,
      kind,
      box: summary.box,
      status,
      candidates: chosen.map((m) => ({
        adapterId: m.page.adapterId,
        kindLabel: m.page.kindLabel,
        relativePath: m.page.relativePath,
        precise: m.page.precise,
        score: m.score,
        reasons: m.reasons,
      })),
    })
  }

  return mappings
}
