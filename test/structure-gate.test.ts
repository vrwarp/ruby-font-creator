import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import opentype from 'opentype.js'
import {
  prepRef,
  scoreGlyph,
  calibrate,
  passes,
  gateZScore,
  glyphMatch,
  refSimilarity,
  type GateRef,
  type GateScores,
  type GateCalibration,
} from '../src/structure-gate.js'
import { flattenSvgPath } from '../frontend/compiler.js'

// Tests for the Track C structure-fidelity gate. Glyphs are rasterized in
// node WITHOUT canvas: opentype.js outlines -> flattenSvgPath -> scanline
// nonzero-winding fill into a 256x256 ink-high Float32Array.
//
// trad-only.ttf is a SUBSET of Droid Sans Fallback (see
// scripts/make-test-fixture-font.py), so cross-font same-char pairs carry no
// style gap; legitimate style variation is synthesized with deterministic
// weight/geometry transforms (dilate, shear, squash) on Droid rasters, with
// strictly milder parameters for the held-out genuine set.

const repoRoot = path.resolve(__dirname, '..')
const droidPath = path.join(
  repoRoot,
  'frontend',
  'public',
  'resources',
  'fonts',
  'DroidSansFallbackFull.ttf',
)
const tradPath = path.join(repoRoot, 'test', 'fixtures', 'trad-only.ttf')
const fontsOk = fs.existsSync(droidPath) && fs.existsSync(tradPath)

const SIZE = 256

// --- node rasterization (no canvas) ----------------------------------------

function loadFont(p: string): opentype.Font {
  const buf = fs.readFileSync(p)
  return opentype.parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  )
}

// opentype's toPathData emits quadratic (Q) segments for TrueType outlines;
// flattenSvgPath only parses M/L/C/Z, so elevate quadratics to cubics first.
function quadsToCubics(d: string): string {
  const tokens = d.match(/[MLCQZmlcqz]|[+-]?(\d+\.?\d*|\.\d+)/g) ?? []
  let out = ''
  let i = 0
  let px = 0
  let py = 0
  const num = (k: number): number => parseFloat(tokens[k])
  while (i < tokens.length) {
    const cmd = tokens[i]
    if (cmd === 'M' || cmd === 'L') {
      px = num(i + 1)
      py = num(i + 2)
      out += `${cmd} ${px} ${py} `
      i += 3
    } else if (cmd === 'C') {
      px = num(i + 5)
      py = num(i + 6)
      out += `C ${num(i + 1)} ${num(i + 2)} ${num(i + 3)} ${num(i + 4)} ${px} ${py} `
      i += 7
    } else if (cmd === 'Q') {
      const qx = num(i + 1)
      const qy = num(i + 2)
      const x = num(i + 3)
      const y = num(i + 4)
      const c1x = px + (2 / 3) * (qx - px)
      const c1y = py + (2 / 3) * (qy - py)
      const c2x = x + (2 / 3) * (qx - x)
      const c2y = y + (2 / 3) * (qy - y)
      out += `C ${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y} `
      px = x
      py = y
      i += 5
    } else if (cmd === 'Z' || cmd === 'z') {
      out += 'Z '
      i += 1
    } else {
      i += 1
    }
  }
  return out.trim()
}

// Scanline nonzero-winding fill of polyline contours (pixel-center sampling,
// no antialiasing) into an ink-high Float32Array.
function fillNonzero(
  contours: { x: number; y: number }[][],
  size: number,
): Float32Array {
  const img = new Float32Array(size * size)
  for (let row = 0; row < size; row++) {
    const sy = row + 0.5
    const crossings: { x: number; w: number }[] = []
    for (const c of contours) {
      for (let i = 0; i < c.length; i++) {
        const p = c[i]
        const q = c[(i + 1) % c.length]
        if (p.y === q.y) continue
        if (sy < Math.min(p.y, q.y) || sy >= Math.max(p.y, q.y)) continue
        const t = (sy - p.y) / (q.y - p.y)
        crossings.push({ x: p.x + t * (q.x - p.x), w: q.y > p.y ? 1 : -1 })
      }
    }
    crossings.sort((a, b) => a.x - b.x)
    let wind = 0
    let spanStart = 0
    for (const cr of crossings) {
      const prev = wind
      wind += cr.w
      if (prev === 0 && wind !== 0) {
        spanStart = cr.x
      } else if (prev !== 0 && wind === 0) {
        const x0 = Math.max(0, Math.ceil(spanStart - 0.5))
        for (let x = x0; x + 0.5 < cr.x && x < size; x++) {
          img[row * size + x] = 1
        }
      }
    }
  }
  return img
}

const rasterCache = new Map<string, Float32Array>()

function rasterize(
  font: opentype.Font,
  fontKey: string,
  char: string,
): Float32Array {
  const key = `${fontKey}:${char}`
  const hit = rasterCache.get(key)
  if (hit) return hit
  const fontSize = SIZE * 0.7
  const p = font.getPath(char, SIZE * 0.15, SIZE * 0.78, fontSize)
  const img = fillNonzero(flattenSvgPath(quadsToCubics(p.toPathData(2))), SIZE)
  rasterCache.set(key, img)
  return img
}

// --- deterministic style-variation transforms -------------------------------

// 3x3 max filter: simulates a bolder weight.
function dilate(ink: Float32Array, size: number): Float32Array {
  const out = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let m = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue
          const v = ink[yy * size + xx]
          if (v > m) m = v
        }
      }
      out[y * size + x] = m
    }
  }
  return out
}

// Bilinear backward warp; coordinates outside the source sample as 0.
function warp(
  ink: Float32Array,
  size: number,
  map: (x: number, y: number) => [number, number],
): Float32Array {
  const out = new Float32Array(size * size)
  const sample = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= size || y >= size ? 0 : ink[y * size + x]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [sx, sy] = map(x, y)
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const fx = sx - x0
      const fy = sy - y0
      const top = sample(x0, y0) * (1 - fx) + sample(x0 + 1, y0) * fx
      const bot = sample(x0, y0 + 1) * (1 - fx) + sample(x0 + 1, y0 + 1) * fx
      out[y * size + x] = top * (1 - fy) + bot * fy
    }
  }
  return out
}

function shear(ink: Float32Array, size: number, k: number): Float32Array {
  const c = size / 2
  return warp(ink, size, (x, y) => [x - k * (y - c), y])
}

function squashY(ink: Float32Array, size: number, s: number): Float32Array {
  const c = size / 2
  return warp(ink, size, (x, y) => [x, c + (y - c) / s])
}

// Erases the middle `frac` horizontal slab of the ink bbox — the
// missing-component corruption from the gate study.
function eraseSlab(
  ink: Float32Array,
  size: number,
  frac: number,
): Float32Array {
  let minY = size
  let maxY = -1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (ink[y * size + x] >= 0.25) {
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const out = new Float32Array(ink)
  if (maxY < 0) return out
  const h = maxY - minY + 1
  const y0 = Math.round(minY + h * (0.5 - frac / 2))
  const y1 = Math.round(minY + h * (0.5 + frac / 2))
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < size; x++) out[y * size + x] = 0
  }
  return out
}

// --- synthetic shapes --------------------------------------------------------

function filledRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Float32Array {
  const img = new Float32Array(SIZE * SIZE)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) img[y * SIZE + x] = 1
  }
  return img
}

describe('structure-gate synthetic metrics', () => {
  const square = filledRect(78, 78, 178, 178)
  const ring = (() => {
    const img = filledRect(78, 78, 178, 178)
    for (let y = 108; y < 148; y++) {
      for (let x = 108; x < 148; x++) img[y * SIZE + x] = 0
    }
    return img
  })()

  it('scores a shape against itself as perfect', () => {
    const ref = prepRef(square, SIZE)
    expect(ref.ok).toBe(true)
    const s = scoreGlyph(square, SIZE, ref)
    expect(s.occ16).toBeGreaterThan(0.9999)
    expect(s.softIoU).toBeGreaterThan(0.9999)
    expect(s.r2gP90).toBe(0)
    expect(s.g2rP90).toBe(0)
  })

  it('is deterministic', () => {
    const ref = prepRef(ring, SIZE)
    const a = scoreGlyph(square, SIZE, ref)
    const b = scoreGlyph(square, SIZE, ref)
    expect(a).toEqual(b)
  })

  it('separates a square from a ring', () => {
    const ref = prepRef(square, SIZE)
    const s = scoreGlyph(ring, SIZE, ref)
    expect(s.occ16).toBeLessThan(0.995)
    expect(s.softIoU).toBeLessThan(0.95)
    expect(s.r2gP90).toBeGreaterThan(2)
    expect(glyphMatch(s)).toBeLessThan(
      glyphMatch(scoreGlyph(square, SIZE, ref)),
    )
  })

  it('reports two identical refs as maximally similar', () => {
    const a = prepRef(square, SIZE)
    const b = prepRef(square, SIZE)
    expect(refSimilarity(a, b)).toBeGreaterThan(0.9999)
    expect(refSimilarity(a, prepRef(ring, SIZE))).toBeLessThan(0.95)
  })

  it('handles degenerate inputs without throwing', () => {
    const allWhite = new Float32Array(SIZE * SIZE) // no ink
    const allBlack = new Float32Array(SIZE * SIZE).fill(1)

    const badRef = prepRef(allWhite, SIZE)
    expect(badRef.ok).toBe(false)
    expect(() => scoreGlyph(square, SIZE, badRef)).not.toThrow()

    const fullRef = prepRef(allBlack, SIZE)
    expect(fullRef.ok).toBe(true)
    expect(() => scoreGlyph(allWhite, SIZE, fullRef)).not.toThrow()
    expect(() => scoreGlyph(allBlack, SIZE, fullRef)).not.toThrow()

    const worst = scoreGlyph(allWhite, SIZE, fullRef)
    expect(worst.occ16).toBe(0)
    expect(worst.softIoU).toBe(0)
    expect(worst.r2gP90).toBeGreaterThan(10)
    expect(refSimilarity(badRef, fullRef)).toBe(0)
  })
})

// --- real-font calibration & gating ------------------------------------------

const TRAD_CHARS = [...'一不乾了人他國在幹後愛我是書有發的馬龍']
const VAR_CAL_CHARS = [...'國書馬龍']
const HELD_OUT_CHARS = [...'這時會學說道']
const ID_CHARS = [...'的一是不了人我在有他這中大來上國個到們為']
const WRONG_POOL = [...'的是不了人我在有他這中大來上國個到說們為']

describe.skipIf(!fontsOk)('structure-gate on real font rasters', () => {
  let droid: opentype.Font
  let trad: opentype.Font
  let calib: GateCalibration
  const refs = new Map<string, GateRef>()

  const droidInk = (c: string): Float32Array => rasterize(droid, 'droid', c)
  const refOf = (c: string): GateRef => {
    let r = refs.get(c)
    if (!r) {
      r = prepRef(droidInk(c), SIZE)
      refs.set(c, r)
    }
    return r
  }

  beforeAll(() => {
    droid = loadFont(droidPath)
    trad = loadFont(tradPath)

    // ~31 genuine pairs: 19 cross-font same-char pairs + 12 synthetic
    // style variants (bolder weight, slant, vertical squash).
    const genuine: GateScores[] = []
    for (const c of TRAD_CHARS) {
      genuine.push(scoreGlyph(rasterize(trad, 'trad', c), SIZE, refOf(c)))
    }
    for (const c of VAR_CAL_CHARS) {
      const ink = droidInk(c)
      for (const variant of [
        dilate(ink, SIZE),
        shear(ink, SIZE, 0.12),
        squashY(ink, SIZE, 0.85),
      ]) {
        genuine.push(scoreGlyph(variant, SIZE, refOf(c)))
      }
    }
    expect(genuine.length).toBe(31)
    calib = calibrate(genuine)
    expect(calib.samples).toBe(31)
    expect(calib.medianOcc16).toBeGreaterThan(0.9)
  })

  it('passes >= 90% of held-out genuine pairs', () => {
    let pass = 0
    let total = 0
    for (const c of HELD_OUT_CHARS) {
      const ink = droidInk(c)
      for (const variant of [
        shear(ink, SIZE, 0.08),
        shear(ink, SIZE, -0.08),
        squashY(ink, SIZE, 0.92),
      ]) {
        const s = scoreGlyph(variant, SIZE, refOf(c))
        const r = passes(s, calib)
        if (r.pass) pass++
        expect(r.hardFail).toBe(false)
        total++
      }
    }
    expect(pass / total).toBeGreaterThanOrEqual(0.9)
  })

  it('fails 100% of missing-component corruptions', () => {
    for (const c of [...'國書馬龍愛發']) {
      const corrupted = eraseSlab(droidInk(c), SIZE, 0.45)
      const s = scoreGlyph(corrupted, SIZE, refOf(c))
      const r = passes(s, calib)
      expect(r.pass, `slab-erased ${c} must fail the gate`).toBe(false)
      // a confidently broken glyph should also rank below genuine ones
      expect(gateZScore(s, calib)).toBeLessThan(0)
    }
  })

  it('fails a clear majority of wrong-character pairs', () => {
    let fail = 0
    const n = WRONG_POOL.length
    for (let i = 0; i < n; i++) {
      const gen = droidInk(WRONG_POOL[i])
      const ref = refOf(WRONG_POOL[(i + 7) % n])
      if (!passes(scoreGlyph(gen, SIZE, ref), calib).pass) fail++
    }
    expect(fail / n).toBeGreaterThan(0.6)
  })

  it('identifies the correct ref by glyphMatch for >= 90% of chars', () => {
    let correct = 0
    const n = ID_CHARS.length
    for (let i = 0; i < n; i++) {
      const s = scoreGlyph(
        shear(droidInk(ID_CHARS[i]), SIZE, 0.1),
        SIZE,
        refOf(ID_CHARS[i]),
      )
      const own = glyphMatch(s)
      let wins = 0
      for (let d = 1; d <= 5; d++) {
        const decoy = scoreGlyph(
          shear(droidInk(ID_CHARS[i]), SIZE, 0.1),
          SIZE,
          refOf(ID_CHARS[(i + d) % n]),
        )
        if (own > glyphMatch(decoy)) wins++
      }
      if (wins === 5) correct++
    }
    expect(correct / n).toBeGreaterThanOrEqual(0.9)
  })

  it('scores a 256px glyph in under 100ms', () => {
    const ref = refOf('國')
    const gen = droidInk('書')
    scoreGlyph(gen, SIZE, ref) // warm-up
    const runs = 5
    const t0 = performance.now()
    for (let i = 0; i < runs; i++) scoreGlyph(gen, SIZE, ref)
    const perCall = (performance.now() - t0) / runs
    expect(perCall).toBeLessThan(100)
  })
})
