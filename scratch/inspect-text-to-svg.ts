import TextToSVG from 'text-to-svg'
import path from 'node:path'

const fontPath = path.resolve(
  process.cwd(),
  'resources/fonts/DroidSansFallbackFull.ttf',
)
const engine = TextToSVG.loadSync(fontPath)

console.log(
  'TextToSVG prototype methods:',
  Object.getOwnPropertyNames(Object.getPrototypeOf(engine)),
)
console.log('TextToSVG instance keys:', Object.keys(engine))
