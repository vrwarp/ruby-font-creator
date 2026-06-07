import TextToSVG from 'text-to-svg'
import path from 'node:path'
import ruby from '../src/ruby.js'
import fs from 'node:fs'

const fontPath = path.resolve(
  process.cwd(),
  'resources/fonts/DroidSansFallbackFull.ttf',
)
const fontEngine = TextToSVG.loadSync(fontPath)

const line = {
  hanzi: '奇异恩典何等甘甜',
  pinyin: ['qí', 'yì', 'ēn', 'diǎn', 'hé', 'děng', 'gān', 'tián'],
}

let result =
  '<svg width="800" height="200" xmlns="http://www.w3.org/2000/svg" style="background:#0b1120; color:white;">'

line.hanzi.split('').forEach((char, idx) => {
  const pinyin = line.pinyin[idx]

  // Render base
  const base = ruby.getBase(fontEngine, char, {
    x: 40 + idx * 80,
    y: 92,
    fontSize: 56,
    anchor: 'bottom center',
    attributes: { fill: 'currentColor' },
  })

  // Render annotation
  const annotation = ruby.getAnnotation(fontEngine, pinyin, {
    x: 40 + idx * 80,
    y: -8,
    fontSize: 15,
    anchor: 'top center',
    attributes: { fill: 'currentColor' },
  })

  result += `\n<g id="char-${idx}">\n${base}\n${annotation}\n</g>`
})

result += '\n</svg>'
fs.writeFileSync('scratch/slide-preview.svg', result)
console.log('Saved scratch/slide-preview.svg')
