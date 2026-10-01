/**
 * Design subsystem facade.
 *
 * Orchestrates the platform adapters end-to-end:
 *   discover pages → match a design screen to them → compare the chosen page.
 *
 * Callers (DSH routes) should use these functions rather than reaching into
 * individual adapters, so the workflow stays consistent.
 */
import { access } from 'node:fs/promises'
import path from 'node:path'
import type { DesignDoc } from './types.js'
import { matchPages, tokenizeName, type PageMatch, type MatchOptions } from './page-fingerprint.js'
import {
  getPlatformAdapter,
  platformAdapters,
} from './registry.js'
import type { AdapterId, CodePage } from './adapters/adapter-types.js'

const DISCOVER_CACHE_TTL_MS = 30_000
const discoverCache = new Map<string, { pages: CodePage[]; at: number }>()

/** Drop in-process discovery cache (tests / after large checkouts). */
export function clearDiscoverPagesCache(): void {
  discoverCache.clear()
}

/**
 * Discover every candidate page across all registered platform adapters.
 * Adapters run in parallel; results are memoized briefly per absolute root so
 * visual flows that call this repeatedly in one session do not re-walk ~20×.
 */
export async function discoverAllPages(root: string): Promise<CodePage[]> {
  const key = path.resolve(root)
  const hit = discoverCache.get(key)
  if (hit && Date.now() - hit.at < DISCOVER_CACHE_TTL_MS) {
    return hit.pages
  }
  const batches = await Promise.all(
    platformAdapters().map((adapter) => adapter.discoverPages(root)),
  )
  const pages = batches.flat()
  discoverCache.set(key, { pages, at: Date.now() })
  return pages
}

/**
 * Resolve one code page when adapterId + relativePath are already known.
 * Prefers the discover cache; for precise adapters builds a lightweight
 * CodePage without walking the whole tree (toDesignDoc only needs the path).
 */
export async function resolveCodePage(
  root: string,
  adapterId: string,
  relativePath: string,
): Promise<CodePage | undefined> {
  const normRel = relativePath.replace(/\\/g, '/')
  const key = path.resolve(root)
  const cached = discoverCache.get(key)
  if (cached && Date.now() - cached.at < DISCOVER_CACHE_TTL_MS) {
    return cached.pages.find(
      (p) => p.adapterId === adapterId && p.relativePath === normRel,
    )
  }

  const adapter = getPlatformAdapter(adapterId as AdapterId)
  if (!adapter) return undefined

  const absolutePath = path.resolve(root, normRel)
  try {
    await access(absolutePath)
  } catch {
    return undefined
  }

  if (adapter.precise && adapter.toDesignDoc) {
    return {
      adapterId: adapter.id,
      platform: adapter.platform,
      kindLabel: adapter.kindLabel,
      relativePath: normRel,
      absolutePath,
      precise: true,
      fingerprint: {
        texts: [],
        nameTokens: tokenizeName(path.basename(normRel)),
        controlCount: 0,
      },
    }
  }

  // Locator / heuristic-only: need fingerprint from that adapter's discover.
  const pages = await adapter.discoverPages(root)
  return pages.find((p) => p.relativePath === normRel)
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
