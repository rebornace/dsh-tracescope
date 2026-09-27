/**
 * Build an {@link AndroidRenderContext} for a project from its parsed resource
 * index. Resources are merged module-by-module with the application module
 * taking precedence (library modules fill the gaps). Layout files needed by
 * `<include>` are read lazily and cached, so rendering never preloads every
 * layout in the project.
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { AndroidProjectResources } from './android-resources.js'
import type { AndroidRenderContext } from './android-layout-engine.js'

interface LayoutIndexEntry {
  file: string
  rank: number
}

function isAppModule(resRoot: string): boolean {
  const normalized = resRoot.split(path.sep).join('/')
  return /\/app\/src\/.*\/res$/.test(normalized) || /\\app\\src\\.*\\res$/.test(resRoot)
}

// Prefer a portrait/regular layout over -land; app module wins over libs.
function layoutQualifierRank(file: string): number {
  if (/[\\/]layout-land[\\/]/.test(file)) return 2
  if (/[\\/]layout-port[\\/]/.test(file)) return 1
  return 0
}

/** Index every layout file path by base name (app module, portrait preferred). */
async function indexLayoutFiles(
  projectRoot: string,
  resources: AndroidProjectResources,
): Promise<Map<string, LayoutIndexEntry>> {
  const index = new Map<string, LayoutIndexEntry>()
  // App modules first so their entries are inserted first (lower rank preferred).
  const modules = [...resources.modules].sort((a, b) => {
    const aa = isAppModule(a.resRoot) ? 0 : 1
    const bb = isAppModule(b.resRoot) ? 0 : 1
    return aa - bb
  })

  for (const module of modules) {
    const moduleBias = isAppModule(module.resRoot) ? 0 : 10
    let dirs: string[] = []
    try {
      dirs = (await readdir(module.resRoot, { withFileTypes: true }))
        .filter((d) => d.isDirectory() && d.name.startsWith('layout'))
        .map((d) => path.join(module.resRoot, d.name))
    } catch {
      continue
    }
    for (const dir of dirs) {
      let files: string[] = []
      try {
        files = await readdir(dir)
      } catch {
        continue
      }
      for (const file of files) {
        if (!file.endsWith('.xml')) continue
        const name = file.replace(/\.xml$/, '')
        const full = path.join(dir, file)
        const rank = moduleBias + layoutQualifierRank(full)
        const existing = index.get(name)
        if (!existing || rank < existing.rank) index.set(name, { file: full, rank })
      }
    }
  }
  void projectRoot
  return index
}

function mergeMissing<T>(target: Record<string, T>, source: Record<string, T>): void {
  for (const [key, value] of Object.entries(source)) {
    if (target[key] === undefined) target[key] = value
  }
}

export interface BuiltAndroidRenderContext {
  context: AndroidRenderContext
  resolveLayout: (name: string) => Promise<string | undefined>
}

/** Build the high-fidelity render context (merged resources, lazy includes). */
export async function buildAndroidRenderContext(
  projectRoot: string,
  resources: AndroidProjectResources,
): Promise<BuiltAndroidRenderContext> {
  const colors: Record<string, string> = {}
  const dimens: Record<string, number> = {}
  const strings: Record<string, string> = {}
  const drawables = {} as AndroidRenderContext['drawables']

  const modules = [...resources.modules].sort((a, b) => {
    const aa = isAppModule(a.resRoot) ? 0 : 1
    const bb = isAppModule(b.resRoot) ? 0 : 1
    return aa - bb
  })
  for (const module of modules) {
    mergeMissing(colors, module.values.colors)
    mergeMissing(dimens, module.values.dimens)
    mergeMissing(strings, module.values.strings)
    mergeMissing(drawables, module.drawables)
  }

  const layoutIndex = await indexLayoutFiles(projectRoot, resources)
  const cache = new Map<string, string>()
  async function resolveLayout(name: string): Promise<string | undefined> {
    const cached = cache.get(name)
    if (cached !== undefined) return cached
    const entry = layoutIndex.get(name)
    if (!entry) return undefined
    const content = await readFile(entry.file, 'utf8')
    cache.set(name, content)
    return content
  }

  return {
    context: { colors, dimens, strings, drawables, layouts: {} },
    resolveLayout,
  }
}
