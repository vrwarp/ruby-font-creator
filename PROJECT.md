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

## Code Layout

- `frontend/`
  - `index.html` - PWA entry-point, registers Service Worker
  - `main.ts` - Client-side state manager and interface controller
  - `compiler.ts` - Browser-side font compiler and Pyodide bridge
  - `db.ts` - IndexedDB persistence layer
  - `public/sw.js` - Service worker handling caching for offline capability
  - `public/manifest.json` - PWA web manifest
  - `public/pyodide/` - Vendored Pyodide runtime and Python wheels
- `src/`
  - `ruby.ts` - Shared/browser-side layout computations
  - `polyphonic.ts` - Font alternate mappings (simplified & traditional)
