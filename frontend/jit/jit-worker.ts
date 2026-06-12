// In-browser zi2zi-JiT LoRA fine-tuning worker (experimental).
//
// Self-contained: loads the fp16 transformer shards into jax-js (WebGPU when
// available, wasm otherwise), runs the frozen style/content encoders via
// onnxruntime-web to precompute per-sample conditioning, then trains LoRA
// with the jitted flow-matching step and samples glyphs with ab2 + CFG.
//
// Protocol (request/response by id, mirroring zi2zi-worker-core; all images
// are CHW Float32Arrays in [-1,1]; requests run strictly one at a time except
// 'abort'):
//   init        {assetBase} -> {device, weightsMs}
//   prepare-begin  {nullFontIndex} -> {}        (resets sample state)
//   prepare-add    {samples: [{image(3*256*256), styleImage(3*128*128),
//                  contentImage(3*256*256), fontIndex, prior?}]}
//                  -> streams {type:'prepare-progress', done},
//                     ends {total, aborted}     (send small batches; buffers
//                     are transferred and the worker stores u8-quantized
//                     targets plus encoded conditioning)
//   prepare-finish {} -> {prepared, aborted}    (builds CFG null cond)
//   train       {opts} -> streams {type:'progress', epoch, step,
//                stepsPerEpoch, loss, lr}, ends {aborted}
//   abort       {} -> {} immediately (out-of-band; the running prepare/train
//               stops at its next checkpoint and resolves with aborted: true)
//   sample      {styleImage, contentImage, fontIndex, steps, cfg, seed,
//                tStart?, loraScale?, loraTStart?, contentCfg?}  (anchors:
//                SDEdit init from contentImage, LoRA dial, decoupled CFG)
//               -> {image: Float32Array [1,3,256,256] in ~[-1,1], ink black}
//   export-lora {} -> {lora: Record<name, {data, shape}>}
//   import-lora {lora, nullFontIndex} -> {}
//   parity      {goldensBase, mode?, batch?} -> diagnostics

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
let stylePool: Float32Array[] = []
// one pool entry per character: augmented variants share the same style
// render, so they reuse the entry (and skip re-encoding)
const stylePoolByKey = new Map<number, number>()
let fontEmbInit: Float32Array | null = null
let nullFontIdx = 1000
let nullCond: NullCond | null = null
// trained font/null-slot embeddings, fetched once after train/import and
// reused for every generation cond (the null row is the CFG uncond register)
let trainedFontEmb: Float32Array | null = null
let trainedNullFontEmb: Float32Array | null = null

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

async function encodeStyle(styleImage: Float32Array): Promise<Float32Array> {
  // [3*128*128] in [-1,1]
  const out = await styleSession.run({
    image: new ort.Tensor('float32', styleImage, [1, 3, 128, 128]),
  })
  return out.embedding.data as Float32Array
}

async function encodeContent(
  contentImage: Float32Array, // [3*256*256] in [-1,1]
): Promise<Float32Array> {
  const out = await contentSession.run({
    image: new ort.Tensor('float32', contentImage, [1, 3, 256, 256]),
  })
  return out.embedding.data as Float32Array
}

function buildCond(
  styleEmb: Float32Array,
  contentEmb: Float32Array,
  fontIndex: number,
) {
  const fontEmb = fontTable!.slice(fontIndex * hidden, (fontIndex + 1) * hidden)
  const yEmb = new Float32Array(hidden)
  for (let i = 0; i < hidden; i++)
    yEmb[i] = fontEmb[i] + styleEmb[i] + contentEmb[i]
  return { yEmb, fontEmb, contentEmb, styleEmb }
}

async function encodeCond(
  styleImage: Float32Array,
  contentImage: Float32Array,
  fontIndex: number,
) {
  return buildCond(
    await encodeStyle(styleImage),
    await encodeContent(contentImage),
    fontIndex,
  )
}

let abortRequested = false

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

// All requests run strictly one-at-a-time: concurrent jax computations would
// race on trainer.lora under move semantics. 'abort' bypasses the queue —
// it only flips a flag polled by the running train loop.
let queue: Promise<void> = Promise.resolve()
self.onmessage = (e: MessageEvent) => {
  const msg = e.data
  if (msg.type === 'abort') {
    abortRequested = true
    postMessage({ type: 'aborted', id: msg.id, output: {} })
    return
  }
  queue = queue.then(() => handle(msg))
}

async function handle(msg: any) {
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
    } else if (msg.type === 'prepare-begin') {
      abortRequested = false
      samples = []
      stylePool = []
      stylePoolByKey.clear()
      trainedFontEmb = null
      trainedNullFontEmb = null
      nullFontIdx = msg.nullFontIndex
      fontEmbInit = null
      postMessage({ type: 'prepare-begun', id: msg.id, output: {} })
    } else if (msg.type === 'prepare-add') {
      for (const s of msg.samples) {
        if (abortRequested) break
        const knownPool =
          !s.prior && s.styleKey != null
            ? stylePoolByKey.get(s.styleKey)
            : undefined
        const styleEmb =
          knownPool != null
            ? stylePool[knownPool]
            : await encodeStyle(s.styleImage)
        const contentEmb = await encodeContent(s.contentImage)
        // quantize the target so a few hundred augmented samples fit in
        // memory; the rasterizer's grays were u8-derived, so this round-trips
        const imageU8 = new Uint8Array(s.image.length)
        for (let i = 0; i < s.image.length; i++) {
          imageU8[i] = Math.max(
            0,
            Math.min(255, Math.round((s.image[i] + 1) * 127.5)),
          )
        }
        let poolIdx = -1
        if (!s.prior) {
          if (knownPool != null) {
            poolIdx = knownPool
          } else {
            poolIdx = stylePool.length
            stylePool.push(styleEmb)
            if (s.styleKey != null) stylePoolByKey.set(s.styleKey, poolIdx)
          }
          if (!fontEmbInit) {
            fontEmbInit = fontTable!.slice(
              s.fontIndex * hidden,
              (s.fontIndex + 1) * hidden,
            )
          }
        }
        samples.push({
          imageU8,
          contentEmb,
          styleEmb,
          prior: !!s.prior,
          poolIdx,
        })
        postMessage({ type: 'prepare-progress', done: samples.length })
      }
      postMessage({
        type: 'prepare-added',
        id: msg.id,
        output: { total: samples.length, aborted: abortRequested },
      })
    } else if (msg.type === 'prepare-finish') {
      if (!abortRequested) {
        // CFG null conditioning: white images + the null font slot
        const whiteStyle = new Float32Array(3 * 128 * 128).fill(1)
        const whiteContent = new Float32Array(3 * 256 * 256).fill(1)
        nullCond = await encodeCond(whiteStyle, whiteContent, nullFontIdx)
      }
      postMessage({
        type: 'prepared',
        id: msg.id,
        output: { prepared: samples.length, aborted: abortRequested },
      })
    } else if (msg.type === 'train') {
      if (!trainer || !nullCond) throw new Error('not prepared')
      if (!fontEmbInit) throw new Error('no trainable font slot prepared')
      await trainer.train(samples, stylePool, nullCond, fontEmbInit, {
        ...msg.opts,
        shouldStop: () => abortRequested,
        onProgress: (info) => postMessage({ type: 'progress', ...info }),
      })
      trainedFontEmb = await trainer.trainedFontEmb()
      trainedNullFontEmb = await trainer.trainedNullFontEmb()
      postMessage({
        type: 'train-done',
        id: msg.id,
        output: { aborted: abortRequested },
      })
    } else if (msg.type === 'sample') {
      if (!trainer || !nullCond) throw new Error('not prepared')
      const styleEmb = await encodeStyle(msg.styleImage)
      const contentEmb = await encodeContent(msg.contentImage)
      const cond = buildCond(styleEmb, contentEmb, msg.fontIndex)
      if (trainedFontEmb) {
        // the fine-tune trains the font-slot embedding; generation must use
        // the trained register, not the frozen table row
        cond.fontEmb = trainedFontEmb
        for (let i = 0; i < hidden; i++) {
          cond.yEmb[i] = trainedFontEmb[i] + styleEmb[i] + contentEmb[i]
        }
      }
      // the uncond/null-font registers are trained alongside the LoRA —
      // generation must use the trained rows
      let uncond = nullCond
      if (trainedNullFontEmb) {
        const yEmb = new Float32Array(hidden)
        for (let i = 0; i < hidden; i++) {
          yEmb[i] =
            trainedNullFontEmb[i] +
            nullCond.styleEmb[i] +
            nullCond.contentEmb[i]
        }
        uncond = { ...nullCond, fontEmb: trainedNullFontEmb, yEmb }
      }
      // decoupled CFG content branch: real content, null style + font
      let condContent
      if (msg.contentCfg != null) {
        condContent = buildCond(nullCond.styleEmb, contentEmb, nullFontIdx)
        if (trainedNullFontEmb) {
          condContent.fontEmb = trainedNullFontEmb
          for (let i = 0; i < hidden; i++) {
            condContent.yEmb[i] =
              trainedNullFontEmb[i] + nullCond.styleEmb[i] + contentEmb[i]
          }
        }
      }
      const image = await trainer.sample(
        cond,
        uncond,
        {
          steps: msg.steps,
          cfg: msg.cfg,
          seed: msg.seed,
          tStart: msg.tStart,
          initImage: msg.tStart ? msg.contentImage : undefined,
          initBlur: msg.initBlur,
          loraScale: msg.loraScale,
          loraTStart: msg.loraTStart,
          contentCfg: msg.contentCfg,
        },
        condContent,
      )
      postMessage({ type: 'sampled', id: msg.id, output: { image } }, [
        image.buffer,
      ] as any)
    } else if (msg.type === 'style-embed') {
      const emb = await encodeStyle(msg.image)
      postMessage({ type: 'style-embedded', id: msg.id, output: { emb } }, [
        emb.buffer,
      ] as any)
    } else if (msg.type === 'export-lora') {
      if (!trainer) throw new Error('not initialized')
      const lora = await trainer.exportLora()
      postMessage(
        { type: 'lora-exported', id: msg.id, output: { lora } },
        Object.values(lora).map((t) => t.data.buffer) as any,
      )
    } else if (msg.type === 'import-lora') {
      if (!trainer) throw new Error('not initialized')
      trainer.importLora(msg.lora)
      trainedFontEmb = await trainer.trainedFontEmb()
      trainedNullFontEmb = await trainer.trainedNullFontEmb()
      nullFontIdx = msg.nullFontIndex ?? nullFontIdx
      // imported checkpoints are for generation: CFG still needs the null
      // conditioning, which prepare() normally sets up
      if (!nullCond) {
        const whiteStyle = new Float32Array(3 * 128 * 128).fill(1)
        const whiteContent = new Float32Array(3 * 256 * 256).fill(1)
        nullCond = await encodeCond(whiteStyle, whiteContent, msg.nullFontIndex)
      }
      postMessage({ type: 'lora-imported', id: msg.id, output: {} })
    } else {
      // reject instead of hanging the client's pending promise forever
      throw new Error(`unknown message type '${msg.type}'`)
    }
  } catch (err: any) {
    postMessage({
      type: 'error',
      id: msg.id,
      message: err?.message || String(err),
    })
  }
}
