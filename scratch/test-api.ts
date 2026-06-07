import TextToSVG from 'text-to-svg'
import path from 'node:path'
import ruby from '../src/ruby.js'

const fontPath = path.resolve(
  process.cwd(),
  'resources/fonts/DroidSansFallbackFull.ttf',
)
const fontEngine = TextToSVG.loadSync(fontPath)

const char = { glyph: '奇', ruby: 'qí' }
const layout = {
  placement: 'top',
  verticalOffset: 4,
  opticalSqueeze: 65,
  fontWeight: 500,
  letterTracking: -0.04,
  strategy: 'smart',
  pinyinSize: 13,
  hanziSize: 48,
}

const isPlacementTop = layout.placement === 'top'
const baseLineY = isPlacementTop ? 92 : -4
const baseAnchor = isPlacementTop ? 'bottom center' : 'top center'
const annoLineY = isPlacementTop
  ? -4 - layout.verticalOffset
  : 92 + layout.verticalOffset
const annoAnchor = isPlacementTop ? 'top center' : 'bottom center'

let scaleX = 100
let letterSpacing = 0
let weight = 400

const length = char.ruby.length // 'qí' length is 2
if (layout.strategy === 'global') {
  scaleX = layout.opticalSqueeze
  letterSpacing = layout.letterTracking
  weight = layout.fontWeight
} else if (layout.strategy === 'smart') {
  if (length >= 5) {
    scaleX = layout.opticalSqueeze
    letterSpacing = layout.letterTracking
    weight = layout.fontWeight
  }
}

const baseSvgPath = ruby.getBase(fontEngine, char.glyph, {
  x: 40,
  y: baseLineY,
  fontSize: 56,
  anchor: baseAnchor,
  attributes: {
    fill: 'currentColor',
    id: 'glyph',
  },
})

const pinyinFontSize = Math.round(56 * (layout.pinyinSize / layout.hanziSize))

const pinyinPaths = ruby.getAnnotation(fontEngine, char.ruby, {
  x: 40,
  y: annoLineY,
  fontSize: pinyinFontSize,
  anchor: annoAnchor,
  attributes: {
    fill: 'currentColor',
    id: 'annotation',
  },
  squeeze: scaleX,
  tracking: letterSpacing,
  weight: weight,
})

const svgContent = `<svg width="80" height="80" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  ${baseSvgPath}
  ${pinyinPaths}
</svg>`

console.log(svgContent)
