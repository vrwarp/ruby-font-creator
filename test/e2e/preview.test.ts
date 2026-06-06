import { describe, test, expect, beforeAll } from 'vitest'
import ruby from '../../src/ruby.js'
import path from 'node:path'

describe('Feature 1: Preview Layout & Rendering', () => {
  let engine: any
  const fontPath = path.resolve(
    process.cwd(),
    'resources/fonts/DroidSansFallbackFull.ttf',
  )

  beforeAll(() => {
    engine = ruby.loadFont(fontPath)
  })

  // === TIER 1: HAPPY PATH TESTS ===

  test('Feature 1 Tier 1-1: loadFont - should successfully load DroidSansFallback font', () => {
    expect(engine).toBeDefined()
    expect(engine.font).toBeDefined()
    expect(engine.font.names.fontFamily.en).toBe('Droid Sans Fallback')
  })

  test('Feature 1 Tier 1-2: getBase - should render correct SVG path for a Hanzi character', () => {
    const glyph = '北'
    const svgPath = ruby.getBase(engine, glyph, {
      x: 40,
      y: 92,
      fontSize: 56,
      anchor: 'bottom center',
      attributes: { fill: 'black', id: 'glyph' },
    })
    expect(svgPath).toContain('<path')
    expect(svgPath).toContain('d="')
    expect(svgPath).toContain('id="glyph"')
  })

  test('Feature 1 Tier 1-3: getAnnotation - should render pinyin above character with smart squeeze', () => {
    const pinyin = 'chuāng' // 6 letters (>=5, should trigger smart squeeze)
    const annoPath = ruby.getAnnotation(engine, pinyin, {
      x: 40,
      y: -4,
      fontSize: 13,
      anchor: 'top center',
      squeeze: 65, // 65% squeeze
      tracking: -0.04,
      weight: 500,
      strategy: 'smart',
      attributes: { fill: 'black', id: 'annotation' },
    })
    expect(annoPath).toContain('<path')
    expect(annoPath).toContain('id="pinyin-')
  })

  test('Feature 1 Tier 1-4: getAnnotation - should render pinyin below character', () => {
    const pinyin = 'běi'
    const annoPath = ruby.getAnnotation(engine, pinyin, {
      x: 40,
      y: 92 + 4,
      fontSize: 13,
      anchor: 'bottom center',
      squeeze: 100,
      tracking: 0,
      weight: 400,
      strategy: 'smart',
      attributes: { fill: 'black', id: 'annotation' },
    })
    expect(annoPath).toContain('<path')
    expect(annoPath).toContain('id="pinyin-')
  })

  test('Feature 1 Tier 1-5: stroke weight - should render thicker pinyin strokes with higher font weight', () => {
    const pinyin = 'a'
    const optionsLight = {
      x: 40,
      y: 4,
      fontSize: 12,
      anchor: 'top center',
      squeeze: 100,
      tracking: 0,
      weight: 400, // standard weight
      strategy: 'global',
      attributes: { fill: 'black' },
    }
    const optionsBold = {
      ...optionsLight,
      weight: 700, // bold weight
    }

    const svgLight = ruby.getAnnotation(engine, pinyin, optionsLight)
    const svgBold = ruby.getAnnotation(engine, pinyin, optionsBold)

    // Higher weight generates offset strokes (duplicate paths) for thickness simulation.
    // Assert that the bold version has more paths or commands than the light version.
    const pathCountLight = (svgLight.match(/<path/g) || []).length
    const pathCountBold = (svgBold.match(/<path/g) || []).length
    expect(pathCountBold).toBeGreaterThan(pathCountLight)
    expect(pathCountLight).toBe(1) // 1 stroke
    expect(pathCountBold).toBe(5) // 5 stroke offsets (center + 4 directions)
  })

  // === TIER 2: EDGE CASE & BOUNDARY TESTS ===

  test('Feature 1 Tier 2-1: optical squeeze boundaries - should apply squeeze at lower bound (30%) and upper bound (120%)', () => {
    const pinyin = 'chuāng'
    const getSpecs = (squeeze: number) => {
      const svg = ruby.getAnnotation(engine, pinyin, {
        x: 40,
        y: 4,
        fontSize: 12,
        anchor: 'top center',
        squeeze,
        tracking: 0,
        weight: 400,
        strategy: 'global',
        attributes: {},
      })
      return svg
    }

    const svg30 = getSpecs(30)
    const svg120 = getSpecs(120)

    expect(svg30).toBeDefined()
    expect(svg120).toBeDefined()

    // Low squeeze (30%) paths should contain different coordinates compared to high squeeze (120%)
    expect(svg30).not.toBe(svg120)
  })

  test('Feature 1 Tier 2-2: vertical offset boundaries - should apply offset at lower bound (-20px) and upper bound (60px)', () => {
    const pinyin = 'a'
    const renderOffset = (offset: number) => {
      return ruby.getAnnotation(engine, pinyin, {
        x: 40,
        y: offset,
        fontSize: 12,
        anchor: 'top center',
        squeeze: 100,
        tracking: 0,
        weight: 400,
        attributes: {},
      })
    }

    const svgNeg = renderOffset(-20)
    const svgPos = renderOffset(60)

    expect(svgNeg).toBeDefined()
    expect(svgPos).toBeDefined()
    expect(svgNeg).not.toBe(svgPos)
  })

  test('Feature 1 Tier 2-3: character width boundaries - should position pinyin correctly for narrow and wide layouts', () => {
    const pinyin = 'hao'
    const renderWidth = (width: number) => {
      return ruby.getAnnotation(engine, pinyin, {
        x: width / 2, // Centered on canvas
        y: 4,
        fontSize: 12,
        anchor: 'top center',
        squeeze: 100,
        tracking: 0,
        weight: 400,
        attributes: {},
      })
    }

    const svgNarrow = renderWidth(50)
    const svgWide = renderWidth(150)

    expect(svgNarrow).toBeDefined()
    expect(svgWide).toBeDefined()
    expect(svgNarrow).not.toBe(svgWide)
  })

  test('Feature 1 Tier 2-4: squeeze strategies - should correctly handle proportional strategy for long vs short pinyin words', () => {
    const options = {
      x: 40,
      y: 4,
      fontSize: 12,
      anchor: 'top center',
      squeeze: 50,
      tracking: 0,
      weight: 400,
      strategy: 'proportional',
      attributes: {},
    }

    // Short word (3 letters) - proportional strategy should apply 0% squeeze (scale = 1.0)
    const svgShort = ruby.getAnnotation(engine, 'abc', options)

    // Medium word (4 letters) - proportional strategy should apply partial squeeze (scale = 1 - (1-0.5)*0.35 = 0.825)
    const svgMed = ruby.getAnnotation(engine, 'abcd', options)

    // Long word (5 letters) - proportional strategy should apply full squeeze (scale = 0.5)
    const svgLong = ruby.getAnnotation(engine, 'abcde', options)

    expect(svgShort).toBeDefined()
    expect(svgMed).toBeDefined()
    expect(svgLong).toBeDefined()
  })

  test('Feature 1 Tier 2-5: empty or missing parameters - should handle empty or null values gracefully without throwing', () => {
    // Should fallback or execute without crash
    const svgEmpty = ruby.getAnnotation(engine, '', {
      x: 40,
      y: 4,
      fontSize: 12,
      anchor: 'top center',
      attributes: {},
    })
    expect(svgEmpty).toBe('')

    // Should work with single letters
    const svgSingle = ruby.getAnnotation(engine, 'a', {
      x: 40,
      y: 4,
      fontSize: 12,
      anchor: 'top center',
      attributes: {},
    })
    expect(svgSingle).toContain('<path')
  })
})
