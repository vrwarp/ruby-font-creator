import { describe, it, expect } from 'vitest'
import {
  traceContours,
  traceGrayscaleImage,
  shoelace,
  type Point,
} from '../src/vectorizer.js'
import { flattenSvgPath } from '../frontend/compiler.js'

// Helpers -------------------------------------------------------------

function field(
  width: number,
  height: number,
  fill: (x: number, y: number) => number,
): Float32Array {
  const f = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      f[y * width + x] = fill(x, y)
    }
  }
  return f
}

function binaryRect(
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Float32Array {
  return field(width, height, (x, y) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1 ? 1 : 0,
  )
}

function pathLoops(d: string): Point[][] {
  return flattenSvgPath(d)
}

function bbox(pts: Point[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}

// traceContours (marching squares) -------------------------------------

describe('traceContours - sub-pixel marching squares', () => {
  it('traces a binary square with the iso line halfway between pixels', () => {
    // ink at pixel centers (3..6)x(3..6); iso 0.5 -> boundary at 2.5 / 6.5
    const f = binaryRect(10, 10, 3, 3, 6, 6)
    const loops = traceContours(f, 10, 10, 0.5)
    expect(loops.length).toBe(1)
    const area = shoelace(loops[0])
    // 4x4 square minus four 45-degree corner chamfers of area 0.125 each
    expect(area).toBeCloseTo(15.5, 5)
    const b = bbox(loops[0])
    expect(b.minX).toBeCloseTo(2.5, 5)
    expect(b.maxX).toBeCloseTo(6.5, 5)
    expect(b.minY).toBeCloseTo(2.5, 5)
    expect(b.maxY).toBeCloseTo(6.5, 5)
  })

  it('emits holes with opposite winding', () => {
    // ink (1..6)^2 with a 2x2 hole at (3..4)^2
    const f = field(8, 8, (x, y) => {
      const ink = x >= 1 && x <= 6 && y >= 1 && y <= 6
      const hole = x >= 3 && x <= 4 && y >= 3 && y <= 4
      return ink && !hole ? 1 : 0
    })
    const loops = traceContours(f, 8, 8, 0.5)
    expect(loops.length).toBe(2)
    const areas = loops.map(shoelace).sort((a, b) => b - a)
    expect(areas[0]).toBeCloseTo(35.5, 5) // 6x6 outer minus chamfers
    expect(areas[1]).toBeCloseTo(-3.5, 5) // 2x2 hole minus chamfers, negative
  })

  it('finds the iso crossing at the interpolated sub-pixel position', () => {
    // columns: x<=4 -> 1.0, x=5 -> 0.6, x>=6 -> 0.0
    const f = field(12, 12, (x) => (x <= 4 ? 1 : x === 5 ? 0.6 : 0))
    const loops = traceContours(f, 12, 12, 0.5)
    expect(loops.length).toBe(1)
    // crossing between x=5 (0.6) and x=6 (0.0): t = (0.5-0.6)/(0-0.6) = 1/6
    const expectedX = 5 + 1 / 6
    // interior points of the vertical boundary (away from border closure)
    const rightEdgeXs = loops[0]
      .filter((p) => p.x > 4.5 && p.y > 2 && p.y < 9)
      .map((p) => p.x)
    expect(rightEdgeXs.length).toBeGreaterThan(0)
    for (const x of rightEdgeXs) {
      expect(x).toBeCloseTo(expectedX, 5)
    }
  })

  it('closes contours for ink touching the bitmap border', () => {
    const f = field(10, 10, (x) => (x <= 2 ? 1 : 0))
    const loops = traceContours(f, 10, 10, 0.5)
    expect(loops.length).toBe(1)
    expect(shoelace(loops[0])).toBeGreaterThan(0)
    const b = bbox(loops[0])
    // the zero padding closes the loop just outside the bitmap edge
    expect(b.minX).toBeLessThan(0)
    expect(b.maxX).toBeCloseTo(2.5, 5)
  })

  it('handles nested structures (回) with alternating winding', () => {
    // outer ring (1..10)^2 minus (3..8)^2, inner block (5..6)^2 in 12x12
    const f = field(12, 12, (x, y) => {
      const outer = x >= 1 && x <= 10 && y >= 1 && y <= 10
      const ring = x >= 3 && x <= 8 && y >= 3 && y <= 8
      const inner = x >= 5 && x <= 6 && y >= 5 && y <= 6
      return (outer && !ring) || inner ? 1 : 0
    })
    const loops = traceContours(f, 12, 12, 0.5)
    expect(loops.length).toBe(3)
    const areas = loops.map(shoelace).sort((a, b) => b - a)
    expect(areas[0]).toBeGreaterThan(0) // outermost boundary
    expect(areas[1]).toBeGreaterThan(0) // inner block
    expect(areas[2]).toBeLessThan(0) // ring hole
  })

  it('approximates a smooth disk with sub-pixel accuracy', () => {
    const f = field(64, 64, (x, y) => {
      const r = Math.hypot(x - 32, y - 32)
      return Math.min(1, Math.max(0, 1 - (r - 16) / 4)) // 0.5 at r=18
    })
    const loops = traceContours(f, 64, 64, 0.5)
    expect(loops.length).toBe(1)
    const area = shoelace(loops[0])
    const ideal = Math.PI * 18 * 18
    expect(Math.abs(area - ideal) / ideal).toBeLessThan(0.01)
    for (const p of loops[0]) {
      const r = Math.hypot(p.x - 32, p.y - 32)
      expect(Math.abs(r - 18)).toBeLessThan(0.25)
    }
  })
})

// traceGrayscaleImage (full pipeline) -----------------------------------

describe('traceGrayscaleImage', () => {
  it('returns an empty string for an empty field', () => {
    expect(traceGrayscaleImage(new Float32Array(64), 8, 8, 128, 1)).toBe('')
  })

  it('drops single-pixel speckle noise', () => {
    const f = field(10, 10, (x, y) => (x === 5 && y === 5 ? 1 : 0))
    expect(traceGrayscaleImage(f, 10, 10, 128, 1)).toBe('')
  })

  it('produces identical output for equivalent Float32 and Uint8 inputs', () => {
    const f32 = binaryRect(16, 16, 4, 4, 11, 11)
    const u8 = new Uint8Array(f32.length)
    for (let i = 0; i < f32.length; i++) u8[i] = f32[i] * 255
    const a = traceGrayscaleImage(f32, 16, 16, 128, 1)
    const b = traceGrayscaleImage(u8, 16, 16, 128, 1)
    expect(a).toBe(b)
    expect(a.length).toBeGreaterThan(0)
  })

  it('emits straight L segments for straight stroke edges', () => {
    const d = traceGrayscaleImage(
      binaryRect(20, 20, 4, 4, 15, 15),
      20,
      20,
      128,
      1,
    )
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    // a clean rectangle fits compactly: straight sides plus at most a couple
    // of short curves absorbing the marching-squares corner chamfers
    const commands = (d.match(/[LC]/g) || []).length
    expect((d.match(/L/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(commands).toBeLessThanOrEqual(12)
    const loops = pathLoops(d)
    expect(loops.length).toBe(1)
    expect(shoelace(loops[0])).toBeGreaterThan(0)
  })

  it('keeps detected corners sharp under smoothing', () => {
    // L-shaped region with a concave corner at (8.5, 10.5)
    const f = field(20, 20, (x, y) => {
      const vertical = x >= 3 && x <= 8 && y >= 3 && y <= 16
      const horizontal = x >= 3 && x <= 16 && y >= 11 && y <= 16
      return vertical || horizontal ? 1 : 0
    })
    const d = traceGrayscaleImage(f, 20, 20, 128, 1.5)
    const loops = pathLoops(d)
    expect(loops.length).toBe(1)
    let best = Infinity
    for (const p of loops[0]) {
      best = Math.min(best, Math.hypot(p.x - 8.5, p.y - 10.5))
    }
    expect(best).toBeLessThan(0.5)
  })

  it('respects the threshold as a sub-pixel iso level', () => {
    // horizontal ramp from 1.0 down to 0.0 across columns
    const f = field(16, 16, (x) => Math.min(1, Math.max(0, (10 - x) / 5)))
    const lowIso = pathLoops(traceGrayscaleImage(f, 16, 16, 64, 0))
    const highIso = pathLoops(traceGrayscaleImage(f, 16, 16, 192, 0))
    const wLow = bbox(lowIso[0]).maxX
    const wHigh = bbox(highIso[0]).maxX
    // lower iso -> contour reaches further into the faded edge
    expect(wLow).toBeGreaterThan(wHigh + 1.5)
  })

  it('reconstructs a smooth disk faithfully and compactly', () => {
    const f = field(64, 64, (x, y) => {
      const r = Math.hypot(x - 32, y - 32)
      return Math.min(1, Math.max(0, 1 - (r - 16) / 4))
    })
    const d = traceGrayscaleImage(f, 64, 64, 128, 1)
    expect(d).toContain('C')
    const loops = pathLoops(d)
    expect(loops.length).toBe(1)
    for (const p of loops[0]) {
      const r = Math.hypot(p.x - 32, p.y - 32)
      expect(Math.abs(r - 18)).toBeLessThan(0.45)
    }
    // compact: a circle needs few fitted segments, not hundreds of points
    expect((d.match(/C/g) || []).length).toBeLessThan(24)
  })

  it('emits polygons only when smoothing < 0.1', () => {
    const f = binaryRect(16, 16, 4, 4, 11, 11)
    const d = traceGrayscaleImage(f, 16, 16, 128, 0)
    expect(d).toContain('L')
    expect(d).not.toContain('C')
    expect(d.endsWith('Z')).toBe(true)
  })

  it('preserves winding through the full pipeline (ring with hole)', () => {
    const f = field(16, 16, (x, y) => {
      const ink = x >= 2 && x <= 13 && y >= 2 && y <= 13
      const hole = x >= 6 && x <= 9 && y >= 6 && y <= 9
      return ink && !hole ? 1 : 0
    })
    const d = traceGrayscaleImage(f, 16, 16, 128, 1)
    const loops = pathLoops(d)
    expect(loops.length).toBe(2)
    const areas = loops.map(shoelace).sort((a, b) => b - a)
    expect(areas[0]).toBeGreaterThan(0)
    expect(areas[1]).toBeLessThan(0)
  })

  it('produces finite, parseable numbers throughout', () => {
    const f = field(32, 32, (x, y) =>
      Math.max(0, Math.sin(x / 3) * Math.cos(y / 4)),
    )
    const d = traceGrayscaleImage(f, 32, 32, 100, 1)
    const nums = d.match(/-?\d+\.?\d*/g) || []
    expect(nums.length).toBeGreaterThan(0)
    for (const n of nums) {
      expect(Number.isFinite(parseFloat(n))).toBe(true)
    }
  })
})
