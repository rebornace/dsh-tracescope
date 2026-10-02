import type { DesignCompareEnrichment } from './types.js'

const enrichments = new Map<string, DesignCompareEnrichment>()

export function registerDesignEnrichment(enrichment: DesignCompareEnrichment): void {
  enrichments.set(enrichment.adapterId, enrichment)
}

export function getDesignEnrichment(
  adapterId: string,
): DesignCompareEnrichment | undefined {
  return enrichments.get(adapterId)
}

export function listDesignEnrichments(): DesignCompareEnrichment[] {
  return [...enrichments.values()]
}
