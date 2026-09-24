/**
 * Discover UI layout files inside a repository so the caller never has to type
 * a layout path by hand.
 *
 * Recognises layout files:
 *  - Android: any XML directly under a `res/layout*` directory.
 *  - iOS:     `.xib` and `.storyboard` anywhere in the repo.
 *
 * Also detects high-level project kinds (Android / iOS / Flutter / React
 * Native) so the UI can explain *why* no comparable layouts were found — for
 * example a Jetpack Compose / SwiftUI / Flutter app has no XML to compare.
 *
 * The walk skips dependency / build output directories, so it stays fast.
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

export type LayoutPlatform = 'android' | 'ios'

export interface DiscoveredLayout {
  /** Absolute path of the layout file. */
  path: string
  /** Repo-relative path (POSIX separators) for display. */
  relativePath: string
  platform: LayoutPlatform
}

export type ProjectKind =
  | 'android'
  | 'ios'
  | 'flutter'
  | 'react-native'

/** Directories that never contain source layouts we want to inspect. */
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'build',
  'dist',
  '.gradle',
  '.idea',
  'Pods',
  'DerivedData',
  'Carthage',
  '.build',
  'out',
  'target',
  'bin',
  'obj',
])

const MAX_DEPTH = 12
const MAX_FILES = 2000
const MAX_SCANNED = 60_000

function toPosix(p: string): string {
  return p.split(path.sep).join('/')
}

export interface RepoScanResult {
  layouts: DiscoveredLayout[]
  projectKinds: ProjectKind[]
  /** True when a React Native package.json dependency was confirmed. */
  reactNativeConfirmed: boolean
}

/**
 * @param repoRoot Absolute path to a locally available repository checkout.
 */
export async function discoverLayouts(repoRoot: string): Promise<RepoScanResult> {
  const layouts: DiscoveredLayout[] = []
  const projectKinds = new Set<ProjectKind>()
  let scanned = 0
  let reactNativeConfirmed = false
  let stopped = false

  async function walk(dir: string, depth: number): Promise<void> {
    if (stopped || depth > MAX_DEPTH || layouts.length >= MAX_FILES) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    // If this directory is an Android `res/layout*` dir, only collect its XML.
    const base = path.basename(dir)
    const parentBase = path.basename(path.dirname(dir))
    const isAndroidLayoutDir = parentBase === 'res' && /^layout/.test(base)

    for (const entry of entries) {
      if (stopped) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        if (entry.name.startsWith('.')) continue
        await walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      scanned += 1
      if (scanned > MAX_SCANNED) {
        stopped = true
        return
      }

      // Layout files.
      let layoutPlatform: LayoutPlatform | undefined
      if (isAndroidLayoutDir && entry.name.endsWith('.xml')) layoutPlatform = 'android'
      else if (/\.xib$/i.test(entry.name) || /\.storyboard$/i.test(entry.name)) layoutPlatform = 'ios'
      if (layoutPlatform) {
        layouts.push({
          path: full,
          relativePath: toPosix(path.relative(repoRoot, full)),
          platform: layoutPlatform,
        })
      }

      // Project-kind markers (only inspect shallowly to bound IO).
      if (depth <= 3) {
        if (/^(build\.gradle(\.kts)?|settings\.gradle(\.kts)?)$/.test(entry.name)) {
          projectKinds.add('android')
        } else if (entry.name === 'AndroidManifest.xml') {
          projectKinds.add('android')
        } else if (/\.xcodeproj$/i.test(entry.name) || /\.xcworkspace$/i.test(entry.name)) {
          projectKinds.add('ios')
        } else if (entry.name === 'Podfile') {
          projectKinds.add('ios')
        } else if (entry.name === 'pubspec.yaml') {
          projectKinds.add('flutter')
        } else if (entry.name === 'package.json' && depth === 0) {
          try {
            const pkg = JSON.parse(await readFile(full, 'utf8')) as {
              dependencies?: Record<string, unknown>
              devDependencies?: Record<string, unknown>
            }
            const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
            if (deps['react-native']) {
              projectKinds.add('react-native')
              reactNativeConfirmed = true
            }
          } catch {
            /* ignore malformed package.json */
          }
        }
      }
    }
  }

  await walk(repoRoot, 0)
  layouts.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return {
    layouts,
    projectKinds: [...projectKinds],
    reactNativeConfirmed,
  }
}
