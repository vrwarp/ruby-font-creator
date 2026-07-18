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

/**
 * An alternate (context-dependent) Chinese gloss for an English word — the
 * word-level analogue of PolyphonicContext. The alternate applies when the
 * word is immediately preceded by `before` and a space (e.g. "river bank"
 * glosses 河岸 instead of the default 银行).
 */
export interface GlossAlternate {
  gloss: string // alternate Chinese gloss, e.g. "河岸"
  before: string // preceding word (lowercase) that triggers it, e.g. "river"
}

/** An English vocabulary word mapped to the Chinese gloss drawn above it */
export interface GlossEntry {
  word: string // lowercase ASCII word, e.g. "bank"
  gloss: string // default Chinese gloss, e.g. "银行"
  alternates?: GlossAlternate[]
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
  /**
   * Rotation in degrees (clockwise) baked directly into the generated path
   * coordinates. Unlike an SVG `transform` attribute this survives the
   * browser compiler, which only re-scales each path's `d` data. Used by the
   * rotated side layouts (e.g. pinyin to the right of the glyph).
   */
  rotate?: number
  /** Rotation pivot X in canvas space; defaults to `x` when `rotate` is set. */
  rotateOriginX?: number
  /** Rotation pivot Y in canvas space; defaults to `y` when `rotate` is set. */
  rotateOriginY?: number
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
