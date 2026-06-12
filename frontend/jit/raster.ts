// Glyph rasterization for zi2zi-JiT conditioning, replicating the offline
// pipeline's GlyphRenderer contract (vendor/zi2zi-jit/data_processing/
// font_utils.py) rather than the MX-Font renderGlyphTensor:
//  - font size = floor(resolution * 0.8), glyphs keep their natural size
//  - one GLOBAL centering offset averaged over up to 50 sample glyphs, so
//    relative glyph proportions survive (per-glyph centering would erase the
//    very style signal the model trains on)
//  - white background, black ink, RGB replicated to 3 channels, CHW layout,
//    normalized uint8/255 * 2 - 1 into [-1, 1]
//  - style input = ONE reference glyph downscaled to 128x128 (the offline
//    2x2 grids are storage; the style encoder always consumes one cell)

export const JIT_CONTENT_SIZE = 256
export const JIT_STYLE_SIZE = 128

// shared scale/shift for one augmented training pair
export interface GlyphJitter {
  scale: number
  dx: number
  dy: number
}

const SAMPLE_LIMIT = 50

// opentype.js Font — typed loosely to match the rest of the frontend
type OTFont = any

export class JitRasterizer {
  private font: OTFont
  private resolution: number
  private fontSize: number
  private offsetX: number
  private offsetY: number
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  constructor(font: OTFont, resolution: number) {
    this.font = font
    this.resolution = resolution
    this.fontSize = Math.floor(resolution * 0.8)
    this.canvas = document.createElement('canvas')
    this.canvas.width = resolution
    this.canvas.height = resolution
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
    const [ox, oy] = this.computeGlobalOffset()
    this.offsetX = ox
    this.offsetY = oy
  }

  hasGlyph(cp: number): boolean {
    const glyph = this.font.charToGlyph(String.fromCodePoint(cp))
    return !!glyph && glyph.index !== 0
  }

  // the internal canvas, holding whatever renderToCanvas last drew — for
  // preview thumbnails
  get canvasEl(): HTMLCanvasElement {
    return this.canvas
  }

  // average of per-glyph centering offsets over a sample of the font's CJK
  // coverage (mirrors GlyphRenderer._calculate_global_offset)
  private computeGlobalOffset(): [number, number] {
    const res = this.resolution
    const cps: number[] = []
    const cmap = this.font.tables?.cmap?.glyphIndexMap ?? {}
    for (const key of Object.keys(cmap)) {
      const cp = Number(key)
      if (cp >= 0x3400 && cp <= 0x9fff) {
        cps.push(cp)
        if (cps.length >= SAMPLE_LIMIT) break
      }
    }
    const xs: number[] = []
    const ys: number[] = []
    for (const cp of cps) {
      const path = this.font.getPath(
        String.fromCodePoint(cp),
        0,
        0,
        this.fontSize,
      )
      const bb = path.getBoundingBox()
      const w = bb.x2 - bb.x1
      const h = bb.y2 - bb.y1
      if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) continue
      xs.push((res - w) / 2 - bb.x1)
      ys.push((res - h) / 2 - bb.y1)
    }
    if (!xs.length) return [res / 2, res / 2]
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
    return [avg(xs), avg(ys)]
  }

  // draw one glyph onto the internal canvas; returns false for missing or
  // blank glyphs. jitter applies the offline resize_and_random_crop analog
  // (scale about the canvas center plus a small shift) — pass the SAME
  // jitter to the target and content renders of one training sample so the
  // pair stays aligned.
  renderToCanvas(cp: number, jitter?: GlyphJitter): boolean {
    const glyph = this.font.charToGlyph(String.fromCodePoint(cp))
    if (!glyph || glyph.index === 0) return false
    const { ctx, resolution } = this
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, resolution, resolution)
    const s = jitter?.scale ?? 1
    const half = resolution / 2
    const ox = half + (this.offsetX - half) * s + (jitter?.dx ?? 0)
    const oy = half + (this.offsetY - half) * s + (jitter?.dy ?? 0)
    const path = this.font.getPath(
      String.fromCodePoint(cp),
      ox,
      oy,
      this.fontSize * s,
    )
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    path.draw(ctx)
    ctx.fill()
    return true
  }

  // CHW [-1,1] tensor of the current canvas content
  tensorFromCanvas(canvas?: HTMLCanvasElement): Float32Array {
    const src = canvas ?? this.canvas
    const size = src.width
    const sctx = src.getContext('2d', { willReadFrequently: true })!
    const img = sctx.getImageData(0, 0, size, size)
    const out = new Float32Array(3 * size * size)
    const plane = size * size
    for (let i = 0; i < plane; i++) {
      const r = img.data[i * 4]
      const g = img.data[i * 4 + 1]
      const b = img.data[i * 4 + 2]
      const gray = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      const v = gray * 2 - 1
      out[i] = v
      out[plane + i] = v
      out[2 * plane + i] = v
    }
    return out
  }

  // [3*res*res] CHW in [-1,1], or null when the glyph is absent/blank
  renderTensor(cp: number, jitter?: GlyphJitter): Float32Array | null {
    if (!this.renderToCanvas(cp, jitter)) return null
    const t = this.tensorFromCanvas()
    // blank-detection: all-white means the cmap entry exists but has no ink
    let min = 1
    const plane = this.resolution * this.resolution
    for (let i = 0; i < plane; i++) if (t[i] < min) min = t[i]
    if (min > 0.96) return null
    return t
  }

  // Style input: ONE reference glyph at 128x128 -> [3*128*128] CHW [-1,1].
  // The offline pipeline stores 2x2 reference grids but the style encoder
  // always consumes a single 128px cell (create_reference_grid followed by
  // .crop((0,0,128,128)) at generation; a random cell during training) —
  // feeding the whole grid downscaled puts the frozen encoder far
  // off-distribution. refCps comes from the per-character seeded pick; the
  // first entry plays the offline crop-(0,0) role.
  renderStyleImage(refCps: number[]): Float32Array | null {
    if (refCps.length === 0) return null
    if (!this.renderToCanvas(refCps[0])) return null
    const style = document.createElement('canvas')
    style.width = JIT_STYLE_SIZE
    style.height = JIT_STYLE_SIZE
    const sctx = style.getContext('2d', { willReadFrequently: true })!
    sctx.imageSmoothingEnabled = true
    sctx.imageSmoothingQuality = 'high'
    sctx.drawImage(
      this.canvas,
      0,
      0,
      this.resolution,
      this.resolution,
      0,
      0,
      JIT_STYLE_SIZE,
      JIT_STYLE_SIZE,
    )
    return this.tensorFromCanvas(style)
  }
}

// sampler output [1,3,256,256] CHW in ~[-1,1] with ink black -> ink-high
// grayscale [0,1] for traceGrayscaleImage
export function sampleToInk(image: Float32Array, size: number): Float32Array {
  const plane = size * size
  const ink = new Float32Array(plane)
  for (let i = 0; i < plane; i++) {
    const v = (image[i] + image[plane + i] + image[2 * plane + i]) / 3
    ink[i] = Math.max(0, Math.min(1, (1 - v) / 2))
  }
  return ink
}
