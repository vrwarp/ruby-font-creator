// In-browser LoRA fine-tuning loop for zi2zi-JiT, built on @jax-js/optax.
// Mirrors vendor/zi2zi-jit/lora_single_gpu_finetune_jit.py with the
// research-roadmap recipe (docs/style-transfer-research.md): AdamW with
// small-batch-corrected beta2, gradient accumulation to recover the
// validated effective batch, a TRAINABLE font-slot embedding (offline
// parity), per-step random style references, the offline font-label-only
// dropout (p=0.4) on top of joint CFG dropout, prior-preservation rows, and
// tail-averaged checkpoints. The sampler adds inference-time structure
// anchors: SDEdit-style init from the content rendering, a LoRA gain dial
// with early-step muting, and decoupled content/style CFG.
//
// The caller supplies precomputed per-sample conditioning vectors (from the
// ONNX encoders via onnxruntime-web) and raster batches; this module owns
// everything jax-js: LoRA params, optimizer state, the jitted train step.

import {
  numpy as np,
  valueAndGrad,
  jit,
  random,
  tree,
  type Array as JaxArray,
} from '@jax-js/jax'
import { adamw, applyUpdates } from '@jax-js/optax'
import {
  buildModel,
  type Frozen,
  type JitConfig,
  type LoraTree,
  type ModelApi,
} from './model.js'

export interface TrainSample {
  // target glyph raster [-1,1] (ink black), quantized to u8 so a few hundred
  // augmented samples fit in worker memory: v = u8/127.5 - 1
  imageU8: Uint8Array
  contentEmb: Float32Array
  // the char's OWN glyph style embedding — pool entry for non-prior rows
  styleEmb: Float32Array
  // prior-preservation row (content-font target, null style + font slot):
  // defends the base model's structure prior against forgetting
  prior: boolean
  // index into the style pool, -1 for prior rows
  poolIdx: number
}

export interface NullCond {
  yEmb: Float32Array
  fontEmb: Float32Array
  contentEmb: Float32Array
  styleEmb: Float32Array
}

export interface TrainerOptions {
  epochs: number
  batchSize: number
  lr: number
  warmupEpochs: number
  minLr: number
  seed: number
  // microbatches averaged per optimizer update (exact batch-size recovery:
  // mean loss, no cross-sample ops)
  accumSteps?: number
  beta2?: number
  // probability of dropping ONLY the font label to its null slot (offline
  // category_drop_prob), independent of the joint CFG drop
  fontDropProb?: number
  // average the last 3 epoch-end checkpoints (SWA-style stability)
  tailAverage?: boolean
  // polled between microbatches; returning true stops training cleanly (the
  // LoRA state keeps whatever progress was made)
  shouldStop?: () => boolean
  onProgress?: (info: {
    epoch: number
    step: number
    stepsPerEpoch: number
    loss: number
    lr: number
  }) => void
}

export interface SampleOptions {
  steps: number
  cfg: number
  seed: number
  // SDEdit-style structure anchor: start integration at tStart from
  // z = tStart·initImage + (1−tStart)·noise instead of pure noise
  tStart?: number
  initImage?: Float32Array // content rendering [3*S*S] CHW [-1,1]
  // box-blur radius (px) applied to initImage before mixing: low
  // frequencies carry radical layout, high frequencies carry stroke style —
  // blurring anchors structure without injecting the content font's strokes
  initBlur?: number
  // LoRA dial: global delta multiplier, and muting below loraTStart so the
  // intact base model decides layout before the LoRA styles it
  loraScale?: number
  loraTStart?: number
  // decoupled CFG content weight w_c (InstructPix2Pix decomposition); needs
  // condContent. opts.cfg acts as the style weight w_s.
  contentCfg?: number
}

// Host-side LoRA checkpoint: structured-clonable, IndexedDB-storable.
export type LoraExport = Record<string, { data: Float32Array; shape: number[] }>

const FONT_EMB_KEY = 'fontEmb'
const NULL_FONT_EMB_KEY = 'nullFontEmb'

export class JitTrainer {
  private model: ModelApi
  private config: JitConfig
  private lora: LoraTree = {}
  private optState: any = null

  constructor(frozen: Frozen, config: JitConfig) {
    this.config = config
    this.model = buildModel(frozen, config)
  }

  private disposeOptState() {
    if (this.optState) {
      tree.dispose(this.optState)
      this.optState = null
    }
  }

  initLora(
    seed: number,
    fontEmbInit?: Float32Array,
    nullFontEmbInit?: Float32Array,
  ) {
    for (const v of Object.values(this.lora)) v.dispose()
    this.lora = {}
    const { r, targets } = this.config.lora
    const dims: Record<string, [number, number]> = {
      qkv: [this.config.hiddenSize, 3 * this.config.hiddenSize],
      proj: [this.config.hiddenSize, this.config.hiddenSize],
      w12: [this.config.hiddenSize, 2 * this.config.mlpHidden],
      w3: [this.config.mlpHidden, this.config.hiddenSize],
    }
    let key = random.key(seed)
    for (let i = 0; i < this.config.depth; i++) {
      for (const target of targets) {
        const [inDim, outDim] = dims[target]
        const [k1, k2] = random.split(key, 2)
        key = k2
        // kaiming-uniform(a=sqrt(5)) on [r, inDim]: U(-b, b), b = sqrt(6 / ((1+5) * fan_in)) * ... torch
        // computes gain = sqrt(2/(1+a^2)) = sqrt(1/3); bound = gain * sqrt(3/fan_in)
        const bound = Math.sqrt(1 / 3) * Math.sqrt(3 / inDim)
        const a = np.multiply(
          np.subtract(np.multiply(random.uniform(k1, [r, inDim]), 2), 1),
          bound,
        )
        this.lora[`blocks.${i}.${target}.A`] = a
        this.lora[`blocks.${i}.${target}.B`] = np.zeros([outDim, r])
      }
    }
    key.dispose()
    if (fontEmbInit) {
      // trainable style register, initialized from the frozen slot embedding
      // (offline parity: mark_only_lora_as_trainable(train_font_emb=True))
      this.lora[FONT_EMB_KEY] = np
        .array(fontEmbInit.slice() as Float32Array<ArrayBuffer>)
        .reshape([1, this.config.hiddenSize])
    }
    if (nullFontEmbInit) {
      // offline marks the WHOLE font_embedding table trainable, so the null
      // row (the CFG uncond register, hit by ~46% of rows via the drops)
      // learns too
      this.lora[NULL_FONT_EMB_KEY] = np
        .array(nullFontEmbInit.slice() as Float32Array<ArrayBuffer>)
        .reshape([1, this.config.hiddenSize])
    }
  }

  loraParamCount(): number {
    let n = 0
    for (const arr of Object.values(this.lora)) {
      n += arr.aval.shape.reduce((x, y) => x * y, 1)
    }
    return n
  }

  // the trained font-slot embedding for generation conditioning, or null
  // when training ran without one (e.g. legacy checkpoints)
  async trainedFontEmb(): Promise<Float32Array | null> {
    const fe = this.lora[FONT_EMB_KEY]
    if (!fe) return null
    return flattenToF32(await fe.ref.jsAsync())
  }

  async trainedNullFontEmb(): Promise<Float32Array | null> {
    const fe = this.lora[NULL_FONT_EMB_KEY]
    if (!fe) return null
    return flattenToF32(await fe.ref.jsAsync())
  }

  // Runs the full fine-tune. Yields to the event loop between steps so the
  // UI stays responsive (call from a worker regardless).
  async train(
    samples: TrainSample[],
    stylePool: Float32Array[],
    nullCond: NullCond,
    fontEmbInit: Float32Array,
    opts: TrainerOptions,
  ): Promise<void> {
    const C = this.config
    const B = opts.batchSize
    const acc = Math.max(1, opts.accumSteps ?? 1)
    const S = C.inputSize
    const H = C.hiddenSize
    const stepsPerEpoch = Math.max(1, Math.floor(samples.length / (B * acc)))
    const fontDropProb = opts.fontDropProb ?? 0

    this.initLora(opts.seed, fontEmbInit, nullCond.fontEmb)
    // optax adamw takes a fixed lr; the schedule is applied by scaling updates
    const baseSolver = adamw(1.0, {
      b1: 0.9,
      b2: opts.beta2 ?? 0.95,
      weightDecay: 0,
    })
    this.disposeOptState()
    this.optState = baseSolver.init(tree.ref(this.lora))

    // the font row is assembled IN-GRAPH from the trainable embedding and a
    // per-row mask so gradients reach it: mask·fontEmb + (1−mask)·nullFont
    const lossFn = (
      lora: LoraTree,
      x: JaxArray,
      t: JaxArray,
      e: JaxArray,
      styleRows: JaxArray,
      contentRows: JaxArray,
      fontMask: JaxArray, // [B,1] 1=trainable slot, 0=trainable null slot
    ) => {
      const fe = lora[FONT_EMB_KEY]
      const nfe = lora[NULL_FONT_EMB_KEY]
      const fontRows = np.add(
        np.multiply(fontMask.ref, fe.ref),
        np.multiply(np.subtract(1, fontMask), nfe.ref),
      )
      const yEmb = np.add(np.add(fontRows.ref, styleRows.ref), contentRows.ref)
      return this.model.loss(lora, x, t, e, {
        yEmb,
        fontEmb: fontRows,
        contentEmb: contentRows,
        styleEmb: styleRows,
      })
    }

    const step = jit(valueAndGrad(lossFn))

    const rng = mulberry32(opts.seed)
    let key = random.key(opts.seed + 1)
    const snaps: LoraExport[] = []

    try {
      for (let epoch = 0; epoch < opts.epochs; epoch++) {
        const order = shuffled(samples.length, rng)
        for (let s = 0; s < stepsPerEpoch; s++) {
          const globalStep = epoch * stepsPerEpoch + s
          const lr = scheduleLr(
            globalStep / stepsPerEpoch,
            opts.lr,
            opts.warmupEpochs,
            opts.epochs,
            opts.minLr,
          )

          let accGrads: LoraTree | null = null
          let lossSum = 0
          let aborted = false
          for (let m = 0; m < acc; m++) {
            if (opts.shouldStop?.()) {
              aborted = true
              break
            }

            // assemble one microbatch on the host
            const xHost = new Float32Array(B * 3 * S * S)
            const styleHost = new Float32Array(B * H)
            const contentHost = new Float32Array(B * H)
            const maskHost = new Float32Array(B)
            const tHost = new Float32Array(B)
            for (let b = 0; b < B; b++) {
              const idx = ((s * acc + m) * B + b) % samples.length
              const sample = samples[order[idx]]
              const u8 = sample.imageU8
              const off = b * 3 * S * S
              for (let i = 0; i < u8.length; i++) {
                xHost[off + i] = u8[i] / 127.5 - 1
              }
              const jointDrop = rng() < C.flow.labelDropProb
              const fontOnlyDrop = rng() < fontDropProb
              maskHost[b] = sample.prior || jointDrop || fontOnlyDrop ? 0 : 1
              if (jointDrop || sample.prior) {
                styleHost.set(nullCond.styleEmb, b * H)
              } else {
                // per-step random reference from the pool (offline 1-of-8
                // parity) — never the char's own glyph
                let ri = Math.floor(rng() * stylePool.length)
                if (stylePool.length > 1 && ri === sample.poolIdx) {
                  ri = (ri + 1) % stylePool.length
                }
                styleHost.set(stylePool[ri] ?? sample.styleEmb, b * H)
              }
              contentHost.set(
                jointDrop ? nullCond.contentEmb : sample.contentEmb,
                b * H,
              )
              // t = sigmoid(N(pMean, pStd))
              const z = gauss(rng) * C.flow.pStd + C.flow.pMean
              tHost[b] = 1 / (1 + Math.exp(-z))
            }

            const [kNoise, kNext] = random.split(key, 2)
            key = kNext
            const e = np.multiply(
              random.normal(kNoise, [B, 3, S, S]),
              C.flow.noiseScale,
            )
            const x = np.array(xHost).reshape([B, 3, S, S])
            const t = np.array(tHost)
            const styleRows = np.array(styleHost).reshape([B, H])
            const contentRows = np.array(contentHost).reshape([B, H])
            const fontMask = np.array(maskHost).reshape([B, 1])

            const [lossVal, grads] = step(
              tree.ref(this.lora),
              x,
              t,
              e,
              styleRows,
              contentRows,
              fontMask,
            ) as [JaxArray, LoraTree]
            lossSum += (await lossVal.jsAsync()) as number

            if (!accGrads) {
              accGrads = {}
              for (const [k, v] of Object.entries(grads)) {
                accGrads[k] = acc === 1 ? v : np.multiply(v, 1 / acc)
              }
            } else {
              for (const [k, v] of Object.entries(grads)) {
                accGrads[k] = np.add(accGrads[k], np.multiply(v, 1 / acc))
              }
            }
          }
          if (aborted || !accGrads) {
            if (accGrads) for (const v of Object.values(accGrads)) v.dispose()
            return
          }

          // optax's adamw chain includes addDecayedWeights, which requires the
          // params argument even with weightDecay 0
          const [updates, newState] = baseSolver.update(
            accGrads,
            this.optState,
            tree.ref(this.lora),
          )
          this.optState = newState
          const scaled: LoraTree = {}
          for (const [k, v] of Object.entries(updates as LoraTree)) {
            scaled[k] = np.multiply(v, lr)
          }
          const newLora = applyUpdates(this.lora, scaled) as LoraTree
          this.lora = newLora

          opts.onProgress?.({
            epoch,
            step: s,
            stepsPerEpoch,
            loss: lossSum / acc,
            lr,
          })
        }

        if (opts.tailAverage && opts.epochs - 1 - epoch < 3) {
          snaps.push(await this.exportLora())
        }
      }

      // SWA-style tail averaging of the last epoch snapshots; approximate for
      // the bilinear A·B product but stabilizing for nearby checkpoints
      if (opts.tailAverage && snaps.length >= 2) {
        const avg: LoraExport = {}
        for (const k of Object.keys(snaps[0])) {
          const out = new Float32Array(snaps[0][k].data.length)
          for (const snap of snaps) {
            const d = snap[k].data
            for (let i = 0; i < d.length; i++) out[i] += d[i] / snaps.length
          }
          avg[k] = { data: out, shape: snaps[0][k].shape }
        }
        this.importLora(avg)
      }
    } finally {
      key.dispose()
    }
  }

  // generation: ab2 solver with CFG and optional structure anchors. Cond and
  // uncond run as one jitted B=2 forward (the parity-verified batch shape),
  // compiled once per sample() and reused across solver steps. Decoupled CFG
  // adds a second B=2 forward per step ([contentOnly, uncond]) rather than a
  // B=3 stack — B>2 exceeds the verified kernel index-space envelope.
  async sample(
    cond: NullCond,
    uncond: NullCond,
    opts: SampleOptions,
    condContent?: NullCond,
  ): Promise<Float32Array> {
    const C = this.config
    const S = C.inputSize
    const H = C.hiddenSize
    const stack2 = (a: Float32Array, b: Float32Array): JaxArray => {
      const buf = new Float32Array(2 * H)
      buf.set(a)
      buf.set(b, H)
      return np.array(buf).reshape([2, H])
    }
    const stackCond = (top: NullCond) => ({
      y: stack2(top.yEmb, uncond.yEmb),
      font: stack2(top.fontEmb, uncond.fontEmb),
      content: stack2(top.contentEmb, uncond.contentEmb),
      style: stack2(top.styleEmb, uncond.styleEmb),
    })
    const main = stackCond(cond)
    const decoupled = opts.contentCfg != null && condContent != null
    const contentPair = decoupled ? stackCond(condContent!) : null

    const fwd = jit(
      (
        lora: LoraTree,
        z2: JaxArray,
        t2: JaxArray,
        y: JaxArray,
        f: JaxArray,
        ce: JaxArray,
        se: JaxArray,
        gain: JaxArray,
      ) =>
        this.model.forward(
          z2,
          t2,
          { yEmb: y, fontEmb: f, contentEmb: ce, styleEmb: se },
          lora,
          gain,
        ),
    )

    const loraScale = opts.loraScale ?? 1
    // muting is defined on the INTEGRATED window: with SDEdit init the grid
    // starts at tStart, so an absolute threshold below tStart would never
    // fire. muteUntil maps loraTStart in [0,1) onto [t0, 1).
    const t0Mute = opts.tStart && opts.initImage ? opts.tStart : 0
    const muteUntil = t0Mute + (1 - t0Mute) * (opts.loraTStart ?? 0)

    // one stacked forward; consumes z2/t2/gain, refs the pair tensors
    const fwdPair = (
      pair: NonNullable<typeof contentPair>,
      z: JaxArray,
      tv: number,
    ): [JaxArray, JaxArray] => {
      const t2 = np.array(new Float32Array([tv, tv]))
      const z2 = np.concatenate([z.ref, z], 0)
      const gainVal = tv < muteUntil ? 0 : loraScale
      const gain = np.array(new Float32Array([gainVal]))
      const x2 = fwd(
        tree.ref(this.lora),
        z2,
        t2,
        pair.y.ref,
        pair.font.ref,
        pair.content.ref,
        pair.style.ref,
        gain,
      ) as JaxArray
      const [top, bottom] = np.split(x2, 2, 0)
      return [top, bottom]
    }

    // consumes z; returns the CFG-combined velocity at time tv. The throw
    // path (device loss/OOM inside a forward) disposes whatever this scope
    // still owns — bulk fill retries per glyph, so stranded buffers would
    // compound across hundreds of glyphs.
    const vAt = (z: JaxArray, tv: number): JaxArray => {
      const denom = Math.max(1 - tv, C.flow.tEps)
      let zKeep: JaxArray | null = z.ref
      let xc: JaxArray | null = null
      let xu: JaxArray | null = null
      let xCont: JaxArray | null = null
      try {
        ;[xc, xu] = fwdPair(main, z, tv)
        if (!decoupled) {
          const vc = np.divide(np.subtract(xc, zKeep.ref), denom)
          xc = null
          const zK = zKeep
          zKeep = null
          const vu = np.divide(np.subtract(xu, zK), denom)
          xu = null
          return np.add(vu.ref, np.multiply(np.subtract(vc, vu), opts.cfg))
        }
        // v = v_u + w_c(v_cont − v_u) + w_s(v_full − v_cont)
        const [xc2, xu2] = fwdPair(contentPair!, zKeep.ref, tv)
        xCont = xc2
        xu2.dispose()
        const vc = np.divide(np.subtract(xc, zKeep.ref), denom)
        xc = null
        const vu = np.divide(np.subtract(xu, zKeep.ref), denom)
        xu = null
        const zK = zKeep
        zKeep = null
        const vCont = np.divide(np.subtract(xCont, zK), denom)
        xCont = null
        return np.add(
          np.add(
            vu.ref,
            np.multiply(np.subtract(vCont.ref, vu), opts.contentCfg!),
          ),
          np.multiply(np.subtract(vc, vCont), opts.cfg),
        )
      } catch (err) {
        zKeep?.dispose()
        xc?.dispose()
        xu?.dispose()
        xCont?.dispose()
        throw err
      }
    }

    // error paths (device loss, OOM mid-batch) must not strand device
    // buffers: the bulk-fill loop catches per glyph and keeps going, so a
    // leak here compounds across hundreds of glyphs
    let z: JaxArray | null = null
    let vPrev: JaxArray | null = null
    try {
      const key = random.key(opts.seed)
      const noise = np.multiply(
        random.normal(key, [1, 3, S, S]),
        C.flow.noiseScale,
      )
      const t0 = opts.tStart && opts.initImage ? opts.tStart : 0
      if (t0 > 0) {
        // SDEdit anchor: LAYOUT comes from the (blurred) content rendering,
        // the remaining (1−t0) of the schedule paints the strokes
        let init = opts.initImage!.slice() as Float32Array<ArrayBuffer>
        if (opts.initBlur && opts.initBlur > 0) {
          init = boxBlurCHW(init, S, opts.initBlur) as Float32Array<ArrayBuffer>
        }
        const content = np.array(init).reshape([1, 3, S, S])
        z = np.add(np.multiply(content, t0), np.multiply(noise, 1 - t0))
      } else {
        z = noise
      }
      const ts: number[] = []
      for (let i = 0; i <= opts.steps; i++) {
        ts.push(t0 + (1 - t0) * (i / opts.steps))
      }

      vPrev = vAt(z.ref, ts[0])
      z = np.add(z, np.multiply(vPrev.ref, ts[1] - ts[0]))
      for (let i = 1; i < opts.steps; i++) {
        const vCurr = vAt(z.ref, ts[i])
        const combo = np.subtract(
          np.multiply(vCurr.ref, 1.5),
          np.multiply(vPrev, 0.5),
        )
        vPrev = null // consumed by combo
        z = np.add(z, np.multiply(combo, ts[i + 1] - ts[i]))
        vPrev = vCurr
      }
      vPrev.dispose()
      vPrev = null

      const zOut = z
      z = null // consumed by jsAsync
      return flattenToF32(await zOut.jsAsync())
    } finally {
      vPrev?.dispose()
      z?.dispose()
      for (const pair of [main, contentPair]) {
        if (!pair) continue
        pair.y.dispose()
        pair.font.dispose()
        pair.content.dispose()
        pair.style.dispose()
      }
    }
  }

  hasLora(): boolean {
    return Object.keys(this.lora).length > 0
  }

  async exportLora(): Promise<LoraExport> {
    const out: LoraExport = {}
    for (const [k, v] of Object.entries(this.lora)) {
      out[k] = {
        data: flattenToF32(await v.ref.jsAsync()),
        shape: [...v.aval.shape],
      }
    }
    return out
  }

  // restore a checkpoint produced by exportLora (e.g., from IndexedDB);
  // optimizer state is not restored — importing is for generation or a
  // fresh fine-tune, not resuming an interrupted one
  importLora(stored: LoraExport) {
    for (const v of Object.values(this.lora)) v.dispose()
    this.lora = {}
    for (const [k, t] of Object.entries(stored)) {
      this.lora[k] = np
        .array(t.data as Float32Array<ArrayBuffer>)
        .reshape(t.shape)
    }
    this.disposeOptState()
  }
}

// separable two-pass box blur on a CHW image (channels are identical gray
// planes, so blur one and replicate)
function boxBlurCHW(
  img: Float32Array,
  size: number,
  radius: number,
): Float32Array {
  const plane = size * size
  const src0 = img.subarray(0, plane)
  const tmp = new Float32Array(plane)
  const dst = new Float32Array(plane)
  const r = Math.max(1, Math.round(radius))
  const win = 2 * r + 1
  // horizontal
  for (let y = 0; y < size; y++) {
    let acc = 0
    const row = y * size
    for (let x = -r; x <= r; x++)
      acc += src0[row + Math.min(size - 1, Math.max(0, x))]
    for (let x = 0; x < size; x++) {
      tmp[row + x] = acc / win
      const add = Math.min(size - 1, x + r + 1)
      const sub = Math.max(0, x - r)
      acc += src0[row + add] - src0[row + sub]
    }
  }
  // vertical
  for (let x = 0; x < size; x++) {
    let acc = 0
    for (let y = -r; y <= r; y++)
      acc += tmp[Math.min(size - 1, Math.max(0, y)) * size + x]
    for (let y = 0; y < size; y++) {
      dst[y * size + x] = acc / win
      const add = Math.min(size - 1, y + r + 1)
      const sub = Math.max(0, y - r)
      acc += tmp[add * size + x] - tmp[sub * size + x]
    }
  }
  const out = new Float32Array(3 * plane)
  out.set(dst, 0)
  out.set(dst, plane)
  out.set(dst, 2 * plane)
  return out
}

function flattenToF32(x: any): Float32Array {
  if (x instanceof Float32Array) return x
  const out: number[] = []
  const walk = (v: any) => {
    if (typeof v === 'number') out.push(v)
    else for (const c of v) walk(c)
  }
  walk(x)
  return Float32Array.from(out)
}

// warmup (per-epoch fraction) then cosine decay — mirrors util/lr_sched.py
function scheduleLr(
  epochFloat: number,
  baseLr: number,
  warmupEpochs: number,
  totalEpochs: number,
  minLr: number,
): number {
  if (epochFloat < warmupEpochs) return (baseLr * epochFloat) / warmupEpochs
  const progress =
    (epochFloat - warmupEpochs) / Math.max(1e-8, totalEpochs - warmupEpochs)
  return minLr + (baseLr - minLr) * 0.5 * (1 + Math.cos(Math.PI * progress))
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(rng: () => number): number {
  // Box-Muller
  const u1 = Math.max(rng(), 1e-12)
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

function shuffled(n: number, rng: () => number): number[] {
  const idx = [...Array(n).keys()]
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx
}
