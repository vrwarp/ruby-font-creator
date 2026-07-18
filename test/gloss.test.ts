import path from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'
import { CURATED_GLOSS_ENTRIES, GLOSS_ENTRIES } from '../src/gloss-data.js'
import {
  DEFAULT_GLOSS_LAYOUT,
  GLOSS_BMP_PUA_END,
  GLOSS_PUA_START,
  GLOSS_SUPP_PUA_END,
  GLOSS_SUPP_PUA_START,
  buildGlossPlan,
  composeAsciiGlyph,
  composeWordGlyph,
  titleCase,
} from '../src/gloss.js'
import ruby, { TextToSVG } from '../src/ruby.js'

const fontsDir = path.resolve(import.meta.dirname, '../resources/fonts')

describe('gloss dataset', () => {
  test('words are unique lowercase ASCII', () => {
    const seen = new Set<string>()
    for (const entry of GLOSS_ENTRIES) {
      expect(entry.word).toMatch(/^[a-z]+$/)
      expect(seen.has(entry.word)).toBe(false)
      seen.add(entry.word)
    }
  })

  test('glosses are Han characters', () => {
    for (const entry of GLOSS_ENTRIES) {
      expect(entry.gloss).toMatch(/^\p{Script=Han}+$/u)
      for (const alt of entry.alternates ?? []) {
        expect(alt.gloss).toMatch(/^\p{Script=Han}+$/u)
      }
    }
  })

  test('alternate contexts reference vocabulary words', () => {
    // Context words must be entries themselves so the trigger still matches
    // after the context word has been ligated by its own lookup.
    const words = new Set(GLOSS_ENTRIES.map((entry) => entry.word))
    for (const entry of GLOSS_ENTRIES) {
      for (const alt of entry.alternates ?? []) {
        expect(words.has(alt.before)).toBe(true)
        expect(alt.gloss).not.toBe(entry.gloss)
      }
    }
  })
})

describe('buildGlossPlan()', () => {
  const plan = buildGlossPlan(GLOSS_ENTRIES)

  test('emits one job per composite and one map row per word', () => {
    const expectedJobs = GLOSS_ENTRIES.reduce(
      (sum, entry) => sum + 2 + 2 * (entry.alternates?.length ?? 0),
      0,
    )
    expect(plan.jobs).toHaveLength(expectedJobs)
    expect(plan.map).toHaveLength(GLOSS_ENTRIES.length)
  })

  test('assigns unique PUA codepoints from U+E100, clear of the pinyin alternates', () => {
    const codepoints = plan.jobs.map((job) => job.codepoint)
    expect(new Set(codepoints).size).toBe(codepoints.length)
    let inSupplementary = 0
    for (const codepoint of codepoints) {
      const cp = parseInt(codepoint.replace('U+', ''), 16)
      const inBmpPua = cp >= GLOSS_PUA_START && cp <= GLOSS_BMP_PUA_END
      const inSuppPua = cp >= GLOSS_SUPP_PUA_START && cp <= GLOSS_SUPP_PUA_END
      expect(inBmpPua || inSuppPua).toBe(true)
      if (inSuppPua) inSupplementary++
    }
    // The 9th-grade vocabulary overflows the BMP PUA into plane 15.
    expect(inSupplementary).toBeGreaterThan(0)
  })

  test('generated vocabulary merges under the curated entries', () => {
    expect(GLOSS_ENTRIES.length).toBeGreaterThan(9000)
    // Curated entries come first and keep their hand-checked glosses.
    const merged = new Map(GLOSS_ENTRIES.map((e) => [e.word, e]))
    for (const curated of CURATED_GLOSS_ENTRIES) {
      expect(merged.get(curated.word)).toBe(curated)
    }
  })

  test('map rows carry distinct lower/title composites and alternates', () => {
    const bank = plan.map.find((row) => row.word === 'bank')!
    expect(bank.lower).not.toBe(bank.title)
    expect(bank.alternates).toHaveLength(1)
    expect(bank.alternates[0].before).toBe('river')
    const bankJobs = plan.jobs.filter((job) =>
      [
        bank.lower,
        bank.title,
        bank.alternates[0].lower,
        bank.alternates[0].title,
      ].includes(job.codepoint),
    )
    expect(bankJobs.map((job) => job.text)).toEqual([
      'bank',
      'Bank',
      'bank',
      'Bank',
    ])
    expect(bankJobs.map((job) => job.gloss)).toEqual([
      '银行',
      '银行',
      '河岸',
      '河岸',
    ])
  })

  test('titleCase()', () => {
    expect(titleCase('bank')).toBe('Bank')
    expect(titleCase('hallelujah')).toBe('Hallelujah')
  })
})

describe('glyph composition', () => {
  let baseEngine: TextToSVG
  let glossEngine: TextToSVG

  beforeAll(() => {
    baseEngine = ruby.loadFont(
      path.join(fontsDir, 'PT_Sans-Narrow-Web-Regular.ttf'),
    )
    glossEngine = ruby.loadFont(
      path.join(fontsDir, 'DroidSansFallbackFull.ttf'),
    )
  })

  test('composite advance covers both the word and the gloss', () => {
    const layout = DEFAULT_GLOSS_LAYOUT
    // Word wider than gloss:
    const hallelujah = composeWordGlyph(
      baseEngine,
      glossEngine,
      'hallelujah',
      '哈利路亚',
      layout,
    )
    // Gloss wider than word:
    const go = composeWordGlyph(baseEngine, glossEngine, 'go', '去', layout)

    for (const composed of [hallelujah, go]) {
      expect(composed.d.length).toBeGreaterThan(0)
      expect(composed.advance).toBeGreaterThan(0)
    }
    const goWordWidth = baseEngine.getWidth('go', {
      fontSize: layout.baseFontSize,
      kerning: true,
    })
    const goGlossWidth = glossEngine.getWidth('去', {
      fontSize: layout.glossFontSize,
      kerning: true,
    })
    expect(go.advance).toBeGreaterThanOrEqual(goWordWidth)
    expect(go.advance).toBeGreaterThanOrEqual(goGlossWidth)
  })

  test('gloss ink sits above the Latin baseline', () => {
    const layout = DEFAULT_GLOSS_LAYOUT
    const glossOnly = glossEngine.font
      .getPath(
        '爱',
        0,
        layout.glossTop +
          (glossEngine.font.ascender / glossEngine.font.unitsPerEm) *
            layout.glossFontSize,
        layout.glossFontSize,
      )
      .getBoundingBox()
    expect(glossOnly.y1).toBeGreaterThanOrEqual(0)
    expect(glossOnly.y2).toBeLessThan(
      layout.baselineY - layout.baseFontSize / 2,
    )
  })

  test('ASCII glyphs render on the shared baseline', () => {
    const a = composeAsciiGlyph(baseEngine, 'a')
    expect(a.d.length).toBeGreaterThan(0)
    expect(a.advance).toBeGreaterThan(0)

    const space = composeAsciiGlyph(baseEngine, ' ')
    expect(space.advance).toBeGreaterThan(0)
  })
})
