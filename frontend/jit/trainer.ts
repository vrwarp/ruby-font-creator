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
  type CondVectors,
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
  onProgress?: (info: {
    epoch: number
    step: number
    stepsPerEpoch: number
    loss: number
    lr: number
  }) => void
}

export class JitTrainer {
  private model: ModelApi
  private config: JitConfig
  private lora: LoraTree = {}
  private optState: any = null

  constructor(frozen: Frozen, config: JitConfig) {
    this.config = config
    this.model = buildModel(frozen, config)
  }

  initLora(seed: number) {
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

        const [updates, newState] = baseSolver.update(grads, this.optState)
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
  }

  // merged sampling forward for generation: cond + uncond CFG, ab2 solver
  async sample(
    cond: NullCond,
    uncond: NullCond,
    opts: { steps: number; cfg: number; seed: number },
  ): Promise<Float32Array> {
    const C = this.config
    const S = C.inputSize
    const toCond = (c: NullCond): CondVectors => ({
      yEmb: np.array(c.yEmb).reshape([1, C.hiddenSize]),
      fontEmb: np.array(c.fontEmb).reshape([1, C.hiddenSize]),
      contentEmb: np.array(c.contentEmb).reshape([1, C.hiddenSize]),
      styleEmb: np.array(c.styleEmb).reshape([1, C.hiddenSize]),
    })

    const vAt = (z: JaxArray, tv: number): JaxArray => {
      const t = np.array(new Float32Array([tv]))
      const denom = Math.max(1 - tv, C.flow.tEps)
      const xc = this.model.forward(z.ref, t.ref, toCond(cond), this.lora)
      const vc = np.divide(np.subtract(xc, z.ref), denom)
      const xu = this.model.forward(z.ref, t, toCond(uncond), this.lora)
      const vu = np.divide(np.subtract(xu, z), denom)
      const scale = tv < 1.0 ? opts.cfg : 1.0
      return np.add(vu.ref, np.multiply(np.subtract(vc, vu), scale))
    }

    const key = random.key(opts.seed)
    let z = np.multiply(random.normal(key, [1, 3, S, S]), C.flow.noiseScale)
    const ts: number[] = []
    for (let i = 0; i <= opts.steps; i++) ts.push(i / opts.steps)

    let vPrev = vAt(z.ref, ts[0])
    z = np.add(z, np.multiply(vPrev.ref, ts[1] - ts[0]))
    for (let i = 1; i < opts.steps; i++) {
      const vCurr = vAt(z.ref, ts[i])
      const combo = np.subtract(
        np.multiply(vCurr.ref, 1.5),
        np.multiply(vPrev, 0.5),
      )
      z = np.add(z, np.multiply(combo, ts[i + 1] - ts[i]))
      vPrev = vCurr
    }
    vPrev.dispose()

    const out = flattenToF32(await z.jsAsync())
    return out
  }

  exportLora(): Record<string, { data: number[]; shape: number[] }> {
    const out: Record<string, { data: number[]; shape: number[] }> = {}
    for (const [k, v] of Object.entries(this.lora)) {
      out[k] = {
        data: flattenToF32(v.ref.dataSync() as any) as any,
        shape: v.aval.shape,
      }
    }
    return out
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
