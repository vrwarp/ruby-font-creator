# Project: Ruby Font Creator PWA Conversion

## Architecture

- **Static Frontend**: Built via Vite and hosted from `dist-web/`. Runs 100% client-side.
- **Service Worker (`sw.js`)**: Caches all assets including `DroidSansFallbackFull.ttf`, Pyodide assets, and Python wheels to support 100% offline usage.
- **IndexedDB**: Persistent database storing compiled font blobs (TTF and WOFF2) and user settings.
- **Browser Font Engine**: Uses `opentype.js` to parse the base TTF and generate SVG paths for preview rendering using browser-compatible `ruby.ts`.
- **Browser Font Compiler**: Constructs SVG Font XML from glyph vectors in memory, converts SVG Font XML to TTF using `svg2ttf`, and registers via CSS Font Loading API.
- **Pyodide OpenType Feature Injector**: Pyodide runs Python in the browser, loads local wheels (`fonttools`, `brotli`), and executes a script equivalent to `scripts/inject-gsub.py` to inject GSUB alternate lookup rules and output compressed WOFF2.

```
+-------------------------------------------------------------+
|                        Browser Tab                          |
|                                                             |
|   +------------------+   +------------------+               |
|   |   IndexedDB      |   |   UI (main.ts)   |               |
|   | - Compiled Fonts |<->| - Configuration  |               |
|   | - Configuration  |   +--------+---------+               |
|   +------------------+            |                         |
|                                   v                         |
|                        +----------+----------+              |
|                        |  Client-Side Engine |              |
|                        |  - ruby.ts          |              |
|                        |  - opentype.js      |              |
|                        +----------+----------+              |
|                                   |                         |
|                                   v                         |
|                        +----------+----------+              |
|                        | Client-Side Compiler|              |
|                        | - SVG XML builder   |              |
|                        | - svg2ttf           |              |
|                        +----------+----------+              |
|                                   |                         |
|                                   v                         |
|                        +----------+----------+              |
|                        |    Pyodide WASM     |              |
|                        | - fonttools wheel   |              |
|                        | - brotli wheel      |              |
|                        | - GSUB rules script |              |
|                        +---------------------+              |
+-------------------------------------------------------------+
                                ^
                                | (Intercept & Cache)
+-------------------------------+-----------------------------+
|                      Service Worker (sw.js)                 |
+-------------------------------------------------------------+
```

## Milestones

| #   | Name                                                        | Scope                                                                                                                        | Dependencies | Status |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------ | ------ |
| 1   | M1: Test Suite & Infrastructure (E2E Track)                 | Design and implement the E2E/integration testing infrastructure for browser-side PWA features, including mocking.            | None         | DONE   |
| 2   | M2: Dependency Vendoring & PWA Setup                        | Download Pyodide runtime, Python wheels (`fonttools`, `brotli`), `opentype.js`, and setup `manifest.json` and `sw.js`.       | None         | DONE   |
| 3   | M3: Client-Side Vector Preview Rendering                    | Implement client-side loading of `DroidSansFallbackFull.ttf` via `opentype.js` and port `ruby.ts` for browser-side previews. | M2           | DONE   |
| 4   | M4: Browser-Side Font Compilation                           | Implement browser-side SVG font XML generation, convert to TTF via `svg2ttf`, and register via CSS Font Loading API.         | M3           | DONE   |
| 5   | M5: Browser-Side GSUB rules injection and WOFF2 Compression | Initialize Pyodide with vendored assets, run GSUB injection and WOFF2 compression on the TTF in-browser.                     | M2, M4       | DONE   |
| 6   | M6: Offline Storage & Cleanup                               | Store compiled fonts and settings in IndexedDB; remove server-side API middlewares in `vite.config.ts`.                      | M5           | DONE   |

## Interface Contracts

### Client-Side Preview Generator

- **Input**:
  - `glyphs: Array<{ glyph: string, ruby: string }>`
  - `layout: LayoutConfig` (placement, verticalOffset, opticalSqueeze, fontWeight, letterTracking, pinyinSize, hanziSize, strategy, characterWidth)
- **Output**:
  - `Array<{ glyph: string, ruby: string, svg: string }>` (containing rendered inline SVGs)

### Client-Side SVG-to-TTF Compiler

- **Input**:
  - `glyphs: Array<{ glyph: string, path: string, unicode: number }>`
- **Output**:
  - `Uint8Array` (TTF binary representation)

### Pyodide Feature Injector

- **Input**:
  - `ttfBuffer: Uint8Array` (compiled TTF font)
  - `polyphonicMapJson: string` (JSON mapping alternate glyph substitutions)
- **Output**:
  - `Uint8Array` (TTF font with GSUB tables)
  - `Uint8Array` (WOFF2 compressed font)

## AI Glyph Generation (zi2zi-style missing-half fill)

Fills missing simplified/traditional characters in a user-uploaded Chinese
font, entirely client-side. Two modes:

- **AI style transfer**: few-shot generation with **MX-Font**
  (clovaai/mxfont, ICCV'21, MIT — forked in `vendor/mxfont/` with small
  ONNX-export patches to `models/modules/cbam.py`). Style references are
  glyphs rendered from the user's own font; content images come from the
  bundled Droid Sans Fallback. Inference runs in a Web Worker via
  onnxruntime-web (WASM, single-threaded), int8-quantized graphs
  (`frontend/public/models/mxfont_{encoder,decoder}.int8.onnx`, ~24 MB,
  committed). Output rasters are vectorized (`src/vectorizer.ts`, crack-
  following tracer with hole/winding handling) and injected as TrueType
  glyphs by fontTools in Pyodide (`frontend/py/patch_chinese_font.py`).
- **Variant mapping**: deterministic cmap aliasing of missing codepoints to
  existing counterpart glyphs (exact style, counterpart shape), driven by
  OpenCC single-character tables (`frontend/public/data/variants.json`,
  Apache-2.0, regenerate with `npm run download:opencc`; planning logic in
  `src/variants.ts`).

Model pipeline (offline, requires the `.venv-mxfont` Python env):

1. `curl -L -o vendor/mxfont/generator.pth https://raw.githubusercontent.com/clovaai/mxfont/main/generator.pth`
2. `.venv-mxfont/bin/python scripts/export-mxfont-onnx.py` — exports the fp32
   graphs and verifies ONNX/PyTorch parity.
3. `.venv-mxfont/bin/python scripts/quantize-mxfont-static.py` — static QDQ
   Conv-only int8 quantization (calibrated on real glyph renders).
4. `.venv-mxfont/bin/python scripts/test-mxfont-quality.py [.int8]` — renders
   comparison grids into `scratch/mxfont-quality/`.

Inference performance (measured 2026-06, M4 Mac, Chrome):

- Execution-provider selection in `frontend/zi2zi-client.ts`: WebGPU
  (fp32 graphs, ~50 ms/glyph) on non-WebKit browsers with an adapter; plain
  single-threaded WASM (int8 graphs, ~600 ms/glyph) elsewhere, parallelized
  with a worker pool (up to 4 workers) for batch fills. Style factors are
  encoded once and broadcast to pool siblings. Pyodide is prewarmed during
  generation. `scripts/bench-mxfont.py` reproduces the native benchmarks.
- Hard-won constraints (do not regress): dynamic quantization emits
  ConvInteger ops that are 6-8x slower than fp32 everywhere — only static
  QDQ Conv-only quantization is safe. int8 models must never run on the
  WebGPU EP (per-node CPU fallback). fp16 conversion collapses to blank
  output for some style fonts. Batched (N>1) graphs measured no faster.
  WASM threads would need crossOriginIsolated (COOP/COEP via service
  worker) — evaluated and skipped: the worker pool achieves the same
  parallelism without the embedding/CDN risks. The service worker caches
  /models/ cache-first: bump CACHE_NAME whenever model files change.

## Code Layout

- `frontend/`
  - `index.html` - PWA entry-point, registers Service Worker
  - `main.ts` - Client-side state manager and interface controller
  - `compiler.ts` - Browser-side font compiler and Pyodide bridge
  - `db.ts` - IndexedDB persistence layer
  - `zi2zi-worker.ts` - Web Worker running MX-Font ONNX inference
  - `zi2zi-client.ts` - Worker client + model-input glyph rasterization
  - `py/patch_chinese_font.py` - fontTools patcher (Pyodide + CLI/tests)
  - `public/sw.js` - Service worker handling caching for offline capability
  - `public/manifest.json` - PWA web manifest
  - `public/pyodide/` - Vendored Pyodide runtime and Python wheels
  - `public/models/` - MX-Font ONNX graphs (int8 committed)
  - `public/data/variants.json` - OpenCC simplified↔traditional char tables
- `src/`
  - `ruby.ts` - Shared/browser-side layout computations
  - `polyphonic.ts` - Font alternate mappings (simplified & traditional)
  - `vectorizer.ts` - Raster→SVG outline tracer (holes, winding, smoothing)
  - `variants.ts` - Variant-fill planning over OpenCC data
- `vendor/mxfont/` - Forked MX-Font (NAVER, MIT) for ONNX export
- `test/fixtures/trad-only.ttf` - Traditional-only Droid subset for tests
