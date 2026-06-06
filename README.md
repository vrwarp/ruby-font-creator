# Ruby Font Creator

A utility and Progressive Web Application (PWA) to generate Chinese (Hanzi) fonts annotated with phonetic pronunciation (Pinyin). It compiles glyphs combining a base Chinese character and a smaller layout-aligned Pinyin annotation into unified SVG characters, which are then packaged into SVG, TTF, and WOFF2 fonts.

The project features:

1. **Command Line Font Builder**: A Node.js and Python command-line utility to compile font assets.
2. **Pinyin Typography Lab (PWA)**: A 100% client-side web application that performs parameter tuning, vector path inspection, layout simulations, and client-side font compilation (including GSUB injection and WOFF2 compression via WebAssembly) without server dependencies.

---

## Architecture & Features

### 1. In-Browser Font Compilation Pipeline

The web application hosts the entire compiler stack directly in the browser:

- **Vector Path Extraction**: Uses `opentype.js` to parse the base `DroidSansFallbackFull.ttf` font and extract vector paths in the browser.
- **Glyph Layout Composition**: Shared logic in `src/ruby.ts` positions Hanzi and Pinyin paths, scaling and offsetting them based on layout configurations.
- **SVG Font XML Builder**: Packages vector glyphs into SVG Font format in memory.
- **SVG-to-TTF Conversion**: Uses `svg2ttf` to compile the SVG Font string into a TTF binary array.
- **OpenType Feature Injection via WebAssembly (Pyodide)**:
  - Bootstraps Mozilla's **Pyodide WASM** runtime inside the browser.
  - Loads vendored Python wheels for `fonttools` and `brotli`.
  - Runs a Python script inside WebAssembly to parse the compiled TTF, inject a Contextual Alternates (`calt`) GSUB lookup table for polyphonic rules, and export both TTF and compressed WOFF2 font formats.

### 2. Contextual Polyphonic (多音字) Support

- **Context Dictionary**: Built-in contextual alternate rules mapped across 16 characters (~100 bigram rules) for general Chinese and evangelical Christian worship vocabulary (e.g., `重生` pronounced _chóngshēng_ vs. `重量` pronounced _zhòngliàng_).
- **PUA Mapping**: Maps alternate character annotations to Private Use Area (PUA) codepoints (U+E000–U+E024) during vector generation.
- **GSUB calt Rules**: Substitutes standard glyphs with their PUA equivalents depending on adjacent character bigram rules.

### 3. PWA & Offline Support

- **Service Worker (`sw.js`)**: Intercepts network requests and caches core app assets, including base fonts, Pyodide WASM runtimes, and vendored Python wheels, supporting 100% offline usage.
- **Web App Manifest (`manifest.json`)**: Configures application installability.
- **IndexedDB Storage**: Stores compiled font binaries and visual layout configurations locally to preserve them across browser reloads.

### 4. Interactive Visual Simulators

- **Worship Slide Engine**: Renders line-wrapped bilingual text with customizable line spacing, scaling, theme presets, and projection aspect ratios.
- **Textbook Layout Grid**: Simulates responsive layout containment to test boundary box collisions and adjacent character/vowel overlap metrics.
- **Vector Sandbox**: Renders vector paths dynamically from `DroidSansFallbackFull.ttf` to preview output paths before compilation.
- **Compiled Font Tester**: Loads the built TTF/WOFF2 font dynamically in the browser via CSS `@font-face` to verify browser rendering of GSUB contextual substitutions.
- **Live Compilation**: Compiles a subset font containing only the characters in the active text input to reduce build times.

---

## Requirements

- **Node.js**: `>= 22`
- **npm**
- **Python 3**: Required with `fonttools` library installed (only if running the command-line GSUB injector).

---

## Installation & Bootstrapping

Clone the repository and install Node dependencies:

```bash
npm install
```

### Bootstrap Offline & Browser Assets

To download and vendor the local WebAssembly binaries, Python wheels, and dependencies for the web visual simulator, run the download scripts:

```bash
# Download Pyodide runtime, wheels, and vendor assets
npm run download:vendor
npm run download:pyodide
```

---

## Usage

### 1. Web Visual Simulator

Start the local Vite development server:

```bash
npm run dev
```

Build production assets:

```bash
npm run build:web
```

### 2. Command Line Font Builder

The command-line build is a two-step process:

1. **Compile Vector Glyphs and Build Fonts**:
   Reads character mappings from a JSON dataset to compile base-and-annotation SVG pairs and outputs the `.ttf` and `.woff2` files:

   ```bash
   npm run build:font
   ```

   _Optional CLI Arguments:_
   - `--config <path>`: Path to configuration module (defaults to `./src/config/default.ts`).
   - `--data <path>`: JSON dataset containing codepoint mappings.
   - `--font-name <name>`: Custom name for the generated font family.

2. **Inject GSUB Table**:
   Post-processes the compiled TTF font to inject contextual alternates based on the registered polyphonic rules in `src/polyphonic.ts`:
   ```bash
   npm run build:gsub
   ```

---

## Development & Testing

- **Regenerate Datasets**: Parse and build the character database from Unihan source data:
  ```bash
  npm run generate-data
  ```
- **Test Suite**: Run Vitest tests (including mock browser PWA and Pyodide compilation unit tests):
  ```bash
  npm test
  ```
- **Linters & Formatters**:
  ```bash
  npm run lint
  npm run format
  npx tsc --noEmit
  ```

---

## Third-Party Software Licensing & Attributions

This project incorporates and uses several open-source libraries and fonts. Their respective licenses are listed below:

| Software / Resource     | Author / Project                     | License                                                                      | Usage in Project                                     |
| :---------------------- | :----------------------------------- | :--------------------------------------------------------------------------- | :--------------------------------------------------- |
| **Pyodide**             | Mozilla / Pyodide Contributors       | [MPL 2.0](https://github.com/pyodide/pyodide/blob/main/LICENSE)              | In-browser Python WebAssembly runtime                |
| **fonttools**           | fonttools Contributors               | [MIT License](https://github.com/fonttools/fonttools/blob/main/LICENSE)      | OpenType tables manipulation and GSUB compiler       |
| **brotli**              | Google / Brotli Contributors         | [MIT License](https://github.com/google/brotli/blob/master/LICENSE)          | WOFF2 font compression                               |
| **opentype.js**         | Frederik De Bleser / opentype.js     | [MIT License](https://github.com/opentypejs/opentype.js/blob/master/LICENSE) | Base font vector path parsing and preview generation |
| **svg2ttf**             | Vitaly Puzrin / svg2ttf              | [MIT License](https://github.com/fontello/svg2ttf/blob/master/LICENSE)       | Compiling SVG Font XML to TTF binary                 |
| **svgpath**             | Vitaly Puzrin / svgpath              | [MIT License](https://github.com/fontello/svgpath/blob/master/LICENSE)       | SVG path scaling, translation, and parsing           |
| **text-to-svg**         | shrhdk / text-to-svg                 | [MIT License](https://github.com/shrhdk/text-to-svg/blob/master/LICENSE)     | SVG rendering in Node CLI font builder               |
| **jsdom**               | jsdom Contributors                   | [MIT License](https://github.com/jsdom/jsdom/blob/master/LICENSE)            | DOM parsing mock during Node-based testing           |
| **Droid Sans Fallback** | Google / Android Open Source Project | [Apache 2.0](http://www.apache.org/licenses/LICENSE-2.0)                     | Default base Chinese character font                  |
| **DejaVu Sans**         | DejaVu Fonts                         | [DejaVu License](https://dejavu-fonts.github.io/License.html)                | Default base Western/annotation character font       |
| **Noto Sans CJK**       | Google / Adobe                       | [SIL OFL 1.1](http://scripts.sil.org/OFL)                                    | Auxiliary base CJK glyph font support                |

---

## License

This project is licensed under the [Apache License 2.0](http://choosealicense.com/licenses/apache-2.0/).

---

## Authors & Contributors

### Original Authors

- **Édouard Lopez** ([@edouard-lopez](https://github.com/edouard-lopez))
- **Hugo Lopez** ([@hugolpz](https://github.com/hugolpz))

### Modernizations & Enhancements

- **Benson Tsai** ([@btsai](https://github.com/btsai))
- **Antigravity** (Autonomous AI Coding Assistant by Google DeepMind)
