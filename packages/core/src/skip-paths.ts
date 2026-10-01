/**
 * Shared directory / path skip rules for source indexing and filesystem walks.
 * Keep dependency, build, and IDE junk out of analysis and design discovery.
 */
export const SKIP_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  'miniprogram_npm',
  'bower_components',
  'build',
  'dist',
  'out',
  'target',
  'bin',
  'obj',
  'Pods',
  'DerivedData',
  'Carthage',
  '.dart_tool',
  '.gradle',
  '.idea',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
  '.cache',
  '.build',
  'coverage',
  '__pycache__',
  'vendor',
  'venv',
  '.venv',
])

/** True when any path segment is a known skip directory. */
export function pathHasSkippedSegment(rel: string): boolean {
  const parts = rel.replace(/\\/g, '/').split('/')
  return parts.some((p) => SKIP_DIR_NAMES.has(p))
}
