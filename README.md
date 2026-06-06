# Ruby Font Creator

A utility to generate Chinese (Hanzi) fonts annotated with phonetic pronunciation (Pinyin). It compiles glyphs combining a base Chinese character and a smaller layout-aligned Pinyin annotation into unified SVG characters, which are then packaged into SVG, TTF, and WOFF2 fonts.

The repository includes a Node.js-based font compiler, a Python-based OpenType GSUB table injector to handle polyphonic (多音字) character rules, and a local Vite-based visual simulator for parameter tuning and vector path inspection.

---

## Architecture & Features

### 1. Font Compiler

- **SVG Generation**: Matches character-Pinyin pairs from a JSON dataset. Uses `text-to-svg` to render the Hanzi and Pinyin text as vector paths, combining them according to layout rules (above or below base glyph).
- **Format Conversion**: Uses `svgtofont` to package individual combined SVG characters into web-ready font formats (`.ttf`, `.woff2`).
- **TypeScript & ESM**: Fully modernized codebase targeting Node.js `>= 22` and ECMAScript modules (ESM).

### 2. Contextual Polyphonic (多音字) Support

- **GSUB calt Table Injection**: Handles polyphonic character contexts (e.g., `重生` pronounced _chóngshēng_ vs. `重量` pronounced _zhòngliàng_).
- **PUA Mapping**: Maps alternate pronunciations to Private Use Area (PUA) codepoints (U+E000–U+E024) during SVG generation.
- **Python Post-Processing**: The `scripts/inject-gsub.py` script uses `fonttools` to append a Contextual Alternates (`calt`) lookup table into the compiled TTF font, substituting standard characters with their PUA equivalents depending on adjacent character bigram rules.

### 3. Visual Simulator (Vite App)

- **Worship Slide Engine**: Renders line-wrapped bilingual (Chinese + English) text with configurable line spacing, scaling, and viewport containers.
- **Textbook Layout Grid**: Simulates responsive layout containment to test boundary box collisions and adjacent character/vowel overlap metrics.
- **Vector Sandbox**: Renders vector paths dynamically from `DroidSansFallbackFull.ttf` using `opentype.js` to preview output paths before compilation.
- **Compiled Font Tester**: Loads the built TTF/WOFF2 font dynamically in the browser via CSS `@font-face` to verify browser rendering of GSUB contextual substitutions.
- **Parameter Controls**: Tuning controls for horizontal character width, squeeze strategies (Smart/Proportional/Global), vertical offsets, letter tracking (kerning), and stroke weights.
- **Live Compilation**: Compiles a subset font containing only the characters in the active text input to reduce build times and memory footprint.

---

## Requirements

- **Node.js**: `>= 22`
- **npm**
- **Python 3**: With `fonttools` library installed (required for GSUB injection).

---

## Installation

```bash
# Node dependencies
npm install

# Python fonttools
pip install -r scripts/requirements.txt
```

---

## Usage

### Font Generation Workflow

The compilation is a two-step process:

1. **Compile Vector Glyphs and Build Fonts**:
   Reads standard JSON data to compile base-and-annotation SVG pairs and outputs the `.ttf` and `.woff2` files:

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

### Web Visual Simulator

Start the local Vite development server:

```bash
npm run dev
```

Build the production frontend assets:

```bash
npm run build:web
```

---

## Development & Testing

- **Regenerate Datasets**: Parse and build the character database from Unihan source data:
  ```bash
  npm run generate-data
  ```
- **Test Suite**: Run unit and integration tests via Vitest:
  ```bash
  npm test
  ```
- **Linters & Formatters**:
  ```bash
  npm run lint
  npm run format
  npx tsc --noEmit
  ```

### Input Data Schema

JSON format for character mapping entries:

```json
[
  {
    "codepoint": "U+6211",
    "glyph": "我",
    "ruby": "wǒ"
  }
]
```

---

## Font Licensing & Attributions

This project uses base open-source fonts:

- [DejaVuSans](https://github.com/TFTFonts/DejaVuSans)
- [DroidSansFallbackFull](https://github.com/parlr/platform_frameworks_base/blob/562c45cc841681ed80d4e94515b23c28eb60eae4/data/fonts/DroidSansFallbackFull.ttf)
- [Noto Sans CJK](https://github.com/nodebox/opentype.js/issues/273)

---

## License

[Apache License 2.0](http://choosealicense.com/licenses/apache-2.0/)

---

## Authors & Contributors

### Original Authors

- **Édouard Lopez** ([@edouard-lopez](https://github.com/edouard-lopez))
- **Hugo Lopez** ([@hugolpz](https://github.com/hugolpz))

### Modernizations & Enhancements

- **Benson Tsai** ([@btsai](https://github.com/btsai))
- **Antigravity** (Autonomous AI Coding Assistant by Google DeepMind)
