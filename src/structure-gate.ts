/**
 * Structure-fidelity gate for AI-generated glyphs (Track C of
 * docs/style-transfer-research.md).
 *
 * Scores a generated glyph raster against the content font's rendering of
 * the same character using the four metrics that the gate study validated
 * to separate structural failures (wrong char, missing component, franken
 * composition) from legitimate style variation:
 *
 *   - occ16:   16x16 ink-density cosine        (wrong-char AUC 0.961)
 *   - softIoU: blurred density-normalized IoU  (missing-comp AUC 1.000)
 *   - r2gP90:  skeleton directed chamfer P90 ref->gen — missing structure
 *   - g2rP90:  skeleton directed chamfer P90 gen->ref — hallucinated strokes
 *
 * All metrics operate on a shared normalization: binarize at 0.25 for the
 * ink bbox, crop, pad to a centered square, bilinear-resample to 128x128.
 * Thresholds are calibrated per font from genuine glyph pairs (calibrate),
 * so the gate auto-adapts to how wild the style legitimately is.
 *
 * DOM-free by design: plain typed arrays only, no canvas/document. Runs in
 * the page, in workers, and under node for unit tests.
 */

export interface GateRef {
  ok: boolean
  norm: Float32Array
  occ: Float32Array
  skel: Int32Array /* packed x,y pairs */
}

export interface GateScores {
  occ16: number
  softIoU: number
  r2gP90: number
  g2rP90: number
}

export interface GateCalibration {
  thresholds: GateScores
  floors: GateScores
  mean: GateScores
  std: GateScores
  medianOcc16: number
  samples: number
}

const NORM = 128 // normalized raster side
const BBOX_ISO = 0.25 // binarization level for ink-bbox detection
const SKEL_ISO = 0.5 // binarization level for the skeleton raster
const SKEL_SIZE = 64 // skeleton grid side (max-pooled from NORM)
const BLUR_RADIUS = 6 // softIoU box-blur radius on the 128px norm
const OCC_SIZE = 16 // occupancy grid side
// Sentinel chamfer distance when one skeleton is empty (or the glyph is
// degenerate): the 64px grid diagonal, beyond any real point-to-point value.
const MAX_CHAMFER = Math.hypot(SKEL_SIZE, SKEL_SIZE)

const WORST_SCORES: GateScores = Object.freeze({
  occ16: 0,
  softIoU: 0,
  r2gP90: MAX_CHAMFER,
  g2rP90: MAX_CHAMFER,
})

// --- shared normalization --------------------------------------------------

// Returns the bbox-cropped, square-padded, 128x128 bilinear resample of an
// ink-high [0,1] raster, or null when no pixel reaches the bbox threshold.
function normalize(ink: Float32Array, size: number): Float32Array | null {
  let minX = size
  let minY = size
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (ink[y * size + x] >= BBOX_ISO) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null

  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const side = Math.max(bw, bh)
  const offX = (side - bw) >> 1
  const offY = (side - bh) >> 1
  const square = new Float32Array(side * side)
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      square[(y + offY) * side + (x + offX)] =
        ink[(y + minY) * size + (x + minX)]
    }
  }

  const norm = new Float32Array(NORM * NORM)
  const scale = side / NORM
  const sample = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= side || y >= side ? 0 : square[y * side + x]
  for (let oy = 0; oy < NORM; oy++) {
    const sy = (oy + 0.5) * scale - 0.5
    const y0 = Math.floor(sy)
    const fy = sy - y0
    for (let ox = 0; ox < NORM; ox++) {
      const sx = (ox + 0.5) * scale - 0.5
      const x0 = Math.floor(sx)
      const fx = sx - x0
      const top = sample(x0, y0) * (1 - fx) + sample(x0 + 1, y0) * fx
      const bot = sample(x0, y0 + 1) * (1 - fx) + sample(x0 + 1, y0 + 1) * fx
      norm[oy * NORM + ox] = top * (1 - fy) + bot * fy
    }
  }
  return norm
}

// --- metric building blocks ------------------------------------------------

// 16x16 mean-pooled ink density, L1-normalized.
function occDensity(norm: Float32Array): Float32Array {
  const occ = new Float32Array(OCC_SIZE * OCC_SIZE)
  const block = NORM / OCC_SIZE
  let total = 0
  for (let by = 0; by < OCC_SIZE; by++) {
    for (let bx = 0; bx < OCC_SIZE; bx++) {
      let sum = 0
      for (let y = by * block; y < (by + 1) * block; y++) {
        for (let x = bx * block; x < (bx + 1) * block; x++) {
          sum += norm[y * NORM + x]
        }
      }
      occ[by * OCC_SIZE + bx] = sum
      total += sum
    }
  }
  if (total > 0) {
    for (let i = 0; i < occ.length; i++) occ[i] /= total
  }
  return occ
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom > 0 ? dot / denom : 0
}

// Box blur (radius BLUR_RADIUS, zero-padded) via integral image, then
// L1-normalized. The constant kernel-area divisor is dropped since L1
// normalization cancels it.
function blurredDensity(norm: Float32Array): Float32Array {
  const w = NORM
  const ii = new Float64Array((w + 1) * (w + 1))
  for (let y = 0; y < w; y++) {
    let rowSum = 0
    for (let x = 0; x < w; x++) {
      rowSum += norm[y * w + x]
      ii[(y + 1) * (w + 1) + (x + 1)] = ii[y * (w + 1) + (x + 1)] + rowSum
    }
  }
  const out = new Float32Array(w * w)
  let total = 0
  for (let y = 0; y < w; y++) {
    const y0 = Math.max(0, y - BLUR_RADIUS)
    const y1 = Math.min(w, y + BLUR_RADIUS + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - BLUR_RADIUS)
      const x1 = Math.min(w, x + BLUR_RADIUS + 1)
      const v =
        ii[y1 * (w + 1) + x1] -
        ii[y0 * (w + 1) + x1] -
        ii[y1 * (w + 1) + x0] +
        ii[y0 * (w + 1) + x0]
      out[y * w + x] = v
      total += v
    }
  }
  if (total > 0) {
    for (let i = 0; i < out.length; i++) out[i] /= total
  }
  return out
}

function softIoUFromNorms(a: Float32Array, b: Float32Array): number {
  const da = blurredDensity(a)
  const db = blurredDensity(b)
  let inter = 0
  let union = 0
  for (let i = 0; i < da.length; i++) {
    inter += Math.min(da[i], db[i])
    union += Math.max(da[i], db[i])
  }
  return union > 0 ? inter / union : 0
}

// Zhang-Suen thinning, in place. Neighbors outside the grid count as 0.
function zhangSuen(g: Uint8Array, w: number): void {
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= w ? 0 : g[y * w + x]
  const toClear: number[] = []
  let changed = true
  while (changed) {
    changed = false
    for (let pass = 0; pass < 2; pass++) {
      toClear.length = 0
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          if (!g[y * w + x]) continue
          const p2 = at(x, y - 1)
          const p3 = at(x + 1, y - 1)
          const p4 = at(x + 1, y)
          const p5 = at(x + 1, y + 1)
          const p6 = at(x, y + 1)
          const p7 = at(x - 1, y + 1)
          const p8 = at(x - 1, y)
          const p9 = at(x - 1, y - 1)
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
          if (b < 2 || b > 6) continue
          let a = 0
          if (p2 === 0 && p3 === 1) a++
          if (p3 === 0 && p4 === 1) a++
          if (p4 === 0 && p5 === 1) a++
          if (p5 === 0 && p6 === 1) a++
          if (p6 === 0 && p7 === 1) a++
          if (p7 === 0 && p8 === 1) a++
          if (p8 === 0 && p9 === 1) a++
          if (p9 === 0 && p2 === 1) a++
          if (a !== 1) continue
          if (pass === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue
          } else {
            if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue
          }
          toClear.push(y * w + x)
        }
      }
      if (toClear.length > 0) {
        changed = true
        for (const i of toClear) g[i] = 0
      }
    }
  }
}

// Binarize the 128px norm at 0.5, 2x2 max-pool to 64x64, thin, and pack the
// surviving points as [x0,y0, x1,y1, ...].
function skeletonPoints(norm: Float32Array): Int32Array {
  const g = new Uint8Array(SKEL_SIZE * SKEL_SIZE)
  for (let y = 0; y < SKEL_SIZE; y++) {
    for (let x = 0; x < SKEL_SIZE; x++) {
      const i = 2 * y * NORM + 2 * x
      g[y * SKEL_SIZE + x] =
        norm[i] >= SKEL_ISO ||
        norm[i + 1] >= SKEL_ISO ||
        norm[i + NORM] >= SKEL_ISO ||
        norm[i + NORM + 1] >= SKEL_ISO
          ? 1
          : 0
    }
  }
  zhangSuen(g, SKEL_SIZE)
  let count = 0
  for (let i = 0; i < g.length; i++) count += g[i]
  const pts = new Int32Array(count * 2)
  let k = 0
  for (let y = 0; y < SKEL_SIZE; y++) {
    for (let x = 0; x < SKEL_SIZE; x++) {
      if (g[y * SKEL_SIZE + x]) {
        pts[k++] = x
        pts[k++] = y
      }
    }
  }
  return pts
}

// 90th percentile of the directed point-to-set distances a -> b. An empty
// source set is vacuously satisfied (0); an empty target set means nothing
// to match against (MAX_CHAMFER).
function directedChamferP90(a: Int32Array, b: Int32Array): number {
  const na = a.length >> 1
  const nb = b.length >> 1
  if (na === 0) return 0
  if (nb === 0) return MAX_CHAMFER
  const dists = new Float64Array(na)
  for (let i = 0; i < na; i++) {
    const ax = a[2 * i]
    const ay = a[2 * i + 1]
    let best = Infinity
    for (let j = 0; j < nb; j++) {
      const dx = ax - b[2 * j]
      const dy = ay - b[2 * j + 1]
      const d = dx * dx + dy * dy
      if (d < best) best = d
    }
    dists[i] = Math.sqrt(best)
  }
  dists.sort()
  return dists[Math.min(na - 1, Math.floor(0.9 * na))]
}

// --- public API -------------------------------------------------------------

export function prepRef(ink: Float32Array, size: number): GateRef {
  const norm = normalize(ink, size)
  if (norm === null) {
    return {
      ok: false,
      norm: new Float32Array(0),
      occ: new Float32Array(0),
      skel: new Int32Array(0),
    }
  }
  return { ok: true, norm, occ: occDensity(norm), skel: skeletonPoints(norm) }
}

// Degenerate inputs (no-ink gen, or a not-ok ref) score as worst-possible so
// they always fail downstream gating instead of throwing.
export function scoreGlyph(
  genInk: Float32Array,
  size: number,
  ref: GateRef,
): GateScores {
  if (!ref.ok) return { ...WORST_SCORES }
  const norm = normalize(genInk, size)
  if (norm === null) return { ...WORST_SCORES }
  const skel = skeletonPoints(norm)
  return {
    occ16: cosine(ref.occ, occDensity(norm)),
    softIoU: softIoUFromNorms(ref.norm, norm),
    r2gP90: directedChamferP90(ref.skel, skel),
    g2rP90: directedChamferP90(skel, ref.skel),
  }
}

const METRICS: ReadonlyArray<keyof GateScores> = [
  'occ16',
  'softIoU',
  'r2gP90',
  'g2rP90',
]
// Chamfer metrics: HIGHER is worse; the similarity metrics: higher is better.
const HIGHER_WORSE: Readonly<Record<keyof GateScores, boolean>> = {
  occ16: false,
  softIoU: false,
  r2gP90: true,
  g2rP90: true,
}

// Linear-interpolated percentile, p in [0,1], over an ascending-sorted array.
function percentile(sorted: number[], p: number): number {
  const pos = (sorted.length - 1) * p
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function calibrate(scores: GateScores[]): GateCalibration {
  if (scores.length === 0) {
    throw new Error('calibrate requires at least one genuine score')
  }
  const n = scores.length
  const out = {
    thresholds: { ...WORST_SCORES },
    floors: { ...WORST_SCORES },
    mean: { ...WORST_SCORES },
    std: { ...WORST_SCORES },
    medianOcc16: 0,
    samples: n,
  }
  for (const m of METRICS) {
    const vals = scores.map((s) => s[m]).sort((a, b) => a - b)
    const med = percentile(vals, 0.5)
    const mad = percentile(
      vals.map((v) => Math.abs(v - med)).sort((a, b) => a - b),
      0.5,
    )
    let mean = 0
    for (const v of vals) mean += v
    mean /= n
    let varSum = 0
    for (const v of vals) varSum += (v - mean) * (v - mean)
    out.mean[m] = mean
    out.std[m] = Math.sqrt(varSum / n)
    if (HIGHER_WORSE[m]) {
      out.thresholds[m] = percentile(vals, 0.975)
      out.floors[m] = vals[n - 1] + 2 * mad
    } else {
      out.thresholds[m] = percentile(vals, 0.025)
      out.floors[m] = vals[0] - 2 * mad
    }
    if (m === 'occ16') out.medianOcc16 = med
  }
  return out
}

// pass: ALL four metrics within their calibrated thresholds.
// hardFail: ANY metric beyond its floor (worse than every calibration sample
// by >2 MAD) — confidently broken, eligible for alias fallback downstream.
export function passes(
  s: GateScores,
  c: GateCalibration,
): { pass: boolean; hardFail: boolean } {
  // degenerate-style escape hatch: when the font's own glyphs barely match
  // the content font (wild but legitimate styles), the wrong-char-grade
  // metrics are noise — gate only on the missing-component detectors
  // (softIoU and ref->gen chamfer, both AUC 1.000 on missing components)
  const degenerate = c.medianOcc16 < 0.7
  const gated: ReadonlyArray<keyof GateScores> = degenerate
    ? ['softIoU', 'r2gP90']
    : METRICS
  let pass = true
  let hardFail = false
  for (const m of gated) {
    if (HIGHER_WORSE[m]) {
      if (s[m] > c.thresholds[m]) pass = false
      if (s[m] > c.floors[m]) hardFail = true
    } else {
      if (s[m] < c.thresholds[m]) pass = false
      if (s[m] < c.floors[m]) hardFail = true
    }
  }
  return { pass, hardFail }
}

// Mean signed z-score across metrics, oriented so higher = better (chamfer
// z is negated). Used to rank regen candidates. std can be ~0 when the
// calibration pairs are near-identical; clamp to keep z finite.
export function gateZScore(s: GateScores, c: GateCalibration): number {
  let sum = 0
  for (const m of METRICS) {
    const z = (s[m] - c.mean[m]) / Math.max(c.std[m], 1e-6)
    sum += HIGHER_WORSE[m] ? -z : z
  }
  return sum / METRICS.length
}

// Scalar match quality for variant-margin and identification comparisons.
export function glyphMatch(s: GateScores): number {
  return 0.5 * s.occ16 + 0.5 * s.softIoU - 0.025 * (s.r2gP90 + s.g2rP90)
}

// softIoU between two refs' normalized rasters; used to skip the
// variant-margin check when the two content renderings are >0.85 similar.
export function refSimilarity(a: GateRef, b: GateRef): number {
  if (!a.ok || !b.ok) return 0
  return softIoUFromNorms(a.norm, b.norm)
}
