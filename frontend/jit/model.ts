// zi2zi-JiT-B/16 transformer in jax-js — the in-browser trainable twin of
// vendor/zi2zi-jit/model_jit.py. Only the diffusion transformer lives here;
// the frozen style/content encoders run via onnxruntime-web and feed
// precomputed conditioning vectors.
//
// Ownership discipline (jax-js move semantics): every helper CONSUMES its
// activation arguments; frozen weights and LoRA parameters are always passed
// in via `.ref` so the caller keeps ownership. Parity against PyTorch golden
// tensors is enforced by test/jit-parity.test.ts.

import { numpy as np, nn, type Array as JaxArray } from '@jax-js/jax'
import type { WeightStore } from './weights.js'

export interface JitConfig {
  depth: number
  hiddenSize: number
  numHeads: number
  headDim: number
  patchSize: number
  inputSize: number
  numPatches: number
  inContextLen: number
  inContextStart: number
  nFontTokens: number
  nContentTokens: number
  nStyleTokens: number
  mlpHidden: number
  numFonts: number
  numChars: number
  rmsNormEps: number
  flow: {
    pMean: number
    pStd: number
    tEps: number
    noiseScale: number
    labelDropProb: number
  }
  lora: { r: number; alpha: number; targets: string[] }
}

// Frozen backbone weights as live jax arrays (uploaded once to the device).
export type Frozen = Map<string, JaxArray>

export function frozenFromStore(store: WeightStore): Frozen {
  const frozen: Frozen = new Map()
  for (const [name, t] of store) {
    frozen.set(
      name,
      np.array(t.data as Float32Array<ArrayBuffer>).reshape(t.shape),
    )
  }
  return frozen
}

export function disposeFrozen(frozen: Frozen) {
  for (const arr of frozen.values()) arr.dispose()
  frozen.clear()
}

// LoRA parameter tree: flat record keyed `blocks.<i>.<target>.{A,B}`.
export type LoraTree = Record<string, JaxArray>

export interface CondVectors {
  // each [B, hidden]; already includes the font embedding lookup
  yEmb: JaxArray
  fontEmb: JaxArray
  contentEmb: JaxArray
  styleEmb: JaxArray
}

const f = (frozen: Frozen, name: string): JaxArray => {
  const arr = frozen.get(name)
  if (!arr) throw new Error(`missing weight: ${name}`)
  return arr.ref
}

// y = x @ W^T + b, with optional LoRA delta (x @ A^T) @ B^T * (alpha/r).
// Consumes x; W/b/A/B/gain are refs. gain is a traced [1] scalar that scales
// the LoRA delta at inference (structure-anchor dial / early-step muting)
// without recompiling per value.
function linear(
  x: JaxArray,
  w: JaxArray,
  b: JaxArray | null,
  lora?: { a: JaxArray; b: JaxArray; scale: number; gain?: JaxArray },
): JaxArray {
  const xr = lora ? x.ref : x
  let y = np.matmul(x, np.transpose(w))
  if (b) y = np.add(y, b)
  if (lora) {
    const mid = np.matmul(xr, np.transpose(lora.a))
    let delta = np.matmul(mid, np.transpose(lora.b))
    if (lora.scale !== 1) delta = np.multiply(delta, lora.scale)
    if (lora.gain) delta = np.multiply(delta, lora.gain)
    y = np.add(y, delta)
  }
  return y
}

// RMSNorm over the last axis: x * rsqrt(mean(x^2) + eps) * weight. Consumes x.
function rmsNorm(x: JaxArray, weight: JaxArray, eps: number): JaxArray {
  const variance = np.mean(np.square(x.ref), -1, { keepdims: true })
  const inv = np.reciprocal(np.sqrt(np.add(variance, eps)))
  return np.multiply(np.multiply(x, inv), weight)
}

// modulate(x, shift, scale): x * (1 + scale[:, None, :]) + shift[:, None, :]
function modulate(x: JaxArray, shift: JaxArray, scale: JaxArray): JaxArray {
  const scale3 = np.expandDims(scale, 1)
  const shift3 = np.expandDims(shift, 1)
  return np.add(np.multiply(x, np.add(scale3, 1)), shift3)
}

// EVA-style rotate_half on interleaved pairs: [x0,x1,...] -> [-x1,x0,...].
// Consumes x; shape [..., D] with D even.
function rotateHalf(x: JaxArray): JaxArray {
  const shape = x.aval.shape
  const d = shape[shape.length - 1]
  const paired = x.reshape([...shape.slice(0, -1), d / 2, 2])
  const [x1, x2] = np.split(paired, 2, -1)
  const rotated = np.concatenate([np.negative(x2), x1], -1)
  return rotated.reshape(shape)
}

// q/k: [B, H, N, hd]; cos/sin: [N, hd] broadcast. Consumes x.
function applyRope(x: JaxArray, cos: JaxArray, sin: JaxArray): JaxArray {
  const xr = x.ref
  return np.add(np.multiply(x, cos), np.multiply(rotateHalf(xr), sin))
}

// Inline, numerically stable silu. nn.silu is jit-wrapped inside jax-js, and
// jit subprograms corrupt gradient buffers on the WebGPU backend (loss is
// right, grads come back NaN); composing eagerly sidesteps that path. The
// two-branch sigmoid keeps exp() arguments non-positive so neither branch
// nor its derivative overflows for any input.
function silu(x: JaxArray): JaxArray {
  const t = np.exp(np.negative(np.abs(x.ref)))
  const sig = np.where(
    np.lessEqual(x.ref, 0),
    np.divide(t.ref, np.add(t.ref, 1)),
    np.reciprocal(np.add(t, 1)),
  )
  return np.multiply(x, sig)
}

export interface ModelApi {
  config: JitConfig
  // x [B,3,S,S], t [B], cond — all consumed. loraGain is an optional traced
  // [1] scalar (consumed) scaling every LoRA delta. Returns x_pred [B,3,S,S].
  forward(
    x: JaxArray,
    t: JaxArray,
    cond: CondVectors,
    lora: LoraTree | null,
    loraGain?: JaxArray,
  ): JaxArray
  // flow-matching loss with explicit t [B] and noise e [B,3,S,S] (consumed).
  loss(
    lora: LoraTree,
    x: JaxArray,
    t: JaxArray,
    e: JaxArray,
    cond: CondVectors,
  ): JaxArray
  // exposed for layer-level parity tests
  internals: {
    tEmbed(t: JaxArray): JaxArray
    patchify(x: JaxArray): JaxArray
    block(
      x: JaxArray,
      c: JaxArray,
      i: number,
      ropeCos: JaxArray,
      ropeSin: JaxArray,
      lora: LoraTree | null,
    ): JaxArray
    weight(name: string): JaxArray
  }
}

export function buildModel(frozen: Frozen, config: JitConfig): ModelApi {
  const C = config
  const P = C.patchSize
  const G = C.inputSize / P // patches per side
  const loraScale = C.lora.alpha / C.lora.r

  function loraFor(
    lora: LoraTree | null,
    block: number,
    target: string,
    gain?: JaxArray,
  ): { a: JaxArray; b: JaxArray; scale: number; gain?: JaxArray } | undefined {
    if (!lora) return undefined
    const a = lora[`blocks.${block}.${target}.A`]
    const b = lora[`blocks.${block}.${target}.B`]
    if (!a || !b) return undefined
    return { a: a.ref, b: b.ref, scale: loraScale, gain: gain?.ref }
  }

  // [B,3,S,S] -> [B, N, hidden] (+ fixed pos embed). Consumes x.
  function patchify(x: JaxArray): JaxArray {
    const B = x.aval.shape[0]
    // (B,C,G,P,G,P) -> (B,G,G,C,P,P) -> (B, N, C*P*P)
    let p = x.reshape([B, 3, G, P, G, P])
    p = np.transpose(p, [0, 2, 4, 1, 3, 5])
    p = p.reshape([B, G * G, 3 * P * P])
    let h = np.matmul(p, np.transpose(f(frozen, 'x_embedder.w1')))
    h = linear(h, f(frozen, 'x_embedder.w2'), f(frozen, 'x_embedder.b2'))
    return np.add(h, f(frozen, 'pos_embed'))
  }

  // [B, N, P*P*3] -> [B,3,S,S]. Consumes x.
  function unpatchify(x: JaxArray): JaxArray {
    const B = x.aval.shape[0]
    // (B,G,G,P,P,C) -> (B,C,G,P,G,P) -> (B,C,S,S)  (torch: nhwpqc->nchpwq)
    let img = x.reshape([B, G, G, P, P, 3])
    img = np.transpose(img, [0, 5, 1, 3, 2, 4])
    return img.reshape([B, 3, G * P, G * P])
  }

  // sinusoidal timestep embedding + MLP. Consumes t [B].
  function tEmbed(t: JaxArray): JaxArray {
    const half = 128
    const freqData = new Float32Array(half)
    for (let i = 0; i < half; i++) {
      freqData[i] = Math.exp((-Math.log(10000) * i) / half)
    }
    const freqs = np.array(freqData)
    const args = np.multiply(np.expandDims(t, 1), freqs)
    const emb = np.concatenate([np.cos(args.ref), np.sin(args)], -1)
    let h = linear(emb, f(frozen, 't_embedder.w0'), f(frozen, 't_embedder.b0'))
    h = silu(h)
    return linear(h, f(frozen, 't_embedder.w2'), f(frozen, 't_embedder.b2'))
  }

  // One transformer block. Consumes x; c is ref'd by caller per use; gain
  // (if present) is ref'd per LoRA site.
  function block(
    x: JaxArray,
    c: JaxArray,
    i: number,
    ropeCos: JaxArray,
    ropeSin: JaxArray,
    lora: LoraTree | null,
    gain?: JaxArray,
  ): JaxArray {
    const B = x.aval.shape[0]
    const N = x.aval.shape[1]
    const pfx = `blocks.${i}.`

    const mod = linear(
      silu(c),
      f(frozen, pfx + 'adaln.weight'),
      f(frozen, pfx + 'adaln.bias'),
    )
    const [shiftMsa, scaleMsa, gateMsa, shiftMlp, scaleMlp, gateMlp] = np.split(
      mod,
      6,
      -1,
    )

    // --- attention path
    let h = rmsNorm(x.ref, f(frozen, pfx + 'norm1.weight'), C.rmsNormEps)
    h = modulate(h, shiftMsa, scaleMsa)
    let qkv = linear(
      h,
      f(frozen, pfx + 'qkv.weight'),
      f(frozen, pfx + 'qkv.bias'),
      loraFor(lora, i, 'qkv', gain),
    )
    qkv = qkv.reshape([B, N, 3, C.numHeads, C.headDim])
    qkv = np.transpose(qkv, [2, 0, 3, 1, 4]) // [3, B, H, N, hd]
    let [q, k, v] = np.split(qkv, 3, 0)
    q = q.reshape([B, C.numHeads, N, C.headDim])
    k = k.reshape([B, C.numHeads, N, C.headDim])
    v = v.reshape([B, C.numHeads, N, C.headDim])

    q = rmsNorm(q, f(frozen, pfx + 'q_norm.weight'), 1e-6)
    k = rmsNorm(k, f(frozen, pfx + 'k_norm.weight'), 1e-6)
    q = applyRope(q, ropeCos.ref, ropeSin.ref)
    k = applyRope(k, ropeCos, ropeSin)

    const scale = 1 / Math.sqrt(C.headDim)
    let attn = np.matmul(q, np.transpose(k, [0, 1, 3, 2]))
    attn = nn.softmax(np.multiply(attn, scale), -1)
    let out = np.matmul(attn, v) // [B, H, N, hd]
    out = np.transpose(out, [0, 2, 1, 3]).reshape([B, N, C.hiddenSize])
    out = linear(
      out,
      f(frozen, pfx + 'proj.weight'),
      f(frozen, pfx + 'proj.bias'),
      loraFor(lora, i, 'proj', gain),
    )
    const x1 = np.add(x, np.multiply(np.expandDims(gateMsa, 1), out))

    // --- MLP path (SwiGLU)
    let m = rmsNorm(x1.ref, f(frozen, pfx + 'norm2.weight'), C.rmsNormEps)
    m = modulate(m, shiftMlp, scaleMlp)
    const w12 = linear(
      m,
      f(frozen, pfx + 'w12.weight'),
      f(frozen, pfx + 'w12.bias'),
      loraFor(lora, i, 'w12', gain),
    )
    const [g1, g2] = np.split(w12, 2, -1)
    const hidden = np.multiply(silu(g1), g2)
    const mlpOut = linear(
      hidden,
      f(frozen, pfx + 'w3.weight'),
      f(frozen, pfx + 'w3.bias'),
      loraFor(lora, i, 'w3', gain),
    )
    return np.add(x1, np.multiply(np.expandDims(gateMlp, 1), mlpOut))
  }

  function forward(
    x: JaxArray,
    t: JaxArray,
    cond: CondVectors,
    lora: LoraTree | null,
    loraGain?: JaxArray,
  ): JaxArray {
    const c = np.add(tEmbed(t), cond.yEmb)

    // token repetition via concat-of-refs: jax-js's broadcastTo transpose
    // rule cannot handle middle-dim broadcasts under grad (reshape error),
    // while concatenate's VJP (split) is solid
    const repeatTok = (v: JaxArray, n: number): JaxArray => {
      const e = np.expandDims(v, 1) // [B, 1, hidden]
      const parts: JaxArray[] = []
      for (let j = 0; j < n - 1; j++) parts.push(e.ref)
      parts.push(e)
      return np.concatenate(parts, 1)
    }

    let h = patchify(x)
    for (let i = 0; i < C.depth; i++) {
      if (i === C.inContextStart) {
        const fontTok = repeatTok(cond.fontEmb, C.nFontTokens)
        const contentTok = repeatTok(cond.contentEmb, C.nContentTokens)
        const styleTok = repeatTok(cond.styleEmb, C.nStyleTokens)
        let ctx = np.concatenate([fontTok, contentTok, styleTok], 1)
        ctx = np.add(ctx, f(frozen, 'in_context_posemb'))
        h = np.concatenate([ctx, h], 1)
      }
      const ctxMode = i >= C.inContextStart
      h = block(
        h,
        c.ref,
        i,
        f(frozen, ctxMode ? 'rope_ctx.cos' : 'rope.cos'),
        f(frozen, ctxMode ? 'rope_ctx.sin' : 'rope.sin'),
        lora,
        loraGain,
      )
    }
    // each block took gain refs; release the caller's handle
    loraGain?.dispose()
    // drop the in-context tokens
    const tokens = np.split(h, [C.inContextLen], 1)
    tokens[0].dispose()
    h = tokens[1]

    // final layer
    const mod = linear(
      silu(c),
      f(frozen, 'final.adaln.weight'),
      f(frozen, 'final.adaln.bias'),
    )
    const [shift, scaleF] = np.split(mod, 2, -1)
    h = rmsNorm(h, f(frozen, 'final.norm.weight'), C.rmsNormEps)
    h = modulate(h, shift, scaleF)
    h = linear(
      h,
      f(frozen, 'final.linear.weight'),
      f(frozen, 'final.linear.bias'),
    )
    return unpatchify(h)
  }

  function loss(
    lora: LoraTree,
    x: JaxArray,
    t: JaxArray,
    e: JaxArray,
    cond: CondVectors,
  ): JaxArray {
    // z = t*x + (1-t)*e ; v = (x-z)/max(1-t, tEps) ; v_pred likewise from the
    // model's x_pred. Mirrors Denoiser.forward (vendor/zi2zi-jit/denoiser.py).
    const B = t.aval.shape[0]
    const t4 = t.ref.reshape([B, 1, 1, 1])
    const oneMinusT = np.maximum(np.subtract(1, t4.ref), C.flow.tEps)
    const z = np.add(
      np.multiply(t4.ref, x.ref),
      np.multiply(np.subtract(1, t4), e),
    )
    const v = np.divide(np.subtract(x, z.ref), oneMinusT.ref)
    const xPred = forward(z.ref, t, cond, lora)
    const vPred = np.divide(np.subtract(xPred, z), oneMinusT)
    return np.mean(np.square(np.subtract(v, vPred)))
  }

  return {
    config: C,
    forward,
    loss,
    internals: { tEmbed, patchify, block, weight: (name) => f(frozen, name) },
  }
}
