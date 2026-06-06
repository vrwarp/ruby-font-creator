import { describe, test, expect, beforeAll } from 'vitest'
import {
  setupAllMocks,
  MockPyodide,
  MockIDBDatabase,
  BrowserFontCompiler,
} from './mocks.js'
import ruby from '../../src/ruby.js'
import path from 'node:path'

describe('Tier 3: Pairwise Combination Testing', () => {
  let engine: any
  const fontPath = path.resolve(
    process.cwd(),
    'resources/fonts/DroidSansFallbackFull.ttf',
  )

  beforeAll(() => {
    engine = ruby.loadFont(fontPath)
    setupAllMocks()
  })

  const runIntegratedFlow = async (
    config: {
      placement: 'top' | 'bottom'
      strategy: 'smart' | 'proportional' | 'global'
      weight: number
      characterWidth: number
      polyphonic: boolean
    },
    fontName: string,
  ) => {
    // 1. Render Preview SVG
    const svgPath = ruby.getAnnotation(engine, 'chuāng', {
      x: config.characterWidth / 2,
      y: config.placement === 'top' ? -4 : 96,
      fontSize: 13,
      anchor: config.placement === 'top' ? 'top center' : 'bottom center',
      squeeze: 65,
      tracking: -0.04,
      weight: config.weight,
      strategy: config.strategy,
      attributes: {},
    })
    expect(svgPath).toContain('<path')

    // 2. Compile base TTF from glyph definitions
    const glyphs = [{ glyph: '窗', path: svgPath, unicode: 0x7a97 }]
    const baseTtf = BrowserFontCompiler.compile(glyphs, fontName)
    expect(baseTtf.length).toBeGreaterThan(0)

    // 3. Inject features via Pyodide if enabled
    let finalTtf = baseTtf
    let finalWoff2 = new Uint8Array()

    if (config.polyphonic) {
      // @ts-expect-error - loadPyodide is a custom mocked global function
      const pyodide: MockPyodide = await globalThis.loadPyodide()
      await pyodide.loadPackage(['fonttools', 'brotli'])
      pyodide.FS.writeFile('in.ttf', baseTtf)

      await pyodide.runPythonAsync('inject_and_compress_woff2()')

      finalTtf = pyodide.FS.readFile('out.ttf') as any
      finalWoff2 = pyodide.FS.readFile('out.woff2') as any
      expect(finalTtf.slice(-4)).toEqual(new Uint8Array([71, 83, 85, 66])) // Has GSUB
      expect(finalWoff2.length).toBeGreaterThan(0)
    }

    // 4. Store final binaries in IndexedDB
    const db: MockIDBDatabase = await new Promise((resolve) => {
      const req = globalThis.indexedDB.open('font-store', 1)
      req.onupgradeneeded = (e: any) => {
        e.target.result.createObjectStore('fonts')
      }
      req.onsuccess = (e: any) => resolve(e.target.result)
    })

    const tx = db.transaction('fonts', 'readwrite')
    const store = tx.objectStore('fonts')

    await new Promise((resolve) => {
      store.put(
        {
          name: fontName,
          ttf: finalTtf,
          woff2: finalWoff2,
          config,
        },
        fontName,
      ).onsuccess = resolve
    })

    // Retrieve and verify DB state
    const retrieved: any = await new Promise((resolve) => {
      store.get(fontName).onsuccess = (e: any) => resolve(e.target.result)
    })

    expect(retrieved).toBeDefined()
    expect(retrieved.name).toBe(fontName)
    expect(retrieved.config.placement).toBe(config.placement)
    expect(retrieved.config.strategy).toBe(config.strategy)

    db.close()
  }

  // Pairwise Test Suite: Covering combinations of parameters

  test('Combination 1: Top, Smart Squeeze, Normal Weight (400), Polyphonic (GSUB) Active', async () => {
    await runIntegratedFlow(
      {
        placement: 'top',
        strategy: 'smart',
        weight: 400,
        characterWidth: 80,
        polyphonic: true,
      },
      'font-combo-1',
    )
  })

  test('Combination 2: Bottom, Proportional Squeeze, Bold Weight (700), Polyphonic (GSUB) Inactive', async () => {
    await runIntegratedFlow(
      {
        placement: 'bottom',
        strategy: 'proportional',
        weight: 700,
        characterWidth: 100,
        polyphonic: false,
      },
      'font-combo-2',
    )
  })

  test('Combination 3: Top, Global Squeeze, Bold Weight (700), Polyphonic (GSUB) Active', async () => {
    await runIntegratedFlow(
      {
        placement: 'top',
        strategy: 'global',
        weight: 700,
        characterWidth: 90,
        polyphonic: true,
      },
      'font-combo-3',
    )
  })

  test('Combination 4: Bottom, Smart Squeeze, Normal Weight (400), Polyphonic (GSUB) Inactive', async () => {
    await runIntegratedFlow(
      {
        placement: 'bottom',
        strategy: 'smart',
        weight: 400,
        characterWidth: 120,
        polyphonic: false,
      },
      'font-combo-4',
    )
  })

  test('Combination 5: Top, Proportional Squeeze, Normal Weight (400), Polyphonic (GSUB) Active', async () => {
    await runIntegratedFlow(
      {
        placement: 'top',
        strategy: 'proportional',
        weight: 400,
        characterWidth: 70,
        polyphonic: true,
      },
      'font-combo-5',
    )
  })
})
