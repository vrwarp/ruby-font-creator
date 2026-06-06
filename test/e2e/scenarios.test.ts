import { describe, test, expect, beforeAll } from 'vitest'
import {
  setupAllMocks,
  MockIDBDatabase,
  MockPyodide,
  BrowserFontCompiler,
} from './mocks.js'
import ruby from '../../src/ruby.js'
import path from 'node:path'

describe('Tier 4: Real-world Application Scenarios', () => {
  let engine: any
  const fontPath = path.resolve(
    process.cwd(),
    'resources/fonts/DroidSansFallbackFull.ttf',
  )

  beforeAll(() => {
    engine = ruby.loadFont(fontPath)
    setupAllMocks()
  })

  test('Scenario 1: Worship Slide Simulator State & Navigation', async () => {
    // 1. Simulate active slide state
    let activeSlideIndex = 0
    let activeTheme = 'navy'
    let printScale = 1.0
    let subtitleVisible = true

    const worshipSlides = [
      {
        hanzi: '奇异恩典何等甘甜',
        pinyin: ['qí', 'yì', 'ēn', 'diǎn', 'hé', 'děng', 'gān', 'tián'],
      },
      {
        hanzi: '我罪已得赦免',
        pinyin: ['wǒ', 'zuì', 'yǐ', 'dé', 'shè', 'miǎn'],
      },
    ]

    // 2. Perform slide navigation (Next Slide)
    activeSlideIndex = (activeSlideIndex + 1) % worshipSlides.length
    expect(activeSlideIndex).toBe(1)

    // 3. Update theme and print scale
    activeTheme = 'emerald'
    printScale = 1.2
    subtitleVisible = false

    // 4. Verify slide rendering under new configurations
    const currentSlide = worshipSlides[activeSlideIndex]
    const renderResults = currentSlide.hanzi.split('').map((char, idx) => {
      return ruby.getAnnotation(engine, currentSlide.pinyin[idx], {
        x: 40 * printScale,
        y: 4,
        fontSize: 13 * printScale,
        anchor: 'top center',
        squeeze: 100,
        tracking: 0,
        weight: 500,
        strategy: 'smart',
        attributes: {},
      })
    })

    expect(renderResults.length).toBe(6) // '我罪已得赦免' has 6 characters
    expect(renderResults[0]).toContain('<path')
    expect(activeTheme).toBe('emerald')
    expect(subtitleVisible).toBe(false)
  })

  test('Scenario 2: Offline PWA Cold Boot and Cache Interception', async () => {
    // 1. Simulate registration in offline mode
    const swContainer = globalThis.navigator.serviceWorker
    const registration = await swContainer.register('/sw.js')
    expect(registration).toBeDefined()

    // 2. Simulate a network request interceptor serving cached files
    const offlineCache = new Map<string, string>()
    offlineCache.set('/index.html', '<html>PWA App</html>')
    offlineCache.set('/dist/main.js', 'console.log("App startup")')
    offlineCache.set(
      '/resources/fonts/DroidSansFallbackFull.ttf',
      'RawFontDataBytes',
    )

    const offlineFetch = async (url: string) => {
      const cachedContent = offlineCache.get(url)
      if (cachedContent) {
        return new Response(cachedContent)
      }
      throw new TypeError('Failed to fetch (Offline)')
    }

    const htmlResponse = await offlineFetch('/index.html')
    const htmlText = await htmlResponse.text()
    expect(htmlText).toContain('PWA App')

    const fontResponse = await offlineFetch(
      '/resources/fonts/DroidSansFallbackFull.ttf',
    )
    const fontText = await fontResponse.text()
    expect(fontText).toBe('RawFontDataBytes')

    // 3. Initialize Pyodide offline
    // @ts-expect-error - loadPyodide is a custom mocked global function
    const pyodide: MockPyodide = await globalThis.loadPyodide()
    await pyodide.loadPackage('fonttools')
    pyodide.FS.writeFile('in.ttf', new Uint8Array([0, 1, 2]))

    const pyResult = await pyodide.runPythonAsync('inject_gsub()')
    expect(pyResult).toBeDefined()
  })

  test('Scenario 3: Custom Font Generation and Live Loader', async () => {
    // 1. User types custom text and triggers sandbox rendering
    const customText = '北'
    const customPinyin = 'běi'

    const customSvgPath = ruby.getAnnotation(engine, customPinyin, {
      x: 40,
      y: 4,
      fontSize: 12,
      anchor: 'top center',
      squeeze: 100,
      tracking: 0,
      weight: 500,
      attributes: {},
    })

    // 2. User clicks 'Build Font Assets'
    const fontName = 'my-custom-worship-font'
    const baseTtf = BrowserFontCompiler.compile(
      [{ glyph: customText, path: customSvgPath, unicode: 0x5317 }],
      fontName,
    )

    // 3. Pyodide injects rules and creates WOFF2
    // @ts-expect-error - loadPyodide is a custom mocked global function
    const pyodide: MockPyodide = await globalThis.loadPyodide()
    await pyodide.loadPackage(['fonttools', 'brotli'])
    pyodide.FS.writeFile('in.ttf', baseTtf)
    await pyodide.runPythonAsync('inject_and_compress_woff2()')
    const finalTtf = pyodide.FS.readFile('out.ttf')
    const finalWoff2 = pyodide.FS.readFile('out.woff2')

    // 4. Save to IndexedDB
    const db: MockIDBDatabase = await new Promise((resolve) => {
      const req = globalThis.indexedDB.open('worship-store', 1)
      req.onupgradeneeded = (e: any) => {
        e.target.result.createObjectStore('fonts')
      }
      req.onsuccess = (e: any) => resolve(e.target.result)
    })

    const tx = db.transaction('fonts', 'readwrite')
    const store = tx.objectStore('fonts')
    await new Promise((resolve) => {
      store.put(
        { name: fontName, ttf: finalTtf, woff2: finalWoff2 },
        fontName,
      ).onsuccess = resolve
    })

    // 5. Load generated font dynamically using FontFace
    const retrieved: any = await new Promise((resolve) => {
      store.get(fontName).onsuccess = (e: any) => resolve(e.target.result)
    })

    // Create Blob URLs
    const ttfBlob = new Blob([retrieved.ttf], { type: 'font/ttf' })
    const woff2Blob = new Blob([retrieved.woff2], { type: 'font/woff2' })
    const ttfUrl = URL.createObjectURL(ttfBlob)
    const woff2Url = URL.createObjectURL(woff2Blob)

    const fontFace = new FontFace(
      fontName,
      `url(${woff2Url}) format('woff2'), url(${ttfUrl}) format('truetype')`,
    )
    await fontFace.load()

    document.fonts.add(fontFace)

    // Assert font loaded successfully
    expect(document.fonts.has(fontFace)).toBe(true)
    expect(fontFace.status).toBe('loaded')

    db.close()
  })

  test('Scenario 4: Adaptive Textbook Layout & Containment Check', async () => {
    // 1. Simulate layout with adjacent characters
    const characterWidthSlider = 60 // narrow layout
    const hanziSize = 48
    void hanziSize

    // Syllable specs calculation simulation
    const calculateSpecs = (pinyin: string, width: number) => {
      const length = pinyin.length
      let scale = 1.0
      const tracking = -0.04
      if (length >= 5) {
        scale = 0.65
      }
      // Estimate pinyin box width (rough estimation logic)
      const letterWidth = 8
      const estimatedWidth =
        length * (letterWidth * scale) + (length - 1) * (tracking * 12)
      return {
        estimatedWidth,
        overflows: estimatedWidth > width,
      }
    }

    // "chuāng" has 6 letters. At width 60, does it fit?
    const specsNarrow = calculateSpecs('chuāng', characterWidthSlider)
    expect(specsNarrow.estimatedWidth).toBeLessThan(characterWidthSlider) // Squeezed fits!

    // If characterWidth was set extremely narrow (e.g. 20px) without squeeze it overflows
    const specsExtreme = calculateSpecs('chuāng', 20)
    expect(specsExtreme.overflows).toBe(true)
  })

  test('Scenario 5: Database Corruption & Storage Recovery', async () => {
    // 1. Simulate opening a database that throws an error
    let dbFallbackTriggered = false
    let databaseErrorMessage = ''

    const openCorruptDB = (): Promise<any> => {
      return new Promise((resolve, reject) => {
        const request = globalThis.indexedDB.open('corrupt-db', 1)
        request.onsuccess = () => {
          // Simulate database corruption error on load
          const err = new Error(
            'IndexedDB: Database file is corrupted or unreadable',
          )
          reject(err)
        }
      })
    }

    // 2. Perform DB operations with fallback recovery
    let activeSettings = { placement: 'top', characterWidth: 80 }

    try {
      await openCorruptDB()
    } catch (err: any) {
      dbFallbackTriggered = true
      databaseErrorMessage = err.message

      // Fallback: Recover using in-memory default store
      activeSettings = { placement: 'top', characterWidth: 80 } // default state
    }

    expect(dbFallbackTriggered).toBe(true)
    expect(databaseErrorMessage).toContain('corrupted')
    expect(activeSettings.characterWidth).toBe(80)
  })
})
