// Typed client for the zi2zi-JiT fine-tuning worker (jit-worker.ts), the
// style-faithful counterpart of Zi2ziClient. One worker per page: training
// and sampling serialize on the GPU anyway, and the worker itself queues
// requests strictly one-at-a-time.

import type { LoraExport } from './trainer.js'

export interface JitTrainProgress {
  epoch: number
  step: number
  stepsPerEpoch: number
  loss: number
  lr: number
}

export interface JitPrepareSample {
  image: Float32Array // target glyph [3*256*256] CHW [-1,1]
  styleImage: Float32Array // own-glyph style ref [3*128*128]
  contentImage: Float32Array // content-font glyph [3*256*256]
  fontIndex: number
  // prior-preservation row: content-font target with null style/font
  prior?: boolean
  // pool-dedupe key (the codepoint): augmented variants of one char share a
  // single style-pool entry in the worker
  styleKey?: number
}

export interface JitTrainOpts {
  epochs: number
  batchSize: number
  lr: number
  warmupEpochs: number
  minLr: number
  seed: number
  accumSteps?: number
  beta2?: number
  fontDropProb?: number
  tailAverage?: boolean
}

// inference-time structure anchors (docs/style-transfer-research.md Track A)
export interface JitAnchorOpts {
  tStart?: number // SDEdit init strength: layout from the content rendering
  loraScale?: number // global LoRA delta multiplier
  loraTStart?: number // mute LoRA below this t (base model decides layout)
  initBlur?: number // blur the init image: layout-only anchoring
  contentCfg?: number // decoupled content guidance weight (2x forwards/step)
}

export class JitClient {
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void }
  >()
  onTrainProgress: ((p: JitTrainProgress) => void) | null = null
  onPrepareProgress: ((done: number) => void) | null = null

  private ensure(): Worker {
    if (this.worker) return this.worker
    this.worker = new Worker(new URL('./jit-worker.ts', import.meta.url), {
      type: 'module',
    })
    this.worker.onmessage = (e: MessageEvent) => {
      const { type, id, message, output } = e.data
      if (type === 'progress') {
        this.onTrainProgress?.(e.data as JitTrainProgress)
        return
      }
      if (type === 'prepare-progress') {
        this.onPrepareProgress?.(e.data.done)
        return
      }
      const req = this.pending.get(id)
      if (!req) return
      this.pending.delete(id)
      if (type === 'error') req.reject(new Error(message))
      else req.resolve(output)
    }
    this.worker.onerror = (e) => {
      const err = new Error(e.message || 'jit worker crashed')
      for (const req of this.pending.values()) req.reject(err)
      this.pending.clear()
    }
    return this.worker
  }

  private request<T>(
    msg: Record<string, unknown>,
    transfer?: Transferable[],
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      this.ensure().postMessage({ ...msg, id }, (transfer ?? []) as any)
    })
  }

  init(assetBase: string): Promise<{ device: string; weightsMs: number }> {
    return this.request({ type: 'init', assetBase })
  }

  prepareBegin(nullFontIndex: number): Promise<void> {
    return this.request({ type: 'prepare-begin', nullFontIndex })
  }

  prepareAdd(
    samples: JitPrepareSample[],
  ): Promise<{ total: number; aborted: boolean }> {
    return this.request(
      { type: 'prepare-add', samples },
      samples.flatMap((s) => [
        s.image.buffer,
        s.styleImage.buffer,
        s.contentImage.buffer,
      ]),
    )
  }

  prepareFinish(): Promise<{ prepared: number; aborted: boolean }> {
    return this.request({ type: 'prepare-finish' })
  }

  // convenience wrapper: chunked begin/add/finish so callers holding a full
  // sample list don't spike worker message sizes
  async prepare(
    samples: JitPrepareSample[],
    nullFontIndex: number,
  ): Promise<{ prepared: number; aborted: boolean }> {
    await this.prepareBegin(nullFontIndex)
    for (let i = 0; i < samples.length; i += 16) {
      const r = await this.prepareAdd(samples.slice(i, i + 16))
      if (r.aborted) break
    }
    return this.prepareFinish()
  }

  train(opts: JitTrainOpts): Promise<{ aborted: boolean }> {
    return this.request({ type: 'train', opts })
  }

  // out-of-band: resolves immediately; a running train stops at the next
  // microbatch boundary and a running prepare at the next sample, each
  // resolving its own promise with {aborted: true}
  abort(): Promise<void> {
    return this.request({ type: 'abort' })
  }

  sample(
    args: {
      styleImage: Float32Array
      contentImage: Float32Array
      fontIndex: number
      steps: number
      cfg: number
      seed: number
    } & JitAnchorOpts,
  ): Promise<{ image: Float32Array }> {
    return this.request({ ...args, type: 'sample' }, [
      args.styleImage.buffer,
      args.contentImage.buffer,
    ])
  }

  // style-encoder embedding of an arbitrary [3*128*128] CHW [-1,1] image —
  // used for the preview gate's style-similarity score
  styleEmbed(image: Float32Array): Promise<{ emb: Float32Array }> {
    return this.request({ type: 'style-embed', image }, [image.buffer])
  }

  exportLora(): Promise<{ lora: LoraExport }> {
    return this.request({ type: 'export-lora' })
  }

  importLora(lora: LoraExport, nullFontIndex: number): Promise<void> {
    return this.request(
      { type: 'import-lora', lora, nullFontIndex },
      Object.values(lora).map((t) => t.data.buffer),
    )
  }

  parity(goldensBase: string, mode?: string, batch?: number): Promise<any> {
    return this.request({ type: 'parity', goldensBase, mode, batch })
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    const err = new Error('jit client disposed')
    for (const req of this.pending.values()) req.reject(err)
    this.pending.clear()
  }
}
