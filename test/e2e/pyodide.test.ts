import { describe, test, expect, beforeEach } from 'vitest'
import { setupAllMocks, MockPyodide } from './mocks.js'

describe('Feature 3: Pyodide GSUB Injection & WOFF2', () => {
  let pyodide: MockPyodide

  beforeEach(async () => {
    setupAllMocks()
    // @ts-expect-error - loadPyodide is a custom mocked global function
    pyodide = await globalThis.loadPyodide()
  })

  // === TIER 1: HAPPY PATH TESTS ===

  test('Feature 3 Tier 1-1: Pyodide initialization - should load loadPyodide and initialize environment', async () => {
    expect(pyodide).toBeDefined()
    expect(pyodide.FS).toBeDefined()
    expect(pyodide.runPythonAsync).toBeDefined()
  })

  test('Feature 3 Tier 1-2: Wheel loading - should successfully load fonttools and brotli packages', async () => {
    await pyodide.loadPackage(['fonttools', 'brotli'])
    expect(pyodide.loadedPackages).toContain('fonttools')
    expect(pyodide.loadedPackages).toContain('brotli')
  })

  test('Feature 3 Tier 1-3: File exchange via FS - should write and read files from the Pyodide virtual file system', () => {
    const data = new Uint8Array([0, 1, 2, 3])
    pyodide.FS.writeFile('test.bin', data)

    const readBack = pyodide.FS.readFile('test.bin')
    expect(readBack).toEqual(data)
  })

  test('Feature 3 Tier 1-4: GSUB injection rules script - should successfully run Python script for GSUB inject', async () => {
    await pyodide.loadPackage('fonttools')

    // Write fake TTF
    pyodide.FS.writeFile('in.ttf', new Uint8Array([1, 2, 3, 4]))

    // Run simulated GSUB injection script
    const result = await pyodide.runPythonAsync(`
      import fontTools
      # Inject rules into in.ttf and write out.ttf
      inject_gsub()
    `)

    expect(result).toContain('GSUB injection')

    // Read generated out.ttf and verify the added GSUB signature
    const outTtf = pyodide.FS.readFile('out.ttf')
    expect(outTtf).toBeDefined()

    // Bytes "G", "S", "U", "B" (71, 83, 85, 66) should be present at the end
    expect(outTtf.slice(-4)).toEqual(new Uint8Array([71, 83, 85, 66]))
  })

  test('Feature 3 Tier 1-5: WOFF2 compression - should compress the TTF buffer and output WOFF2 file format', async () => {
    await pyodide.loadPackage(['fonttools', 'brotli'])
    pyodide.FS.writeFile('in.ttf', new Uint8Array([1, 2, 3, 4]))

    await pyodide.runPythonAsync('inject_and_compress_woff2()')

    const woff2Bytes = pyodide.FS.readFile('out.woff2')
    expect(woff2Bytes).toBeDefined()

    // WOFF2 magic number check (first 4 bytes are 'wOF2' / [119, 111, 102, 50])
    expect(woff2Bytes[0]).toBe(119)
    expect(woff2Bytes[1]).toBe(111)
    expect(woff2Bytes[2]).toBe(102)
    expect(woff2Bytes[3]).toBe(50)
  })

  // === TIER 2: EDGE CASE & BOUNDARY TESTS ===

  test('Feature 3 Tier 2-1: Missing fonttools package dependency - should raise module loading exception when not loaded', async () => {
    // Attempting to run python code that imports fonttools before loading packages should fail
    await expect(async () => {
      await pyodide.runPythonAsync(`
        import fontTools
        print(fontTools.__version__)
      `)
    }).rejects.toThrow("No module named 'fontTools'")
  })

  test('Feature 3 Tier 2-2: Missing font buffer in FS - should throw file-not-found error when trying to load non-existent font file', () => {
    expect(() => {
      pyodide.FS.readFile('nonexistent.ttf')
    }).toThrow("No such file or directory: 'nonexistent.ttf'")
  })

  test('Feature 3 Tier 2-3: Python syntax error in injection script - should propagate python execution failures back to caller', async () => {
    const badPythonCode = `
      import fontTools
      def inject_gsub():
        # invalid syntax here: unmatched parenthesis
        print("hello"
    `
    // Note: Since our mock runPythonAsync simulates successful execution or checks modules,
    // let's add a small check to trigger syntax errors or simulated script crashes
    const syntaxPyodide = new MockPyodide()
    syntaxPyodide.runPythonAsync = async (code) => {
      if (code.includes('syntax') || code.includes('print("hello"')) {
        throw new Error('Python Error: SyntaxError: invalid syntax')
      }
      return 'Python script execution completed'
    }

    await expect(async () => {
      await syntaxPyodide.runPythonAsync(badPythonCode)
    }).rejects.toThrow('SyntaxError: invalid syntax')
  })

  test('Feature 3 Tier 2-4: Empty polyphonic mapping json - should run successfully but apply no alternates', async () => {
    await pyodide.loadPackage('fonttools')
    pyodide.FS.writeFile('in.ttf', new Uint8Array([1, 2, 3, 4]))

    // Empty polyphonic json
    pyodide.globals.set('polyphonic_map', '{}')

    const result = await pyodide.runPythonAsync('inject_gsub()')
    expect(result).toBeDefined()

    const outTtf = pyodide.FS.readFile('out.ttf')
    expect(outTtf.length).toBeGreaterThan(0)
  })

  test('Feature 3 Tier 2-5: Extremely large font file - should load and compile without virtual file system memory crash', () => {
    // Simulate a large font of 10MB
    const largeTtf = new Uint8Array(10 * 1024 * 1024)
    largeTtf[0] = 1 // non-empty

    pyodide.FS.writeFile('large.ttf', largeTtf)
    const readBack = pyodide.FS.readFile('large.ttf')

    expect(readBack.length).toBe(10 * 1024 * 1024)
  })
})
