/**
 * Backwards-compatible layout discovery used by older routes until they move
 * to the design facade. Implemented on top of the platform adapters, so it
 * never duplicates scanning logic.
 *
 * @deprecated Use {@link discoverAllPages} / {@link locatePagesForDesign}.
 */
import type { CodePage } from './adapters/adapter-types.js'
import { discoverAllPages } from './index.js'

export type LayoutPlatform = 'android' | 'ios'

export interface DiscoveredLayout {
  path: string
  relativePath: string
  platform: LayoutPlatform
}

export type ProjectKind = 'android' | 'ios' | 'flutter' | 'react-native'

export interface RepoScanResult {
  layouts: DiscoveredLayout[]
  projectKinds: ProjectKind[]
  reactNativeConfirmed: boolean
}

function toLegacyLayout(page: CodePage): DiscoveredLayout {
  return {
    path: page.absolutePath,
    relativePath: page.relativePath,
    platform: page.platform,
  }
}

export async function discoverLayouts(repoRoot: string): Promise<RepoScanResult> {
  const pages = await discoverAllPages(repoRoot)
  const projectKinds = new Set<ProjectKind>()
  for (const page of pages) projectKinds.add(page.platform)
  return {
    layouts: pages
      // Legacy callers only understand the precise (XML) pages.
      .filter((p) => p.precise)
      .map(toLegacyLayout),
    projectKinds: [...projectKinds],
    reactNativeConfirmed: false,
  }
}
