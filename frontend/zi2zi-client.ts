// Main-thread client for the zi2zi worker (MX-Font ONNX inference) plus the
// glyph rasterization helpers shared by the single-character and batch flows.
//
// Rendering must mirror the preprocessing the model was validated with
// (scripts/test-mxfont-quality.py render()): the glyph's ink bounding box is
// placed on a square white canvas with a 20px pad at font size 150, then the
// canvas is resized to 128x128. Tensors are ink-high [0,1] Float32Arrays.

export const MODEL_SIZE = 128

// Averaged MX-Font style factors; computed once per font by one worker and
// shareable with sibling pool workers without re-encoding the refs.
export interface StyleFactors {
  last: Float32Array
  lastDims: number[]
  skip: Float32Array
  skipDims: number[]
}

interface PendingRequest {
  resolve: (value: any) => void
  reject: (err: Error) => void
}

export type Zi2ziEp = 'webgpu' | 'wasm'

// WebGPU is used only on non-WebKit browsers (ort-web's JSEP build misbehaves
// in Safari — microsoft/onnxruntime#26827) with a live adapter.
let webGpuProbe: Promise<boolean> | null = null
export function detectWebGpu(): Promise<boolean> {
  if (!webGpuProbe) {
    webGpuProbe = (async () => {
      try {
        const ua = navigator.userAgent
        const isWebKit =
          /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)
        if (isWebKit) return false
        if (!('gpu' in navigator)) return false
        const adapter = await (navigator as any).gpu.requestAdapter()
        return !!adapter
      } catch {
        return false
      }
    })()
  }
  return webGpuProbe
}

export class Zi2ziClient {
  private worker: Worker | null = null
  private pending = new Map<number, PendingRequest>()
  private nextId = 1
  private initialized = false
  ep: Zi2ziEp | null = null

  private spawnWorker(ep: Zi2ziEp): Worker {
    // both URLs are static literals so vite bundles both entries; the 26 MB
    // JSEP runtime is only ever downloaded when the webgpu worker is spawned
    const worker =
      ep === 'webgpu'
        ? new Worker(new URL('./zi2zi-worker-webgpu.ts', import.meta.url), {
            type: 'module',
          })
        : new Worker(new URL('./zi2zi-worker.ts', import.meta.url), {
            type: 'module',
          })
    worker.onmessage = (e: MessageEvent) => {
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
    worker.onerror = (e: ErrorEvent) => {
      const err = new Error(e.message || 'zi2zi worker crashed')
      for (const req of this.pending.values()) req.reject(err)
      this.pending.clear()
    }
    return worker
  }

  private request<T>(
    msg: Record<string, unknown>,
    transfer?: Transferable[],
  ): Promise<T> {
    if (!this.worker) throw new Error('Client not initialized')
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker!.postMessage({ ...msg, id }, (transfer as any) || [])
    })
  }

  // Picks WebGPU (fp32 model) where supported, plain WASM (int8) elsewhere.
  // `ep: 'wasm'` forces the portable path (used for pool siblings and tests).
  async init(
    variant?: 'int8' | 'fp16' | 'fp32',
    opt?: string,
    ep: Zi2ziEp | 'auto' = 'auto',
  ): Promise<Zi2ziEp> {
    if (this.initialized) return this.ep!
    const chosen: Zi2ziEp =
      ep === 'auto' ? ((await detectWebGpu()) ? 'webgpu' : 'wasm') : ep
    this.worker = this.spawnWorker(chosen)
    const assetBase = new URL('./', document.baseURI).href
    // int8 ops have no WebGPU kernels (per-node CPU fallback is slower than
    // pure wasm), so the webgpu worker gets the fp32 graphs (fp16 rejected:
    // blank output for some style inputs — see zi2zi-worker-webgpu.ts)
    const v = variant ?? (chosen === 'webgpu' ? 'fp32' : 'int8')
    await this.request({ type: 'init', assetBase, variant: v, opt })
    this.ep = chosen
    this.initialized = true
    return chosen
  }

  async setStyle(refs: Float32Array[]): Promise<StyleFactors> {
    return this.request<StyleFactors>({ type: 'set-style', refs })
  }

  async setStyleRaw(factors: StyleFactors): Promise<void> {
    // structured-clone (not transfer): the caller keeps the factors for
    // further workers
    await this.request({ type: 'set-style-raw', factors })
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
    this.ep = null
  }
}

// Worker pool for batch generation. On WebGPU one worker is enough (the GPU
// is the parallel resource); on the WASM path it spawns several independent
// single-threaded workers — true parallelism without crossOriginIsolated.
// Style factors are computed once by the seed client and broadcast raw to
// siblings, so refs are not re-encoded per worker.
export class Zi2ziPool {
  readonly clients: Zi2ziClient[]

  constructor(seed: Zi2ziClient) {
    this.clients = [seed]
  }

  static targetSize(ep: Zi2ziEp): number {
    if (ep === 'webgpu') return 1
    const cores = navigator.hardwareConcurrency || 4
    let size = Math.min(4, Math.max(1, Math.ceil(cores / 2) - 1))
    const memGb = (navigator as any).deviceMemory
    if (memGb && memGb <= 4) size = Math.min(size, 2)
    return size
  }

  // Grows the pool to the EP-appropriate size and pushes the style factors
  // to every sibling. The seed client must already be initialized + styled.
  async grow(styleFactors: StyleFactors | null): Promise<number> {
    const ep = this.clients[0].ep
    if (!ep) throw new Error('Pool seed client not initialized')
    const target = Zi2ziPool.targetSize(ep)
    const newcomers: Zi2ziClient[] = []
    while (this.clients.length < target) {
      const c = new Zi2ziClient()
      this.clients.push(c)
      newcomers.push(c)
    }
    await Promise.all(newcomers.map((c) => c.init(undefined, undefined, ep)))
    if (styleFactors) {
      await Promise.all(newcomers.map((c) => c.setStyleRaw(styleFactors)))
    }
    return this.clients.length
  }

  async setStyleAll(factors: StyleFactors): Promise<void> {
    await Promise.all(this.clients.map((c) => c.setStyleRaw(factors)))
  }

  // Runs `work(client, index)` over indices 0..count-1 with one in-flight
  // item per worker. Stops dispatching when shouldStop() turns true.
  async run(
    count: number,
    work: (client: Zi2ziClient, index: number) => Promise<void>,
    shouldStop: () => boolean,
  ): Promise<void> {
    let next = 0
    await Promise.all(
      this.clients.map(async (client) => {
        while (!shouldStop()) {
          const i = next++
          if (i >= count) break
          await work(client, i)
        }
      }),
    )
  }

  disposeSiblings() {
    for (const c of this.clients.slice(1)) c.dispose()
    this.clients.length = 1
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
