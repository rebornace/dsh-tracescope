/**
 * Android resource pipeline for high-fidelity static rendering.
 *
 * Indexes every module's `res` root: parsed `values` (colors / dimens / strings)
 * and `drawable*` resources. Bitmaps are read as data URLs; shape XML drawables
 * are parsed into a CSS-friendly description. This gives the layout renderer
 * everything needed to paint a near-real screen without a device.
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseXml, type XmlElement } from './xml-lite.js'
import {
  parseAndroidDimension,
  normalizeAndroidColor,
  EMPTY_ANDROID_RESOURCES,
  type AndroidResources,
} from './adapters/android-xml.js'
import type { DesignGradient, GradientStop } from './types.js'

export interface ParsedDrawableShape {
  kind: 'shape'
  shape: string
  backgroundColor?: string
  cornerRadius?: number
  stroke?: { width: number; color: string }
  gradient?: DesignGradient
}

export interface ParsedDrawableBitmap {
  kind: 'bitmap'
  dataUrl: string
  /** Physical pixel size read from the file header. */
  pixelWidth?: number
  pixelHeight?: number
  /** Density multiplier of the source qualifier (e.g. 3 for xxhdpi). */
  density: number
}

export interface ParsedDrawableUnsupported {
  kind: 'unsupported'
  raw: string
}

export type ParsedDrawable =
  | ParsedDrawableShape
  | ParsedDrawableBitmap
  | ParsedDrawableUnsupported

export interface AndroidValueResources {
  colors: Record<string, string>
  dimens: Record<string, number>
  strings: Record<string, string>
}

export interface AndroidModuleResources {
  moduleRoot: string
  resRoot: string
  values: AndroidValueResources
  drawables: Record<string, ParsedDrawable>
  /**
   * Origin file (absolute path) of each indexed drawable name. Populated so the
   * AI dependency manifest can point at the exact drawable source rather than
   * guessing which density/qualifier file is relevant.
   */
  drawableSources?: Record<string, string>
  /**
   * Origin file (absolute path) of each indexed color/dimen/string name. Names
   * are unique per type after merging, so a single file path per symbol.
   */
  valueSources?: {
    colors: Record<string, string>
    dimens: Record<string, string>
    strings: Record<string, string>
  }
  /**
   * Indexed <style> declarations by name: origin file (absolute path) and the
   * declared `parent` style (for following style inheritance). Built so the AI
   * dependency manifest can pull in the full style chain.
   */
  styles?: Record<string, { file: string; parent?: string }>
}

export interface AndroidProjectResources {
  modules: AndroidModuleResources[]
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

// Qualifier rank: smaller = higher density (preferred when a name repeats).
const DENSITY_ORDER = ['xxxhdpi', 'xxhdpi', 'xhdpi', 'hdpi', 'mdpi']
function densityRank(dir: string): number {
  for (let i = 0; i < DENSITY_ORDER.length; i += 1) {
    if (dir.includes('-' + DENSITY_ORDER[i])) return i
  }
  return DENSITY_ORDER.length
}

function densityMultiplier(dir: string): number {
  for (const d of DENSITY_ORDER) {
    if (d && dir.includes('-' + d)) {
      switch (d) {
        case 'xxxhdpi': return 4
        case 'xxhdpi': return 3
        case 'xhdpi': return 2
        case 'hdpi': return 1.5
        case 'mdpi': return 1
      }
    }
  }
  return 1
}

/** Read intrinsic pixel size from PNG/JPEG/GIF/WebP headers (best effort). */
function imagePixelSize(buffer: Buffer, ext: string): { w: number; h: number } | undefined {
  if (ext === 'png') {
    // 8-byte signature, then IHDR: length(4) 'IHDR'(4) width(4) height(4).
    if (buffer.length >= 24) {
      return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) }
    }
  } else if (ext === 'gif' && buffer.length >= 10) {
    return { w: buffer.readUInt16LE(6), h: buffer.readUInt16LE(8) }
  } else if (ext === 'jpg' || ext === 'jpeg') {
    // Walk JPEG markers to find SOF0/SOF2 which carries the frame size.
    let p = 2
    while (p + 9 < buffer.length) {
      if (buffer[p] !== 0xff) { p += 1; continue }
      const marker = buffer[p + 1]
      if (marker === undefined) break
      p += 2
      // Markers with no payload.
      if (marker >= 0xd0 && marker <= 0xd9) continue
      if (p + 2 > buffer.length) break
      const segLen = buffer.readUInt16BE(p)
      if (marker === 0xc0 || marker === 0xc2) {
        return { h: buffer.readUInt16BE(p + 3), w: buffer.readUInt16BE(p + 5) }
      }
      p += segLen
    }
  }
  return undefined
}

async function readBitmap(file: string, dir: string): Promise<ParsedDrawableBitmap> {
  const buffer = await readFile(file)
  const ext = path.extname(file).slice(1).toLowerCase()
  const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream'
  const px = imagePixelSize(buffer, ext)
  return {
    kind: 'bitmap',
    dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
    pixelWidth: px?.w,
    pixelHeight: px?.h,
    density: densityMultiplier(dir),
  }
}

function attr(el: XmlElement, name: string): string | undefined {
  return el.attrs[name]
}

/** Resolve a possibly-referenced color via the parsed value tables. */
function resolveColor(
  raw: string | undefined,
  values: AndroidValueResources,
): string | undefined {
  if (!raw) return undefined
  const ref = raw.match(/^@color\/(.+)$/)
  if (ref) return values.colors[ref[1] ?? '']
  return normalizeAndroidColor(raw, EMPTY_ANDROID_RESOURCES) as string | undefined
}

/** Resolve a possibly-referenced dimension (radius/width) to a number. */
function resolveDimen(
  raw: string | undefined,
  values: AndroidValueResources,
): number | undefined {
  if (raw === undefined) return undefined
  const ref = raw.trim().match(/^@dimen\/(.+)$/)
  if (ref) {
    return values.dimens[ref[1] ?? '']
  }
  // Strip the Android unit: shape drawables write "100dp"/"1dp"/"8px". A bare
  // Number("100dp") is NaN, which silently dropped the corner radius.
  const unit = raw.trim().match(/^(-?\d+(?:\.\d+)?)(dp|dip|px|sp|pt|in|mm)?$/i)
  if (unit) return Number(unit[1])
  return undefined
}

/** Parse a `<shape>` element into a CSS-friendly description. */
function parseShapeElement(
  root: XmlElement,
  values: AndroidValueResources,
): ParsedDrawableShape {
  const shape: ParsedDrawableShape = {
    kind: 'shape',
    shape: attr(root, 'android:shape') ?? 'rectangle',
  }
  const solid = root.children.find((c) => c.tag === 'solid')
  if (solid) shape.backgroundColor = resolveColor(attr(solid, 'android:color'), values)
  const corners = root.children.find((c) => c.tag === 'corners')
  shape.cornerRadius = corners
    ? resolveDimen(attr(corners, 'android:radius'), values)
    : undefined
  const stroke = root.children.find((c) => c.tag === 'stroke')
  if (stroke) {
    shape.stroke = {
      width: resolveDimen(attr(stroke, 'android:width'), values) ?? 0,
      color: resolveColor(attr(stroke, 'android:color'), values) ?? '#000000',
    }
  }
  const gradient = root.children.find((c) => c.tag === 'gradient')
  if (gradient) {
    const startColor = resolveColor(attr(gradient, 'android:startColor'), values)
    const endColor = resolveColor(attr(gradient, 'android:endColor'), values)
    const centerColor = resolveColor(attr(gradient, 'android:centerColor'), values)
    const androidType = attr(gradient, 'android:type')
    // Default Android linear gradient runs left->right when no start/end given.
    const stops: GradientStop[] = []
    if (startColor) stops.push({ color: startColor, position: 0 })
    if (centerColor) stops.push({ color: centerColor, position: 0.5 })
    if (endColor) stops.push({ color: endColor, position: 1 })
    if (stops.length >= 2) {
      const androidAngle = Number(attr(gradient, 'android:angle') ?? 0)
      // Android 0 = left->right (=CSS 90deg), 90 = bottom->top (=CSS 0deg).
      const cssAngle = (90 - androidAngle + 360) % 360
      shape.gradient = {
        type: androidType === 'radial' ? 'radial' : 'linear',
        cssAngle,
        stops,
      }
    }
  }
  return shape
}

/** Flatten `<layer-list>` / `<level-list>`: topmost / highest-level solid wins. */
function parseLayerListDrawable(
  root: XmlElement,
  values: AndroidValueResources,
): ParsedDrawable {
  let backgroundColor: string | undefined
  let cornerRadius: number | undefined
  let stroke: ParsedDrawableShape['stroke']
  let gradient: DesignGradient | undefined
  let bestLevel = -Infinity
  const isLevelList = root.tag === 'level-list'
  for (const item of root.children) {
    if (item.tag !== 'item') continue
    const rawLevel = item.attrs['android:maxLevel'] ?? item.attrs['android:minLevel']
    const level =
      isLevelList && rawLevel !== undefined && Number.isFinite(Number(rawLevel))
        ? Number(rawLevel)
        : bestLevel + 1
    if (isLevelList && level < bestLevel) continue
    const drawable = attr(item, 'android:drawable')
    if (drawable?.startsWith('@drawable/')) {
      continue
    }
    const color = resolveColor(attr(item, 'android:color'), values)
    let got = false
    if (color) {
      backgroundColor = color
      got = true
    }
    for (const child of item.children) {
      if (child.tag === 'shape') {
        const layer = parseShapeElement(child, values)
        if (layer.backgroundColor) backgroundColor = layer.backgroundColor
        if (layer.cornerRadius !== undefined) cornerRadius = layer.cornerRadius
        if (layer.stroke) stroke = layer.stroke
        if (layer.gradient) gradient = layer.gradient
        got = true
      }
    }
    if (got) bestLevel = level
  }
  if (!backgroundColor && cornerRadius === undefined && !stroke && !gradient) {
    return { kind: 'unsupported', raw: root.tag }
  }
  return {
    kind: 'shape',
    shape: 'rectangle',
    backgroundColor,
    cornerRadius,
    stroke,
    gradient,
  }
}

/** Unwrap `<inset>` / `<clip>` / `<scale>` / `<rotate>` to the nested shape fill. */
function parseInsetDrawable(
  root: XmlElement,
  values: AndroidValueResources,
): ParsedDrawable {
  for (const child of root.children) {
    if (child.tag === 'shape') return parseShapeElement(child, values)
    if (child.tag === 'layer-list') return parseLayerListDrawable(child, values)
    if (
      child.tag === 'inset' ||
      child.tag === 'clip' ||
      child.tag === 'scale' ||
      child.tag === 'rotate'
    ) {
      return parseInsetDrawable(child, values)
    }
  }
  return { kind: 'unsupported', raw: root.tag }
}

/** Parse shape / layer-list / inset / clip / scale / rotate XML drawable. */
function parseShapeDrawable(
  xml: string,
  values: AndroidValueResources,
): ParsedDrawable {
  let root: XmlElement
  try {
    root = parseXml(xml)
  } catch {
    return { kind: 'unsupported', raw: 'invalid-xml' }
  }

  if (root.tag === 'shape') return parseShapeElement(root, values)
  if (root.tag === 'layer-list' || root.tag === 'level-list') {
    return parseLayerListDrawable(root, values)
  }
  if (
    root.tag === 'inset' ||
    root.tag === 'clip' ||
    root.tag === 'scale' ||
    root.tag === 'rotate'
  ) {
    return parseInsetDrawable(root, values)
  }
  // transition / animation-list / ripple / vector
  if (
    root.tag === 'transition' ||
    root.tag === 'animation-list' ||
    root.tag === 'animated-selector' ||
    root.tag === 'ripple'
  ) {
    let maskRadius: number | undefined
    for (const item of root.children) {
      if (item.tag !== 'item') continue
      const isMask = /mask/i.test(item.attrs['android:id'] ?? '')
      for (const child of item.children) {
        if (child.tag === 'shape') {
          const shape = parseShapeElement(child, values)
          if (isMask) {
            if (shape.cornerRadius !== undefined) maskRadius = shape.cornerRadius
            continue
          }
          if (maskRadius !== undefined && shape.cornerRadius === undefined) {
            shape.cornerRadius = maskRadius
          }
          return shape
        }
      }
      if (isMask) continue
      const color = resolveColor(attr(item, 'android:color'), values)
      if (color) {
        return {
          kind: 'shape',
          shape: 'rectangle',
          backgroundColor: color,
          cornerRadius: maskRadius,
        }
      }
    }
    if (root.tag === 'ripple') {
      const rippleColor = resolveColor(attr(root, 'android:color'), values)
      if (rippleColor) {
        return {
          kind: 'shape',
          shape: 'rectangle',
          backgroundColor: rippleColor,
          cornerRadius: maskRadius,
        }
      }
    }
    return { kind: 'unsupported', raw: root.tag }
  }
  if (root.tag === 'vector') {
    const tint = resolveColor(attr(root, 'android:tint'), values)
    if (tint) return { kind: 'shape', shape: 'rectangle', backgroundColor: tint }
    const walk = (el: XmlElement): ParsedDrawable | undefined => {
      if (el.tag === 'path') {
        const fill = resolveColor(attr(el, 'android:fillColor'), values)
        if (fill) return { kind: 'shape', shape: 'rectangle', backgroundColor: fill }
      }
      for (const child of el.children) {
        const hit = walk(child)
        if (hit) return hit
      }
      return undefined
    }
    return walk(root) ?? { kind: 'unsupported', raw: 'vector' }
  }
  if (root.tag === 'adaptive-icon') {
    let backgroundColor: string | undefined
    for (const child of root.children) {
      if (child.tag !== 'background' && child.tag !== 'foreground') continue
      const drawable = attr(child, 'android:drawable')
      if (drawable?.startsWith('@color/') || drawable?.startsWith('#')) {
        const c = resolveColor(drawable, values)
        if (c && child.tag === 'background') backgroundColor = c
        else if (c && !backgroundColor) backgroundColor = c
      }
      for (const nested of child.children) {
        if (nested.tag === 'shape') {
          const shape = parseShapeElement(nested, values)
          if (shape.backgroundColor && (child.tag === 'background' || !backgroundColor)) {
            backgroundColor = shape.backgroundColor
          }
        }
        if (nested.tag === 'vector') {
          const tint = resolveColor(attr(nested, 'android:tint'), values)
          const fill = nested.children.find((c) => c.tag === 'path')
          const pathFill = fill ? resolveColor(attr(fill, 'android:fillColor'), values) : undefined
          const c = tint ?? pathFill
          if (c && (child.tag === 'background' || !backgroundColor)) backgroundColor = c
        }
      }
    }
    if (backgroundColor) {
      return { kind: 'shape', shape: 'rectangle', backgroundColor, cornerRadius: 18 }
    }
    return { kind: 'unsupported', raw: 'adaptive-icon' }
  }
  // selector remain unsupported placeholders for the hifi renderer.
  return { kind: 'unsupported', raw: root.tag }
}

/** Discover every `res` root under the project (each Android module has one). */
export async function findResRoots(projectRoot: string): Promise<string[]> {
  const roots = new Set<string>()
  async function walk(dir: string, depth: number) {
    if (depth > 10) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === '.git' || entry.name === 'build' || entry.name === 'node_modules') continue
      const full = path.join(dir, entry.name)
      if (entry.name === 'res') {
        // Confirm it looks like an Android res root.
        try {
          const sub = await readdir(full)
          if (sub.some((s) => /^(values|layout|drawable)/.test(s))) roots.add(full)
        } catch {
          /* ignore */
        }
      }
      await walk(full, depth + 1)
    }
  }
  await walk(projectRoot, 0)
  return [...roots]
}

/** Read & parse every values XML into resolved colors / dimens / strings. */
export interface AndroidValueResourcesWithSources {
  values: AndroidValueResources
  sources: {
    colors: Record<string, string>
    dimens: Record<string, string>
    strings: Record<string, string>
  }
  /** <style> declarations found in this module's values (name -> file/parent). */
  styles: Record<string, { file: string; parent?: string }>
}

async function parseValueResources(resRoot: string): Promise<AndroidValueResourcesWithSources> {
  const raw: AndroidResources = {
    dimens: {},
    colors: {},
    strings: {},
    styles: {},
    styleParents: {},
    attrs: {},
    drawables: {},
  }
  const strings: Record<string, string> = {}
  const pendingColors: Array<{ name: string; value: string }> = []
  const pendingDimens: Array<{ name: string; value: string }> = []
  // Remember which file each declared symbol came from (first declaration).
  const declaredFile: Record<string, string> = {}
  // Style declarations captured directly: name -> { file, parent }.
  const styles: Record<string, { file: string; parent?: string }> = {}

  let valueDirs: string[] = []
  try {
    valueDirs = (await readdir(resRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && d.name.startsWith('values'))
      .map((d) => path.join(resRoot, d.name))
  } catch {
    return {
      values: { colors: {}, dimens: {}, strings: {} },
      sources: { colors: {}, dimens: {}, strings: {} },
      styles: {},
    }
  }

  for (const dir of valueDirs) {
    let names: string[] = []
    try {
      names = await readdir(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.endsWith('.xml')) continue
      const valueFile = path.join(dir, name)
      let root: XmlElement
      try {
        root = parseXml(await readFile(valueFile, 'utf8'))
      } catch {
        continue
      }
      for (const el of root.children) {
        const key = el.attrs.name
        if (!key) continue
        // Record the origin file the first time the symbol is declared.
        if (!declaredFile[`${el.tag}:${key}`]) declaredFile[`${el.tag}:${key}`] = valueFile
        if (el.tag === 'color') pendingColors.push({ name: key, value: el.text })
        else if (el.tag === 'dimen') pendingDimens.push({ name: key, value: el.text })
        else if (el.tag === 'string') strings[key] = el.text
        else if (el.tag === 'style') {
          if (!styles[key]) {
            const parentRaw = el.attrs.parent
            styles[key] = {
              file: valueFile,
              parent: typeof parentRaw === 'string' && parentRaw ? parentRaw : undefined,
            }
          }
        }
        else if (el.tag === 'item' && el.attrs.type === 'color') {
          pendingColors.push({ name: key, value: el.text })
        }
      }
    }
  }

  // Resolve dimens first (colors may reference them only rarely, but dimen
  // entries can reference other dimens). Iterate to settle @dimen chains.
  let dimenQueue = pendingDimens
  for (let pass = 0; pass < 3 && dimenQueue.length; pass += 1) {
    const rest: typeof pendingDimens = []
    for (const { name, value } of dimenQueue) {
      const parsed = parseAndroidDimension(value, raw)
      if (parsed && !('unresolved' in parsed)) {
        raw.dimens[name] = { value: parsed.value, unit: parsed.unit }
      } else if (parsed && 'unresolved' in parsed) {
        rest.push({ name, value })
      }
    }
    dimenQueue = rest
  }

  // Resolve colors, allowing @color references (iterate to settle chains).
  let colorQueue = pendingColors
  for (let pass = 0; pass < 3 && colorQueue.length; pass += 1) {
    const rest: typeof pendingColors = []
    for (const { name, value } of colorQueue) {
      const resolved = normalizeAndroidColor(value, raw)
      if (resolved && typeof resolved === 'string') raw.colors[name] = resolved
      else if (resolved && typeof resolved === 'object') rest.push({ name, value })
    }
    colorQueue = rest
  }

  // Build per-type origin-file maps from the recorded declarations. Item-based
  // colors are recorded under tag "item"; expose them alongside "color".
  const colorSources: Record<string, string> = {}
  for (const name of Object.keys(raw.colors)) {
    colorSources[name] = declaredFile[`color:${name}`] ?? declaredFile[`item:${name}`] ?? ''
  }
  const dimenSources: Record<string, string> = {}
  for (const name of Object.keys(raw.dimens)) {
    dimenSources[name] = declaredFile[`dimen:${name}`] ?? ''
  }
  const stringSources: Record<string, string> = {}
  for (const name of Object.keys(strings)) {
    stringSources[name] = declaredFile[`string:${name}`] ?? ''
  }

  const values: AndroidValueResources = {
    colors: raw.colors,
    dimens: Object.fromEntries(
      Object.entries(raw.dimens).map(([k, v]) => [k, v.value]),
    ),
    strings,
  }
  return {
    values,
    sources: { colors: colorSources, dimens: dimenSources, strings: stringSources },
    styles,
  }
}

/** Index every drawable name; best bitmap per density, parsed shape XML. */
export interface IndexedDrawables {
  drawables: Record<string, ParsedDrawable>
  /** Origin file (absolute path) chosen for each drawable name. */
  sources: Record<string, string>
}

async function indexDrawables(
  resRoot: string,
  values: AndroidValueResources,
): Promise<IndexedDrawables> {
  const drawables: Record<string, ParsedDrawable> = {}
  const sources: Record<string, string> = {}
  let dirs: string[] = []
  try {
    dirs = (await readdir(resRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && d.name.startsWith('drawable'))
      .map((d) => path.join(resRoot, d.name))
  } catch {
    return { drawables, sources }
  }

  // Sort dirs high -> low density so the first bitmap for a name wins.
  dirs.sort((a, b) => densityRank(a) - densityRank(b))
  for (const dir of dirs) {
    let files: string[] = []
    try {
      files = await readdir(dir)
    } catch {
      continue
    }
    for (const file of files) {
      const full = path.join(dir, file)
      const name = path.basename(file, path.extname(file))
      const ext = path.extname(file).slice(1).toLowerCase()
      if (MIME_BY_EXT[ext]) {
        if (drawables[name]) continue // already have a higher-density copy
        drawables[name] = await readBitmap(full, dir)
        sources[name] = full
      } else if (ext === 'xml') {
        // XML shapes may live in the default drawable dir; never overwrite a
        // higher-density bitmap already chosen.
        if (!drawables[name]) {
          drawables[name] = parseShapeDrawable(await readFile(full, 'utf8'), values)
          sources[name] = full
        }
      }
    }
  }
  return { drawables, sources }
}

/** Build the full resource index for an Android project. */
export async function loadAndroidProjectResources(
  projectRoot: string,
): Promise<AndroidProjectResources> {
  const resRoots = await findResRoots(projectRoot)
  const modules: AndroidModuleResources[] = []
  for (const resRoot of resRoots) {
    const parsed = await parseValueResources(resRoot)
    const indexed = await indexDrawables(resRoot, parsed.values)
    modules.push({
      moduleRoot: path.dirname(resRoot),
      resRoot,
      values: parsed.values,
      drawables: indexed.drawables,
      drawableSources: indexed.sources,
      valueSources: parsed.sources,
      styles: parsed.styles,
    })
  }
  return { modules }
}

export { EMPTY_ANDROID_RESOURCES }
