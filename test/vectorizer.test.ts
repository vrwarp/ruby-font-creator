import { describe, it, expect } from 'vitest'
import { traceContours, traceGrayscaleImage } from '../src/vectorizer.js'
import type { Point } from '../src/vectorizer.js'

/** Signed shoelace sum: sum((x_i * y_{i+1}) - (x_{i+1} * y_i)). */
function shoelace(points: Point[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum
}

/** Splits an SVG path into its 'M ...' subpaths and parses every number. */
function parseSubpaths(path: string): Point[][] {
  const chunks = path.split('M').filter((c) => c.trim() !== '')
  return chunks.map((chunk) => {
    const nums = (chunk.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    expect(nums.length % 2).toBe(0)
    const points: Point[] = []
    for (let i = 0; i < nums.length; i += 2) {
      points.push({ x: nums[i], y: nums[i + 1] })
    }
    return points
  })
}

function vertexSet(points: Point[]): Set<string> {
  return new Set(points.map((p) => `${p.x},${p.y}`))
}

function fillRect(
  pixels: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: number,
): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      pixels[y * width + x] = value
    }
  }
}

/** 8x8 ring: ink rectangle (1,1)-(6,6) with a hole at (3,3)-(4,4). */
function ringImage(): { pixels: Uint8Array; width: number; height: number } {
  const width = 8
  const height = 8
  const pixels = new Uint8Array(width * height)
  fillRect(pixels, width, 1, 1, 6, 6, 255)
  fillRect(pixels, width, 3, 3, 4, 4, 0)
  return { pixels, width, height }
}

/** Asserts every step of a raw loop is a unit-length axis move (incl. wrap). */
function expectUnitClosedLoop(loop: Point[]): void {
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    expect(Math.abs(b.x - a.x) + Math.abs(b.y - a.y)).toBe(1)
  }
}

describe('traceContours (raw crack-following loops)', () => {
  it('traces a single pixel as one clockwise unit square', () => {
    const binary = new Uint8Array(9)
    binary[1 * 3 + 1] = 1 // pixel (1,1) in a 3x3 grid
    const loops = traceContours(binary, 3, 3)
    expect(loops).toHaveLength(1)
    expect(loops[0]).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
    ])
    expect(shoelace(loops[0])).toBe(2) // area 1, screen-clockwise
  })

  it('traces outer and hole loops of a ring with opposite orientations', () => {
    const { pixels, width, height } = ringImage()
    const binary = Uint8Array.from(pixels, (v) => (v >= 128 ? 1 : 0))
    const loops = traceContours(binary, width, height)
    expect(loops).toHaveLength(2)
    for (const loop of loops) expectUnitClosedLoop(loop)

    const outer = loops.find((l) => shoelace(l) > 0)!
    const hole = loops.find((l) => shoelace(l) < 0)!
    expect(outer).toBeDefined()
    expect(hole).toBeDefined()
    // Outer: 6x6 pixel square -> 24 crack steps, shoelace 2 * area 36.
    expect(outer).toHaveLength(24)
    expect(shoelace(outer)).toBe(72)
    // Hole: 2x2 pixel square -> 8 crack steps, shoelace -2 * area 4.
    expect(hole).toHaveLength(8)
    expect(shoelace(hole)).toBe(-8)
    expect(vertexSet(hole)).toContain('3,3')
    expect(vertexSet(hole)).toContain('5,5')
  })

  it('closes loops along the bitmap border (out-of-bounds = background)', () => {
    const binary = new Uint8Array(16).fill(1) // fully inked 4x4 grid
    const loops = traceContours(binary, 4, 4)
    expect(loops).toHaveLength(1)
    expectUnitClosedLoop(loops[0])
    expect(loops[0]).toHaveLength(16) // perimeter cracks of a 4x4 square
    expect(shoelace(loops[0])).toBe(32) // 2 * area 16, positive
  })

  it('keeps diagonally touching pixels positively oriented with total area 2', () => {
    // Pixels (1,1) and (2,2) share only a corner: whatever the connectivity
    // convention, every emitted loop must be an outer (positive) loop and
    // the shoelace sums must add up to 2 * total ink area.
    const binary = new Uint8Array(16)
    binary[1 * 4 + 1] = 1
    binary[2 * 4 + 2] = 1
    const loops = traceContours(binary, 4, 4)
    let total = 0
    for (const loop of loops) {
      expectUnitClosedLoop(loop)
      expect(shoelace(loop)).toBeGreaterThan(0)
      total += shoelace(loop)
    }
    expect(total).toBe(4) // 2 * (2 ink pixels)
  })

  it('satisfies sum(shoelace) = 2 * inkArea on a pseudo-random grid', () => {
    const width = 25
    const height = 25
    const binary = new Uint8Array(width * height)
    let seed = 123456789
    let inkCount = 0
    for (let i = 0; i < binary.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      if (seed % 100 < 45) {
        binary[i] = 1
        inkCount++
      }
    }
    const loops = traceContours(binary, width, height)
    expect(loops.length).toBeGreaterThan(0)
    let total = 0
    for (const loop of loops) {
      expect(loop.length).toBeGreaterThanOrEqual(4)
      expectUnitClosedLoop(loop)
      total += shoelace(loop)
    }
    // Outer loops add their area, holes subtract theirs: the signed total
    // must equal the inked area exactly (shoelace counts it twice).
    expect(total).toBe(2 * inkCount)
  })
})

describe('traceGrayscaleImage', () => {
  it('reduces a 4x4 solid square to exactly its four corners', () => {
    const width = 10
    const height = 10
    const pixels = new Uint8Array(width * height)
    fillRect(pixels, width, 3, 3, 6, 6, 255)

    const path = traceGrayscaleImage(pixels, width, height, 128, 0)
    const contours = parseSubpaths(path)
    expect(contours).toHaveLength(1)
    expect(path.endsWith('Z')).toBe(true)
    expect(path).not.toContain('C')

    const square = contours[0]
    expect(square).toHaveLength(4)
    expect(vertexSet(square)).toEqual(new Set(['3,3', '7,3', '7,7', '3,7']))
    expect(shoelace(square)).toBe(32) // 2 * area 16, positive = outer
  })

  it('emits two opposite-winding contours for a ring with a hole', () => {
    const { pixels, width, height } = ringImage()
    const path = traceGrayscaleImage(pixels, width, height, 128, 0)
    const contours = parseSubpaths(path)
    expect(contours).toHaveLength(2)

    const outer = contours.find((c) => shoelace(c) > 0)!
    const hole = contours.find((c) => shoelace(c) < 0)!
    expect(outer).toBeDefined()
    expect(hole).toBeDefined()

    expect(outer).toHaveLength(4)
    expect(vertexSet(outer)).toEqual(new Set(['1,1', '7,1', '7,7', '1,7']))
    expect(shoelace(outer)).toBe(72) // 2 * area 36

    expect(hole).toHaveLength(4)
    expect(vertexSet(hole)).toEqual(new Set(['3,3', '5,3', '5,5', '3,5']))
    expect(shoelace(hole)).toBe(-8) // 2 * area 4, opposite winding
  })

  it('closes a full-height stripe touching the bitmap border', () => {
    const width = 10
    const height = 10
    const pixels = new Uint8Array(width * height)
    fillRect(pixels, width, 0, 0, 2, height - 1, 255)

    const path = traceGrayscaleImage(pixels, width, height, 128, 0)
    expect(path.endsWith('Z')).toBe(true)
    const contours = parseSubpaths(path)
    expect(contours).toHaveLength(1)

    const stripe = contours[0]
    expect(stripe).toHaveLength(4)
    expect(vertexSet(stripe)).toEqual(new Set(['0,0', '3,0', '3,10', '0,10']))
    expect(shoelace(stripe)).toBe(60) // 2 * area 30, positive

    const xs = stripe.map((p) => p.x)
    const ys = stripe.map((p) => p.y)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.max(...xs)).toBe(3)
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...ys)).toBe(10)
  })

  it('returns an empty string for an empty grid', () => {
    expect(traceGrayscaleImage(new Uint8Array(64), 8, 8, 128, 0)).toBe('')
    expect(traceGrayscaleImage(new Float32Array(64), 8, 8, 128, 0)).toBe('')
    expect(traceGrayscaleImage(new Uint8Array(0), 0, 0, 128, 0)).toBe('')
  })

  it('treats a pixel as ink when its scaled value equals the threshold', () => {
    const pixels = new Uint8Array(16)
    fillRect(pixels, 4, 1, 1, 2, 2, 128)
    const at = traceGrayscaleImage(pixels, 4, 4, 128, 0)
    expect(parseSubpaths(at)).toHaveLength(1)
    expect(vertexSet(parseSubpaths(at)[0])).toEqual(
      new Set(['1,1', '3,1', '3,3', '1,3']),
    )
    fillRect(pixels, 4, 1, 1, 2, 2, 127) // just below: no ink at all
    expect(traceGrayscaleImage(pixels, 4, 4, 128, 0)).toBe('')
  })

  it('produces identical output for Float32Array input scaled to [0,1]', () => {
    const { pixels, width, height } = ringImage()
    // Mix in non-saturated gray levels on both sides of the threshold.
    pixels[1 * width + 1] = 200
    pixels[6 * width + 6] = 131
    pixels[0] = 60
    pixels[7 * width + 7] = 100

    const floats = Float32Array.from(pixels, (v) => v / 255)
    const fromBytes = traceGrayscaleImage(pixels, width, height, 128, 0)
    const fromFloats = traceGrayscaleImage(floats, width, height, 128, 0)
    expect(fromBytes).not.toBe('')
    expect(fromFloats).toBe(fromBytes)

    // Smoothing path must match too.
    expect(traceGrayscaleImage(floats, width, height, 128, 1)).toBe(
      traceGrayscaleImage(pixels, width, height, 128, 1),
    )
  })

  it('emits valid closed cubic Bezier contours when smoothing is enabled', () => {
    const { pixels, width, height } = ringImage()
    const straight = traceGrayscaleImage(pixels, width, height, 128, 0)
    const smooth = traceGrayscaleImage(pixels, width, height, 128, 1.0)

    expect(smooth.startsWith('M ')).toBe(true)
    expect(smooth).toContain('C')
    expect(smooth).not.toContain('L')
    expect(smooth.endsWith('Z')).toBe(true)

    // Same number of contours as the unsmoothed render.
    const countM = (s: string): number => (s.match(/M/g) ?? []).length
    expect(countM(smooth)).toBe(countM(straight))

    // Every number parses finite, and each subpath has a complete set of
    // cubic segments (M pair + 3 pairs per C) that ends exactly on its
    // starting point before the Z.
    for (const chunk of smooth.split('M').filter((c) => c.trim() !== '')) {
      const nums = (chunk.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
      expect(nums.length).toBeGreaterThan(0)
      expect(nums.every(Number.isFinite)).toBe(true)
      expect((nums.length - 2) % 6).toBe(0)
      expect(nums[nums.length - 2]).toBe(nums[0])
      expect(nums[nums.length - 1]).toBe(nums[1])
    }
  })

  it('uses default smoothing of 1.0 and straight lines below 0.1', () => {
    const { pixels, width, height } = ringImage()
    expect(traceGrayscaleImage(pixels, width, height, 128)).toContain('C')
    const faint = traceGrayscaleImage(pixels, width, height, 128, 0.05)
    expect(faint).toContain('L')
    expect(faint).not.toContain('C')
  })

  it('traces a 回-like glyph as four contours with alternating winding', () => {
    const width = 12
    const height = 12
    const pixels = new Uint8Array(width * height)
    fillRect(pixels, width, 1, 1, 10, 10, 255) // outer ring, outside
    fillRect(pixels, width, 3, 3, 8, 8, 0) // outer ring, hole
    fillRect(pixels, width, 4, 4, 7, 7, 255) // inner ring, outside
    fillRect(pixels, width, 5, 5, 6, 6, 0) // inner ring, hole

    const path = traceGrayscaleImage(pixels, width, height, 128, 0)
    const contours = parseSubpaths(path)
    expect(contours).toHaveLength(4)

    // Largest to smallest: outer/hole/outer/hole with alternating signs and
    // exact areas (shoelace = +-2 * area).
    const sums = contours
      .map((c) => shoelace(c))
      .sort((a, b) => Math.abs(b) - Math.abs(a))
    expect(sums).toEqual([200, -72, 32, -8])

    const byArea = contours
      .slice()
      .sort((a, b) => Math.abs(shoelace(b)) - Math.abs(shoelace(a)))
    expect(vertexSet(byArea[0])).toEqual(
      new Set(['1,1', '11,1', '11,11', '1,11']),
    )
    expect(vertexSet(byArea[1])).toEqual(new Set(['3,3', '9,3', '9,9', '3,9']))
    expect(vertexSet(byArea[2])).toEqual(new Set(['4,4', '8,4', '8,8', '4,8']))
    expect(vertexSet(byArea[3])).toEqual(new Set(['5,5', '7,5', '7,7', '5,7']))
  })
})
