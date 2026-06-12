// In-browser LoRA fine-tuning loop for zi2zi-JiT, built on @jax-js/optax.
// Mirrors vendor/zi2zi-jit/lora_single_gpu_finetune_jit.py: AdamW
// (betas 0.9/0.95, weight decay 0), per-step warmup + cosine LR, CFG label
// dropout p=0.1 (null conditioning), flow-matching loss with lognormal t.
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
  // target glyph raster [3*S*S] in [-1,1] (ink black), plus its precomputed
  // conditioning vectors [hidden] each
  image: Float32Array
  yEmb: Float32Array
  fontEmb: Float32Array
  contentEmb: Float32Array
  styleEmb: Float32Array
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
  // polled between steps; returning true stops training cleanly (the LoRA
  // state keeps whatever progress was made)
  shouldStop?: () => boolean
  onProgress?: (info: {
    epoch: number
    step: number
    stepsPerEpoch: number
    loss: number
    lr: number
  }) => void
}

// Host-side LoRA checkpoint: structured-clonable, IndexedDB-storable.
export type LoraExport = Record<string, { data: Float32Array; shape: number[] }>

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

  initLora(seed: number) {
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
  }

  loraParamCount(): number {
    let n = 0
    for (const arr of Object.values(this.lora)) {
      n += arr.aval.shape.reduce((x, y) => x * y, 1)
    }
    return n
  }

  // Runs the full fine-tune. Yields to the event loop between steps so the
  // UI stays responsive (call from a worker regardless).
  async train(
    samples: TrainSample[],
    nullCond: NullCond,
    opts: TrainerOptions,
  ): Promise<void> {
    const C = this.config
    const B = opts.batchSize
    const S = C.inputSize
    const stepsPerEpoch = Math.max(1, Math.floor(samples.length / B))

    this.initLora(opts.seed)
    // optax adamw takes a fixed lr; the schedule is applied by scaling updates
    const baseSolver = adamw(1.0, { b1: 0.9, b2: 0.95, weightDecay: 0 })
    this.disposeOptState()
    this.optState = baseSolver.init(tree.ref(this.lora))

    const lossFn = (
      lora: LoraTree,
      x: JaxArray,
      t: JaxArray,
      e: JaxArray,
      yEmb: JaxArray,
      fontEmb: JaxArray,
      contentEmb: JaxArray,
      styleEmb: JaxArray,
    ) => this.model.loss(lora, x, t, e, { yEmb, fontEmb, contentEmb, styleEmb })

    const step = jit(valueAndGrad(lossFn))

    const rng = mulberry32(opts.seed)
    let key = random.key(opts.seed + 1)

    try {
      for (let epoch = 0; epoch < opts.epochs; epoch++) {
        const order = shuffled(samples.length, rng)
        for (let s = 0; s < stepsPerEpoch; s++) {
          if (opts.shouldStop?.()) return
          const globalStep = epoch * stepsPerEpoch + s
          const lr = scheduleLr(
            globalStep / stepsPerEpoch,
            opts.lr,
            opts.warmupEpochs,
            opts.epochs,
            opts.minLr,
          )

          // assemble batch on the host
          const xHost = new Float32Array(B * 3 * S * S)
          const cond = {
            y: new Float32Array(B * C.hiddenSize),
            font: new Float32Array(B * C.hiddenSize),
            content: new Float32Array(B * C.hiddenSize),
            style: new Float32Array(B * C.hiddenSize),
          }
          const tHost = new Float32Array(B)
          for (let b = 0; b < B; b++) {
            const sample = samples[order[(s * B + b) % samples.length]]
            xHost.set(sample.image, b * 3 * S * S)
            const dropped = rng() < C.flow.labelDropProb
            const src = dropped ? nullCond : sample
            cond.y.set(src.yEmb, b * C.hiddenSize)
            cond.font.set(src.fontEmb, b * C.hiddenSize)
            cond.content.set(src.contentEmb, b * C.hiddenSize)
            cond.style.set(src.styleEmb, b * C.hiddenSize)
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
          const yEmb = np.array(cond.y).reshape([B, C.hiddenSize])
          const fontEmb = np.array(cond.font).reshape([B, C.hiddenSize])
          const contentEmb = np.array(cond.content).reshape([B, C.hiddenSize])
          const styleEmb = np.array(cond.style).reshape([B, C.hiddenSize])

          const [lossVal, grads] = step(
            tree.ref(this.lora),
            x,
            t,
            e,
            yEmb,
            fontEmb,
            contentEmb,
            styleEmb,
          ) as [JaxArray, LoraTree]

          // optax's adamw chain includes addDecayedWeights, which requires the
          // params argument even with weightDecay 0
          const [updates, newState] = baseSolver.update(
            grads,
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

          const loss = (await lossVal.jsAsync()) as number
          opts.onProgress?.({
            epoch,
            step: s,
            stepsPerEpoch,
            loss,
            lr,
          })
        }
      }
    } finally {
      key.dispose()
    }
  }

  // generation: ab2 solver with CFG. Cond and uncond run as one jitted B=2
  // forward (the parity-verified batch shape), compiled once per sample()
  // and reused across solver steps — ~4x over two eager B=1 forwards.
  async sample(
    cond: NullCond,
    uncond: NullCond,
    opts: { steps: number; cfg: number; seed: number },
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
    const yEmb = stack2(cond.yEmb, uncond.yEmb)
    const fontEmb = stack2(cond.fontEmb, uncond.fontEmb)
    const contentEmb = stack2(cond.contentEmb, uncond.contentEmb)
    const styleEmb = stack2(cond.styleEmb, uncond.styleEmb)

    const fwd = jit(
      (
        lora: LoraTree,
        z2: JaxArray,
        t2: JaxArray,
        y: JaxArray,
        f: JaxArray,
        ce: JaxArray,
        se: JaxArray,
      ) =>
        this.model.forward(
          z2,
          t2,
          { yEmb: y, fontEmb: f, contentEmb: ce, styleEmb: se },
          lora,
        ),
    )

    // consumes z; returns the CFG-combined velocity at time tv
    const vAt = (z: JaxArray, tv: number): JaxArray => {
      const t2 = np.array(new Float32Array([tv, tv]))
      const denom = Math.max(1 - tv, C.flow.tEps)
      const z2 = np.concatenate([z.ref, z.ref], 0)
      const x2 = fwd(
        tree.ref(this.lora),
        z2,
        t2,
        yEmb.ref,
        fontEmb.ref,
        contentEmb.ref,
        styleEmb.ref,
      ) as JaxArray
      const [xc, xu] = np.split(x2, 2, 0)
      const vc = np.divide(np.subtract(xc, z.ref), denom)
      const vu = np.divide(np.subtract(xu, z), denom)
      const scale = tv < 1.0 ? opts.cfg : 1.0
      return np.add(vu.ref, np.multiply(np.subtract(vc, vu), scale))
    }

    // error paths (device loss, OOM mid-batch) must not strand device
    // buffers: the bulk-fill loop catches per glyph and keeps going, so a
    // leak here compounds across hundreds of glyphs
    let z: JaxArray | null = null
    let vPrev: JaxArray | null = null
    try {
      const key = random.key(opts.seed)
      z = np.multiply(random.normal(key, [1, 3, S, S]), C.flow.noiseScale)
      const ts: number[] = []
      for (let i = 0; i <= opts.steps; i++) ts.push(i / opts.steps)

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
      yEmb.dispose()
      fontEmb.dispose()
      contentEmb.dispose()
      styleEmb.dispose()
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
