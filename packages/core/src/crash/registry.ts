/**
 * Crash provider registry — horizontal extension point for crash data sources.
 */
import type { CrashProvider } from './provider-types.js'
import { localCrashProvider } from './providers/local.js'

const REGISTRY: CrashProvider[] = []

export function registerCrashProvider(provider: CrashProvider): void {
  const idx = REGISTRY.findIndex((p) => p.id === provider.id)
  if (idx >= 0) REGISTRY[idx] = provider
  else REGISTRY.push(provider)
}

export function crashProviders(): CrashProvider[] {
  return REGISTRY
}

export function getCrashProvider(id: string): CrashProvider | undefined {
  return REGISTRY.find((p) => p.id === id)
}

registerCrashProvider(localCrashProvider)

export { type CrashProvider }
