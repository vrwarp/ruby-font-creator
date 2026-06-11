// Verifies the MX-Font ONNX models vendored in frontend/public/models/.
//
// The onnxruntime-web runtime (JS + WASM) needs no vendoring: the worker
// resolves it from node_modules via vite `?url` imports, so it always matches
// the installed package version in both dev and production builds.
//
// The int8 model variants are committed to the repo; the fp32 variants (and
// the int8 ones, if missing) are produced by scripts/export-mxfont-onnx.py
// from the pretrained MX-Font checkpoint in vendor/mxfont/.
import fs from 'node:fs'
import path from 'node:path'

const modelDir = path.resolve(process.cwd(), 'frontend/public/models')

let ok = true
for (const model of [
  // int8 (static QDQ): WASM execution provider
  'mxfont_encoder.int8.onnx',
  'mxfont_decoder.int8.onnx',
  // fp32: WebGPU execution provider
  'mxfont_encoder.onnx',
  'mxfont_decoder.onnx',
]) {
  const p = path.join(modelDir, model)
  if (!fs.existsSync(p) || fs.statSync(p).size < 100_000) {
    console.error(
      `MISSING: ${model} — run .venv-mxfont/bin/python scripts/export-mxfont-onnx.py ` +
        '(see PROJECT.md) or restore it from the repository.',
    )
    ok = false
  } else {
    console.log(
      `model ok: ${model} (${(fs.statSync(p).size / 1e6).toFixed(1)} MB)`,
    )
  }
}

process.exit(ok ? 0 : 1)
