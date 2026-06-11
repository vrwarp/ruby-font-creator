// zi2zi inference worker — WebGPU (JSEP) build. Spawned by Zi2ziClient only
// when a WebGPU adapter is available on a non-WebKit browser (ort-web's JSEP
// binary misbehaves on Safari — see microsoft/onnxruntime#26827); everyone
// else gets zi2zi-worker.ts (plain WASM). Falls back to the wasm EP inside
// this worker if WebGPU session creation fails.
//
// int8 (QDQ) models must NOT be used here: quantized ops have no WebGPU
// kernels and would be silently partitioned to CPU with GPU<->CPU copies —
// slower than pure wasm. The client requests the fp32 variant instead.
// fp16 was evaluated and REJECTED: it collapses to blank output for some
// style inputs (e.g. calligraphy fonts) — activation overflow outside the
// InstanceNorm islands. Revisit only via auto_mixed_precision validated
// across many style fonts.
import * as ort from 'onnxruntime-web'
import ortWasmUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url'
import ortMjsUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url'
import { setupWorker } from './zi2zi-worker-core.js'

ort.env.webgpu.powerPreference = 'high-performance'

setupWorker({
  ort,
  wasmUrl: ortWasmUrl,
  mjsUrl: ortMjsUrl,
  executionProviders: ['webgpu', 'wasm'],
  defaultVariant: 'fp32',
})
