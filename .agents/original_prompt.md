## 2026-06-06T00:38:14Z

Convert the existing Ruby Font Creator codebase into a self-contained, offline-capable Progressive Web App (PWA) where all preview rendering, font compilation, GSUB calt rules injection, and WOFF2 compression run entirely in the web browser, with all dependencies (including Pyodide and Python packages) vendored locally.

Working directory: `/Users/btsai/antigravity/ruby-font-creator`
Integrity mode: development

## Requirements

### R1. Browser-Side Font Compilation and Preview

The application must perform all font compilation and vector preview rendering entirely in the client-side browser in memory.

- Fetch `DroidSansFallbackFull.ttf` on startup and parse it using `opentype.js` to initialize the `TextToSVG` engine locally.
- Render character previews locally by calling `ruby.ts`.
- In-memory font compilation: Generate an SVG Font XML string from glyph coordinates (scaled and Y-axis flipped to a 1000-unit EM square), convert it to TTF using `svg2ttf`, and load the resulting font face dynamically using the CSS Font Loading API for instant live testing.
- Supported compiled formats: TTF and WOFF2 only.

### R2. In-Browser GSUB Injection and WOFF2 Compression

Inject OpenType features (GSUB calt rules) and compress fonts to WOFF2 using Pyodide (Python WebAssembly) in the browser.

- Run a Python script equivalent to `scripts/inject-gsub.py` inside Pyodide to inject GSUB rules and compress the TTF to WOFF2.
- Support downloading both TTF and WOFF2 files directly via local Blob URLs.

### R3. Vendored Offline Dependencies

To ensure 100% network independence on the very first install/run, all external dependencies must be vendored locally:

- Download the Pyodide WebAssembly runtime assets (including `pyodide.js`, `pyodide.asm.js`, `pyodide.asm.wasm`, `pyodide-lock.json`) and store them in the project.
- Download the required Python package wheels (`fonttools`, `brotli`, and any transitive dependencies) and store them in the project.
- Configure Pyodide to load all scripts, WASM, and wheels locally from these vendored assets instead of hitting external CDNs.

### R4. PWA Capabilities and Local Storage

Add offline capability and local persistence.

- Add a web app manifest (`manifest.json`) and register a Service Worker (`sw.js`) that caches all static assets (HTML, CSS, JS, data.json, base font) and the vendored Pyodide/wheels dependencies.
- Store compiled fonts (TTF/WOFF2 blobs) and user configuration in IndexedDB so they persist across page reloads.
- Remove all server-side Vite API middlewares from `vite.config.ts`.

## Acceptance Criteria

### Verification & Correctness

- [ ] Font compilation works entirely in-browser without server requests.
- [ ] The generated font contains correct GSUB calt rules (can be tested locally using the tester tab with words like "银行" and "行业").
- [ ] Compiled TTF and WOFF2 fonts can be downloaded from local blob links and are valid fonts.
- [ ] All Pyodide resources and Python wheels are loaded locally from the project's own directory (no external network calls to cdns or pythonhosted.org).
- [ ] The app functions 100% offline (when service worker is active and network is disconnected).
- [ ] Compiled fonts persist in IndexedDB and are listed in the font selection dropdown after page reload.
- [ ] The dev server has all API routes removed, and `npm run build:web` creates a production package in `dist-web` that runs fully independently.
