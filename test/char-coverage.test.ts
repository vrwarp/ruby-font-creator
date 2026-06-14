import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

// Sanity checks on the committed IDS-component-coverage ranking
// (built by scripts/build-char-coverage.js, consumed by
// frontend/jit/recipe.ts selectTrainingSet).

const dataPath = path.resolve(
  __dirname,
  '../frontend/public/data/char-coverage.json',
)

describe('char-coverage.json', () => {
  const ranked = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as number[]

  it('parses to a large array of unique codepoints', () => {
    expect(Array.isArray(ranked)).toBe(true)
    expect(ranked.length).toBeGreaterThan(1500)
    expect(new Set(ranked).size).toBe(ranked.length)
  })

  it('contains only BMP CJK codepoint numbers', () => {
    for (const cp of ranked) {
      expect(Number.isInteger(cp)).toBe(true)
      const isCjk =
        (cp >= 0x3400 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff)
      expect(isCjk).toBe(true)
    }
  })

  it('ranks known component-dense chars near the front', () => {
    // Greedy coverage picks component-rich chars first; these cover the
    // most document-frequent IDS components in the cjkvi-ids table.
    const head = new Set(ranked.slice(0, 64))
    for (const ch of ['钀', '籯', '糶', '齇']) {
      expect(head.has(ch.codePointAt(0)!)).toBe(true)
    }
  })

  it('stays compact enough to ship (< 30 KB)', () => {
    expect(fs.statSync(dataPath).size).toBeLessThan(30 * 1024)
  })
})
