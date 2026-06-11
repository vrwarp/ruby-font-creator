// Main-thread client for the zi2zi worker (MX-Font ONNX inference) plus the
// glyph rasterization helpers shared by the single-character and batch flows.
//
// Rendering must mirror the preprocessing the model was validated with
// (scripts/test-mxfont-quality.py render()): the glyph's ink bounding box is
// placed on a square white canvas with a 20px pad at font size 150, then the
// canvas is resized to 128x128. Tensors are ink-high [0,1] Float32Arrays.

export const MODEL_SIZE = 128

interface PendingRequest {
  resolve: (value: any) => void
  reject: (err: Error) => void
}

export class Zi2ziClient {
  private worker: Worker | null = null
  private pending = new Map<number, PendingRequest>()
  private nextId = 1
  private initialized = false

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    this.worker = new Worker(new URL('./zi2zi-worker.ts', import.meta.url), {
      type: 'module',
    })
    this.worker.onmessage = (e: MessageEvent) => {
      const { type, id, message, output } = e.data
      const req = this.pending.get(id)
      if (!req) return
      this.pending.delete(id)
      if (type === 'error') {
        req.reject(new Error(message))
      } else {
        req.resolve(output)
      }
    }
    this.worker.onerror = (e: ErrorEvent) => {
      const err = new Error(e.message || 'zi2zi worker crashed')
      for (const req of this.pending.values()) req.reject(err)
      this.pending.clear()
    }
    return this.worker
  }

  private request<T>(
    msg: Record<string, unknown>,
    transfer?: Transferable[],
  ): Promise<T> {
    const worker = this.ensureWorker()
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      worker.postMessage({ ...msg, id }, (transfer as any) || [])
    })
  }

  // assetBase: absolute base URL under which onnx/ and models/ are served
  async init(variant: 'int8' | 'fp32' = 'int8'): Promise<void> {
    if (this.initialized) return
    const assetBase = new URL('./', document.baseURI).href
    await this.request({ type: 'init', assetBase, variant })
    this.initialized = true
  }

  async setStyle(refs: Float32Array[]): Promise<void> {
    await this.request({ type: 'set-style', refs })
  }

  async generate(content: Float32Array): Promise<Float32Array> {
    return this.request<Float32Array>({ type: 'generate', content }, [
      content.buffer,
    ])
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.pending.clear()
    this.initialized = false
  }
}

// Renders a single character to a model-input tensor: ink-high [0,1],
// 128x128. Returns null when the font has no usable outline for the char.
export function renderGlyphTensor(
  font: any, // opentype.Font
  char: string,
): Float32Array | null {
  const glyph = font.charToGlyph(char)
  if (!glyph || glyph.index === 0) return null

  const fontSize = 150
  const pad = 20
  const path = font.getPath(char, 0, 0, fontSize)
  const bb = path.getBoundingBox()
  const w = bb.x2 - bb.x1
  const h = bb.y2 - bb.y1
  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return null

  const maxSize = Math.max(w, h)
  let startW: number
  let startH: number
  if (w < h) {
    startW = (h - w) / 2 + pad
    startH = pad
  } else {
    startW = pad
    startH = (w - h) / 2 + pad
  }

  const big = document.createElement('canvas')
  const bigSize = Math.ceil(maxSize + pad * 2)
  big.width = bigSize
  big.height = bigSize
  const bctx = big.getContext('2d')!
  bctx.fillStyle = '#ffffff'
  bctx.fillRect(0, 0, bigSize, bigSize)
  const drawPath = font.getPath(char, startW - bb.x1, startH - bb.y1, fontSize)
  bctx.fillStyle = '#000000'
  bctx.beginPath()
  drawPath.draw(bctx)
  bctx.fill()

  const small = document.createElement('canvas')
  small.width = MODEL_SIZE
  small.height = MODEL_SIZE
  const sctx = small.getContext('2d')!
  sctx.imageSmoothingEnabled = true
  sctx.imageSmoothingQuality = 'high'
  sctx.fillStyle = '#ffffff'
  sctx.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE)
  sctx.drawImage(big, 0, 0, bigSize, bigSize, 0, 0, MODEL_SIZE, MODEL_SIZE)

  const imgData = sctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE)
  const ink = new Float32Array(MODEL_SIZE * MODEL_SIZE)
  for (let i = 0; i < ink.length; i++) {
    const r = imgData.data[i * 4]
    const g = imgData.data[i * 4 + 1]
    const b = imgData.data[i * 4 + 2]
    ink[i] = 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }
  return ink
}

// Structurally rich characters preferred as style references; both scripts so
// any font yields usable refs. Order matters — first hits win.
const STYLE_REF_CANDIDATES = [
  ...'永酬國書馬發樂變說鬱愛龍體靈鷹永酬国书马发乐变说郁爱龙体灵鹰的一是不了人我在有他这中大来上',
]

export function pickStyleRefs(
  font: any, // opentype.Font
  count = 6,
): { chars: string[]; tensors: Float32Array[] } {
  const chars: string[] = []
  const tensors: Float32Array[] = []
  const seen = new Set<string>()
  for (const char of STYLE_REF_CANDIDATES) {
    if (seen.has(char)) continue
    seen.add(char)
    const tensor = renderGlyphTensor(font, char)
    if (tensor) {
      chars.push(char)
      tensors.push(tensor)
      if (chars.length >= count) break
    }
  }
  // Last resort: walk the cmap for any non-empty glyphs
  if (chars.length < count) {
    const cmap = font.tables?.cmap?.glyphIndexMap || {}
    for (const cpStr of Object.keys(cmap)) {
      const cp = Number(cpStr)
      if (cp < 0x3400) continue // CJK only — Latin glyphs make poor style refs
      const char = String.fromCodePoint(cp)
      if (seen.has(char)) continue
      seen.add(char)
      const tensor = renderGlyphTensor(font, char)
      if (tensor) {
        chars.push(char)
        tensors.push(tensor)
        if (chars.length >= count) break
      }
    }
  }
  return { chars, tensors }
}
