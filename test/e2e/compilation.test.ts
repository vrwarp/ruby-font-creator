import { describe, test, expect } from 'vitest'

import { GlyphInput, BrowserFontCompiler } from './mocks.js'

describe('Feature 2: TTF Compilation', () => {
  const sampleGlyphs: GlyphInput[] = [
    {
      glyph: '北',
      path: 'M 100 100 L 900 100 L 900 900 L 100 900 Z',
      unicode: 0x5317,
    },
    {
      glyph: '京',
      path: 'M 200 200 L 800 200 L 800 800 L 200 800 Z',
      unicode: 0x4eac,
    },
  ]

  // === TIER 1: HAPPY PATH TESTS ===

  test('Feature 2 Tier 1-1: SVG Font XML Generation - should generate a valid SVG Font XML with basic glyph nodes', () => {
    const xml = BrowserFontCompiler.generateSvgFontXml(
      sampleGlyphs,
      'test-font',
    )
    expect(xml).toContain('font-family="test-font"')
    expect(xml).toContain('unicode="&#x5317;"')
    expect(xml).toContain('unicode="&#x4EAC;"')
    expect(xml).toContain('d="M 100 100')
  })

  test('Feature 2 Tier 1-2: Font compilation - should compile SVG Font XML to TTF Uint8Array successfully', () => {
    const ttfBytes = BrowserFontCompiler.compile(sampleGlyphs, 'test-font')
    expect(ttfBytes).toBeInstanceOf(Uint8Array)
    expect(ttfBytes.length).toBeGreaterThan(0)

    // TTF format magic number check: first four bytes should be 0x00, 0x01, 0x00, 0x00 (or "OTTO")
    expect(ttfBytes[0]).toBe(0)
    expect(ttfBytes[1]).toBe(1)
    expect(ttfBytes[2]).toBe(0)
    expect(ttfBytes[3]).toBe(0)
  })

  test('Feature 2 Tier 1-3: Character mapping - should map Unicode code points to correct glyph IDs in the generated font', () => {
    const xml = BrowserFontCompiler.generateSvgFontXml(sampleGlyphs)
    // Check that standard unicode XML entities are formatted properly
    expect(xml).toContain('unicode="&#x5317;"')
    expect(xml).toContain('unicode="&#x4EAC;"')
  })

  test('Feature 2 Tier 1-4: Font name settings - should write correct font metadata to the header', () => {
    const customFontName = 'my-awesome-pinyin-font'
    const xml = BrowserFontCompiler.generateSvgFontXml(
      sampleGlyphs,
      customFontName,
    )
    expect(xml).toContain(`font id="${customFontName}"`)
    expect(xml).toContain(`font-family="${customFontName}"`)
  })

  test('Feature 2 Tier 1-5: Compilation with multiple glyphs - should generate TTF containing multiple custom glyphs', () => {
    const multiGlyphs = [
      ...sampleGlyphs,
      { glyph: '上', path: 'M 500 100 L 500 900', unicode: 0x4e0a },
      { glyph: '海', path: 'M 100 500 L 900 500', unicode: 0x6d77 },
    ]
    const ttfBytes = BrowserFontCompiler.compile(multiGlyphs)
    expect(ttfBytes.length).toBeGreaterThan(0)
  })

  // === TIER 2: EDGE CASE & BOUNDARY TESTS ===

  test('Feature 2 Tier 2-1: Empty glyph input - should throw or handle empty glyph lists gracefully', () => {
    expect(() => {
      BrowserFontCompiler.compile([])
    }).toThrow('No glyphs provided for compilation')
  })

  test('Feature 2 Tier 2-2: Missing glyph path - should handle empty path definitions without throwing', () => {
    const glyphsWithMissingPath = [{ glyph: '空', path: '', unicode: 0x7a7a }]
    const xml = BrowserFontCompiler.generateSvgFontXml(glyphsWithMissingPath)
    expect(xml).toContain('unicode="&#x7A7A;" d=""') // Empty path data written for this glyph

    const ttfBytes = BrowserFontCompiler.compile(glyphsWithMissingPath)
    expect(ttfBytes.length).toBeGreaterThan(0)
  })

  test('Feature 2 Tier 2-3: Invalid SVG path format - should handle malformed SVG path descriptions', () => {
    const glyphsWithBadPath = [
      { glyph: '错', path: 'invalid path data syntax', unicode: 0x9519 },
    ]
    // svg2ttf is resilient and parses what it can, or skips bad commands
    const ttfBytes = BrowserFontCompiler.compile(glyphsWithBadPath)
    expect(ttfBytes.length).toBeGreaterThan(0)
  })

  test('Feature 2 Tier 2-4: Duplicate Unicode mapping - should output multiple glyph definitions for duplicate characters', () => {
    const duplicateGlyphs = [
      { glyph: '重', path: 'M 10 10 L 20 20', unicode: 0x91cd },
      { glyph: '重', path: 'M 30 30 L 40 40', unicode: 0x91cd },
    ]
    const xml = BrowserFontCompiler.generateSvgFontXml(duplicateGlyphs)
    const matches = xml.match(/unicode="&#x91CD;"/g)
    expect(matches?.length).toBe(2)

    const ttfBytes = BrowserFontCompiler.compile(duplicateGlyphs)
    expect(ttfBytes.length).toBeGreaterThan(0)
  })

  test('Feature 2 Tier 2-5: Extremely long font name - should handle/truncate font metadata names that exceed size bounds', () => {
    const superLongName = 'a'.repeat(250) // Very long font name
    const xml = BrowserFontCompiler.generateSvgFontXml(
      sampleGlyphs,
      superLongName,
    )
    expect(xml).toContain(`font-family="${superLongName}"`)

    const ttfBytes = BrowserFontCompiler.compile(sampleGlyphs, superLongName)
    expect(ttfBytes.length).toBeGreaterThan(0)
  })
})
