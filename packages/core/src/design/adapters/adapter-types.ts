/**
 * Platform adapter contract.
 *
 * Each native UI implementation (Android XML, iOS xib, Jetpack Compose,
 * SwiftUI, Flutter, RN, ArkUI, ...) is implemented as one adapter file and
 * registered once. The page-locator and the comparison engine then work
 * against this common interface.
 */
import type { DesignDoc } from '../types.js'

export type PlatformId =
  | 'android'
  | 'ios'
  | 'flutter'
  | 'react-native'
  | 'harmony'
  | 'web'
  | 'miniprogram'
  | 'dotnet'

export type AdapterId =
  | 'android-xml'
  | 'ios-xib'
  | 'android-compose'
  | 'ios-swiftui'
  | 'android-view-java'
  | 'android-view-kotlin'
  | 'ios-uikit-objc'
  | 'ios-uikit-swift'
  | 'flutter'
  | 'react-native'
  | 'harmony-arkui'
  | 'web-html'
  | 'web-react'
  | 'web-vue'
  | 'web-svelte'
  | 'web-angular'
  | 'miniprogram-wxml'
  | 'miniprogram-axml'
  | 'miniprogram-ttml'
  | 'miniprogram-swan'
  | 'uni-app'
  | 'taro'
  | 'maui-xaml'

/**
 * Compact, deterministic signature of a code page used to match it against a
 * design screen. Never contains geometry that depends on a running app.
 */
export interface PageFingerprint {
  /** Normalised user-facing text strings present on the page. */
  texts: string[]
  /** Normalised tokens from the file / screen name. */
  nameTokens: string[]
  /** Approximate number of UI controls declared on the page. */
  controlCount: number
}

export interface CodePage {
  adapterId: AdapterId
  platform: PlatformId
  /** Human label for the implementation kind, e.g. "Android XML". */
  kindLabel: string
  relativePath: string
  absolutePath: string
  /** Whether property-level comparison is supported for this page. */
  precise: boolean
  fingerprint: PageFingerprint
}

/**
 * Optional capability flags so UI / flows need not infer from `precise` alone.
 * When omitted, callers should treat `precise` + `toDesignDoc` presence as L1.
 */
export interface AdapterCapabilities {
  discover: boolean
  heuristicCompare: boolean
  exactCompare: boolean
}

export interface PlatformAdapter {
  id: AdapterId
  platform: PlatformId
  kindLabel: string
  /** False when the adapter can only locate pages (cannot produce a diff). */
  precise: boolean
  /** Optional explicit capability declaration (plan §5). */
  capabilities?: AdapterCapabilities
  /** Enumerate candidate pages for this platform inside a checkout. */
  discoverPages(root: string): Promise<CodePage[]>
  /** Build the normalised doc for precise comparison. */
  toDesignDoc?(page: CodePage): Promise<DesignDoc>
}

/** Resolve capabilities from an adapter, deriving defaults when undeclared. */
export function resolveAdapterCapabilities(adapter: PlatformAdapter): AdapterCapabilities {
  if (adapter.capabilities) return adapter.capabilities
  return {
    discover: true,
    heuristicCompare: true,
    exactCompare: Boolean(adapter.precise && adapter.toDesignDoc),
  }
}
