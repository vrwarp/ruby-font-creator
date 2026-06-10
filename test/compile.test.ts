import path from 'node:path'
import { test, expect, beforeAll } from 'vitest'
import opentype from 'opentype.js'
import ruby, { TextToSVG } from '../src/ruby.js'
import { buildSvgFontXml, compileTtf } from '../src/compile.js'
import type { GlyphEntry } from '../src/types.js'

// Tests for the shared in-memory compile pipeline used by both the CLI
// builder and the browser/worker compiler.

const fontPath = path.resolve(
  import.meta.dirname,
  '../resources/fonts/DroidSansFallbackFull.ttf',
)

let engine: TextToSVG

beforeAll(() => {
  engine = ruby.loadFont(fontPath)
})

const entries: GlyphEntry[] = [
  { codepoint: 'U+884C', glyph: '行', ruby: 'xíng' },
  { codepoint: 'U+94F6', glyph: '银', ruby: 'yín' },
  // PUA alternate, as emitted by getAlternateGlyphEntries()
  { codepoint: 'U+E000', glyph: '行', ruby: 'háng' },
]

function makeConfig(width = 80) {
  return {
    canvas: { width, height: 80 },
    fontName: 'unit-test-font',
    layout: {
      base: {
        x: width / 2,
        y: 92,
        fontSize: 56,
        anchor: 'bottom center',
        attributes: {},
      },
      annotation: {
        x: width / 2,
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
  }
}

test('compileTtf produces a valid TTF with every entry mapped at fixed advance', () => {
  const ttf = compileTtf(entries, makeConfig(), engine, engine)

  const font = opentype.parse(
    ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength),
  )
  expect(font.unitsPerEm).toBe(1000)

  for (const entry of entries) {
    const codepoint = parseInt(entry.codepoint.replace('U+', ''), 16)
    const glyph = font.charToGlyph(String.fromCodePoint(codepoint))
    expect(glyph.index, `${entry.glyph} ${entry.codepoint}`).toBeGreaterThan(0)
    // canvas width 80 × (1000 / canvas height 80) = 1000 units
    expect(glyph.advanceWidth).toBe(1000)
    // The composed glyph must carry actual outlines
    expect(glyph.getPath(0, 0, 72).commands.length).toBeGreaterThan(0)
  }
})

test('glyph advance follows the configured character width', () => {
  const ttf = compileTtf(entries, makeConfig(100), engine, engine)
  const font = opentype.parse(
    ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength),
  )
  // width 100 × scale 12.5 = 1250 units
  expect(font.charToGlyph('行').advanceWidth).toBe(1250)
})

test('buildSvgFontXml emits one glyph element per entry with PUA escapes', () => {
  const xml = buildSvgFontXml(entries, makeConfig(), engine, engine)

  expect(xml).toContain('font-family="unit-test-font"')
  expect((xml.match(/<glyph /g) ?? []).length).toBe(entries.length)
  expect(xml).toContain('unicode="&#x884c;"')
  expect(xml).toContain('unicode="&#xe000;"')
})

test('unrenderable entries are skipped with a warning, not fatal', () => {
  const logs: string[] = []
  const badEntries: GlyphEntry[] = [
    ...entries,
    // null glyph forces the per-entry failure path
    { codepoint: 'U+FFFD', glyph: null as any, ruby: 'x' },
  ]

  const ttf = compileTtf(badEntries, makeConfig(), engine, engine, (msg) =>
    logs.push(msg),
  )

  const font = opentype.parse(
    ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength),
  )
  expect(font.charToGlyph('银').index).toBeGreaterThan(0)
  expect(logs.join('')).toContain('Warning: failed generating glyph')
})
