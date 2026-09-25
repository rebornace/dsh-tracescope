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
  /** Whether property-level comparison could be performed. */
  precise: boolean
  /** Present only when the page supports precise comparison. */
  result?: import('./types.js').VisualCompareResult
  /** Reason the comparison was skipped when not precise. */
  reason?: string
}

/**
 * Compare a design screen against a specific matched page.
 *
 * For locator-only implementations (Compose / SwiftUI) comparison is skipped
 * with a clear reason instead of producing a misleading diff.
 */
export async function compareDesignWithPage(
  design: DesignDoc,
  page: CodePage,
): Promise<PageComparison> {
  if (!page.precise) {
    return {
      precise: false,
      reason: `${page.kindLabel} 页面已定位，但该实现以代码方式构建界面，当前版本暂不支持属性级对比。`,
    }
  }
  const adapter = getPlatformAdapter(page.adapterId)
  if (!adapter?.toDesignDoc) {
    return { precise: false, reason: '该页面缺少可用的对比适配器。' }
  }
  const code = await adapter.toDesignDoc(page)
  // Imported lazily to keep the module graph explicit.
  const { compareVisualDocs } = await import('./compare.js')
  return { precise: true, result: compareVisualDocs(design, code) }
}

export { matchPages }
