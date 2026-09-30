/**
 * Design subsystem facade.
 *
 * Orchestrates the platform adapters end-to-end:
 *   discover pages → match a design screen to them → compare the chosen page.
 *
 * Callers (DSH routes) should use these functions rather than reaching into
 * individual adapters, so the workflow stays consistent.
 */
import type { DesignDoc } from './types.js'
import { matchPages, type PageMatch, type MatchOptions } from './page-fingerprint.js'
import {
  getPlatformAdapter,
  platformAdapters,
} from './registry.js'
import type { CodePage } from './adapters/adapter-types.js'

/** Discover every candidate page across all registered platform adapters. */
export async function discoverAllPages(root: string): Promise<CodePage[]> {
  const pages: CodePage[] = []
  for (const adapter of platformAdapters()) {
    pages.push(...(await adapter.discoverPages(root)))
  }
  return pages
}

/**
 * Locate the code pages that implement a design screen, best first.
 * Convenience wrapper around discovery + scoring.
 */
export async function locatePagesForDesign(
  design: DesignDoc,
  root: string,
  options?: MatchOptions,
): Promise<PageMatch[]> {
  const pages = await discoverAllPages(root)
  return matchPages(design, pages, options)
}

export interface PageComparison {
  /** Whether property-level (exact) comparison could be performed. */
  precise: boolean
  /** Diff result from exact or heuristic compare. */
  result?: import('./types.js').VisualCompareResult
  /** Extra note when compare was heuristic / incomplete. */
  reason?: string
}

/**
 * Compare a design screen against a specific matched page.
 *
 * Precise adapters run property-level compare via toDesignDoc; others fall
 * back to L2 heuristic (texts / control-count) instead of a hard stop.
 */
export async function compareDesignWithPage(
  design: DesignDoc,
  page: CodePage,
): Promise<PageComparison> {
  const adapter = getPlatformAdapter(page.adapterId)
  if (!page.precise || !adapter?.toDesignDoc) {
    const { heuristicCompare } = await import('./heuristic-compare.js')
    return {
      precise: false,
      result: await heuristicCompare(design, page),
      reason: `${page.kindLabel} 已完成启发式静态对比；属性级几何对比可后续加深。`,
    }
  }
  const code = await adapter.toDesignDoc(page)
  // Imported lazily to keep the module graph explicit.
  const { compareVisualDocs } = await import('./compare.js')
  return { precise: true, result: compareVisualDocs(design, code) }
}

export { matchPages }
