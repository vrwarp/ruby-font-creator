import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import svg2ttf from 'svg2ttf'
import svgpath from 'svgpath'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { GLOSS_ENTRIES } from './src/gloss-data.js'
import {
  DEFAULT_GLOSS_LAYOUT,
  buildGlossPlan,
  composeAsciiGlyph,
  composeWordGlyph,
} from './src/gloss.js'
import ruby from './src/ruby.js'

// Canvas (80 units tall) → 1000 UPM font units, ascent 800 / descent −200;
// the y-flip converts SVG's y-down to font y-up. Same convention as the
// browser compiler (frontend/compiler.ts).
const SCALE = 12.5
const ASCENT = 800
const DESCENT = -200

const projectRoot = import.meta.dirname

interface EnglishCliArguments {
  fontName?: string
  baseFont?: string
  glossFont?: string
  out?: string
}

function xmlGlyph(
  name: string,
  codepoint: number,
  dCanvas: string,
  advanceCanvas: number,
): string {
  const scaled = dCanvas
    ? svgpath(dCanvas).scale(SCALE, -SCALE).translate(0, ASCENT).toString()
    : ''
  const advance = Math.round(advanceCanvas * SCALE)
  // svg2ttf requires a d attribute on every <glyph>; blank glyphs (space) get
  // an empty path.
  return `\n  <glyph unicode="&#x${codepoint.toString(16)};" glyph-name="${name}" horiz-adv-x="${advance}" d="${scaled}" />`
}

async function start(args: EnglishCliArguments): Promise<void> {
  const fontName = args.fontName ?? 'english-gloss'
  const baseFontPath =
    args.baseFont ??
    path.resolve(projectRoot, 'resources/fonts/PT_Sans-Narrow-Web-Regular.ttf')
  const glossFontPath =
    args.glossFont ??
    path.resolve(projectRoot, 'resources/fonts/DroidSansFallbackFull.ttf')
  const outDir = args.out ?? path.resolve(projectRoot, 'build/english')

  const baseEngine = ruby.loadFont(baseFontPath)
  const glossEngine = ruby.loadFont(glossFontPath)
  const layout = DEFAULT_GLOSS_LAYOUT

  const plan = buildGlossPlan(GLOSS_ENTRIES)
  let glyphsXml = ''

  // Plain ASCII glyphs on the reduced baseline, so unglossed text lines up
  // with the composites.
  let asciiCount = 0
  for (let cp = 0x20; cp <= 0x7e; cp++) {
    const char = String.fromCodePoint(cp)
    const { d, advance } = composeAsciiGlyph(baseEngine, char, layout)
    glyphsXml += xmlGlyph(
      `u${cp.toString(16).padStart(4, '0')}`,
      cp,
      cp === 0x20 ? '' : d,
      advance,
    )
    asciiCount++
  }

  // Word composites at PUA codepoints, reachable only via GSUB.
  for (const job of plan.jobs) {
    const { d, advance } = composeWordGlyph(
      baseEngine,
      glossEngine,
      job.text,
      job.gloss,
      layout,
    )
    const cp = parseInt(job.codepoint.replace('U+', ''), 16)
    glyphsXml += xmlGlyph(`u${cp.toString(16).toUpperCase()}`, cp, d, advance)
  }

  const svgFontString = `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" >
<svg xmlns="http://www.w3.org/2000/svg">
<defs>
<font id="${fontName}" horiz-adv-x="500">
  <font-face font-family="${fontName}" units-per-em="1000" ascent="${ASCENT}" descent="${DESCENT}" />
  <missing-glyph horiz-adv-x="500" />${glyphsXml}
</font>
</defs>
</svg>`

  await mkdir(outDir, { recursive: true })
  console.log(
    `composed ${plan.jobs.length + asciiCount} glyphs (${Math.round(svgFontString.length / 1e6)} MB SVG font); running svg2ttf...`,
  )
  const ttf = svg2ttf(svgFontString, {})
  const ttfPath = path.join(outDir, `${fontName}.ttf`)
  await writeFile(ttfPath, Buffer.from(ttf.buffer))
  console.log(
    `wrote: ${ttfPath} (${asciiCount} ASCII + ${plan.jobs.length} composite glyphs)`,
  )

  const mapPath = path.join(outDir, 'gloss-map.json')
  await writeFile(mapPath, JSON.stringify(plan.map, null, 2))
  console.log(`wrote: ${mapPath} (${plan.map.length} words)`)

  const previewPath = path.join(outDir, 'preview.html')
  await writeFile(previewPath, buildPreviewHtml(fontName))
  console.log(`wrote: ${previewPath}`)
  console.log(
    `next: python3 scripts/inject-gloss-gsub.py ${ttfPath} ${mapPath}`,
  )
}

function buildPreviewHtml(fontName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${fontName} preview</title>
<style>
  @font-face { font-family: '${fontName}'; src: url('./${fontName}.ttf'); }
  body { font-family: '${fontName}'; font-size: 40px; line-height: 1.6; margin: 2rem; }
  p { margin: 0.5rem 0; }
</style>
</head>
<body>
<p>Praise God with joy and singing</p>
<p>Amazing grace, how sweet the sound</p>
<p>The ancient scientists discovered that knowledge requires patience</p>
<p>Although the environment continues changing, communities develop practical solutions</p>
<p>river bank / bank / hot spring / spring / traffic light / movie star</p>
<p>Sunday morning we sing a new song together</p>
<p>lovely clove glovebank (no substitution inside words)</p>
</body>
</html>
`
}

const argv = yargs(hideBin(process.argv))
  .option('fontName', {
    alias: 'n',
    type: 'string',
    description: 'Font name',
  })
  .option('baseFont', {
    type: 'string',
    description: 'Latin base font path',
  })
  .option('glossFont', {
    type: 'string',
    description: 'CJK gloss font path',
  })
  .option('out', {
    type: 'string',
    description: 'Output directory',
  })
  .parseSync()

start(argv as EnglishCliArguments).catch((err) => {
  console.error(err)
  process.exit(1)
})
