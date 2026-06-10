import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { compileTtf } from './src/compile.js'
import helpers from './src/helpers.js'
import {
  getAlternateGlyphEntries,
  buildPolyphonicMap,
} from './src/polyphonic.js'
import ruby from './src/ruby.js'
import type { GlyphEntry, CliArguments } from './src/types.js'

const require = createRequire(import.meta.url)

async function start(cliArguments: CliArguments): Promise<void> {
  let config = await helpers.setBuildConfig(cliArguments)
  config = helpers.setDataSource(config, cliArguments)
  config = helpers.setFontName(config, cliArguments)

  const rawData = await readFile(config.dataSource, 'utf-8')
  const data: GlyphEntry[] = JSON.parse(rawData)
  const allEntries = [...data, ...getAlternateGlyphEntries()]

  const baseEngine = ruby.loadFont(
    config.baseFontFilepath ?? config.fontFilepath!,
  )
  const annotationEngine = ruby.loadFont(
    config.annotationFontFilepath ?? config.fontFilepath!,
  )

  // Compile entirely in memory: the previous svgtofont pipeline wrote one
  // SVG file per glyph and opened them all concurrently, which exhausts
  // file-descriptor limits at full dataset size (26k+ glyphs).
  const startedAt = Date.now()
  const ttf = compileTtf(
    allEntries,
    config,
    baseEngine,
    annotationEngine,
    (msg) => process.stdout.write(msg),
  )
  console.log(
    `compiled ${allEntries.length} glyphs to TTF in ${((Date.now() - startedAt) / 1000).toFixed(1)}s (${(ttf.length / 1e6).toFixed(1)} MB)`,
  )

  const outputs: Record<string, Uint8Array> = {}
  if (config.formats.includes('ttf')) {
    outputs.ttf = ttf
  }
  if (config.formats.includes('woff2')) {
    console.log('compressing WOFF2...')
    const wawoff2 = require('wawoff2')
    outputs.woff2 = await wawoff2.compress(ttf)
  }

  const distDir = path.dirname(config.destFilename)
  await mkdir(distDir, { recursive: true })
  await helpers.generateFontFiles(outputs, config)

  const polyMap = buildPolyphonicMap(data)
  await writeFile(
    path.join(distDir, 'polyphonic-map.json'),
    JSON.stringify(polyMap, null, 2),
  )
  console.log(`wrote: ${path.join(distDir, 'polyphonic-map.json')}`)
}

const argv = yargs(hideBin(process.argv))
  .option('config', {
    alias: 'c',
    type: 'string',
    description: 'Path to configuration file',
  })
  .option('data', {
    alias: 'd',
    type: 'string',
    description: 'Path to data JSON file',
  })
  .option('fontName', {
    alias: 'n',
    type: 'string',
    description: 'Font name',
  })
  .parseSync()

start(argv as CliArguments).catch((err) => {
  console.error(err)
  process.exit(1)
})
