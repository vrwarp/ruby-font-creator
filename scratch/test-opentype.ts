import TextToSVG from 'text-to-svg'
import path from 'node:path'

const fontPath = path.resolve(
  process.cwd(),
  'resources/fonts/DroidSansFallbackFull.ttf',
)
const engine = TextToSVG.loadSync(fontPath)

const text = 'qí'
const options = {
  fontSize: 15,
  anchor: 'top center',
  y: -8,
  squeeze: 70,
  tracking: 0.09,
  weight: 800,
}

const pinyinChars = text.split('')
const advances = pinyinChars.map((c) => {
  const metrics = engine.getMetrics(c, { fontSize: options.fontSize })
  return metrics.width
})

const spacingPx = options.tracking * options.fontSize
const scaleRatio = options.squeeze / 100
const totalPinyinWidth =
  advances.reduce((a, b) => a + b, 0) + spacingPx * (pinyinChars.length - 1)

let currentX = 40 - (totalPinyinWidth * scaleRatio) / 2
let pinyinPaths = ''

const strokeWidth = (options.weight - 400) / 300
const offsets = [
  { dx: 0, dy: 0 },
  { dx: -strokeWidth * 0.25, dy: 0 },
  { dx: strokeWidth * 0.25, dy: 0 },
  { dx: 0, dy: -strokeWidth * 0.25 },
  { dx: 0, dy: strokeWidth * 0.25 },
]

pinyinChars.forEach((c, idx) => {
  const metrics = engine.getMetrics(c, {
    x: 0,
    y: options.y,
    fontSize: options.fontSize,
    anchor: 'top center',
  })

  const pathObj = engine.font.getPath(
    c,
    metrics.x,
    metrics.baseline,
    options.fontSize,
    { kerning: true },
  )
  const originalCommands = pathObj.commands.map((cmd: any) => ({ ...cmd }))

  offsets.forEach(({ dx, dy }) => {
    pathObj.commands = originalCommands.map((cmd: any) => {
      const newCmd = { ...cmd }
      if (newCmd.x !== undefined)
        newCmd.x = newCmd.x * scaleRatio + currentX + dx
      if (newCmd.y !== undefined) newCmd.y = newCmd.y + dy
      if (newCmd.x1 !== undefined)
        newCmd.x1 = newCmd.x1 * scaleRatio + currentX + dx
      if (newCmd.y1 !== undefined) newCmd.y1 = newCmd.y1 + dy
      if (newCmd.x2 !== undefined)
        newCmd.x2 = newCmd.x2 * scaleRatio + currentX + dx
      if (newCmd.y2 !== undefined) newCmd.y2 = newCmd.y2 + dy
      return newCmd
    })

    const d = pathObj.toPathData()
    pinyinPaths += `<path d="${d}"/>\n`
  })

  currentX += (advances[idx] + spacingPx) * scaleRatio
})

console.log(pinyinPaths.substring(0, 1000))
