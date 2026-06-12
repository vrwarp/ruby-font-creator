import { describe, it, expect } from 'vitest'

// Unit tests for the browser-side glue of the AI glyph-generation pipeline:
// SVG path flattening and the patch request plumbing (against MockPyodide).
// The vectorizer itself is covered in test/vectorizer.test.ts, the variant
// planning in test/variants.test.ts, and the real fontTools patching in
// test/patch-font.test.ts.

describe('compiler - flattenSvgPath', () => {
  it('flattens M/L/Z polygons into contours', async () => {
    const { flattenSvgPath } = await import('../frontend/compiler.js')
    const contours = flattenSvgPath(
      'M 1 2 L 11 2 L 11 12 Z M 20 20 L 24 20 L 24 24 Z',
    )
    expect(contours.length).toBe(2)
    expect(contours[0]).toEqual([
      { x: 1, y: 2 },
      { x: 11, y: 2 },
      { x: 11, y: 12 },
    ])
    expect(contours[1].length).toBe(3)
  })

  it('samples cubic Bezier segments into polyline points', async () => {
    const { flattenSvgPath } = await import('../frontend/compiler.js')
    const contours = flattenSvgPath('M 0 0 C 10 0, 10 10, 0 10 Z')
    expect(contours.length).toBe(1)
    // 1 moveto point + 8 sampled bezier points
    expect(contours[0].length).toBe(9)
    const last = contours[0][contours[0].length - 1]
    expect(last.x).toBeCloseTo(0)
    expect(last.y).toBeCloseTo(10)
    // curve bulges to the right of the start point
    expect(Math.max(...contours[0].map((p) => p.x))).toBeGreaterThan(5)
  })

  it('handles decimal coordinates without a Z terminator', async () => {
    const { flattenSvgPath } = await import('../frontend/compiler.js')
    const contours = flattenSvgPath('M 1.5 2.25 L 3.75 4.5')
    expect(contours).toEqual([
      [
        { x: 1.5, y: 2.25 },
        { x: 3.75, y: 4.5 },
      ],
    ])
  })
})

describe('compiler - patchChineseFontInBrowser', () => {
  it('round-trips a patch spec through the (mocked) Pyodide runtime', async () => {
    const { setupAllMocks } = await import('./e2e/mocks.js')
    setupAllMocks()

    const { patchChineseFontInBrowser } =
      await import('../frontend/compiler.js')
    const fontBytes = new Uint8Array([1, 2, 3, 4])
    const result = await patchChineseFontInBrowser(
      fontBytes,
      {
        aliases: [{ cp: 0x7231, toCp: 0x611b }],
        glyphs: [
          {
            cp: 0x4e66,
            svgPath: 'M 10 10 L 100 10 L 100 100 L 10 100 Z',
            targetCp: 0x66f8,
          },
        ],
      },
      () => {},
    )
    expect(result).toBeDefined()
    // MockPyodide copies /chinese_font.ttf to /chinese_font_patched.ttf
    expect(Array.from(result)).toEqual([1, 2, 3, 4])
  })
})
