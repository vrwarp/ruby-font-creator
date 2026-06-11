// Shared body of the zi2zi inference workers (MX-Font ONNX, two graphs).
// The thin entry files (zi2zi-worker.ts for plain WASM, zi2zi-worker-webgpu.ts
// for the WebGPU/JSEP build) supply their flavor of the onnxruntime-web
// module plus runtime binary URLs and the execution-provider list; everything
// else — tensor conventions, style-factor handling, message protocol — lives
// here so the two stay in lock-step.
//
// Pixel conventions on the wire (main thread <-> worker):
//   Float32Array of length 128*128, values in [0,1], ink-high (1 = black ink).
// The model uses [-1,1] ink-low internally; conversion happens here.

const SIZE = 128
const N_PIXELS = SIZE * SIZE

export interface WorkerConfig {
  ort: any
  wasmUrl: string
  mjsUrl: string
  executionProviders: string[]
  defaultVariant: 'int8' | 'fp16' | 'fp32'
}

const MODEL_SUFFIX: Record<string, string> = {
  fp32: '',
  fp16: '.fp16',
  int8: '.int8',
}

export function setupWorker(config: WorkerConfig): void {
  const { ort } = config

  interface StyleFactorsMsg {
    last: Float32Array
    lastDims: number[]
    skip: Float32Array
    skipDims: number[]
  }

  let encoderSession: any = null
  let decoderSession: any = null
  let styleFactors: { last: any; skip: any } | null = null
  let initPromise: Promise<string> | null = null

  function toModelTensor(ink: Float32Array) {
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

  // Returns the execution provider actually selected for the sessions.
  async function initModel(
    assetBase: string,
    variant: string,
    opt?: string,
  ): Promise<string> {
    ort.env.wasm.wasmPaths = {
      wasm: new URL(config.wasmUrl, self.location.href).href,
      mjs: new URL(config.mjsUrl, self.location.href).href,
    }
    // Single-threaded unless crossOriginIsolated makes SAB available; ort
    // clamps internally, this just avoids the console warning.
    if (!(self as any).crossOriginIsolated) {
      ort.env.wasm.numThreads = 1
    }

    const suffix = MODEL_SUFFIX[variant] ?? '.int8'
    const [encBuf, decBuf] = await Promise.all([
      fetchModel(`${assetBase}models/mxfont_encoder${suffix}.onnx`),
      fetchModel(`${assetBase}models/mxfont_decoder${suffix}.onnx`),
    ])

    const sessionOptions = {
      executionProviders: config.executionProviders,
      graphOptimizationLevel: opt || 'all',
    }
    encoderSession = await ort.InferenceSession.create(encBuf, sessionOptions)
    decoderSession = await ort.InferenceSession.create(decBuf, sessionOptions)
    return config.executionProviders[0]
  }

  async function encodeImage(ink: Float32Array) {
    return encoderSession.run({ image: toModelTensor(ink) })
  }

  async function setStyle(refs: Float32Array[]): Promise<StyleFactorsMsg> {
    if (refs.length === 0)
      throw new Error('At least one style reference is required')

    let lastSum: Float32Array | null = null
    let skipSum: Float32Array | null = null
    let lastDims: readonly number[] = []
    let skipDims: readonly number[] = []

    for (const ref of refs) {
      const out = await encodeImage(ref)
      const last = (await out.style_last.getData()) as Float32Array
      const skip = (await out.style_skip.getData()) as Float32Array
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
    // a copy of the averaged factors so the main thread can fan them out to
    // sibling pool workers without re-encoding the refs there
    return {
      last: lastSum!.slice(),
      lastDims: [...lastDims],
      skip: skipSum!.slice(),
      skipDims: [...skipDims],
    }
  }

  function setStyleRaw(data: StyleFactorsMsg): void {
    styleFactors = {
      last: new ort.Tensor('float32', data.last, data.lastDims),
      skip: new ort.Tensor('float32', data.skip, data.skipDims),
    }
  }

  async function generate(content: Float32Array): Promise<Float32Array> {
    if (!styleFactors)
      throw new Error('Style references not set — send set-style first')

    const enc = await encodeImage(content)
    const out = await decoderSession.run({
      style_last: styleFactors.last,
      style_skip: styleFactors.skip,
      char_last: enc.char_last,
      char_skip: enc.char_skip,
    })
    const img = (await out.image.getData()) as Float32Array
    return fromModelOutput(img)
  }

  self.onmessage = async (e: MessageEvent) => {
    const data = e.data
    try {
      if (data.type === 'init') {
        if (!initPromise) {
          initPromise = initModel(
            data.assetBase,
            data.variant || config.defaultVariant,
            data.opt,
          )
        }
        const ep = await initPromise
        postMessage({ type: 'ready', id: data.id, output: { ep } })
      } else if (data.type === 'set-style') {
        if (!initPromise) throw new Error('Worker not initialized')
        await initPromise
        const factors = await setStyle(data.refs)
        postMessage({ type: 'style-set', id: data.id, output: factors }, [
          factors.last.buffer,
          factors.skip.buffer,
        ] as any)
      } else if (data.type === 'set-style-raw') {
        if (!initPromise) throw new Error('Worker not initialized')
        await initPromise
        setStyleRaw(data.factors)
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
}
