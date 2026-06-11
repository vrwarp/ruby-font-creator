// Web Worker: few-shot Chinese glyph generation (zi2zi-style) powered by the
// MX-Font generator (clovaai/mxfont, MIT) exported to ONNX and executed with
// onnxruntime-web (WASM).
//
// Inference is split into two graphs (see scripts/export-mxfont-onnx.py):
//   mxfont_encoder.onnx  image [1,1,128,128] -> style/content factor tensors
//   mxfont_decoder.onnx  style factors (averaged over refs) + content factors
//                        -> generated image [1,1,128,128]
//
// Pixel conventions on the wire (main thread <-> worker):
//   Float32Array of length 128*128, values in [0,1], ink-high (1 = black ink).
// The model itself uses [-1,1] ink-low internally; conversion happens here.
// wasm-only build: keeps the WebGPU/JSEP wasm binary out of the bundle
import * as ort from 'onnxruntime-web/wasm'
// Resolve the runtime binaries through the bundler (?url) so dev and prod both
// serve the exact files matching the installed onnxruntime-web version. The
// package's exports map hides dist/*, hence the relative node_modules paths
// (same workaround as the aliases in vite.config.ts).
import ortWasmUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'
import ortMjsUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url'

const SIZE = 128
const N_PIXELS = SIZE * SIZE

interface StyleFactors {
  last: ort.Tensor
  skip: ort.Tensor
}

let encoderSession: ort.InferenceSession | null = null
let decoderSession: ort.InferenceSession | null = null
let styleFactors: StyleFactors | null = null
let initPromise: Promise<void> | null = null

function toModelTensor(ink: Float32Array): ort.Tensor {
  // ink-high [0,1] -> model convention [-1,1] ink-low
  const data = new Float32Array(N_PIXELS)
  for (let i = 0; i < N_PIXELS; i++) {
    data[i] = 1 - 2 * ink[i]
  }
  return new ort.Tensor('float32', data, [1, 1, SIZE, SIZE])
}

function fromModelOutput(out: Float32Array): Float32Array {
  // sigmoid [0,1] ink-low -> ink-high [0,1]
  const ink = new Float32Array(N_PIXELS)
  for (let i = 0; i < N_PIXELS; i++) {
    ink[i] = 1 - out[i]
  }
  return ink
}

async function initModel(assetBase: string, variant: string): Promise<void> {
  // Single-threaded: the app is not crossOriginIsolated, so
  // SharedArrayBuffer is unavailable.
  ort.env.wasm.wasmPaths = {
    wasm: new URL(ortWasmUrl, self.location.href).href,
    mjs: new URL(ortMjsUrl, self.location.href).href,
  }
  ort.env.wasm.numThreads = 1

  const suffix = variant === 'fp32' ? '' : '.int8'
  const [encBuf, decBuf] = await Promise.all([
    fetchModel(`${assetBase}models/mxfont_encoder${suffix}.onnx`),
    fetchModel(`${assetBase}models/mxfont_decoder${suffix}.onnx`),
  ])

  encoderSession = await ort.InferenceSession.create(encBuf, {
    executionProviders: ['wasm'],
  })
  decoderSession = await ort.InferenceSession.create(decBuf, {
    executionProviders: ['wasm'],
  })
}

async function fetchModel(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch model ${url}: HTTP ${res.status}`)
  }
  const buf = await res.arrayBuffer()
  if (buf.byteLength < 100_000) {
    throw new Error(
      `Model file ${url} is too small (${buf.byteLength} bytes) — ` +
        'run "npm run download:onnx" and the model export to vendor real models.',
    )
  }
  return new Uint8Array(buf)
}

async function encodeImage(ink: Float32Array) {
  const feeds = { image: toModelTensor(ink) }
  return encoderSession!.run(feeds)
}

async function setStyle(refs: Float32Array[]): Promise<void> {
  if (refs.length === 0)
    throw new Error('At least one style reference is required')

  let lastSum: Float32Array | null = null
  let skipSum: Float32Array | null = null
  let lastDims: readonly number[] = []
  let skipDims: readonly number[] = []

  for (const ref of refs) {
    const out = await encodeImage(ref)
    const last = out.style_last.data as Float32Array
    const skip = out.style_skip.data as Float32Array
    if (!lastSum) {
      lastSum = new Float32Array(last.length)
      skipSum = new Float32Array(skip.length)
      lastDims = out.style_last.dims
      skipDims = out.style_skip.dims
    }
    for (let i = 0; i < last.length; i++) lastSum![i] += last[i]
    for (let i = 0; i < skip.length; i++) skipSum![i] += skip[i]
  }

  const n = refs.length
  for (let i = 0; i < lastSum!.length; i++) lastSum![i] /= n
  for (let i = 0; i < skipSum!.length; i++) skipSum![i] /= n

  styleFactors = {
    last: new ort.Tensor('float32', lastSum!, lastDims as number[]),
    skip: new ort.Tensor('float32', skipSum!, skipDims as number[]),
  }
}

async function generate(content: Float32Array): Promise<Float32Array> {
  if (!styleFactors)
    throw new Error('Style references not set — send set-style first')

  const enc = await encodeImage(content)
  const out = await decoderSession!.run({
    style_last: styleFactors.last,
    style_skip: styleFactors.skip,
    char_last: enc.char_last,
    char_skip: enc.char_skip,
  })
  return fromModelOutput(out.image.data as Float32Array)
}

self.onmessage = async (e: MessageEvent) => {
  const data = e.data
  try {
    if (data.type === 'init') {
      if (!initPromise) {
        initPromise = initModel(data.assetBase, data.variant || 'int8')
      }
      await initPromise
      postMessage({ type: 'ready', id: data.id })
    } else if (data.type === 'set-style') {
      if (!initPromise) throw new Error('Worker not initialized')
      await initPromise
      await setStyle(data.refs)
      postMessage({ type: 'style-set', id: data.id })
    } else if (data.type === 'generate') {
      if (!initPromise) throw new Error('Worker not initialized')
      await initPromise
      const output = await generate(data.content)
      postMessage({ type: 'result', id: data.id, output }, [
        output.buffer,
      ] as any)
    }
  } catch (err: any) {
    postMessage({
      type: 'error',
      id: data.id,
      message: err?.message || String(err),
    })
  }
}
