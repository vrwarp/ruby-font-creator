/**
 * Glyph raster -> SVG outline vectorizer.
 *
 * Treats the grayscale image as a continuous scalar field and extracts the
 * iso-contour with sub-pixel precision (marching squares with linear
 * interpolation), then fits corner-aware cubic Bezier curves (Schneider's
 * least-squares algorithm from Graphics Gems) between detected corners.
 * Compared to tracing the binarized bitmap, this exploits the anti-aliased
 * edge gradient of neural-network outputs for much smoother, more faithful
 * outlines: straight strokes stay straight, curves stay smooth, and real
 * corners stay sharp.
 *
 * Coordinates are pixel-center based, y-down. Outer contours are emitted
 * with positive shoelace area and holes negative (ink kept on the right of
 * the travel direction), so a y-flip into font space yields TrueType-correct
 * winding under nonzero fill.
 */

export interface Point {
  x: number
  y: number
}

const MIN_LOOP_AREA = 2.0 // px^2 — drops speckle noise

// Marching-squares case tables. Corner bits: TL=8 TR=4 BR=2 BL=1; cell edges:
// 0=T 1=R 2=B 3=L. Each case lists directed (entry -> exit) edge crossings
// with ink kept on the RIGHT of travel (verified by the orientation tests).
const CASE_TABLE: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  /* 0*/ [],
  /* 1*/ [[3, 2]],
  /* 2*/ [[2, 1]],
  /* 3*/ [[3, 1]],
  /* 4*/ [[1, 0]],
  /* 5*/ [], // saddle, resolved at runtime
  /* 6*/ [[2, 0]],
  /* 7*/ [[3, 0]],
  /* 8*/ [[0, 3]],
  /* 9*/ [[0, 2]],
  /*10*/ [], // saddle
  /*11*/ [[0, 1]],
  /*12*/ [[1, 3]],
  /*13*/ [[1, 2]],
  /*14*/ [[2, 3]],
  /*15*/ [],
]

const SADDLE_5_HIGH: ReadonlyArray<readonly [number, number]> = [
  [3, 0],
  [1, 2],
]
const SADDLE_5_LOW: ReadonlyArray<readonly [number, number]> = [
  [3, 2],
  [1, 0],
]
const SADDLE_10_HIGH: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [2, 3],
]
const SADDLE_10_LOW: ReadonlyArray<readonly [number, number]> = [
  [0, 3],
  [2, 1],
]

// Neighbor step per exit edge: dx, dy, and the entry edge in that neighbor.
const STEP: ReadonlyArray<readonly [number, number, number]> = [
  [0, -1, 2], // exit top -> cell above, enter through its bottom
  [1, 0, 3], // exit right -> enter left
  [0, 1, 0], // exit bottom -> enter top
  [-1, 0, 1], // exit left -> enter right
]

function interp(a: number, b: number, iso: number): number {
  const d = b - a
  return Math.abs(d) < 1e-12 ? 0.5 : (iso - a) / d
}

export function shoelace(pts: Point[]): number {
  let s = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % n]
    s += p.x * q.y - q.x * p.y
  }
  return s / 2
}

/**
 * Extracts closed sub-pixel iso-contours from a scalar field (values [0,1],
 * ink-high). Returns loops in pixel-center coordinates: outer loops with
 * positive shoelace (y-down), holes negative. Exposed for tests.
 */
export function traceContours(
  field: Float32Array,
  width: number,
  height: number,
  iso: number,
): Point[][] {
  // Pad with a zero border so ink touching the bitmap edge still closes.
  const w = width + 2
  const h = height + 2
  const f = new Float64Array(w * h)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      f[(y + 1) * w + (x + 1)] = field[y * width + x]
    }
  }

  // segs[(cy * cellsW + cx) * 4 + entryEdge] = exitEdge + 1 (0 = none)
  const cellsW = w - 1
  const cellsH = h - 1
  const segs = new Int8Array(cellsW * cellsH * 4)

  for (let cy = 0; cy < cellsH; cy++) {
    for (let cx = 0; cx < cellsW; cx++) {
      const tl = f[cy * w + cx]
      const tr = f[cy * w + cx + 1]
      const br = f[(cy + 1) * w + cx + 1]
      const bl = f[(cy + 1) * w + cx]
      const code =
        (tl >= iso ? 8 : 0) |
        (tr >= iso ? 4 : 0) |
        (br >= iso ? 2 : 0) |
        (bl >= iso ? 1 : 0)
      if (code === 0 || code === 15) continue
      let pairs: ReadonlyArray<readonly [number, number]>
      if (code === 5 || code === 10) {
        const high = (tl + tr + br + bl) / 4 >= iso
        pairs =
          code === 5
            ? high
              ? SADDLE_5_HIGH
              : SADDLE_5_LOW
            : high
              ? SADDLE_10_HIGH
              : SADDLE_10_LOW
      } else {
        pairs = CASE_TABLE[code]
      }
      const base = (cy * cellsW + cx) * 4
      for (const [entry, exit] of pairs) {
        segs[base + entry] = exit + 1
      }
    }
  }

  const edgePoint = (cy: number, cx: number, edge: number): Point => {
    const tl = f[cy * w + cx]
    const tr = f[cy * w + cx + 1]
    const br = f[(cy + 1) * w + cx + 1]
    const bl = f[(cy + 1) * w + cx]
    // the -1 shifts back from padded space to pixel-center space
    if (edge === 0) return { x: cx + interp(tl, tr, iso) - 1, y: cy - 1 }
    if (edge === 1) return { x: cx, y: cy + interp(tr, br, iso) - 1 }
    if (edge === 2) return { x: cx + interp(bl, br, iso) - 1, y: cy }
    return { x: cx - 1, y: cy + interp(tl, bl, iso) - 1 }
  }

  const visited = new Uint8Array(cellsW * cellsH * 4)
  const contours: Point[][] = []
  const maxSteps = cellsW * cellsH * 4 + 4

  for (let start = 0; start < segs.length; start++) {
    if (segs[start] === 0 || visited[start]) continue
    const loop: Point[] = []
    const startCell = start >> 2
    let cx = startCell % cellsW
    let cy = (startCell / cellsW) | 0
    let entry = start & 3
    let steps = 0
    while (steps++ < maxSteps) {
      const key = (cy * cellsW + cx) * 4 + entry
      if (segs[key] === 0 || visited[key]) break
      visited[key] = 1
      const exit = segs[key] - 1
      loop.push(edgePoint(cy, cx, exit))
      const step = STEP[exit]
      cx += step[0]
      cy += step[1]
      entry = step[2]
    }
    if (loop.length >= 3) contours.push(loop)
  }
  return contours
}

// --- contour post-processing ---------------------------------------------

function resample(pts: Point[], spacing: number): Point[] {
  const n = pts.length
  const lengths = new Float64Array(n)
  let total = 0
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % n]
    lengths[i] = Math.hypot(q.x - p.x, q.y - p.y)
    total += lengths[i]
  }
  if (total < spacing * 3) return pts
  const m = Math.max(8, Math.round(total / spacing))
  const step = total / m
  const out: Point[] = []
  let acc = 0
  let i = 0
  for (let k = 0; k < m; k++) {
    const target = k * step
    while (acc + lengths[i] < target) {
      acc += lengths[i]
      i = (i + 1) % n
    }
    const t = lengths[i] > 0 ? (target - acc) / lengths[i] : 0
    const p = pts[i]
    const q = pts[(i + 1) % n]
    out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })
  }
  return out
}

function detectCorners(
  pts: Point[],
  angleDeg: number,
  support: number,
): number[] {
  const n = pts.length
  if (n < support * 2 + 1) return []
  const cosThresh = Math.cos((angleDeg * Math.PI) / 180)
  // cosine of the turn angle at vertex i over the support window;
  // smaller value = sharper corner
  const turnCos = (i: number): number => {
    const p0 = pts[(i - support + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + support) % n]
    const v1x = p1.x - p0.x
    const v1y = p1.y - p0.y
    const v2x = p2.x - p1.x
    const v2y = p2.y - p1.y
    const l1 = Math.hypot(v1x, v1y) || 1e-9
    const l2 = Math.hypot(v2x, v2y) || 1e-9
    return (v1x * v2x + v1y * v2y) / (l1 * l2)
  }
  const candidates: number[] = []
  for (let i = 0; i < n; i++) {
    if (turnCos(i) < cosThresh) candidates.push(i)
  }
  if (candidates.length === 0) return []
  // non-maximum suppression: keep the sharpest of nearby candidates
  const keep: number[] = []
  const bySharpness = [...candidates].sort((a, b) => turnCos(a) - turnCos(b))
  for (const i of bySharpness) {
    let tooClose = false
    for (const j of keep) {
      const d = Math.min((i - j + n) % n, (j - i + n) % n)
      if (d <= support) {
        tooClose = true
        break
      }
    }
    if (!tooClose) keep.push(i)
  }
  return keep.sort((a, b) => a - b)
}

// --- Schneider least-squares cubic fitting (Graphics Gems "FitCurve") -----

type Bezier = readonly [Point, Point, Point, Point]

function bezierPoint(b: Bezier, t: number): Point {
  const mt = 1 - t
  const a = mt * mt * mt
  const c1 = 3 * mt * mt * t
  const c2 = 3 * mt * t * t
  const d = t * t * t
  return {
    x: a * b[0].x + c1 * b[1].x + c2 * b[2].x + d * b[3].x,
    y: a * b[0].y + c1 * b[1].y + c2 * b[2].y + d * b[3].y,
  }
}

function unit(x: number, y: number): Point {
  const l = Math.hypot(x, y) || 1e-9
  return { x: x / l, y: y / l }
}

function chordLengthParam(pts: Point[]): number[] {
  const u = [0]
  for (let i = 1; i < pts.length; i++) {
    u.push(
      u[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y),
    )
  }
  const total = u[u.length - 1] || 1
  return u.map((v) => v / total)
}

function generateBezier(
  pts: Point[],
  u: number[],
  tHat1: Point,
  tHat2: Point,
): Bezier {
  const n = pts.length
  const first = pts[0]
  const last = pts[n - 1]
  let c00 = 0
  let c01 = 0
  let c11 = 0
  let x0 = 0
  let x1 = 0
  for (let i = 0; i < n; i++) {
    const t = u[i]
    const mt = 1 - t
    const b1 = 3 * t * mt * mt
    const b2 = 3 * t * t * mt
    const a1x = tHat1.x * b1
    const a1y = tHat1.y * b1
    const a2x = tHat2.x * b2
    const a2y = tHat2.y * b2
    const b0 = mt * mt * mt
    const b3 = t * t * t
    const tmpx = pts[i].x - (first.x * (b0 + b1) + last.x * (b2 + b3))
    const tmpy = pts[i].y - (first.y * (b0 + b1) + last.y * (b2 + b3))
    c00 += a1x * a1x + a1y * a1y
    c01 += a1x * a2x + a1y * a2y
    c11 += a2x * a2x + a2y * a2y
    x0 += a1x * tmpx + a1y * tmpy
    x1 += a2x * tmpx + a2y * tmpy
  }
  const detC = c00 * c11 - c01 * c01
  let alphaL = Math.abs(detC) < 1e-12 ? 0 : (x0 * c11 - x1 * c01) / detC
  let alphaR = Math.abs(detC) < 1e-12 ? 0 : (c00 * x1 - c01 * x0) / detC
  const segLen = Math.hypot(last.x - first.x, last.y - first.y)
  const eps = 1e-6 * segLen
  if (alphaL < eps || alphaR < eps) {
    alphaL = alphaR = segLen / 3
  }
  return [
    first,
    { x: first.x + tHat1.x * alphaL, y: first.y + tHat1.y * alphaL },
    { x: last.x + tHat2.x * alphaR, y: last.y + tHat2.y * alphaR },
    last,
  ]
}

function computeMaxError(
  pts: Point[],
  bez: Bezier,
  u: number[],
): { err: number; split: number } {
  let maxErr = 0
  let split = pts.length >> 1
  for (let i = 1; i < pts.length - 1; i++) {
    const p = bezierPoint(bez, u[i])
    const dx = p.x - pts[i].x
    const dy = p.y - pts[i].y
    const err = dx * dx + dy * dy
    if (err > maxErr) {
      maxErr = err
      split = i
    }
  }
  return { err: Math.sqrt(maxErr), split }
}

function newtonRaphson(bez: Bezier, p: Point, u: number): number {
  const d = bezierPoint(bez, u)
  const dx = d.x - p.x
  const dy = d.y - p.y
  const q1: Point[] = []
  for (let i = 0; i < 3; i++) {
    q1.push({
      x: 3 * (bez[i + 1].x - bez[i].x),
      y: 3 * (bez[i + 1].y - bez[i].y),
    })
  }
  const q2: Point[] = []
  for (let i = 0; i < 2; i++) {
    q2.push({ x: 2 * (q1[i + 1].x - q1[i].x), y: 2 * (q1[i + 1].y - q1[i].y) })
  }
  const mt = 1 - u
  const d1x = mt * mt * q1[0].x + 2 * mt * u * q1[1].x + u * u * q1[2].x
  const d1y = mt * mt * q1[0].y + 2 * mt * u * q1[1].y + u * u * q1[2].y
  const d2x = mt * q2[0].x + u * q2[1].x
  const d2y = mt * q2[0].y + u * q2[1].y
  const num = dx * d1x + dy * d1y
  const den = d1x * d1x + d1y * d1y + dx * d2x + dy * d2y
  if (Math.abs(den) < 1e-12) return u
  return Math.min(1, Math.max(0, u - num / den))
}

function centerTangent(pts: Point[], i: number): Point {
  // backward-pointing tangent at a split point (Graphics Gems convention)
  return unit(pts[i - 1].x - pts[i + 1].x, pts[i - 1].y - pts[i + 1].y)
}

function fitCubic(
  pts: Point[],
  tHat1: Point,
  tHat2: Point,
  error: number,
): Bezier[] {
  if (pts.length === 2) {
    const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) / 3
    return [
      [
        pts[0],
        { x: pts[0].x + tHat1.x * d, y: pts[0].y + tHat1.y * d },
        { x: pts[1].x + tHat2.x * d, y: pts[1].y + tHat2.y * d },
        pts[1],
      ],
    ]
  }
  let u = chordLengthParam(pts)
  let bez = generateBezier(pts, u, tHat1, tHat2)
  let { err, split } = computeMaxError(pts, bez, u)
  if (err < error) return [bez]
  if (err < error * 4) {
    for (let k = 0; k < 4; k++) {
      u = u.map((t, i) => newtonRaphson(bez, pts[i], t))
      bez = generateBezier(pts, u, tHat1, tHat2)
      const r = computeMaxError(pts, bez, u)
      err = r.err
      split = r.split
      if (err < error) return [bez]
    }
  }
  const tan = centerTangent(pts, split)
  const left = fitCubic(pts.slice(0, split + 1), tHat1, tan, error)
  const right = fitCubic(
    pts.slice(split),
    { x: -tan.x, y: -tan.y },
    tHat2,
    error,
  )
  return left.concat(right)
}

type Segment = { kind: 'L'; p0: Point; p1: Point } | { kind: 'C'; bez: Bezier }

function fitContour(pts: Point[], corners: number[], error: number): Segment[] {
  const n = pts.length
  const spans: Point[][] = []
  if (corners.length === 0) {
    // fully smooth closed loop: introduce two artificial breaks for fitting
    corners = [0, n >> 1]
  }
  if (corners.length === 1) {
    // single corner: one span wrapping the whole loop back to itself
    const a = corners[0]
    const span: Point[] = []
    for (let j = 0; j <= n; j++) span.push(pts[(a + j) % n])
    spans.push(span)
  } else {
    for (let ci = 0; ci < corners.length; ci++) {
      const a = corners[ci]
      const b = corners[(ci + 1) % corners.length]
      const len = (b - a + n) % n
      const span: Point[] = []
      for (let j = 0; j <= len; j++) span.push(pts[(a + j) % n])
      spans.push(span)
    }
  }

  const segments: Segment[] = []
  for (const span of spans) {
    if (span.length < 2) continue
    const p0 = span[0]
    const p1 = span[span.length - 1]
    const chordX = p1.x - p0.x
    const chordY = p1.y - p0.y
    const chordLen = Math.hypot(chordX, chordY)
    // straight-line shortcut when the span barely deviates from its chord
    if (chordLen > 1e-9) {
      let maxDev = 0
      for (const p of span) {
        const t = Math.min(
          1,
          Math.max(
            0,
            ((p.x - p0.x) * chordX + (p.y - p0.y) * chordY) /
              (chordLen * chordLen),
          ),
        )
        maxDev = Math.max(
          maxDev,
          Math.hypot(p.x - (p0.x + chordX * t), p.y - (p0.y + chordY * t)),
        )
      }
      if (maxDev < error * 0.75) {
        segments.push({ kind: 'L', p0, p1 })
        continue
      }
    }
    const t1 = unit(span[1].x - span[0].x, span[1].y - span[0].y)
    const t2 = unit(
      span[span.length - 2].x - span[span.length - 1].x,
      span[span.length - 2].y - span[span.length - 1].y,
    )
    for (const bez of fitCubic(span, t1, t2, error)) {
      segments.push({ kind: 'C', bez })
    }
  }
  return segments
}

const fmt = (v: number): string => {
  const r = Math.round(v * 100) / 100
  return Object.is(r, -0) ? '0' : r.toString()
}

function segmentsToPath(segments: Segment[]): string {
  if (segments.length === 0) return ''
  let d = ''
  let started = false
  for (const seg of segments) {
    const start = seg.kind === 'L' ? seg.p0 : seg.bez[0]
    if (!started) {
      started = true
      d += `M ${fmt(start.x)} ${fmt(start.y)}`
    }
    if (seg.kind === 'L') {
      d += ` L ${fmt(seg.p1.x)} ${fmt(seg.p1.y)}`
    } else {
      const c1 = seg.bez[1]
      const c2 = seg.bez[2]
      const p3 = seg.bez[3]
      d += ` C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(p3.x)} ${fmt(p3.y)}`
    }
  }
  return d + ' Z'
}

function polylineToPath(pts: Point[]): string {
  if (pts.length < 3) return ''
  let d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${fmt(pts[i].x)} ${fmt(pts[i].y)}`
  }
  return d + ' Z'
}

// Closure-safe Ramer-Douglas-Peucker for polygon-mode output: the closed
// loop is split at vertex 0 and its farthest vertex, each half simplified
// as an open polyline.
function rdp(pts: Point[], epsilon: number): Point[] {
  if (pts.length <= 3) return pts
  const sqSegDist = (p: Point, a: Point, b: Point): number => {
    let x = a.x
    let y = a.y
    let dx = b.x - x
    let dy = b.y - y
    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy)
      if (t > 1) {
        x = b.x
        y = b.y
      } else if (t > 0) {
        x += dx * t
        y += dy * t
      }
    }
    dx = p.x - x
    dy = p.y - y
    return dx * dx + dy * dy
  }
  const simplifyOpen = (seg: Point[]): Point[] => {
    if (seg.length <= 2) return seg
    let maxD = 0
    let idx = 0
    for (let i = 1; i < seg.length - 1; i++) {
      const dist = sqSegDist(seg[i], seg[0], seg[seg.length - 1])
      if (dist > maxD) {
        maxD = dist
        idx = i
      }
    }
    if (maxD > epsilon * epsilon) {
      const left = simplifyOpen(seg.slice(0, idx + 1))
      const right = simplifyOpen(seg.slice(idx))
      return left.slice(0, -1).concat(right)
    }
    return [seg[0], seg[seg.length - 1]]
  }
  let far = 1
  let maxD = -1
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[0].x
    const dy = pts[i].y - pts[0].y
    const dist = dx * dx + dy * dy
    if (dist > maxD) {
      maxD = dist
      far = i
    }
  }
  const half1 = simplifyOpen(pts.slice(0, far + 1))
  const half2 = simplifyOpen(pts.slice(far).concat([pts[0]]))
  return half1.slice(0, -1).concat(half2.slice(0, -1))
}

/**
 * Main entry point.
 * @param pixels Grayscale ink intensity, ink-high. Float32Array values in
 *               [0,1]; Uint8Array values in [0,255].
 * @param threshold Iso level in [0,255]; the outline follows the sub-pixel
 *                  interpolated threshold/255 level set of the image.
 * @param smoothing < 0.1 emits simplified polygons; otherwise sets the
 *                  Bezier fit tolerance in pixels (1.0 ≈ 0.4px).
 */
export function traceGrayscaleImage(
  pixels: Uint8Array | Float32Array,
  width: number,
  height: number,
  threshold: number,
  smoothing: number = 1.0,
): string {
  const field = new Float32Array(width * height)
  if (pixels instanceof Float32Array) {
    field.set(pixels)
  } else {
    for (let i = 0; i < pixels.length; i++) field[i] = pixels[i] / 255
  }
  const iso = threshold / 255

  const loops = traceContours(field, width, height, iso).filter(
    (l) => Math.abs(shoelace(l)) >= MIN_LOOP_AREA,
  )

  const parts: string[] = []
  for (const loop of loops) {
    const rs = resample(loop, 0.6)
    if (smoothing < 0.1) {
      const path = polylineToPath(rdp(rs, 0.3))
      if (path) parts.push(path)
    } else {
      const error = 0.15 + 0.25 * smoothing
      const corners = detectCorners(rs, 55, 2)
      const path = segmentsToPath(fitContour(rs, corners, error))
      if (path) parts.push(path)
    }
  }
  return parts.join(' ')
}
