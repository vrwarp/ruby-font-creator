import { test, expect } from 'vitest'
import ruby from '../src/ruby.js'
import buildConfig from '../src/config/default.js'

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
