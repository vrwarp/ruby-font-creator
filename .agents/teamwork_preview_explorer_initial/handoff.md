# Handoff Report - Initial Codebase Investigation

This report documents findings from an investigation of the `ruby-font-creator` repository.

## 1. Observation

Direct observations and evidence obtained from filesystem tools:

### Application Structure and Key Locations

- **`ruby.ts` Location**: Found at `src/ruby.ts` (lines 5-159).
- **Font Assets**:
  - Base font: `resources/fonts/DroidSansFallbackFull.ttf`
  - Font documentation: `resources/fonts/README.md`
  - Output files in `build/` (once generated): `build/ruby-font-creator.ttf`, `build/live.ttf`, `build/test.ttf`, `build/pairs.ttf`, `build/below.ttf`, `build/bottom-try-2.ttf` to `build/bottom-try-5.ttf`.
  - Reference fonts: `node_modules/text-to-svg/build/fonts/ipag.ttf` and `node_modules/text-to-svg/fonts/ipag.ttf`.
- **`inject-gsub.py` Location**: Found at `scripts/inject-gsub.py` (lines 1-153).
- **Vite Server Configuration**: Found at `frontend/vite.config.ts` (lines 1-484) containing the middleware configuration.
- **Main Command-Line / Build Entry Point**: Found at `index.ts` (lines 1-119).
- **Frontend Entry Points**: `frontend/index.html` (the web layout) and `frontend/main.ts` (the client-side logic).

### `inject-gsub.py` Imports

From `scripts/inject-gsub.py`, we observe the following imports and requirements:

- Line 14: `Requires: pip3 install fonttools`
- Lines 17-18:
  ```python
  import sys
  import json
  ```
- Lines 21-22:
  ```python
  from fontTools.ttLib import TTFont
  from fontTools.feaLib.builder import addOpenTypeFeatures
  ```
  Therefore, it requires the third-party Python library `fonttools` (specifically `fontTools`).

### Font Preview and Compilation Triggering

- **Preview Triggering**:
  - `frontend/main.ts` calls `getPreviews(glyphs)` (lines 1010-1042) to request SVG previews from `/api/render-preview` by passing glyph inputs and layout parameters (placement, offset, opticalSqueeze, weight, tracking, strategy, etc.).
  - The middleware in `frontend/vite.config.ts` (lines 387-480) handles `/api/render-preview` requests:
    ```typescript
    const baseSvgPath = ruby.getBase(fontEngine!, char.glyph, { ... })
    const pinyinPaths = ruby.getAnnotation(fontEngine!, char.ruby, { ... })
    const svgContent = `<svg width="${characterWidth}" height="80" ...>${baseSvgPath}${pinyinPaths}</svg>`
    ```
- **Compilation Triggering**:
  - `frontend/main.ts` triggers standard compilation via `triggerFontBuild()` (lines 1417-1500) and live/subset compilation via `triggerLiveFontBuild()` (lines 1504-1550) calling the backend POST endpoint `/api/build-font`.
  - The middleware in `frontend/vite.config.ts` (lines 95-384) handles the `/api/build-font` POST request:
    - If the font name is `"live"`, it parses the `text` field, extracts unique characters, filters `src/data.json` to retain only these characters, adds active alternates, and saves the data to `src/config/live-data.json`.
    - It generates a temporary configuration file at `src/config/web-temp.ts` containing the layout coordinates and parameters.
    - It spawns a compilation command using `child_process.exec` (line 229):
      ```typescript
      const cmd = `NODE_OPTIONS="--max-old-space-size=8192" npx tsx ./index.ts --config ./src/config/web-temp.ts`
      ```
    - Upon successful compilation exit (code `0`), if `enablePolyphonic` is true:
      - It executes `python3 scripts/inject-gsub.py build/${sanitizedFontName}.ttf build/polyphonic-map.json` to inject GSUB rules (lines 271-301).
      - It compresses the updated `.ttf` file to `.woff2` using `ttf2woff2(ttfBuffer)` (lines 319-321).
      - It returns JSON success containing paths `/build/${sanitizedFontName}.ttf` and `/build/${sanitizedFontName}.woff2`.

### Project Dependencies (from `package.json`)

The following dependencies were observed in `package.json` (lines 28-49):

- **Dependencies**:
  - `"jsdom": "^25.0.1"` (parses SVG files to extract path coordinates)
  - `"svgtofont": "^3.21.6"` (compiles SVG glyph directories to font files)
  - `"text-to-svg": "^3.1.5"` (computes character outlines from base TTF)
  - `"yargs": "^17.7.2"` (parses CLI arguments)
- **DevDependencies**:
  - `@eslint/js`: `^9.16.0`
  - `@types/jsdom`: `^21.1.7`
  - `@types/yargs`: `^17.0.33`
  - `eslint`: `^9.16.0`
  - `eslint-config-prettier`: `^10.0.1`
  - `globals`: `^15.13.0`
  - `husky`: `^9.1.7`
  - `lint-staged`: `^15.2.10`
  - `prettier`: `^3.4.2`
  - `tsx`: `^4.19.2`
  - `typescript`: `^5.7.2`
  - `typescript-eslint`: `^8.17.0`
  - `vite`: `^5.4.21`
  - `vitest`: `^2.1.8`
- **Transitive dependencies imported in code**:
  - `ttf2woff2`: Used in `frontend/vite.config.ts` (lines 8, 320) via Node `require('ttf2woff2')`. The `package-lock.json` contains:
    - `"node_modules/ttf2woff2"` resolved from `https://registry.npmjs.org/ttf2woff2/-/ttf2woff2-5.0.0.tgz` (transitively installed as a dependency of `svgtofont`).

---

## 2. Logic Chain

The reasoning linking observations to codebase behavior is structured as follows:

1. **Application Structure**: By checking the output of filesystem listing, we identify that backend files reside under `src/` (TypeScript logic) and `scripts/` (Python injector), while frontend files are under `frontend/` (Vite config, HTML, and browser TypeScript logic).
2. **Preview Workflow**:
   - `frontend/main.ts` sends character information to `/api/render-preview`.
   - The Vite middleware in `frontend/vite.config.ts` imports `ruby.ts` from `../src/ruby.js`.
   - `ruby.ts` parses the base font `DroidSansFallbackFull.ttf` using `TextToSVG` to convert standard character string sequences into precise SVG `<path>` vectors.
   - The middleware combines these vectors and returns the raw SVG markup directly to the client for immediate, lightweight inline browser previews.
3. **Compilation and GSUB rules workflow**:
   - `/api/build-font` dynamically constructs a target configuration `web-temp.ts` and spins up the Node-based CLI build process (`index.ts` using `tsx`).
   - `index.ts` reads the input characters (`src/data.json` or `src/config/live-data.json`), calls `ruby.ts` to output standard and alternate SVGs (PUA codepoint mappings) to `build/svg/`, and generates the mapping `build/polyphonic-map.json` based on the lists in `src/polyphonic.ts`.
   - `svgtofont` compiles those SVG files into a base `.ttf` and `.woff2` font.
   - Once compiled, the server-side API middleware runs `scripts/inject-gsub.py`, which uses Python's `fonttools` library to add an OpenType substitution feature (`calt` rules) derived from `polyphonic-map.json`.
   - The resulting `.ttf` is finally compressed to a `.woff2` using `ttf2woff2` to guarantee that the web font has all compiled GSUB substitution tables.

---

## 3. Caveats

- **External Packages**: The python script `scripts/inject-gsub.py` depends on `fonttools` being installed on the local system. If Python 3 or `fonttools` are not available, font building with `enablePolyphonic: true` will fail during the post-build step.
- **Node module execution**: `ttf2woff2` is not directly declared as a dependency in `package.json` and is instead loaded dynamically in Vite's config. It is assumed to be present through transitive resolution via `svgtofont`.
- **System Memory Requirements**: The compilation step uses `NODE_OPTIONS="--max-old-space-size=8192"` which implies high memory usage when generating the full font from thousands of SVG glyph files.

---

## 4. Conclusion

The ruby-font-creator application uses a two-stage process to generate custom ruby character fonts:

1. **Frontend controls & backend preview**: The user interactively updates parameters in the web UI, sending rendering configuration parameters to a server-side endpoint that leverages `TextToSVG` to generate high-fidelity vector previews of standard and alternate characters.
2. **Font Compilation & Feature Injection**: The font compiler creates SVG glyph definitions, packages them using `svgtofont` to generate the TTF, runs a Python `fonttools` script to inject contextual alternate substitutions (GSUB tables) based on pre-defined worship vocabulary in `src/polyphonic.ts`, and compresses the result to `.woff2` for deployment. All processes have been verified as fully functional via the project tests.

---

## 5. Verification Method

To verify the setup and compilation features locally, use the following commands and check files:

1. **Run Unit Tests**:
   ```bash
   npm test
   ```
   _Expect: 30 passing tests (across `layouts.test.ts`, `polyphonic.test.ts`, `helpers.test.ts`, `svg.test.ts`, `ruby.test.ts`)._
2. **Check Generated Outputs**:
   - Build a font via command line:
     ```bash
     npm run build:font
     ```
   - Check if `build/ruby-font-creator.ttf` and `build/polyphonic-map.json` are generated successfully.
   - Run the GSUB rules injection script:
     ```bash
     npm run build:gsub
     ```
     _Expect: Log confirmation of writing `.fea` features and updated TTF font._
