/**
 * Grayscale bitmap -> SVG path vectorizer.
 *
 * The input grid is binarized against a threshold, then every boundary loop
 * (outer contours AND interior holes, e.g. the counter of 口) is traced by
 * crack following: walking the unit-length "cracks" between an ink pixel and
 * a background pixel on the pixel-corner lattice, always keeping ink on the
 * right-hand side of the walking direction (coordinates are y-down).
 *
 * That single convention fixes the winding deterministically:
 *   - outer contours come out screen-clockwise -> positive shoelace sum,
 *     where shoelace = sum((x_i * y_{i+1}) - (x_{i+1} * y_i))
 *   - interior holes come out the opposite way -> negative shoelace sum
 * The consumer flips y when mapping to TrueType font units, so the opposite
 * winding is exactly what makes holes render as holes under nonzero fill.
 *
 * Out-of-bounds is treated as background, so ink touching the bitmap border
 * still produces closed loops along the border.
 */

export interface Point {
  x: number
  y: number
}

// Walk directions on the corner lattice: East, South, West, North (y-down).
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

/**
 * Traces every boundary loop of a binary image (nonzero = ink) and returns
 * the raw loops of integer pixel-corner coordinates, one point per crack
 * step, before any simplification. Outer loops have a positive shoelace sum,
 * hole loops a negative one. Exposed for tests and debugging.
 */
export function traceContours(
  binary: Uint8Array,
  width: number,
  height: number,
): Point[][] {
  const loops: Point[][] = []
  if (width <= 0 || height <= 0) return loops

  const ink = (x: number, y: number): boolean =>
    x >= 0 && x < width && y >= 0 && y < height && binary[y * width + x] !== 0

  // One flag per directed crack edge, keyed by origin corner and direction.
  // Corners form a (width + 1) x (height + 1) lattice.
  const cornersPerRow = width + 1
  const visited = new Uint8Array(cornersPerRow * (height + 1) * 4)
  const edgeKey = (cx: number, cy: number, dir: number): number =>
    (cy * cornersPerRow + cx) * 4 + dir

  /**
   * True when the directed crack edge leaving corner (cx, cy) towards `dir`
   * has ink on its right and background on its left (y-down screen sense).
   */
  const isBoundaryEdge = (cx: number, cy: number, dir: number): boolean => {
    switch (dir) {
      case 0: // East: ink below the crack, background above
        return ink(cx, cy) && !ink(cx, cy - 1)
      case 1: // South: ink west of the crack, background east
        return ink(cx - 1, cy) && !ink(cx, cy)
      case 2: // West: ink above the crack, background below
        return ink(cx - 1, cy - 1) && !ink(cx - 1, cy)
      default: // North: ink east of the crack, background west
        return ink(cx, cy - 1) && !ink(cx - 1, cy - 1)
    }
  }

  /**
   * Picks the outgoing direction at the corner we just arrived at. The right
   * turn is preferred so that at ambiguous corners (two ink pixels touching
   * diagonally) the walk keeps hugging the same ink pixel. This pairs every
   * incoming boundary edge with a unique outgoing one, making the successor
   * map a bijection on directed boundary edges - so each loop returns to its
   * starting edge and every edge belongs to exactly one loop.
   */
  const nextDir = (cx: number, cy: number, incoming: number): number => {
    const right = (incoming + 1) & 3
    if (isBoundaryEdge(cx, cy, right)) return right
    if (isBoundaryEdge(cx, cy, incoming)) return incoming
    const left = (incoming + 3) & 3
    if (isBoundaryEdge(cx, cy, left)) return left
    return -1 // unreachable on a consistent grid; defensive only
  }

  const trace = (sx: number, sy: number, sdir: number): Point[] => {
    const points: Point[] = []
    let cx = sx
    let cy = sy
    let dir = sdir
    // The walk terminates naturally by revisiting its starting directed
    // edge; the cap (more steps than directed edges exist) is defensive.
    const cap = visited.length + 1
    for (let step = 0; step < cap; step++) {
      visited[edgeKey(cx, cy, dir)] = 1
      points.push({ x: cx, y: cy })
      cx += DX[dir]
      cy += DY[dir]
      dir = nextDir(cx, cy, dir)
      if (dir < 0 || (cx === sx && cy === sy && dir === sdir)) break
    }
    return points
  }

  // Scan every ink pixel for unvisited boundary cracks and start a new loop
  // on each. Every crack is expressed as the directed edge that keeps the
  // ink pixel on the right of the walk.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (binary[y * width + x] === 0) continue
      // background above -> East edge from corner (x, y)
      if (!ink(x, y - 1) && !visited[edgeKey(x, y, 0)]) {
        loops.push(trace(x, y, 0))
      }
      // background to the right -> South edge from corner (x + 1, y)
      if (!ink(x + 1, y) && !visited[edgeKey(x + 1, y, 1)]) {
        loops.push(trace(x + 1, y, 1))
      }
      // background below -> West edge from corner (x + 1, y + 1)
      if (!ink(x, y + 1) && !visited[edgeKey(x + 1, y + 1, 2)]) {
        loops.push(trace(x + 1, y + 1, 2))
      }
      // background to the left -> North edge from corner (x, y + 1)
      if (!ink(x - 1, y) && !visited[edgeKey(x, y + 1, 3)]) {
        loops.push(trace(x, y + 1, 3))
      }
    }
  }

  return loops
}

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

/** Drops exactly collinear vertices from a closed polygon (with wrap). */
function removeCollinear(points: Point[]): Point[] {
  const n = points.length
  if (n < 3) return points.slice()
  const out: Point[] = []
  for (let i = 0; i < n; i++) {
    const prev = points[(i + n - 1) % n]
    const cur = points[i]
    const next = points[(i + 1) % n]
    const cross =
      (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x)
    if (cross !== 0) out.push(cur)
  }
  return out
}

/** Squared distance from point p to the segment a-b. */
function sqSegDist(p: Point, a: Point, b: Point): number {
  let x = a.x
  let y = a.y
  let dx = b.x - x
  let dy = b.y - y
  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy)
    if (t >= 1) {
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

/** Ramer-Douglas-Peucker on an open polyline; both endpoints are kept. */
function rdpOpen(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points.slice()
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const epsSq = epsilon * epsilon
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let maxDist = epsSq
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(points[i], points[first], points[last])
      if (d > maxDist) {
        maxDist = d
        index = i
      }
    }
    if (index !== -1) {
      keep[index] = 1
      if (index - first > 1) stack.push([first, index])
      if (last - index > 1) stack.push([index, last])
    }
  }
  return points.filter((_, i) => keep[i] === 1)
}

/**
 * Simplifies a closed polygon without breaking closure: drop collinear crack
 * vertices, then anchor the loop at vertex 0 (a true corner) and the vertex
 * farthest from it, and run RDP on the two open halves between the anchors.
 */
function simplifyClosed(points: Point[], epsilon: number): Point[] {
  const corners = removeCollinear(points)
  if (corners.length <= 3) return corners
  let split = 1
  let best = -1
  for (let i = 1; i < corners.length; i++) {
    const dx = corners[i].x - corners[0].x
    const dy = corners[i].y - corners[0].y
    const d = dx * dx + dy * dy
    if (d > best) {
      best = d
      split = i
    }
  }
  const half1 = rdpOpen(corners.slice(0, split + 1), epsilon)
  const half2 = rdpOpen([...corners.slice(split), corners[0]], epsilon)
  return [...half1.slice(0, -1), ...half2.slice(0, -1)]
}

/** Formats a coordinate with at most two decimals and no negative zero. */
function fmt(n: number): string {
  const r = Math.round(n * 100) / 100
  return Object.is(r, -0) ? '0' : String(r)
}

/** Renders a closed polygon as straight absolute line segments. */
function polygonPath(points: Point[]): string {
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${fmt(points[i].x)} ${fmt(points[i].y)}`
  }
  return d + ' Z'
}

/**
 * Renders a closed polygon as cubic Bezier segments with Catmull-Rom-style
 * control points scaled by the smoothing factor. The curve passes through
 * every polygon vertex and the last segment ends exactly on the start point.
 */
function smoothPath(points: Point[], smoothing: number): string {
  const n = points.length
  if (n < 3) return polygonPath(points)
  const k = smoothing / 6
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`
  for (let i = 0; i < n; i++) {
    const p0 = points[(i + n - 1) % n]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const p3 = points[(i + 2) % n]
    const c1x = p1.x + (p2.x - p0.x) * k
    const c1y = p1.y + (p2.y - p0.y) * k
    const c2x = p2.x - (p3.x - p1.x) * k
    const c2y = p2.y - (p3.y - p1.y) * k
    d +=
      ` C ${fmt(c1x)} ${fmt(c1y)}` +
      ` ${fmt(c2x)} ${fmt(c2y)}` +
      ` ${fmt(p2.x)} ${fmt(p2.y)}`
  }
  return d + ' Z'
}

/**
 * Traces a grayscale image into an SVG path string using absolute commands,
 * each contour closed with 'Z'. Returns '' when the image contains no ink.
 *
 * @param pixels Flat grayscale values, row-major. Float32Array values are
 *   expected in [0, 1] and are scaled by 255 before thresholding.
 * @param width Grid width in pixels.
 * @param height Grid height in pixels.
 * @param threshold Binarization threshold in 0-255; a pixel is ink (solid)
 *   when its scaled value is >= threshold.
 * @param smoothing Bezier smoothing factor, default 1.0. Values below 0.1
 *   emit straight 'L' polygons; otherwise the simplified polygons are
 *   rendered as cubic Bezier ('C') segments.
 */
export function traceGrayscaleImage(
  pixels: Uint8Array | Float32Array,
  width: number,
  height: number,
  threshold: number,
  smoothing: number = 1.0,
): string {
  if (width <= 0 || height <= 0) return ''

  const binary = new Uint8Array(width * height)
  const isFloat = pixels instanceof Float32Array
  const count = Math.min(pixels.length, width * height)
  for (let i = 0; i < count; i++) {
    const value = isFloat ? pixels[i] * 255 : pixels[i]
    if (value >= threshold) binary[i] = 1
  }

  const contours = traceContours(binary, width, height)
  const parts: string[] = []
  for (const contour of contours) {
    const simplified = simplifyClosed(contour, 0.75)
    if (simplified.length < 3) continue
    if (Math.abs(shoelace(simplified)) / 2 < 1e-6) continue
    parts.push(
      smoothing >= 0.1
        ? smoothPath(simplified, smoothing)
        : polygonPath(simplified),
    )
  }
  return parts.join(' ')
}
