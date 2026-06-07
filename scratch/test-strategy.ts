import TextToSVG from 'text-to-svg'
import path from 'node:path'

const fontPath = path.resolve(
  process.cwd(),
  'resources/fonts/DroidSansFallbackFull.ttf',
)
const engine = TextToSVG.loadSync(fontPath)

const syllables = [
  'qí',
  'yì',
  'ēn',
  'diǎn',
  'hé',
  'děng',
  'gān',
  'tián',
  'qiáng',
  'chuāng',
]
const fontSize = 15
const limit = fontSize * 2.2 // 33px

console.log(`Limit threshold: ${limit}px\n`)

for (const syl of syllables) {
  const pinyinChars = syl.split('')
  const advances = pinyinChars.map((c) => {
    const metrics = engine.getMetrics(c, { fontSize })
    return metrics.width
  })

  const unsqueezedWidth = advances.reduce((a, b) => a + b, 0)

  // Smart
  let smartSqueeze = 1.0
  if (unsqueezedWidth > limit) {
    smartSqueeze = 0.65
  }

  // Proportional
  let propSqueeze = 1.0
  if (unsqueezedWidth > limit) {
    const required = limit / unsqueezedWidth
    propSqueeze = Math.max(0.65, Math.min(1.0, required))
  }

  console.log(`Syllable: "${syl}"`)
  console.log(`  Unsqueezed Width: ${unsqueezedWidth.toFixed(2)}px`)
  console.log(`  Smart Squeeze: ${smartSqueeze * 100}%`)
  console.log(`  Proportional Squeeze: ${(propSqueeze * 100).toFixed(1)}%`)
}
