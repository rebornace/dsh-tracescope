/**
 * Platform adapter registry — the single horizontal extension point.
 *
 * Register a new platform once here; page discovery, matching and comparison
 * pick it up automatically with no changes elsewhere.
 */
import type { PlatformAdapter } from './adapters/adapter-types.js'
import { androidXmlAdapter } from './adapters/android-xml.js'
import { androidComposeAdapter } from './adapters/android-compose.js'
import { iosXibAdapter } from './adapters/ios-xib.js'
import { iosSwiftuiAdapter } from './adapters/ios-swiftui.js'

const REGISTRY: PlatformAdapter[] = [
  androidXmlAdapter,
  androidComposeAdapter,
  iosXibAdapter,
  iosSwiftuiAdapter,
]

/** All registered adapters (registration order preserved). */
export function platformAdapters(): PlatformAdapter[] {
  return REGISTRY
}

export function getPlatformAdapter(id: string): PlatformAdapter | undefined {
  return REGISTRY.find((a) => a.id === id)
}

export { type PlatformAdapter }
