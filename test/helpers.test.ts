import { test, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import helpers from '../src/helpers.js'

test('setFontName(): use name from config file', () => {
  const argv = {}
  const config = { fontName: 'RFC-config-font-name' }

  const newConfig = helpers.setFontName(config, argv)
  expect(newConfig.fontName).toBe('RFC-config-font-name')
})

test('setFontName(): use name from CLI argument --font-name', () => {
  const argv = { fontName: 'RFC-cli-font-name' }
  const config = { fontName: 'RFC-config-font-name' }

  const newConfig = helpers.setFontName(config, argv)
  expect(newConfig.fontName).toBe('RFC-cli-font-name')
})

test('setDataSource(): use default path', () => {
  const argv = {}
  const config = { dataSource: './data.json' }

  const newConfig = helpers.setDataSource(config, argv)
  expect(newConfig.dataSource).toBe('./data.json')
})

test('setDataSource(): use CLI --data as path', () => {
  const argv = { data: '/tmp/../tmp/data.json' }
  const config = { dataSource: './data.json' }

  const newConfig = helpers.setDataSource(config, argv)
  expect(newConfig.dataSource).toBe('/tmp/data.json')
})

test('setBuildConfig(): use default config', async () => {
  const argv = {}
  const config = await helpers.setBuildConfig(argv)
  expect(config.layout).toBeDefined()
})

test('setBuildConfig(): use CLI --config', async () => {
  const argv = { config: './src/config/bottom.ts' }
  const config = await helpers.setBuildConfig(argv)
  expect(config.layout.annotation.anchor).toBe('bottom center')
})

beforeAll(() => {
  if (!fs.existsSync('./build')) {
    fs.mkdirSync('./build')
  }
})

test('prepare()', async () => {
  const config = { workingDir: '.whatever' }

  await helpers.prepare(config)
  expect(fs.existsSync(config.workingDir)).toBe(true)
  fs.rmdirSync(config.workingDir)
})

test('writeFont()', async () => {
  const content = 'hello'
  const destination = '.whatever.txt'

  await helpers.writeFont(content, destination)
  expect(fs.existsSync(destination)).toBe(true)
  fs.unlinkSync(destination)
})

test('generateFontFiles(): writes requested formats next to destFilename', async () => {
  const content = { ttf: 'font-data' }
  const config = {
    formats: ['ttf', 'woff2'], // woff2 not in content — must be skipped
    fontName: 'RFC-config-font-name',
    destFilename: './build/RFC-config-font-name',
  }

  await helpers.generateFontFiles(content, config)
  const directoryPath = path.resolve('./build')
  expect(fs.existsSync(`${directoryPath}/RFC-config-font-name.ttf`)).toBe(true)
  expect(fs.existsSync(`${directoryPath}/RFC-config-font-name.woff2`)).toBe(
    false,
  )
  fs.unlinkSync(`${directoryPath}/RFC-config-font-name.ttf`)
})
