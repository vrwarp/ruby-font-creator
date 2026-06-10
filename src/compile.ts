import svg2ttf from 'svg2ttf'
import svgpath from 'svgpath'
import ruby, { TextToSVG } from './ruby.js'
import type { CanvasDimensions, GlyphEntry, LayoutAttributes } from './types.js'

/**
 * Shared in-memory font compilation pipeline, used by both the CLI builder
 * (index.ts) and the browser compiler (frontend/compiler.ts). Glyph vectors
 * are composed with ruby.ts, scaled into a 1000-unit em square, packaged as
 * an SVG Font XML document, and compiled to TTF with svg2ttf — entirely in
 * memory (no per-glyph SVG files, no file-descriptor pressure).
 */

export interface CompileGlyphConfig {
  canvas: CanvasDimensions
  fontName: string
  layout: {
    base: LayoutAttributes
    annotation: LayoutAttributes
  }
}

export type CompileLog = (message: string) => void

/**
 * Composes the base hanzi and pinyin annotation vectors for one entry and
 * returns the combined path data in font units (y-flipped, baseline at 800).
 */
export function buildGlyphPathData(
  entry: GlyphEntry,
  config: CompileGlyphConfig,
  baseEngine: TextToSVG,
  annotationEngine: TextToSVG,
): string {
  // Uniform scale mapping the canvas height onto the 1000-unit em square;
  // negative y flips from SVG (y-down) to font (y-up) coordinates.
  const scale = 1000 / config.canvas.height

  const baseSvg = ruby.getBase(baseEngine, entry.glyph, config.layout.base)
  const baseD = ruby.getData(baseSvg)
  let combined = svgpath(baseD)
    .scale(scale, -scale)
    .translate(0, 800)
    .toString()

  const annoSvg = ruby.getAnnotation(
    annotationEngine,
    entry.ruby,
    config.layout.annotation,
  )
  for (const match of annoSvg.matchAll(/d="([^"]*)"/g)) {
    combined +=
      ' ' + svgpath(match[1]).scale(scale, -scale).translate(0, 800).toString()
  }

  return combined
}

/** Builds the complete SVG Font XML document for the given glyph entries. */
export function buildSvgFontXml(
  data: GlyphEntry[],
  config: CompileGlyphConfig,
  baseEngine: TextToSVG,
  annotationEngine: TextToSVG,
  log: CompileLog = () => {},
): string {
  const scale = 1000 / config.canvas.height
  const glyphWidth = config.canvas.width * scale
  const parts: string[] = []

  for (const entry of data) {
    try {
      const pathData = buildGlyphPathData(
        entry,
        config,
        baseEngine,
        annotationEngine,
      )
      const unicodeHex = entry.codepoint.replace('U+', '').toLowerCase()
      parts.push(
        `\n  <glyph unicode="&#x${unicodeHex};" glyph-name="u${unicodeHex}" horiz-adv-x="${glyphWidth}" d="${pathData}" />`,
      )
    } catch (e: any) {
      log(
        `Warning: failed generating glyph for ${entry.glyph} (${entry.ruby}): ${e.message}\n`,
      )
    }
  }

  return `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" >
<svg xmlns="http://www.w3.org/2000/svg">
<defs>
<font id="${config.fontName}" horiz-adv-x="1000">
  <font-face font-family="${config.fontName}" units-per-em="1000" ascent="800" descent="-200" />
  <missing-glyph horiz-adv-x="500" />${parts.join('')}
</font>
</defs>
</svg>`
}

/** Compiles glyph entries straight to a TTF binary. */
export function compileTtf(
  data: GlyphEntry[],
  config: CompileGlyphConfig,
  baseEngine: TextToSVG,
  annotationEngine: TextToSVG,
  log: CompileLog = () => {},
): Uint8Array {
  log(`Generating SVG glyph paths for ${data.length} entries...\n`)
  const svgFontString = buildSvgFontXml(
    data,
    config,
    baseEngine,
    annotationEngine,
    log,
  )

  log('Converting SVG Font to TTF...\n')
  return new Uint8Array(svg2ttf(svgFontString, {}).buffer)
}
