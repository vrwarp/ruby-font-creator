import { test, expect } from 'vitest'
import {
  POLYPHONIC_ENTRIES,
  getAlternateGlyphEntries,
  buildPolyphonicMap,
} from '../src/polyphonic.js'
import type { GlyphEntry } from '../src/types.js'

test('POLYPHONIC_ENTRIES: all PUA codepoints are in U+E000–U+F8FF range', () => {
  for (const entry of POLYPHONIC_ENTRIES) {
    for (const alt of entry.alternates) {
      const cp = parseInt(alt.codepoint.replace('U+', ''), 16)
      expect(cp).toBeGreaterThanOrEqual(0xe000)
      expect(cp).toBeLessThanOrEqual(0xf8ff)
    }
  }
})

test('POLYPHONIC_ENTRIES: no duplicate PUA codepoints', () => {
  const seen = new Set<string>()
  for (const entry of POLYPHONIC_ENTRIES) {
    for (const alt of entry.alternates) {
      expect(seen.has(alt.codepoint)).toBe(false)
      seen.add(alt.codepoint)
    }
  }
})

test('POLYPHONIC_ENTRIES: every context has at least one of before/after', () => {
  for (const entry of POLYPHONIC_ENTRIES) {
    for (const alt of entry.alternates) {
      for (const ctx of alt.contexts) {
        expect(ctx.before !== undefined || ctx.after !== undefined).toBe(true)
      }
    }
  }
})

test('POLYPHONIC_ENTRIES: evangelical-critical characters present', () => {
  const codepoints = new Set(POLYPHONIC_ENTRIES.map((e) => e.codepoint))
  expect(codepoints.has('U+91CD')).toBe(true) // 重 (重生 born again)
  expect(codepoints.has('U+4E50')).toBe(true) // 乐 (音乐 music)
  expect(codepoints.has('U+96BE')).toBe(true) // 难 (受难 Passion)
  expect(codepoints.has('U+5174')).toBe(true) // 兴 (复兴 revival)
  expect(codepoints.has('U+5C3D')).toBe(true) // 尽 (尽心 Great Commandment)
  expect(codepoints.has('U+4F20')).toBe(true) // 传 (使徒行传 Acts)
})

test('getAlternateGlyphEntries(): returns one entry per alternate reading', () => {
  const totalAlternates = POLYPHONIC_ENTRIES.reduce(
    (sum, e) => sum + e.alternates.length,
    0,
  )
  const entries = getAlternateGlyphEntries()
  expect(entries).toHaveLength(totalAlternates)
})

test('getAlternateGlyphEntries(): entries have required GlyphEntry fields', () => {
  const entries = getAlternateGlyphEntries()
  for (const entry of entries) {
    expect(entry.codepoint).toMatch(/^U\+[0-9A-F]+$/i)
    expect(entry.glyph.length).toBeGreaterThan(0)
    expect(entry.ruby.length).toBeGreaterThan(0)
  }
})

test('getAlternateGlyphEntries(): 重 alternate is chóng at U+E001', () => {
  const entries = getAlternateGlyphEntries()
  const zhong = entries.find((e) => e.codepoint === 'U+E001')
  expect(zhong).toBeDefined()
  expect(zhong!.glyph).toBe('重')
  expect(zhong!.ruby).toBe('chóng')
})

test('getAlternateGlyphEntries(): 兴 alternate is xīng at U+E007', () => {
  const entries = getAlternateGlyphEntries()
  const xing = entries.find((e) => e.codepoint === 'U+E007')
  expect(xing).toBeDefined()
  expect(xing!.glyph).toBe('兴')
  expect(xing!.ruby).toBe('xīng')
})

test('buildPolyphonicMap(): uses primary ruby from main data', () => {
  const mainData: GlyphEntry[] = [
    { codepoint: 'U+91CD', glyph: '重', ruby: 'zhòng' },
    { codepoint: 'U+4E50', glyph: '乐', ruby: 'lè' },
  ]
  const map = buildPolyphonicMap(mainData)

  expect(map['重'].default.ruby).toBe('zhòng')
  expect(map['乐'].default.ruby).toBe('lè')
})

test('buildPolyphonicMap(): alternates include contexts', () => {
  const mainData: GlyphEntry[] = [
    { codepoint: 'U+96BE', glyph: '难', ruby: 'nán' },
  ]
  const map = buildPolyphonicMap(mainData)
  const nan = map['难']

  expect(nan.alternates).toHaveLength(1)
  expect(nan.alternates[0].ruby).toBe('nàn')

  const words = nan.alternates[0].contexts.map((c) => c.word)
  expect(words).toContain('受难')
  expect(words).toContain('患难')
  expect(words).toContain('苦难')
})

test('buildPolyphonicMap(): skips entries not in main data', () => {
  const mainData: GlyphEntry[] = [
    { codepoint: 'U+91CD', glyph: '重', ruby: 'zhòng' },
  ]
  const map = buildPolyphonicMap(mainData)
  // 乐 not in mainData — should not appear in map
  expect(map['乐']).toBeUndefined()
  expect(map['重']).toBeDefined()
})

test('buildPolyphonicMap(): 尽心尽性尽意 contexts all present (Matt 22:37)', () => {
  const mainData: GlyphEntry[] = [
    { codepoint: 'U+5C3D', glyph: '尽', ruby: 'jǐn' },
  ]
  const map = buildPolyphonicMap(mainData)
  const jin = map['尽']
  const words = jin.alternates[0].contexts.map((c) => c.word)

  expect(words).toContain('尽心')
  expect(words).toContain('尽性')
  expect(words).toContain('尽意')
  expect(words).toContain('尽力')
})
