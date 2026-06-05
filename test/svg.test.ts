import fs from 'node:fs'
import { test, expect, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'
import svg from '../src/svg.js'

afterEach(() => {
  for (const filename of ['./test/test1.svg', './test/test2.svg']) {
    if (fs.existsSync(filename)) {
      fs.unlinkSync(filename)
    }
  }
})

test('should save data to svg file asynchronously', async () => {
  const content =
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M22.64 50.17Q15.01…"/></svg>'

  const filename = './test/test1.svg'
  await svg.save(filename, content)

  expect(fs.statSync(filename).size).toBeGreaterThan(0)
})

test('should save data to svg file', () => {
  const content =
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M22.64 50.17Q15.01…"/></svg>'

  const filename = './test/test2.svg'
  svg.saveSync(filename, content)

  expect(fs.statSync(filename).size).toBeGreaterThan(0)
})

test('wrap()', () => {
  const xml = svg.wrap('<path d="M1"/>', '<path d="M2"/>')

  const dom = new JSDOM(xml)
  expect(dom.window.document.querySelectorAll('path').length).toBe(2)
})
