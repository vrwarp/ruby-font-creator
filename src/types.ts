/**
 * A bigram context that triggers an alternate GSUB reading.
 * `before`/`after` are the adjacent characters themselves and must match the
 * neighbours of the glyph inside `word`; U+XXXX codepoints are derived from
 * them when the polyphonic map is built (see buildPolyphonicMap).
 */
export interface PolyphonicContext {
  word: string // the full word this context represents, e.g. "银行"
  before?: string // character immediately preceding the glyph, e.g. "银"
  after?: string // character immediately following the glyph, e.g. "业"
}

/** An alternate pronunciation for a polyphonic character, mapped to a PUA codepoint */
export interface AlternateReading {
  ruby: string // alternate pronunciation, e.g. "háng"
  codepoint: string // PUA codepoint for the alternate glyph, e.g. "U+E000"
  contexts: PolyphonicContext[] // bigram contexts that trigger this reading via GSUB calt
}

/** A single glyph entry mapping a Unicode codepoint to its visual glyph and ruby annotation */
export interface GlyphEntry {
  codepoint: string
  glyph: string
  ruby: string
  alternates?: AlternateReading[]
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
  squeeze?: number
  tracking?: number
  weight?: number
  strategy?: string
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
