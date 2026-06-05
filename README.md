[![CI](https://github.com/parlr/ruby-font-creator/actions/workflows/ci.yml/badge.svg)](https://github.com/parlr/ruby-font-creator/actions/workflows/ci.yml)

# Ruby Font Creator

Font creator to help students **learn and read foreign languages faster** by appending pronunciation or meaning to each glyph.

### Features

| languages                                                                                |                 preview                  |  state  | repository                                                               | base-font                                                                                                                                                     |
| ---------------------------------------------------------------------------------------- | :--------------------------------------: | :-----: | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chinese                                                                                  | ![top](resources/tpl/annotation-top.png) | **✔️**  | [hanzi-pinyin-font](https://github.com/parlr/hanzi-pinyin-font/releases) | [DroidSansFallbackFull](https://github.com/parlr/platform_frameworks_base/blob/562c45cc841681ed80d4e94515b23c28eb60eae4/data/fonts/DroidSansFallbackFull.ttf) |
| Tifinagh                                                                                 |                    -                     | **🏃‍** | [hanzi-pinyin-font](https://github.com/parlr/tifinagh-font/releases)     | [DroidSansFallbackFull](https://github.com/parlr/platform_frameworks_base/blob/562c45cc841681ed80d4e94515b23c28eb60eae4/data/fonts/DroidSansFallbackFull.ttf) |
| :speaking_head: [request new one](https://github.com/parlr/ruby-font-creator/issues/new) |                    -                     |    -    | -                                                                        | Please provide an open-source font                                                                                                                            |

**Legend:**
**⏸**→
**🏃‍**→
**✔️**

### Install

**Requirements**: `Node.js >= 22`, `npm`.

```bash
npm install
```

### Usage

**Requirements:** a `JSON` file describing _codepoint_-_glyph_-_gloss_ tuple (e.g. [src/data.json](src/data.json)).

```bash
npm run build:font
```

**Custom config:**

```bash
npm run build:font -- --config ./src/config/default.ts
```

**Custom data:**

```bash
npm run build:font -- --data ./path-to/data.json
```

**Custom Font Name:**

```bash
npm run build:font -- --font-name 'custom-font-name'
```

### Development

```bash
npm run generate-data  # Regenerate data.json from Unihan tsv
npm test               # Run Vitest test suite
npm run lint           # Run ESLint check
npm run format         # Format codebase with Prettier
npx tsc --noEmit       # Run TypeScript type check
```

### Data Structure

A list of objects, each describing a glyph, with the following 3 elements:

1. a unicode `codepoint` ;
2. a base `glyph` ;
3. a `ruby` text.

Example:

```json
[
  {
    "codepoint": "U+03B1",
    "glyph": "α",
    "ruby": "alpha"
  }
]
```

### Font

This project uses fonts under open-source licenses :
[DejaVuSans](https://github.com/TFTFonts/DejaVuSans),
[DroidSansFallbackFull](https://github.com/parlr/platform_frameworks_base/blob/562c45cc841681ed80d4e94515b23c28eb60eae4/data/fonts/DroidSansFallbackFull.ttf),
[Noto Sans CJK](https://github.com/nodebox/opentype.js/issues/273).

### License

> [Apache License 2.0](http://choosealicense.com/licenses/apache-2.0/)

### Contributors

- [Édouard Lopez](https://github.com/edouard-lopez/) ;
- [Hugo Lopez](https://github.com/hugolpz)
