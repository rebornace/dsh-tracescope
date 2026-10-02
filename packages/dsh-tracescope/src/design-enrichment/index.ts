/**
 * Design-compare enrichment plugins.
 * Import this module once from the compare entry so adapters register.
 */
import './android-xml.js'
export type {
  DesignCompareEnrichment,
  EnrichmentRelatedResult,
  EnrichmentCodeCompareResult,
} from './types.js'
export {
  registerDesignEnrichment,
  getDesignEnrichment,
  listDesignEnrichments,
} from './registry.js'
export {
  type DesignWireNode,
  serializeLayoutTree,
  emptyCodeWire,
  designDocToWire,
  designDocToWireSimple,
} from './wire.js'
