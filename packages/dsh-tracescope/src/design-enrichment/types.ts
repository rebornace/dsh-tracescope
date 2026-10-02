/**
 * Optional per-adapter enrichment for design-static compare.
 *
 * The main compare path is adapter-agnostic (toDesignDoc / heuristic).
 * Stacks that need extra closure analysis or a layout engine plug in here
 * without forking the shared flow.
 */
import type {
  DesignDoc,
  RelatedSourceFilesResult,
} from '@rebornace/tracescope-core'
import type { DesignWireNode } from './wire.js'

export interface EnrichmentRelatedResult {
  related: RelatedSourceFilesResult
  /** Absolute paths hashed into the compare cache key. */
  fingerprintFiles: string[]
}

export interface EnrichmentCodeCompareResult {
  /** Code-side doc used for L1 property compare. */
  codeDoc: DesignDoc
  /** Wire tree for AI dynamic-region catalog (and optional overlays). */
  codeTree: DesignWireNode
  note?: string
  kindLabel?: string
}

export interface DesignCompareEnrichment {
  adapterId: string
  /**
   * Resolve related sources + fingerprint inputs for cache invalidation.
   * Return null to fall back to generic resolveRelatedSourceFiles.
   */
  resolveRelated?(input: {
    checkoutPath: string
    relativePath: string
  }): Promise<EnrichmentRelatedResult | null>
  /**
   * Build the code-side DesignDoc (+ wire tree) for static compare.
   * Return null to fall back to adapter.toDesignDoc / heuristic.
   */
  buildCodeCompare?(input: {
    checkoutPath: string
    relativePath: string
    design: DesignDoc
    viewport: { width: number; height: number }
    fillUrls: Map<string, string>
  }): Promise<EnrichmentCodeCompareResult | null>
}
