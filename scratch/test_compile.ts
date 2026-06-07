import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ruby from '../src/ruby.js'
import svg from '../src/svg.js'
import helpers from '../src/helpers.js'

async function run() {
  const config = {
    canvas: { width: 80, height: 80 },
    dataSource: path.resolve('./src/data.json'),
    destFilename: path.resolve('./build/test-pt-sans'),
    fontFilepath: path.resolve('./resources/fonts/DroidSansFallbackFull.ttf'),
    annotationFontFilepath: path.resolve(
      './resources/fonts/PT_Sans-Narrow-Web-Regular.ttf',
    ),
    fontName: 'test-pt-sans',
    formats: ['ttf'],
    inputFiles: './build/**/*.svg',
    workingDir: path.resolve('./build/svg-test'),
    layout: {
      base: {
        x: 40,
        y: 92,
        fontSize: 56,
        anchor: 'bottom center',
        attributes: { fill: 'black', id: 'glyph' },
      },
      annotation: {
        x: 40,
        y: -4,
        fontSize: 13,
        anchor: 'top center',
        attributes: { fill: 'black', id: 'annotation' },
        squeeze: 65,
        tracking: -0.04,
        weight: 500,
        strategy: 'smart',
      },
    },
  }

  await helpers.prepare(config)

  const rawData = await readFile(config.dataSource, 'utf-8')
  const data = JSON.parse(rawData).slice(0, 5) // test first 5 entries

  const baseEngine = ruby.loadFont(config.fontFilepath)
  const annotationEngine = ruby.loadFont(config.annotationFontFilepath)

  for (const char of data) {
    console.log(`Generating glyph for ${char.glyph} (${char.ruby})...`)
    const baseSvg = ruby.getBase(baseEngine, char.glyph, config.layout.base)
    const annoSvg = ruby.getAnnotation(
      annotationEngine,
      char.ruby,
      config.layout.annotation,
    )
    const svgContent = svg.wrap(baseSvg, annoSvg, config.canvas)
    const unicode = char.codepoint.replace('U+', 'u').toLowerCase()
    svg.save(`${config.workingDir}/${unicode}-${char.glyph}.svg`, svgContent)
  }
  console.log('Success!')
}

run().catch(console.error)
