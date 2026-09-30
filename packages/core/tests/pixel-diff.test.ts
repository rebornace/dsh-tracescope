import { describe, expect, it } from 'vitest'
import { diffPixelImages, pixelDistance, type PixelImage } from '../src/pixel-diff.js'

/** Build a width*height RGBA buffer filled with one colour. */
function solid(width: number, height: number, c: [number, number, number, number]): PixelImage {
  const data = new Uint8Array(width * height * 4)
  for (let p = 0; p < width * height; p++) {
    data[p * 4] = c[0]
    data[p * 4 + 1] = c[1]
    data[p * 4 + 2] = c[2]
    data[p * 4 + 3] = c[3]
  }
  return { width, height, data }
}

/** Paint a filled rectangle onto an image (in place). */
function fillRect(
  img: PixelImage,
  x: number,
  y: number,
  w: number,
  h: number,
  c: [number, number, number, number],
): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      const p = j * img.width + i
      img.data[p * 4] = c[0]
      img.data[p * 4 + 1] = c[1]
      img.data[p * 4 + 2] = c[2]
      img.data[p * 4 + 3] = c[3]
    }
  }
}

describe('pixelDistance', () => {
  it('is 0 for identical pixels', () => {
    const a = new Uint8Array([10, 200, 30, 255])
    const b = new Uint8Array([10, 200, 30, 255])
    expect(pixelDistance(a, b, 0, 0)).toBe(0)
  })
  it('is high (~0.85) for black vs white', () => {
    const a = new Uint8Array([0, 0, 0, 255])
    const b = new Uint8Array([255, 255, 255, 255])
    // Pure RGB change is weighted to 0.85 (headroom reserved for alpha edges).
    expect(pixelDistance(a, b, 0, 0)).toBeGreaterThan(0.8)
  })
})

describe('diffPixelImages', () => {
  it('reports zero diffs for identical images', () => {
    const a = solid(20, 20, [12, 34, 56, 255])
    const b = solid(20, 20, [12, 34, 56, 255])
    const res = diffPixelImages(a, b)
    expect(res.changedPixels).toBe(0)
    expect(res.regions).toHaveLength(0)
  })

  it('clusters one filled block into a single region with correct box', () => {
    const expected = solid(40, 40, [255, 255, 255, 255])
    const actual = solid(40, 40, [255, 255, 255, 255])
    fillRect(actual, 10, 12, 8, 6, [0, 0, 0, 255])
    const res = diffPixelImages(expected, actual, { minRegionPixels: 1 })
    expect(res.regions).toHaveLength(1)
    const r = res.regions[0]!
    expect(r.x).toBe(10)
    expect(r.y).toBe(12)
    expect(r.width).toBe(8)
    expect(r.height).toBe(6)
    expect(r.changedPixels).toBe(48)
    expect(r.density).toBeCloseTo(1, 5)
    expect(r.severity).not.toBe('low')
  })

  it('treats both-transparent pixels as equal', () => {
    const a = solid(10, 10, [0, 0, 0, 0])
    const b = solid(10, 10, [123, 45, 200, 0])
    const res = diffPixelImages(a, b)
    expect(res.changedPixels).toBe(0)
  })

  it('separates two distant blocks into two regions', () => {
    const expected = solid(40, 40, [255, 255, 255, 255])
    const actual = solid(40, 40, [255, 255, 255, 255])
    fillRect(actual, 2, 2, 5, 5, [0, 0, 0, 255])
    fillRect(actual, 30, 30, 5, 5, [0, 0, 0, 255])
    const res = diffPixelImages(expected, actual, { minRegionPixels: 1 })
    expect(res.regions).toHaveLength(2)
  })

  it('ignores changes below the threshold (compression noise)', () => {
    const expected = solid(10, 10, [100, 100, 100, 255])
    const actual = solid(10, 10, [104, 104, 104, 255]) // tiny drift
    const res = diffPixelImages(expected, actual, { threshold: 0.1 })
    expect(res.changedPixels).toBe(0)
  })

  it('throws on mismatched sizes', () => {
    expect(() => diffPixelImages(solid(10, 10, [0, 0, 0, 255]), solid(11, 10, [0, 0, 0, 255]))).toThrow()
  })
})
