import TextToSVG from 'text-to-svg'
import { JSDOM } from 'jsdom'
import type { LayoutAttributes } from './types.js'

export const ruby = {
  loadFont(fontFilepath: string): TextToSVG {
    return TextToSVG.loadSync(fontFilepath)
  },
  getBase(
    engine: TextToSVG,
    glyph: string = '汉字',
    options: LayoutAttributes,
  ): string {
    return engine.getPath(glyph, options)
  },
  getAnnotation(
    engine: TextToSVG,
    text: string = 'hanzi',
    options: LayoutAttributes,
  ): string {
    const pinyin = text.toLowerCase()

    // Default metrics options
    const squeezeVal = options.squeeze !== undefined ? options.squeeze : 100
    const trackingVal = options.tracking !== undefined ? options.tracking : 0
    const weightVal = options.weight !== undefined ? options.weight : 400

    const isPlacementTop = options.anchor.includes('top') || options.y < 40
    const annoAnchor = isPlacementTop ? 'top left' : 'bottom left'

    // Split letter-by-letter to compute vector tracking & squeeze
    const pinyinChars = pinyin.split('')
    const advances = pinyinChars.map((c) => {
      const metrics = engine.getMetrics(c, { fontSize: options.fontSize })
      return metrics.width
    })

    // Length-based strategy calculations
    const length = pinyinChars.length
    const userSqueeze = squeezeVal / 100
    const userTracking = trackingVal
    const userWeight = weightVal

    let scaleRatio = 1.0
    let spacingPx = 0
    let finalWeight = 400

    const strategyVal = options.strategy || 'smart'

    if (strategyVal === 'global') {
      scaleRatio = userSqueeze
      spacingPx = userTracking * options.fontSize
      finalWeight = userWeight
    } else if (strategyVal === 'smart') {
      if (length >= 5) {
        scaleRatio = userSqueeze
        spacingPx = userTracking * options.fontSize
        finalWeight = userWeight
      }
    } else if (strategyVal === 'proportional') {
      if (length === 4) {
        scaleRatio = 1.0 - (1.0 - userSqueeze) * 0.35
        spacingPx = userTracking * options.fontSize * 0.35
        finalWeight = Math.round(400 + (userWeight - 400) * 0.35)
      } else if (length >= 5) {
        scaleRatio = userSqueeze
        spacingPx = userTracking * options.fontSize
        finalWeight = userWeight
      }
    }

    const totalPinyinWidth =
      advances.reduce((a, b) => a + b, 0) * scaleRatio +
      spacingPx * (pinyinChars.length - 1)

    // Start coordinate centered around options.x
    let currentX = options.x - totalPinyinWidth / 2
    let pinyinPaths = ''

    // Weight compensation stroke calculation via path offsets
    const hasWeightComp = finalWeight > 400
    const strokeWidth = hasWeightComp ? (finalWeight - 400) / 300 : 0
    const offsets = hasWeightComp
      ? [
          { dx: 0, dy: 0 },
          { dx: -strokeWidth * 0.25, dy: 0 },
          { dx: strokeWidth * 0.25, dy: 0 },
          { dx: 0, dy: -strokeWidth * 0.25 },
          { dx: 0, dy: strokeWidth * 0.25 },
        ]
      : [{ dx: 0, dy: 0 }]

    const baseAttribs = Object.keys(options.attributes || {})
      .filter(
        (k) =>
          k !== 'stroke' &&
          k !== 'stroke-width' &&
          k !== 'stroke-linejoin' &&
          k !== 'transform',
      )
      .map((k) => `${k}="${options.attributes[k]}"`)
      .join(' ')

    pinyinChars.forEach((c, idx) => {
      const metrics = engine.getMetrics(c, {
        x: 0,
        y: options.y,
        fontSize: options.fontSize,
        anchor: annoAnchor,
      })

      const pathObj = engine.font.getPath(
        c,
        metrics.x,
        metrics.baseline,
        options.fontSize,
        { kerning: true },
      )
      const originalCommands = pathObj.commands.map((cmd: any) => ({ ...cmd }))

      offsets.forEach(({ dx, dy }, oIdx) => {
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
        const idAttr = `id="pinyin-${idx}-${oIdx}"`
        const attrs = baseAttribs ? `${baseAttribs} ${idAttr}` : idAttr
        pinyinPaths += `<path ${attrs} d="${d}"/>`
      })

      currentX += (advances[idx] + spacingPx) * scaleRatio
    })

    return pinyinPaths
  },
  getData(doc: string): string {
    const dom = new JSDOM(doc)
    const path = dom.window.document.querySelector('path')
    if (!path) {
      throw new Error('No path found in document')
    }
    const dAttr = path.attributes.getNamedItem('d')
    if (!dAttr) {
      throw new Error('No d attribute found in path')
    }
    return dAttr.value
  },
}

export default ruby
