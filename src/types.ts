/** A single glyph entry mapping a Unicode codepoint to its visual glyph and ruby annotation */
export interface GlyphEntry {
  codepoint: string
  glyph: string
  ruby: string
}

/** Canvas dimensions for SVG layout */
export interface CanvasDimensions {
  width: number
  height: number
}

/** SVG layout attributes for positioning text within the glyph */
export interface LayoutAttributes {
  x: number
  y: number
  fontSize: number
  anchor: string
  attributes: Record<string, string>
}

/** Build configuration for font generation */
export interface BuildConfig {
  canvas: CanvasDimensions
  dataSource: string
  destFilename: string
  baseFontFilepath?: string
  annotationFontFilepath?: string
  fontFilepath?: string
  fontName: string
  formats: string[]
  inputFiles: string
  workingDir: string
  layout: {
    base: LayoutAttributes
    annotation: LayoutAttributes
  }
}

/** CLI arguments parsed from yargs */
export interface CliArguments {
  config?: string
  data?: string
  fontName?: string
}
