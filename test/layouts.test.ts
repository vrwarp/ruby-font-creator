import { test, expect } from 'vitest'
import layout from '../src/layouts.js'

test('verify layout.annotation.top attributes', () => {
  const svgAttributes = layout.annotation.top({ width: 80, height: 80 })

  expect(svgAttributes.x).toBeDefined()
  expect(svgAttributes.y).toBeDefined()
  expect(svgAttributes.fontSize).toBeDefined()
  expect(svgAttributes.anchor).toBeDefined()
  expect(svgAttributes.attributes).toEqual({
    id: 'annotation',
    fill: 'black',
    stroke: 'black',
  })
})

test('verify layout.annotation.right is a 90° clockwise rotated column', () => {
  const svgAttributes = layout.annotation.right({ width: 80, height: 80 })

  expect(svgAttributes.x).toBeDefined()
  expect(svgAttributes.y).toBeDefined()
  expect(svgAttributes.fontSize).toBeDefined()
  expect(svgAttributes.anchor).toBeDefined()
  // Rotation is baked into the path coordinates (not an SVG transform) so it
  // survives the in-browser compiler, which only re-scales path `d` data.
  expect(svgAttributes.rotate).toBe(90)
  // Column hugs the right edge and is vertically centred.
  expect(svgAttributes.x).toBeGreaterThan(40)
  expect(svgAttributes.y).toBe(40)
  expect(svgAttributes.attributes).toEqual({
    id: 'annotation',
    fill: 'black',
    stroke: 'black',
  })
})

test('verify layout.base.left attributes', () => {
  const svgAttributes = layout.base.left({ width: 80, height: 80 })

  expect(svgAttributes.x).toBeDefined()
  expect(svgAttributes.y).toBeDefined()
  expect(svgAttributes.fontSize).toBeDefined()
  expect(svgAttributes.anchor).toBeDefined()
  // Glyph is shifted left of centre to leave room for the right-hand column.
  expect(svgAttributes.x).toBeLessThan(40)
  expect(svgAttributes.attributes).toEqual({
    id: 'glyph',
    fill: 'black',
    stroke: 'black',
  })
})

test('verify layout.base.bottom attributes', () => {
  const svgAttributes = layout.base.bottom({ width: 80, height: 80 })

  expect(svgAttributes.x).toBeDefined()
  expect(svgAttributes.y).toBeDefined()
  expect(svgAttributes.fontSize).toBeDefined()
  expect(svgAttributes.anchor).toBeDefined()
  expect(svgAttributes.attributes).toEqual({
    id: 'glyph',
    fill: 'black',
    stroke: 'black',
  })
})
