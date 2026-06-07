import TextToSVG from 'text-to-svg'
import path from 'node:path'

const fontPath = path.resolve(
  process.cwd(),
  'resources/fonts/DroidSansFallbackFull.ttf',
)
const engine = TextToSVG.loadSync(fontPath)

const p1 = engine.getPath('q', {
  x: 0,
  y: 0,
  fontSize: 10,
  anchor: 'top center',
})

const p2 = engine.getPath('q', {
  x: 40,
  y: 50,
  fontSize: 10,
  anchor: 'top center',
})

console.log('p1:', p1)
console.log('p2:', p2)
