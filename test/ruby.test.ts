import { test, expect } from 'vitest'
import ruby from '../src/ruby.js'
import buildConfig from '../src/config/default.js'
import layout from '../src/layouts.js'

// Crude bounding box over the absolute commands emitted by toPathData (M/L/Q/C).
function pathBoundingBox(svg: string) {
  const ds = [...svg.matchAll(/d="([^"]*)"/g)].map((m) => m[1])
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const d of ds) {
    const toks = d.match(/[MLQCZ]|-?\d+\.?\d*/g) || []
    let i = 0
    let cmd = ''
    const pt = (x: number, y: number) => {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    const n = (k: number) => parseFloat(toks[k])
    while (i < toks.length) {
      const t = toks[i]
      if (/[A-Z]/.test(t)) {
        cmd = t
        i++
        continue
      }
      if (cmd === 'M' || cmd === 'L') {
        pt(n(i), n(i + 1))
        i += 2
      } else if (cmd === 'Q') {
        pt(n(i), n(i + 1))
        pt(n(i + 2), n(i + 3))
        i += 4
      } else if (cmd === 'C') {
        pt(n(i), n(i + 1))
        pt(n(i + 2), n(i + 3))
        pt(n(i + 4), n(i + 5))
        i += 6
      } else {
        i++
      }
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

test('loadFont()', () => {
  const engine = ruby.loadFont(buildConfig.fontFilepath!)
  expect(engine.font.names.fontFamily.en).toBeDefined()
})

test('should extract path data', () => {
  const doc =
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M22.64 50.17Q15.01…"/></svg>'

  const data = ruby.getData(doc)

  expect(data).toBe('M22.64 50.17Q15.01…')
})

test('should create svg <path> with text', () => {
  const engine = ruby.loadFont(buildConfig.fontFilepath!)
  const glyph = '北'

  const doc = ruby.getBase(engine, glyph, buildConfig.layout.base)
  const data = ruby.getData(doc)

  expect(data.length > 0).toBe(true)
})

test('should create svg <path> with annotation', () => {
  const engine = ruby.loadFont(buildConfig.fontFilepath!)
  const text = 'běi'

  const doc = ruby.getAnnotation(engine, text, buildConfig.layout.annotation)
  const data = ruby.getData(doc)

  expect(data.length > 0).toBe(true)
})

test('rotate option turns a horizontal run into a vertical column', () => {
  const engine = ruby.loadFont(buildConfig.fontFilepath!)
  const text = 'chuáng'

  const horizontal = ruby.getAnnotation(engine, text, {
    x: 40,
    y: 40,
    fontSize: 22,
    anchor: 'top center',
    attributes: { id: 'annotation' },
  })
  const rotated = ruby.getAnnotation(engine, text, {
    x: 40,
    y: 40,
    fontSize: 22,
    anchor: 'top center',
    rotate: 90,
    attributes: { id: 'annotation' },
  })

  const hBox = pathBoundingBox(horizontal)
  const rBox = pathBoundingBox(rotated)

  // The unrotated multi-letter run is wider than tall.
  expect(hBox.width).toBeGreaterThan(hBox.height)
  // After a 90° rotation the column is taller than wide, and its extents are
  // roughly the horizontal run's swapped (rotation preserves size).
  expect(rBox.height).toBeGreaterThan(rBox.width)
  expect(rBox.height).toBeCloseTo(hBox.width, 0)
  expect(rBox.width).toBeCloseTo(hBox.height, 0)
})

test('layout.annotation.right keeps the rotated column within the canvas', () => {
  const engine = ruby.loadFont(buildConfig.fontFilepath!)
  const canvas = { width: 80, height: 80 }

  const doc = ruby.getAnnotation(
    engine,
    'chuáng',
    layout.annotation.right(canvas),
  )
  const box = pathBoundingBox(doc)

  // Vertical column on the right half, contained within the 80×80 canvas.
  expect(box.height).toBeGreaterThan(box.width)
  expect(box.minX).toBeGreaterThan(canvas.width / 2)
  expect(box.maxX).toBeLessThanOrEqual(canvas.width)
  expect(box.minY).toBeGreaterThanOrEqual(0)
  expect(box.maxY).toBeLessThanOrEqual(canvas.height)
})
