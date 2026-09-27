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

export interface ParsedDrawableShape {
  kind: 'shape'
  shape: string
  backgroundColor?: string
  cornerRadius?: number
  stroke?: { width: number; color: string }
  gradient?: {
    angle: number
    startColor?: string
    endColor?: string
    centerColor?: string
  }
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
  const ref = raw.match(/^@dimen\/(.+)$/)
  if (ref) {
    const v = values.dimens[ref[1] ?? '']
    return v
  }
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

/** Parse a <shape> XML drawable into a CSS-friendly description. */
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

  // Only simple <shape> is converted precisely; selector/layer-list/ripple are
  // reported unsupported so the renderer shows a neutral placeholder.
  if (root.tag !== 'shape') return { kind: 'unsupported', raw: root.tag }

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
    shape.gradient = {
      angle: Number(attr(gradient, 'android:angle') ?? 0),
      startColor: resolveColor(attr(gradient, 'android:startColor'), values),
      endColor: resolveColor(attr(gradient, 'android:endColor'), values),
      centerColor: resolveColor(attr(gradient, 'android:centerColor'), values),
    }
  }
  return shape
}

/** Discover every `res` root under the project (each Android module has one). */
async function findResRoots(projectRoot: string): Promise<string[]> {
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
async function parseValueResources(resRoot: string): Promise<AndroidValueResources> {
  const raw: AndroidResources = { dimens: {}, colors: {} }
  const strings: Record<string, string> = {}
  const pendingColors: Array<{ name: string; value: string }> = []
  const pendingDimens: Array<{ name: string; value: string }> = []

  let valueDirs: string[] = []
  try {
    valueDirs = (await readdir(resRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && d.name.startsWith('values'))
      .map((d) => path.join(resRoot, d.name))
  } catch {
    return { colors: {}, dimens: {}, strings: {} }
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
      let root: XmlElement
      try {
        root = parseXml(await readFile(path.join(dir, name), 'utf8'))
      } catch {
        continue
      }
      for (const el of root.children) {
        const key = el.attrs.name
        if (!key) continue
        if (el.tag === 'color') pendingColors.push({ name: key, value: el.text })
        else if (el.tag === 'dimen') pendingDimens.push({ name: key, value: el.text })
        else if (el.tag === 'string') strings[key] = el.text
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

  return {
    colors: raw.colors,
    dimens: Object.fromEntries(
      Object.entries(raw.dimens).map(([k, v]) => [k, v.value]),
    ),
    strings,
  }
}

/** Index every drawable name; best bitmap per density, parsed shape XML. */
async function indexDrawables(
  resRoot: string,
  values: AndroidValueResources,
): Promise<Record<string, ParsedDrawable>> {
  const result: Record<string, ParsedDrawable> = {}
  let dirs: string[] = []
  try {
    dirs = (await readdir(resRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && d.name.startsWith('drawable'))
      .map((d) => path.join(resRoot, d.name))
  } catch {
    return result
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
        if (result[name]) continue // already have a higher-density copy
        result[name] = await readBitmap(full, dir)
      } else if (ext === 'xml') {
        // XML shapes may live in the default drawable dir; never overwrite a
        // higher-density bitmap already chosen.
        if (!result[name]) {
          result[name] = parseShapeDrawable(await readFile(full, 'utf8'), values)
        }
      }
    }
  }
  return result
}

/** Build the full resource index for an Android project. */
export async function loadAndroidProjectResources(
  projectRoot: string,
): Promise<AndroidProjectResources> {
  const resRoots = await findResRoots(projectRoot)
  const modules: AndroidModuleResources[] = []
  for (const resRoot of resRoots) {
    const values = await parseValueResources(resRoot)
    const drawables = await indexDrawables(resRoot, values)
    modules.push({
      moduleRoot: path.dirname(resRoot),
      resRoot,
      values,
      drawables,
    })
  }
  return { modules }
}

export { EMPTY_ANDROID_RESOURCES }
