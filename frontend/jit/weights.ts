// Loader for the exported zi2zi-JiT backbone (scripts/export-jit-browser.py):
// a JSON manifest plus fp16 binary shards, decoded to Float32Arrays. The
// reader is injected so the same code serves the browser (fetch + OPFS cache)
// and vitest (node fs).

export interface TensorEntry {
  offset: number
  shape: number[]
  dtype: 'f16' | 'f32'
}

export interface WeightsManifest {
  shards: { name: string; bytes: number }[]
  shardBytes: number
  tensors: Record<string, TensorEntry>
}

export interface HostTensor {
  data: Float32Array
  shape: number[]
}

export type WeightStore = Map<string, HostTensor>

function decodeF16(u16: Uint16Array): Float32Array {
  const out = new Float32Array(u16.length)
  for (let i = 0; i < u16.length; i++) {
    const h = u16[i]
    const sign = (h & 0x8000) << 16
    const exp = (h & 0x7c00) >> 10
    const frac = h & 0x03ff
    let bits: number
    if (exp === 0) {
      if (frac === 0) {
        bits = sign
      } else {
        // subnormal: normalize
        let e = -1
        let f = frac
        do {
          e++
          f <<= 1
        } while ((f & 0x0400) === 0)
        bits = sign | ((127 - 15 - e) << 23) | ((f & 0x03ff) << 13)
      }
    } else if (exp === 0x1f) {
      bits = sign | 0x7f800000 | (frac << 13)
    } else {
      bits = sign | ((exp - 15 + 127) << 23) | (frac << 13)
    }
    out[i] = f32FromBits(bits)
  }
  return out
}

const F32_VIEW = new Float32Array(1)
const U32_VIEW = new Uint32Array(F32_VIEW.buffer)
function f32FromBits(bits: number): number {
  U32_VIEW[0] = bits
  return F32_VIEW[0]
}

export async function loadWeights(
  readFile: (name: string) => Promise<ArrayBuffer>,
): Promise<WeightStore> {
  const manifest: WeightsManifest = JSON.parse(
    new TextDecoder().decode(await readFile('jit_weights.json')),
  )
  const shardBufs = await Promise.all(
    manifest.shards.map((s) => readFile(s.name)),
  )
  const total = shardBufs.reduce((n, b) => n + b.byteLength, 0)
  const blob = new Uint8Array(total)
  let pos = 0
  for (const buf of shardBufs) {
    blob.set(new Uint8Array(buf), pos)
    pos += buf.byteLength
  }

  const store: WeightStore = new Map()
  for (const [name, entry] of Object.entries(manifest.tensors)) {
    const count = entry.shape.reduce((a, b) => a * b, 1)
    let data: Float32Array
    if (entry.dtype === 'f16') {
      data = decodeF16(new Uint16Array(blob.buffer, entry.offset, count))
    } else {
      data = new Float32Array(
        blob.buffer.slice(entry.offset, entry.offset + count * 4),
      )
    }
    store.set(name, { data, shape: entry.shape })
  }
  return store
}

// Binary golden-tensor fixtures share the same format (all f32).
export async function loadGoldens(
  manifestJson: string,
  bin: ArrayBuffer,
): Promise<WeightStore> {
  const manifest = JSON.parse(manifestJson) as {
    tensors: Record<string, TensorEntry>
  }
  const store: WeightStore = new Map()
  const bytes = new Uint8Array(bin)
  for (const [name, entry] of Object.entries(manifest.tensors)) {
    const count = entry.shape.reduce((a, b) => a * b, 1)
    store.set(name, {
      data: new Float32Array(
        bytes.buffer.slice(entry.offset, entry.offset + count * 4),
      ),
      shape: entry.shape.length ? entry.shape : [1],
    })
  }
  return store
}
