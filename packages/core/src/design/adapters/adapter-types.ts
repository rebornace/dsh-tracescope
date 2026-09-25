/**
 * Platform adapter contract.
 *
 * Each native UI implementation (Android XML, iOS xib, Jetpack Compose,
 * SwiftUI, ...) is implemented as one adapter file and registered once. The
 * page-locator and the comparison engine then work against this common
 * interface, so adding a new platform is a single file plus a registry entry.
 */
import type { DesignDoc } from '../types.js'

export type PlatformId = 'android' | 'ios'

export type AdapterId =
  | 'android-xml'
  | 'ios-xib'
  | 'android-compose'
  | 'ios-swiftui'

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

export interface PlatformAdapter {
  id: AdapterId
  platform: PlatformId
  kindLabel: string
  /** False when the adapter can only locate pages (cannot produce a diff). */
  precise: boolean
  /** Enumerate candidate pages for this platform inside a checkout. */
  discoverPages(root: string): Promise<CodePage[]>
  /** Build the normalised doc for precise comparison. */
  toDesignDoc?(page: CodePage): Promise<DesignDoc>
}
