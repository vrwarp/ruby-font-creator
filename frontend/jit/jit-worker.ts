// In-browser zi2zi-JiT LoRA fine-tuning worker (experimental).
//
// Self-contained: loads the fp16 transformer shards into jax-js (WebGPU when
// available, wasm otherwise), runs the frozen style/content encoders via
// onnxruntime-web to precompute per-sample conditioning, then trains LoRA
// with the jitted flow-matching step and samples glyphs with ab2 + CFG.
//
// Protocol (request/response by id, mirroring zi2zi-worker-core):
//   init    {assetBase}                  -> {device, weightsMs}
//   prepare {samples: [{image256, styleImage128, contentImage256, fontIndex}],
//            nullFontIndex}              -> {prepared, nullCond}  (conditioning
//            precompute; images are Float32Array in [-1,1], CHW)
//   train   {opts}                       -> streams {type:'progress', ...},
//                                           ends {type:'train-done'}
//   sample  {cond, uncond, steps, cfg, seed} -> {image: Float32Array}
//   bench   {batchSize}                  -> {stepMs}

import * as ort from 'onnxruntime-web/wasm'
import ortWasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'
import ortMjsUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url'
import {
  init,
  defaultDevice,
  getWebGPUDevice,
  numpy as np,
  valueAndGrad,
  jit,
  type Array as JaxArray,
} from '@jax-js/jax'
import { loadWeights, loadGoldens } from './weights.js'
import {
  buildModel,
  frozenFromStore,
  type Frozen,
  type JitConfig,
  type LoraTree,
} from './model.js'
import { JitTrainer, type NullCond, type TrainSample } from './trainer.js'

let frozen: Frozen | null = null
let config: JitConfig | null = null
let trainer: JitTrainer | null = null
let device = 'wasm'
let fontTable: Float32Array | null = null
let hidden = 768

let styleSession: any = null
let contentSession: any = null

let samples: TrainSample[] = []
let nullCond: NullCond | null = null

async function fetchBuf(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch failed ${url}: ${res.status}`)
  return res.arrayBuffer()
}

async function handleInit(assetBase: string) {
  const t0 = performance.now()
  const devices = await init()
  device = devices.includes('webgpu') ? 'webgpu' : 'wasm'
  defaultDevice(device as any)

  const base = `${assetBase}models/jit/`
  const store = await loadWeights((name) => fetchBuf(base + name))
  config = JSON.parse(
    new TextDecoder().decode(await fetchBuf(base + 'jit_config.json')),
  )
  hidden = config!.hiddenSize
  const font = store.get('font_embedding')!
  fontTable = font.data
  frozen = frozenFromStore(store)
  trainer = new JitTrainer(frozen, config!)

  ort.env.wasm.wasmPaths = {
    wasm: new URL(ortWasmUrl, self.location.href).href,
    mjs: new URL(ortMjsUrl, self.location.href).href,
  }
  ort.env.wasm.numThreads = 1
  styleSession = await ort.InferenceSession.create(
    new Uint8Array(await fetchBuf(base + 'jit_style_encoder.onnx')),
    { executionProviders: ['wasm'] },
  )
  contentSession = await ort.InferenceSession.create(
    new Uint8Array(await fetchBuf(base + 'jit_content_encoder.onnx')),
    { executionProviders: ['wasm'] },
  )
  return { device, weightsMs: Math.round(performance.now() - t0) }
}

async function encodeCond(
  styleImage: Float32Array, // [3*128*128] in [-1,1]
  contentImage: Float32Array, // [3*256*256] in [-1,1]
  fontIndex: number,
) {
  const styleOut = await styleSession.run({
    image: new ort.Tensor('float32', styleImage, [1, 3, 128, 128]),
  })
  const contentOut = await contentSession.run({
    image: new ort.Tensor('float32', contentImage, [1, 3, 256, 256]),
  })
  const styleEmb = styleOut.embedding.data as Float32Array
  const contentEmb = contentOut.embedding.data as Float32Array
  const fontEmb = fontTable!.slice(fontIndex * hidden, (fontIndex + 1) * hidden)
  const yEmb = new Float32Array(hidden)
  for (let i = 0; i < hidden; i++)
    yEmb[i] = fontEmb[i] + styleEmb[i] + contentEmb[i]
  return { yEmb, fontEmb, contentEmb, styleEmb }
}

// Gradient/loss parity against the PyTorch goldens — run here (WebGPU) since
// node's wasm32 4GB heap cannot hold the full eager backward.
const gpuErrors: string[] = []
async function hookGpuErrors() {
  if (device !== 'webgpu') return
  try {
    const dev = await getWebGPUDevice()
    dev.onuncapturederror = (e: any) => {
      if (gpuErrors.length < 20)
        gpuErrors.push(String(e.error?.message || e.error || e).slice(0, 200))
    }
  } catch {
    /* diagnostics only */
  }
}

async function handleParity(
  goldensBase: string,
  mode: 'jit' | 'eager' = 'jit',
  batch: 1 | 2 = 2,
) {
  await hookGpuErrors()
  gpuErrors.length = 0
  const model = buildModel(frozen!, config!)
  const manifest = new TextDecoder().decode(
    await fetchBuf(goldensBase + 'goldens.json'),
  )
  const goldens = await loadGoldens(
    manifest,
    await fetchBuf(goldensBase + 'goldens.bin'),
  )
  const g = (name: string) => goldens.get(name)!
  // slices the leading batch dim when batch === 1 (memory-pressure diagnosis;
  // golden grad values only compare at batch 2)
  const arr = (name: string) => {
    const t = g(name)
    if (batch === 2 || t.shape[0] !== 2)
      return np.array(t.data as Float32Array<ArrayBuffer>).reshape(t.shape)
    const shape = [...t.shape]
    shape[0] = 1
    const count = shape.reduce((a, b) => a * b, 1)
    return np
      .array(t.data.slice(0, count) as Float32Array<ArrayBuffer>)
      .reshape(shape)
  }

  const lora: LoraTree = {}
  const targetDims: Record<string, number> = {
    qkv: 2304,
    proj: 768,
    w12: 4096,
    w3: 768,
  }
  for (let i = 0; i < config!.depth; i++) {
    for (const target of config!.lora.targets) {
      const aName = `init.blocks.${i}.${
        target === 'qkv' || target === 'proj' ? 'attn.' : 'mlp.'
      }${target}.lora_A`
      lora[`blocks.${i}.${target}.A`] = arr(aName)
      lora[`blocks.${i}.${target}.B`] = np.zeros([
        targetDims[target],
        config!.lora.r,
      ])
    }
  }
  const cond = {
    yEmb: np.add(
      np.add(arr('in.font_emb'), arr('in.content_emb')),
      arr('in.style_emb'),
    ),
    fontEmb: arr('in.font_emb'),
    contentEmb: arr('in.content_emb'),
    styleEmb: arr('in.style_emb'),
  }
  const lossFn = (
    params: LoraTree,
    x: JaxArray,
    t: JaxArray,
    e: JaxArray,
    c: typeof cond,
  ) => model.loss(params, x, t, e, c)
  const step = mode === 'jit' ? jit(valueAndGrad(lossFn)) : valueAndGrad(lossFn)
  const t0 = performance.now()
  const [lossVal, grads] = step(
    lora,
    arr('in.x'),
    arr('in.loss_t'),
    arr('in.loss_e'),
    cond,
  ) as [JaxArray, LoraTree]
  const loss = (await lossVal.jsAsync()) as number
  const stepMs = performance.now() - t0

  const flat = (x: any): number[] => {
    const out: number[] = []
    const walk = (v: any) => {
      if (typeof v === 'number') out.push(v)
      else for (const c of v) walk(c)
    }
    walk(x)
    return out
  }
  const relErr = (got: number[], want: Float32Array) => {
    let maxAbs = 0
    let maxVal = 0
    for (let i = 0; i < want.length; i++) {
      maxAbs = Math.max(maxAbs, Math.abs(got[i] - want[i]))
      maxVal = Math.max(maxVal, Math.abs(want[i]))
    }
    return maxAbs / (maxVal + 1e-9)
  }
  const gotA = flat(await grads['blocks.0.qkv.A'].jsAsync())
  const gotB = flat(await grads['blocks.0.qkv.B'].jsAsync())
  const errA = relErr(gotA, g('grad.lora_A_qkv0').data)
  const errB = relErr(gotB, g('grad.lora_B_qkv0').data)
  const stats = (v: number[]) => ({
    len: v.length,
    nan: v.filter((x) => !Number.isFinite(x)).length,
    norm: Math.sqrt(
      v.reduce((s, x) => s + (Number.isFinite(x) ? x * x : 0), 0),
    ),
    first: v.slice(0, 3),
  })
  const diagA = stats(gotA)
  const diagB = stats(gotB)
  const wantNormA = Math.sqrt(
    g('grad.lora_A_qkv0').data.reduce((s, x) => s + x * x, 0),
  )
  const wantNormB = Math.sqrt(
    g('grad.lora_B_qkv0').data.reduce((s, x) => s + x * x, 0),
  )
  // census: NaN count + norm for every grad, to localize where NaN enters
  // the backward chain (block i NaN but i+1 clean => fault in block i+1's
  // backward-through-activations)
  const census: Record<string, string> = {}
  for (const [k, v] of Object.entries(grads)) {
    if (k === 'blocks.0.qkv.A' || k === 'blocks.0.qkv.B') continue
    const fv = flat(await v.jsAsync()) // jsAsync consumes the handle
    const s = stats(fv)
    census[k] = `nan=${s.nan}/${s.len} norm=${s.norm.toExponential(2)}`
  }
  return {
    loss,
    wantLoss: g('out.loss_lora').data[0],
    errA,
    errB,
    diagA,
    diagB,
    wantNormA,
    wantNormB,
    stepMs: Math.round(stepMs),
    census,
    gpuErrors: [...gpuErrors],
  }
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data
  try {
    if (msg.type === 'init') {
      const out = await handleInit(msg.assetBase)
      postMessage({ type: 'ready', id: msg.id, output: out })
    } else if (msg.type === 'parity') {
      const out = await handleParity(
        msg.goldensBase,
        msg.mode || 'jit',
        msg.batch || 2,
      )
      postMessage({ type: 'parity-done', id: msg.id, output: out })
    } else if (msg.type === 'prepare') {
      samples = []
      for (const s of msg.samples) {
        const cond = await encodeCond(s.styleImage, s.contentImage, s.fontIndex)
        samples.push({ image: s.image, ...cond })
      }
      // CFG null conditioning: white images + the null font slot
      const whiteStyle = new Float32Array(3 * 128 * 128).fill(1)
      const whiteContent = new Float32Array(3 * 256 * 256).fill(1)
      nullCond = await encodeCond(whiteStyle, whiteContent, msg.nullFontIndex)
      postMessage({
        type: 'prepared',
        id: msg.id,
        output: { prepared: samples.length },
      })
    } else if (msg.type === 'train') {
      if (!trainer || !nullCond) throw new Error('not prepared')
      await trainer.train(samples, nullCond, {
        ...msg.opts,
        onProgress: (info) => postMessage({ type: 'progress', ...info }),
      })
      postMessage({ type: 'train-done', id: msg.id })
    } else if (msg.type === 'sample') {
      if (!trainer || !nullCond) throw new Error('not prepared')
      const cond = await encodeCond(
        msg.styleImage,
        msg.contentImage,
        msg.fontIndex,
      )
      const image = await trainer.sample(cond, nullCond, {
        steps: msg.steps,
        cfg: msg.cfg,
        seed: msg.seed,
      })
      postMessage({ type: 'sampled', id: msg.id, output: { image } }, [
        image.buffer,
      ] as any)
    }
  } catch (err: any) {
    postMessage({
      type: 'error',
      id: msg.id,
      message: err?.message || String(err),
    })
  }
}
