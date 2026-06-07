# Milestone 3 Implementation Plan: Client-Side Vector Preview Rendering

This report provides the full details, rationale, and step-by-step instructions for implementing Milestone 3 of the **Ruby Font Creator** project.

---

## 1. Observation

1. **`src/ruby.ts` Node-Specific Imports**:
   - Uses `text-to-svg` for font loading and path generation.
   - Uses `jsdom` to parse the resulting SVG string to extract path data in `getData()`:
     ```typescript
     import TextToSVG from 'text-to-svg'
     import { JSDOM } from 'jsdom'
     ...
     getData(doc: string): string {
       const dom = new JSDOM(doc)
       const path = dom.window.document.querySelector('path')
       ...
       return dAttr.value
     }
     ```
2. **`test/e2e/preview.test.ts` Contract Verification**:
   - Verifies loaded font properties:
     ```typescript
     expect(engine).toBeDefined()
     expect(engine.font).toBeDefined()
     expect(engine.font.names.fontFamily.en).toBe('Droid Sans Fallback')
     ```
   - Checks vector output of character base path (`getBase`) and ruby annotation (`getAnnotation`).
   - Checks path parsing via `getData`.
3. **`frontend/main.ts` Backend Preview API Fetching**:
   - Fetches SVGs from the backend `/api/render-preview` endpoint:
     ```typescript
     async function getPreviews(
       glyphs: { glyph: string; ruby: string }[],
     ): Promise<{ glyph: string; ruby: string; svg: string }[]> {
       try {
         const response = await fetch('/api/render-preview', {
           method: 'POST',
           ...
     ```
   - Has a stubbed-out local font loader:
     ```typescript
     function loadLocalFont() {
       // Stubbed out: Opentype is no longer required client-side since the backend renders true vectors!
       elements.fontLoadingBanner.innerHTML = `<span class="text-emerald-500"><i class="fa-solid fa-circle-check"></i> Backend Live Renderer Active</span>`
     }
     ```
4. **Font File Location & Availability**:
   - The DroidSansFallback font is already placed under the client-accessible public path: `frontend/public/resources/fonts/DroidSansFallbackFull.ttf`.
   - The global `opentype` library is loaded via a script tag in `frontend/index.html` from `./vendor/opentype.min.js`.

---

## 2. Logic Chain

1. **Eliminating Node Dependencies**:
   - `text-to-svg` is primarily a wrapper around `opentype.js`. By implementing a minimal wrapper class `TextToSVG` inside `src/ruby.ts` using `opentype.js` directly, we can preserve the entire public API contract while dropping `text-to-svg`.
   - `jsdom`'s role in `getData()` is simply querying the first `<path>` tag and reading its `d="..."` attribute. A simple regular expression `/<path[^>]*\bd="([^"]*)"/` can perform this exact extraction cross-platform in both Node and the browser without any third-party dependencies.
2. **Identical API Preservation**:
   - Creating a custom `TextToSVG` class wrapping `opentype.Font` and implementing the `getMetrics(text, options)` and `getPath(text, options)` methods will keep the interface identical to the original library. This allows tests in `test/e2e/preview.test.ts` to pass cleanly without any changes.
3. **Enabling Browser-Side Rendering**:
   - Since `src/ruby.ts` will have zero Node-specific imports, Vite will be able to bundle it browser-side.
   - We can fetch `DroidSansFallbackFull.ttf` as an `ArrayBuffer` in `frontend/main.ts`, parse it with `opentype.parse(buffer)`, wrap it in our `TextToSVG` class, and cache it.
   - We can modify `getPreviews()` in `frontend/main.ts` to execute client-side path calculations using `ruby.getBase` and `ruby.getAnnotation`, bypassing the backend `/api/render-preview` endpoint entirely.

---

## 3. Caveats

- **Initial Font Download Size**: `DroidSansFallbackFull.ttf` is relatively large (~5MB). Client-side parsing occurs asynchronously on startup, and visual indicators are already provided in the layout (`#font-loading-banner`). Subsequent renderings will be extremely fast because they occur entirely in-memory.
- **Vitest Environment**: Vitest uses JSDOM as a global test runner environment (`environment: 'jsdom'`), so the `JSDOM` test runner is still required in `devDependencies` in `package.json`, but can be safely removed from main `dependencies`.

---

## 4. Conclusion

Milestone 3 is highly feasible. By porting `src/ruby.ts` to use `opentype.js` and regex path extraction, we make the renderer browser-compatible. We can then integrate it into `frontend/main.ts` to perform all preview generation client-side, making the app's preview interface completely server-independent.

---

## 5. Remaining Work

Here is the step-by-step implementation plan for the implementer:

### Step 5.1: Install `opentype.js` and Update `package.json`

1. Add `"opentype.js": "^1.3.4"` to the `dependencies` block in `package.json`.
2. Remove `"text-to-svg"` and `"jsdom"` from `dependencies` in `package.json`.
3. Keep `"@types/jsdom"` and other test runner dependencies in `devDependencies`.
4. Run `npm install`.

### Step 5.2: Rewrite `src/ruby.ts`

Replace the contents of `src/ruby.ts` with the following implementation using `opentype.js` directly:

```typescript
import opentype from 'opentype.js'
import type { LayoutAttributes } from './types.js'

function parseAnchorOption(anchor: string) {
  let horizontal = anchor.match(/left|center|right/gi) || []
  horizontal = horizontal.length === 0 ? 'left' : horizontal[0]

  let vertical = anchor.match(/baseline|top|bottom|middle/gi) || []
  vertical = vertical.length === 0 ? 'baseline' : vertical[0]

  return {
    horizontal: horizontal.toLowerCase(),
    vertical: vertical.toLowerCase(),
  }
}

export class TextToSVG {
  font: opentype.Font

  constructor(font: opentype.Font) {
    this.font = font
  }

  static loadSync(file: string): TextToSVG {
    return new TextToSVG(opentype.loadSync(file))
  }

  getWidth(text: string, options: any = {}): number {
    const fontSize = options.fontSize || 72
    const kerning = 'kerning' in options ? options.kerning : true
    const fontScale = (1 / this.font.unitsPerEm) * fontSize

    let width = 0
    const glyphs = this.font.stringToGlyphs(text)
    for (let i = 0; i < glyphs.length; i++) {
      const glyph = glyphs[i]

      if (glyph.advanceWidth) {
        width += glyph.advanceWidth * fontScale
      }

      if (kerning && i < glyphs.length - 1) {
        const kerningValue = this.font.getKerningValue(glyph, glyphs[i + 1])
        width += kerningValue * fontScale
      }

      if (options.letterSpacing) {
        width += options.letterSpacing * fontSize
      } else if (options.tracking) {
        width += (options.tracking / 1000) * fontSize
      }
    }
    return width
  }

  getHeight(fontSize: number): number {
    const fontScale = (1 / this.font.unitsPerEm) * fontSize
    return (this.font.ascender - this.font.descender) * fontScale
  }

  getMetrics(text: string, options: any = {}): any {
    const fontSize = options.fontSize || 72
    const anchor = parseAnchorOption(options.anchor || '')

    const width = this.getWidth(text, options)
    const height = this.getHeight(fontSize)

    const fontScale = (1 / this.font.unitsPerEm) * fontSize
    const ascender = this.font.ascender * fontScale
    const descender = this.font.descender * fontScale

    let x = options.x || 0
    switch (anchor.horizontal) {
      case 'left':
        x -= 0
        break
      case 'center':
        x -= width / 2
        break
      case 'right':
        x -= width
        break
      default:
        throw new Error(`Unknown anchor option: ${anchor.horizontal}`)
    }

    let y = options.y || 0
    switch (anchor.vertical) {
      case 'baseline':
        y -= ascender
        break
      case 'top':
        y -= 0
        break
      case 'middle':
        y -= height / 2
        break
      case 'bottom':
        y -= height
        break
      default:
        throw new Error(`Unknown anchor option: ${anchor.vertical}`)
    }

    const baseline = y + ascender

    return {
      x,
      y,
      baseline,
      width,
      height,
      ascender,
      descender,
    }
  }

  getD(text: string, options: any = {}): string {
    const fontSize = options.fontSize || 72
    const kerning = 'kerning' in options ? options.kerning : true
    const metrics = this.getMetrics(text, options)
    const path = this.font.getPath(
      text,
      metrics.x,
      metrics.baseline,
      fontSize,
      {
        kerning,
      },
    )
    return path.toPathData()
  }

  getPath(text: string, options: any = {}): string {
    const attributes = Object.keys(options.attributes || {})
      .map((key) => `${key}="${options.attributes[key]}"`)
      .join(' ')
    const d = this.getD(text, options)

    if (attributes) {
      return `<path ${attributes} d="${d}"/>`
    }
    return `<path d="${d}"/>`
  }
}

export const ruby = {
  loadFont(source: string | ArrayBuffer | Buffer): TextToSVG {
    let font: opentype.Font
    if (typeof source === 'string') {
      font = opentype.loadSync(source)
    } else {
      // Support browser array buffer parsing
      font = opentype.parse(source)
    }
    return new TextToSVG(font)
  },
  getBase(
    engine: TextToSVG,
    glyph: string = '汉字',
    options: LayoutAttributes,
  ): string {
    return engine.getPath(glyph, options)
  },
  getAnnotation(
    engine: TextToSVG,
    text: string = 'hanzi',
    options: LayoutAttributes,
  ): string {
    const pinyin = text.toLowerCase()

    // Default metrics options
    const squeezeVal = options.squeeze !== undefined ? options.squeeze : 100
    const trackingVal = options.tracking !== undefined ? options.tracking : 0
    const weightVal = options.weight !== undefined ? options.weight : 400

    const isPlacementTop = options.anchor.includes('top') || options.y < 40
    const annoAnchor = isPlacementTop ? 'top left' : 'bottom left'

    // Split letter-by-letter to compute vector tracking & squeeze
    const pinyinChars = pinyin.split('')
    const advances = pinyinChars.map((c) => {
      const metrics = engine.getMetrics(c, { fontSize: options.fontSize })
      return metrics.width
    })

    // Length-based strategy calculations
    const length = pinyinChars.length
    const userSqueeze = squeezeVal / 100
    const userTracking = trackingVal
    const userWeight = weightVal

    let scaleRatio = 1.0
    let spacingPx = 0
    let finalWeight = 400

    const strategyVal = options.strategy || 'smart'

    if (strategyVal === 'global') {
      scaleRatio = userSqueeze
      spacingPx = userTracking * options.fontSize
      finalWeight = userWeight
    } else if (strategyVal === 'smart') {
      if (length >= 5) {
        scaleRatio = userSqueeze
        spacingPx = userTracking * options.fontSize
        finalWeight = userWeight
      }
    } else if (strategyVal === 'proportional') {
      if (length === 4) {
        scaleRatio = 1.0 - (1.0 - userSqueeze) * 0.35
        spacingPx = userTracking * options.fontSize * 0.35
        finalWeight = Math.round(400 + (userWeight - 400) * 0.35)
      } else if (length >= 5) {
        scaleRatio = userSqueeze
        spacingPx = userTracking * options.fontSize
        finalWeight = userWeight
      }
    }

    const totalPinyinWidth =
      advances.reduce((a, b) => a + b, 0) * scaleRatio +
      spacingPx * (pinyinChars.length - 1)

    // Start coordinate centered around options.x
    let currentX = options.x - totalPinyinWidth / 2
    let pinyinPaths = ''

    // Weight compensation stroke calculation via path offsets
    const hasWeightComp = finalWeight > 400
    const strokeWidth = hasWeightComp ? (finalWeight - 400) / 300 : 0
    const offsets = hasWeightComp
      ? [
          { dx: 0, dy: 0 },
          { dx: -strokeWidth * 0.25, dy: 0 },
          { dx: strokeWidth * 0.25, dy: 0 },
          { dx: 0, dy: -strokeWidth * 0.25 },
          { dx: 0, dy: strokeWidth * 0.25 },
        ]
      : [{ dx: 0, dy: 0 }]

    const baseAttribs = Object.keys(options.attributes || {})
      .filter(
        (k) =>
          k !== 'stroke' &&
          k !== 'stroke-width' &&
          k !== 'stroke-linejoin' &&
          k !== 'transform',
      )
      .map((k) => `${k}="${options.attributes[k]}"`)
      .join(' ')

    pinyinChars.forEach((c, idx) => {
      const metrics = engine.getMetrics(c, {
        x: 0,
        y: options.y,
        fontSize: options.fontSize,
        anchor: annoAnchor,
      })

      const pathObj = engine.font.getPath(
        c,
        metrics.x,
        metrics.baseline,
        options.fontSize,
        { kerning: true },
      )
      const originalCommands = pathObj.commands.map((cmd: any) => ({ ...cmd }))

      offsets.forEach(({ dx, dy }, oIdx) => {
        pathObj.commands = originalCommands.map((cmd: any) => {
          const newCmd = { ...cmd }
          if (newCmd.x !== undefined)
            newCmd.x = newCmd.x * scaleRatio + currentX + dx
          if (newCmd.y !== undefined) newCmd.y = newCmd.y + dy
          if (newCmd.x1 !== undefined)
            newCmd.x1 = newCmd.x1 * scaleRatio + currentX + dx
          if (newCmd.y1 !== undefined) newCmd.y1 = newCmd.y1 + dy
          if (newCmd.x2 !== undefined)
            newCmd.x2 = newCmd.x2 * scaleRatio + currentX + dx
          if (newCmd.y2 !== undefined) newCmd.y2 = newCmd.y2 + dy
          return newCmd
        })

        const d = pathObj.toPathData()
        const idAttr = `id="pinyin-${idx}-${oIdx}"`
        const attrs = baseAttribs ? `${baseAttribs} ${idAttr}` : idAttr
        pinyinPaths += `<path ${attrs} d="${d}"/>`
      })

      currentX += (advances[idx] + spacingPx) * scaleRatio
    })

    return pinyinPaths
  },
  getData(doc: string): string {
    const match = /<path[^>]*\bd="([^"]*)"/.exec(doc)
    if (!match) {
      throw new Error('No path found in document')
    }
    return match[1]
  },
}

export default ruby
```

### Step 5.3: Update `frontend/vite.config.ts`

Since we removed `text-to-svg`, update `frontend/vite.config.ts` to import `ruby` rather than `TextToSVG` directly:

1. Remove `import TextToSVG from 'text-to-svg'` from `frontend/vite.config.ts`.
2. Change the server-side `fontEngine` loader inside `configureServer` (lines 35-40):
   ```typescript
   let fontEngine: any = null
   try {
     fontEngine = ruby.loadFont(fontPath)
   } catch (e) {
     console.error('Failed to load base font for server previews:', e)
   }
   ```

### Step 5.4: Modify `frontend/main.ts`

1. Add import of `ruby` at the top of the file:
   ```typescript
   import ruby from '../src/ruby.js'
   ```
2. Define a global client-side engine cache:
   ```typescript
   let localFontEngine: any = null
   ```
3. Update `loadLocalFont` to load the file asynchronously:

   ```typescript
   async function loadLocalFont() {
     try {
       elements.fontLoadingBanner.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Loading DroidSansFallbackFull.ttf...`

       const response = await fetch(
         '/resources/fonts/DroidSansFallbackFull.ttf',
       )
       if (!response.ok) throw new Error('Font file fetch failed')
       const buffer = await response.arrayBuffer()

       localFontEngine = ruby.loadFont(buffer)

       elements.fontLoadingBanner.innerHTML = `<span class="text-emerald-500"><i class="fa-solid fa-circle-check"></i> Client-Side Renderer Active</span>`
       updateUI()
     } catch (err) {
       console.error('Failed to load local font:', err)
       elements.fontLoadingBanner.innerHTML = `<span class="text-rose-500"><i class="fa-solid fa-circle-xmark"></i> Font Load Failed</span>`
     }
   }
   ```

4. Update `getPreviews` to render entirely client-side using `localFontEngine`:

   ```typescript
   async function getPreviews(
     glyphs: { glyph: string; ruby: string }[],
   ): Promise<{ glyph: string; ruby: string; svg: string }[]> {
     if (!localFontEngine) {
       return glyphs.map((g) => ({
         glyph: g.glyph,
         ruby: g.ruby,
         svg: `<svg viewBox="0 0 80 80" width="80" height="80"><text x="40" y="50" text-anchor="middle" fill="red" font-size="14">${g.glyph}</text></svg>`,
       }))
     }

     const characterWidth = state.characterWidth || 80
     const centerVal = characterWidth / 2
     const isPlacementTop = state.placement === 'top'
     const baseLineY = isPlacementTop ? 92 : -4
     const baseAnchor = isPlacementTop ? 'bottom center' : 'top center'
     const annoLineY = isPlacementTop
       ? -4 - state.verticalOffset
       : 92 + state.verticalOffset
     const annoAnchor = isPlacementTop ? 'top center' : 'bottom center'

     return glyphs.map((char) => {
       const baseSvgPath = ruby.getBase(localFontEngine, char.glyph, {
         x: centerVal,
         y: baseLineY,
         fontSize: 56,
         anchor: baseAnchor,
         attributes: {
           fill: 'currentColor',
           id: 'glyph',
         },
       })

       const pinyinSize = state.pinyinSize || 13
       const hanziSize = state.hanziSize || 48
       const pinyinFontSize = Math.round(56 * (pinyinSize / hanziSize))

       const pinyinPaths = ruby.getAnnotation(localFontEngine, char.ruby, {
         x: centerVal,
         y: annoLineY,
         fontSize: pinyinFontSize,
         anchor: annoAnchor,
         attributes: {
           fill: 'currentColor',
           id: 'annotation',
         },
         squeeze: state.opticalSqueeze,
         tracking: state.letterTracking,
         weight: state.fontWeight,
         strategy: state.strategy,
       })

       const svgContent = `<svg width="${characterWidth}" height="80" viewBox="0 0 ${characterWidth} 80" xmlns="http://www.w3.org/2000/svg">
         ${baseSvgPath}
         ${pinyinPaths}
       </svg>`

       return {
         glyph: char.glyph,
         ruby: char.ruby,
         svg: svgContent,
       }
     })
   }
   ```

---

## 6. Verification Method

To verify the implementation:

1. **Verify Test Suite passes without modification**:
   Run the project-wide vitest suite to ensure that all e2e tests, layouts tests, and specifically `test/e2e/preview.test.ts` pass cleanly:
   ```bash
   npm test
   ```
2. **Verify Frontend Live Vector Previews**:
   - Run the development server:
     ```bash
     npm run dev
     ```
   - Open the web interface in a browser (usually `http://localhost:3000`).
   - Open browser developer tools and navigate to the **Network** tab.
   - Adjust the sliders (e.g., Optical Squeeze or Weight Compensation).
   - **Verification Condition**: Observe that **no** network requests are sent to `/api/render-preview` when tuning the sliders. Previews must update instantly and render as true SVGs generated in the browser.
3. **Verify Build Process**:
   - Run the web build step to ensure bundling is successful:
     ```bash
     npm run build:web
     ```
