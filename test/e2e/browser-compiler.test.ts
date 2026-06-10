import { describe, test, expect, beforeAll } from 'vitest'
import path from 'node:path'
import opentype from 'opentype.js'
import { setupAllMocks } from './mocks.js'
import ruby, { TextToSVG } from '../../src/ruby.js'
import { getAlternateGlyphEntries } from '../../src/polyphonic.js'
import {
  compileFontInBrowser,
  patchFontInBrowser,
} from '../../frontend/compiler.js'
import type { GlyphEntry } from '../../src/types.js'

// Integration tests for the production browser compiler: real layout engine,
// real svg2ttf compilation, with only the Pyodide runtime mocked out.

const fontPath = path.resolve(
  import.meta.dirname,
  '../../resources/fonts/DroidSansFallbackFull.ttf',
)

const testData: GlyphEntry[] = [
  { codepoint: 'U+884C', glyph: '行', ruby: 'xíng' },
  { codepoint: 'U+94F6', glyph: '银', ruby: 'yín' },
  { codepoint: 'U+9280', glyph: '銀', ruby: 'yín' },
  // PUA alternate 行→háng so the polyphonic map has a substitution target
  ...getAlternateGlyphEntries().filter((e) => e.codepoint === 'U+E000'),
]

function makeConfig() {
  return {
    canvas: { width: 80, height: 80 },
    fontName: 'test-font',
    layout: {
      base: {
        x: 40,
        y: 92,
        fontSize: 56,
        anchor: 'bottom center',
        attributes: {},
      },
      annotation: {
        x: 40,
        y: -8,
        fontSize: 15,
        anchor: 'top center',
        attributes: {},
        squeeze: 65,
        tracking: -0.04,
        weight: 500,
        strategy: 'smart',
      },
    },
  } as any
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

describe('frontend/compiler.ts: in-browser font compilation', () => {
  let engine: TextToSVG

  beforeAll(() => {
    setupAllMocks()
    engine = ruby.loadFont(fontPath)
  })

  test('compileFontInBrowser produces a parseable TTF with correct cmap and metrics', async () => {
    const result = await compileFontInBrowser(
      testData,
      makeConfig(),
      engine,
      engine,
      false,
      () => {},
    )

    expect(result.ttf.length).toBeGreaterThan(0)
    const font = opentype.parse(toArrayBuffer(result.ttf))
    expect(font.unitsPerEm).toBe(1000)

    for (const entry of testData) {
      const codepoint = parseInt(entry.codepoint.replace('U+', ''), 16)
      const glyph = font.charToGlyph(String.fromCodePoint(codepoint))
      expect(
        glyph.index,
        `glyph for ${entry.glyph} (${entry.codepoint})`,
      ).toBeGreaterThan(0)
      // Fixed advance: canvas width 80 × scale 12.5 = 1000 font units
      expect(glyph.advanceWidth).toBe(1000)
    }
  })

  test('compileFontInBrowser with polyphonic disabled still emits WOFF2 via Pyodide', async () => {
    const result = await compileFontInBrowser(
      testData,
      makeConfig(),
      engine,
      engine,
      false,
      () => {},
    )

    // 'wOF2' magic from the mocked fontTools flavor conversion
    expect(Array.from(result.woff2.slice(0, 4))).toEqual([119, 111, 102, 50])
  })

  test('compileFontInBrowser with polyphonic enabled runs GSUB injection', async () => {
    const logs: string[] = []
    const result = await compileFontInBrowser(
      testData,
      makeConfig(),
      engine,
      engine,
      true,
      (msg) => logs.push(msg),
    )

    // The mocked Pyodide GSUB pass appends a "GSUB" marker to the TTF
    expect(Array.from(result.ttf.slice(-4))).toEqual([71, 83, 85, 66])
    expect(Array.from(result.woff2.slice(0, 4))).toEqual([119, 111, 102, 50])
    expect(logs.join('')).toContain('GSUB injection')

    // The TTF (sans marker) must still be a valid font
    const font = opentype.parse(toArrayBuffer(result.ttf))
    expect(font.charToGlyph('行').index).toBeGreaterThan(0)
  })

  test('compileFontInBrowser tolerates characters missing from the base font', async () => {
    const badData: GlyphEntry[] = [
      ...testData,
      // U+30EDD (𰻝) is not in DroidSansFallbackFull — renders as a blank glyph
      { codepoint: 'U+30EDD', glyph: '𰻝', ruby: 'biáng' },
    ]

    const result = await compileFontInBrowser(
      badData,
      makeConfig(),
      engine,
      engine,
      false,
      () => {},
    )

    expect(result.ttf.length).toBeGreaterThan(0)
    const font = opentype.parse(toArrayBuffer(result.ttf))
    expect(font.charToGlyph('银').index).toBeGreaterThan(0)
  })

  test('patchFontInBrowser round-trips font bytes through the Pyodide FS', async () => {
    const compiled = await compileFontInBrowser(
      testData,
      makeConfig(),
      engine,
      engine,
      false,
      () => {},
    )

    const logs: string[] = []
    const patched = await patchFontInBrowser(compiled.ttf, ['ǎ'], (msg) =>
      logs.push(msg),
    )

    // The mocked patcher copies /font.ttf to /font_patched.ttf unchanged
    expect(patched).toEqual(compiled.ttf)
    expect(logs.join('')).toContain('Patching complete')
  })
})
