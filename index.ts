import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const cheerio = require('cheerio')
if (cheerio && !cheerio.default) {
  cheerio.default = cheerio
}

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import _svgtofont from 'svgtofont'
const svgtofont = ((_svgtofont as any).default || _svgtofont) as (
  options: any,
) => Promise<void>
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import helpers from './src/helpers.js'
import ruby from './src/ruby.js'
import svg from './src/svg.js'
import type { BuildConfig, GlyphEntry, CliArguments } from './src/types.js'

async function generateSvg(
  data: GlyphEntry[],
  config: BuildConfig,
): Promise<void> {
  const baseEngine = ruby.loadFont(
    config.baseFontFilepath ?? config.fontFilepath!,
  )
  const annotationEngine = ruby.loadFont(
    config.annotationFontFilepath ?? config.fontFilepath!,
  )

  for (const char of data) {
    const svgContent = svg.wrap(
      ruby.getBase(baseEngine, char.glyph, config.layout.base),
      ruby.getAnnotation(annotationEngine, char.ruby, config.layout.annotation),
    )

    const unicode = char.codepoint.replace('U+', 'u')
    svg.save(`${config.workingDir}/${unicode}-${char.glyph}.svg`, svgContent)
  }
}

async function buildFont(config: BuildConfig): Promise<void> {
  const distDir = path.dirname(config.destFilename)
  await svgtofont({
    src: config.workingDir,
    dist: distDir,
    fontName: config.fontName,
    startUnicode: 0x3400,
    svgicons2svgfont: {
      fontHeight: 1000,
      normalize: true,
    },
    website: null,
  })
}

async function start(cliArguments: CliArguments): Promise<void> {
  let config = await helpers.setBuildConfig(cliArguments)
  config = helpers.setDataSource(config, cliArguments)
  config = helpers.setFontName(config, cliArguments)

  const rawData = await readFile(config.dataSource, 'utf-8')
  const data: GlyphEntry[] = JSON.parse(rawData)

  await helpers.prepare(config)
  await generateSvg(data, config)
  await buildFont(config)
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
