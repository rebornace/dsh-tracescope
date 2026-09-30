/**
 * Pixel-diff engine for the "screenshot vs design" branch.
 *
 * Both inputs are decoded and resized to the SAME dimensions by the caller, so
 * this module never deals with image formats or geometry — it compares raw
 * RGBA buffers and groups changed pixels into connected discrepancy REGIONS.
 *
 * Why regions and not a pixel dump: a reviewer needs to know "this block / this
 * icon is off and by how much", not a wall of per-pixel flags. We therefore:
 *   1. compute a perceptual-ish colour distance per pixel;
 *   2. threshold it into a binary changed mask (with a tolerance that absorbs
 *      light JPEG/resize noise);
 *   3. label connected components (8-connectivity) and emit each component's
 *      bounding box, changed-pixel count and an average delta.
 *
 * The functions here are pure and dependency-free so they run under Node
 * (vitest) with tiny hand-built buffers.
 */

/** Raw RGBA image in the same shape the DOM `ImageData` uses. */
export interface PixelImage {
  width: number
  height: number
  /** length === width * height * 4, channels R,G,B,A in that order. */
  data: Uint8Array | Uint8ClampedArray
}

/** One connected discrepancy region, coordinates in normalized pixels. */
export interface DiffRegion {
  id: number
  x: number
  y: number
  width: number
  height: number
  /** Number of changed pixels inside the bounding box. */
  changedPixels: number
  /** Bounding-box area. */
  boxArea: number
  /** Fraction of the box that changed (0..1): dense block vs sparse edge. */
  density: number
  /** Mean perceptual distance over the changed pixels (0..1). */
  meanDelta: number
  /** Severity from size + intensity. */
  severity: 'high' | 'medium' | 'low'
}

export interface PixelDiffResult {
  width: number
  height: number
  /** Total changed pixels after thresholding. */
  changedPixels: number
  /** Fraction of the whole image that changed (0..1). */
  changedRatio: number
  /** Mean perceptual distance over changed pixels (0..1). */
  meanDelta: number
  regions: DiffRegion[]
}

export interface PixelDiffOptions {
  /**
   * Per-pixel distance threshold (0..1). Pixels below this count as equal.
   * A small non-zero value absorbs compression / resize noise.
   */
  threshold?: number
  /**
   * Drop changed components smaller than this many pixels, so isolated
   * anti-aliasing speckles don't become regions.
   */
  minRegionPixels?: number
  /** Ignore pixels whose source OR target alpha is below this (0..255). */
  alphaCutoff?: number
}

/**
 * Perceptual colour distance between two pixels, normalised to 0..1.
 *
 * Uses a weighted RGB distance (green weighs more, blue less) which tracks
 * human sensitivity better than a flat euclidean average.
 */
export function pixelDistance(
  data: ArrayLike<number>,
  a: ArrayLike<number>,
  i: number,
  j: number,
): number {
  const dr = data[i]! - a[j]!
  const dg = data[i + 1]! - a[j + 1]!
  const db = data[i + 2]! - a[j + 2]!
  const da = data[i + 3]! - a[j + 3]!
  // Normalise RGB distance: weighted-squared max is 255^2*(.299+.587+.114)=255^2.
  const rgb = Math.sqrt(
    (0.299 * dr * dr + 0.587 * dg * dg + 0.114 * db * db),
  ) / 255
  const alpha = Math.abs(da) / 255
  // Alpha change matters fully; combine so a fully transparent->opaque edge is 1.
  return Math.min(1, rgb * 0.85 + alpha * 0.5)
}

/**
 * Compare two equally-sized RGBA images and cluster the differences.
 */
export function diffPixelImages(
  expected: PixelImage,
  actual: PixelImage,
  options: PixelDiffOptions = {},
): PixelDiffResult {
  if (expected.width !== actual.width || expected.height !== actual.height) {
    throw new Error(
      `尺寸不一致：${expected.width}x${expected.height} vs ${actual.width}x${actual.height}`,
    )
  }
  const width = expected.width
  const height = expected.height
  const threshold = options.threshold ?? 0.08
  const minRegionPixels = options.minRegionPixels ?? 12
  const alphaCutoff = options.alphaCutoff ?? 8

  const n = width * height
  // Per-pixel changed flag + accumulated delta.
  const changed = new Uint8Array(n)
  const deltas = new Float32Array(n)
  let changedPixels = 0
  let deltaSum = 0

  for (let p = 0; p < n; p++) {
    const i = p * 4
    // Treat both-empty pixels as equal regardless of RGB.
    const bothEmpty =
      expected.data[i + 3]! < alphaCutoff && actual.data[i + 3]! < alphaCutoff
    if (bothEmpty) continue
    const d = pixelDistance(expected.data, actual.data, i, i)
    if (d >= threshold) {
      changed[p] = 1
      deltas[p] = d
      changedPixels += 1
      deltaSum += d
    }
  }

  const regions = labelRegions(changed, deltas, width, height, minRegionPixels)

  return {
    width,
    height,
    changedPixels,
    changedRatio: n ? changedPixels / n : 0,
    meanDelta: changedPixels ? deltaSum / changedPixels : 0,
    regions,
  }
}

/**
 * Label 8-connected components in the binary mask with an iterative BFS
 * (avoids recursion blowing up on a large frame). Computes each component's
 * box, density and mean delta and assigns severity.
 */
function labelRegions(
  changed: Uint8Array,
  deltas: Float32Array,
  width: number,
  height: number,
  minRegionPixels: number,
): DiffRegion[] {
  const n = width * height
  const labels = new Int32Array(n) // 0 = unvisited for changed pixels
  const regions: DiffRegion[] = []
  const queue: number[] = []
  let regionId = 0

  for (let start = 0; start < n; start++) {
    if (!changed[start] || labels[start]) continue
    regionId += 1
    labels[start] = regionId
    queue.length = 0
    queue.push(start)

    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1
    let count = 0
    let deltaSum = 0

    while (queue.length) {
      const p = queue.pop()!
      const x = p % width
      const y = (p / width) | 0
      count += 1
      deltaSum += deltas[p] ?? 0
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y

      // 8-neighbourhood.
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const np = ny * width + nx
          if (changed[np] && !labels[np]) {
            labels[np] = regionId
            queue.push(np)
          }
        }
      }
    }

    if (count < minRegionPixels) continue

    const boxWidth = maxX - minX + 1
    const boxHeight = maxY - minY + 1
    const boxArea = boxWidth * boxHeight
    const meanDelta = count ? deltaSum / count : 0
    regions.push({
      id: regions.length + 1,
      x: minX,
      y: minY,
      width: boxWidth,
      height: boxHeight,
      changedPixels: count,
      boxArea,
      density: boxArea ? count / boxArea : 0,
      meanDelta,
      severity: classifySeverity(count, n, meanDelta),
    })
  }

  // Largest/strongest regions first.
  regions.sort((a, b) => b.changedPixels - a.changedPixels)
  // Re-number after sorting so ids read top-to-bottom.
  regions.forEach((r, i) => {
    r.id = i + 1
  })
  return regions
}

/**
 * Severity blends how big the region is (relative to the frame) with how
 * strongly it changed. A large OR very different region is high; a faint small
 * drift is low.
 */
function classifySeverity(
  pixels: number,
  totalPixels: number,
  meanDelta: number,
): DiffRegion['severity'] {
  const sizeShare = totalPixels ? pixels / totalPixels : 0
  const score = sizeShare * 0.6 + meanDelta * 0.4
  if (score >= 0.06 || meanDelta >= 0.45) return 'high'
  if (score >= 0.015 || meanDelta >= 0.22) return 'medium'
  return 'low'
}
