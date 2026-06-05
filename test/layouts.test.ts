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
