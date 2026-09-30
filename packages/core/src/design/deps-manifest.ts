/**
 * Static dependency-closure analysis for an Android layout.
 *
 * Inlining one layout XML into the AI prompt loses everything behind
 * `<include>`, `@drawable`, `@color`, `@dimen`, `@string` and `@style` (with
 * parent inheritance). This module instead computes the set of REAL source
 * files the entry layout depends on — recursively — and returns absolute paths
 * grouped by kind, so the prompt can hand the agent (a) the repo root and
 * (b) an exact reading list instead of asking it to guess or crawl the repo.
 *
 * Resolution mirrors {@link buildAndroidRenderContext}: merged module index,
 * app module / portrait layout preferred.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { AndroidProjectResources } from './android-resources.js'
import type { BuiltAndroidRenderContext } from './android-render-context.js'

export interface LayoutDependencyManifest {
  /** Entry layout absolute path. */
  entryLayout: string
  /** Layout files pulled in transitively through <include>. */
  layouts: string[]
  /** Drawable source files referenced by the layout (or by those drawables). */
  drawables: string[]
  /** values XML files containing referenced colors. */
  colorFiles: string[]
  /** values XML files containing referenced dimens. */
  dimenFiles: string[]
  /** values XML files containing referenced strings. */
  stringFiles: string[]
  /** values XML files holding referenced styles (parents included). */
  styleFiles: string[]
  /** Referenced symbols the index could not locate (so the AI knows gaps). */
  unresolved: Array<{ kind: string; name: string }>
}

interface RefSet {
  drawable: Set<string>
  color: Set<string>
  dimen: Set<string>
  string: Set<string>
  style: Set<string>
}

function newRefSet(): RefSet {
  return {
    drawable: new Set(),
    color: new Set(),
    dimen: new Set(),
    string: new Set(),
    style: new Set(),
  }
}

/** Extract every `@type/name` resource reference from an XML/string blob. */
function scanReferences(text: string, refs: RefSet): void {
  const re = /@(drawable|color|dimen|string|style|layout)\/([A-Za-z0-9_.-]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const type = m[1]
    const name = m[2]
    if (!type || !name) continue
    switch (type) {
      case 'drawable': refs.drawable.add(name); break
      case 'color': refs.color.add(name); break
      case 'dimen': refs.dimen.add(name); break
      case 'string': refs.string.add(name); break
      case 'style': refs.style.add(name); break
      case 'layout': /* handled via <include> expansion */ break
      default: break
    }
  }
}

/** Find a symbol's origin file by searching modules in (already merged) order. */
function findValueFile(
  resources: AndroidProjectResources,
  kind: 'colors' | 'dimens' | 'strings',
  name: string,
): string | undefined {
  for (const mod of resources.modules) {
    const file = mod.valueSources?.[kind]?.[name]
    if (file) return file
  }
  return undefined
}

function findDrawableFile(
  resources: AndroidProjectResources,
  name: string,
): string | undefined {
  for (const mod of resources.modules) {
    const file = mod.drawableSources?.[name]
    if (file) return file
  }
  return undefined
}

function findStyle(
  resources: AndroidProjectResources,
  name: string,
): { file: string; parent?: string } | undefined {
  for (const mod of resources.modules) {
    const style = mod.styles?.[name]
    if (style) return style
  }
  return undefined
}

/**
 * Compute the full dependency manifest of the entry layout.
 *
 * @param entryLayoutName base name of the entry layout (no extension/qualifier)
 * @param built           project render context (for <include> resolution)
 * @param resources       merged project resource index
 */
export async function analyzeLayoutDependencies(
  entryLayoutName: string,
  built: BuiltAndroidRenderContext,
  resources: AndroidProjectResources,
): Promise<LayoutDependencyManifest> {
  // 1) Walk the <include> graph, collecting every layout file and references.
  const visitedLayouts = new Set<string>()
  const layoutFiles: string[] = []
  const refs = newRefSet()
  let entryFile = ''

  const queue: string[] = [entryLayoutName]
  const seenNames = new Set<string>()
  while (queue.length) {
    const name = queue.shift()!
    if (seenNames.has(name)) continue
    seenNames.add(name)
    const resolved = await built.resolveLayoutEntry(name)
    if (!resolved) continue
    if (!entryFile) entryFile = resolved.file
    if (!visitedLayouts.has(resolved.file)) {
      visitedLayouts.add(resolved.file)
      layoutFiles.push(resolved.file)
    }
    // References inside this layout.
    scanReferences(resolved.content, refs)
    // Queue nested <include> targets.
    const includeRe = /<include\b[^>]*?\blayout\s*=\s*["']@layout\/([A-Za-z0-9_.-]+)["']/g
    let im: RegExpExecArray | null
    while ((im = includeRe.exec(resolved.content)) !== null) {
      if (im[1]) queue.push(im[1])
    }
  }

  // 2) Resolve referenced drawables; XML drawables may reference more symbols.
  const drawableFiles = new Set<string>()
  const extraDrawableRefs = newRefSet()
  for (const drawableName of refs.drawable) {
    const file = findDrawableFile(resources, drawableName)
    if (!file) continue
    drawableFiles.add(file)
    // Parse XML drawables (shape/selector/layer-list) for transitive refs.
    if (file.endsWith('.xml')) {
      try {
        const xml = await readFile(file, 'utf8')
        scanReferences(xml, extraDrawableRefs)
      } catch {
        /* unreadable drawable: keep its file listed */
      }
    }
  }
  for (const n of extraDrawableRefs.color) refs.color.add(n)
  for (const n of extraDrawableRefs.dimen) refs.dimen.add(n)
  for (const n of extraDrawableRefs.drawable) {
    if (!refs.drawable.has(n)) {
      refs.drawable.add(n)
      const f = findDrawableFile(resources, n)
      if (f) drawableFiles.add(f)
    }
  }

  // 3) Follow style inheritance (declared parent), collecting style files.
  const styleFiles = new Set<string>()
  const styleQueue = [...refs.style]
  const seenStyle = new Set<string>()
  while (styleQueue.length) {
    const styleName = styleQueue.shift()!
    if (seenStyle.has(styleName)) continue
    seenStyle.add(styleName)
    const style = findStyle(resources, styleName)
    if (!style) continue
    styleFiles.add(style.file)
    // Styles also reference colors/dimens/strings/other drawables; scan them.
    try {
      const xml = await readFile(style.file, 'utf8')
      scanReferences(xml, refs)
    } catch {
      /* keep the style file listed */
    }
    if (style.parent) {
      // Parent may be a fully-qualified platform name (android:...) we don't have.
      if (!/^android:/.test(style.parent)) styleQueue.push(style.parent)
    }
  }

  // 4) Resolve color/dimen/string symbol names to their values files.
  const colorFiles = new Set<string>()
  const dimenFiles = new Set<string>()
  const stringFiles = new Set<string>()
  const unresolved: LayoutDependencyManifest['unresolved'] = []
  for (const n of refs.color) {
    const f = findValueFile(resources, 'colors', n)
    if (f) colorFiles.add(f)
    else unresolved.push({ kind: 'color', name: n })
  }
  for (const n of refs.dimen) {
    const f = findValueFile(resources, 'dimens', n)
    if (f) dimenFiles.add(f)
    else unresolved.push({ kind: 'dimen', name: n })
  }
  for (const n of refs.string) {
    const f = findValueFile(resources, 'strings', n)
    if (f) stringFiles.add(f)
    else unresolved.push({ kind: 'string', name: n })
  }
  for (const n of refs.drawable) {
    if (!findDrawableFile(resources, n)) unresolved.push({ kind: 'drawable', name: n })
  }
  for (const n of refs.style) {
    if (!findStyle(resources, n)) unresolved.push({ kind: 'style', name: n })
  }

  return {
    entryLayout: entryFile || layoutFiles[0] || '',
    layouts: dedupeExcludingEntry(layoutFiles, entryFile),
    drawables: [...drawableFiles].sort(),
    colorFiles: [...colorFiles].sort(),
    dimenFiles: [...dimenFiles].sort(),
    stringFiles: [...stringFiles].sort(),
    styleFiles: [...styleFiles].sort(),
    unresolved,
  }
}

function dedupeExcludingEntry(files: string[], entry: string): string[] {
  return [...new Set(files)].filter((f) => f !== entry).sort()
}

/** Render the manifest as a readable, relative-path reading list for a prompt. */
export function formatDependencyManifest(manifest: LayoutDependencyManifest, repoRoot: string): string {
  const rel = (file: string): string => {
    const r = path.relative(repoRoot, file)
    return r && !r.startsWith('..') ? r.replace(/\\/g, '/') : file
  }
  const sections: Array<[string, string[]]> = [
    ['入口布局', manifest.entryLayout ? [rel(manifest.entryLayout)] : []],
    ['通过 <include> 引入的布局', manifest.layouts.map(rel)],
    ['引用的 drawable（含位图与 shape/selector）', manifest.drawables.map(rel)],
    ['样式 style（含 parent 继承链）', manifest.styleFiles.map(rel)],
    ['颜色 color 定义文件', manifest.colorFiles.map(rel)],
    ['尺寸 dimen 定义文件', manifest.dimenFiles.map(rel)],
    ['文案 string 定义文件', manifest.stringFiles.map(rel)],
  ]
  const lines: string[] = []
  for (const [title, files] of sections) {
    if (!files.length) continue
    lines.push(`- ${title}：`)
    for (const f of files) lines.push(`  - ${f}`)
  }
  if (manifest.unresolved.length) {
    lines.push('- 索引中未定位到的引用（可能来自远程依赖或平台，需要时再确认）：')
    for (const u of manifest.unresolved.slice(0, 30)) {
      lines.push(`  - @${u.kind}/${u.name}`)
    }
  }
  return lines.join('\n')
}
