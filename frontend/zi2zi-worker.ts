// zi2zi inference worker — plain WASM build (smallest runtime, works
// everywhere incl. Safari). See zi2zi-worker-core.ts for the actual logic
// and zi2zi-worker-webgpu.ts for the GPU-accelerated variant.
//
// The wasm-only subpath keeps the WebGPU/JSEP binary out of this bundle. The
// runtime binaries resolve through the bundler (?url) so dev and prod both
// serve the exact files matching the installed onnxruntime-web version; the
// package's exports map hides dist/*, hence the relative node_modules paths
// (same workaround as the aliases in vite.config.ts).
import * as ort from 'onnxruntime-web/wasm'
import ortWasmUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'
import ortMjsUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url'
import { setupWorker } from './zi2zi-worker-core.js'

setupWorker({
  ort,
  wasmUrl: ortWasmUrl,
  mjsUrl: ortMjsUrl,
  executionProviders: ['wasm'],
  defaultVariant: 'int8',
})
