import opentype from 'opentype.js'
import type { LayoutAttributes } from './types.js'

function parseAnchorOption(anchor: string) {
  const horizontalMatch = anchor.match(/left|center|right/gi)
  const horizontal = horizontalMatch ? horizontalMatch[0].toLowerCase() : 'left'

  const verticalMatch = anchor.match(/baseline|top|bottom|middle/gi)
  const vertical = verticalMatch ? verticalMatch[0].toLowerCase() : 'baseline'

  return {
    horizontal,
    vertical,
  }
}

export class TextToSVG {
  font: opentype.Font

  constructor(font: opentype.Font) {
    this.font = font
  }

  static loadSync(file: string): TextToSVG {
    return new TextToSVG(opentype.loadSync(file))
  }

  getWidth(text: string, options: any = {}): number {
    const fontSize = options.fontSize || 72
    const kerning = 'kerning' in options ? options.kerning : true
    const fontScale = (1 / this.font.unitsPerEm) * fontSize

    let width = 0
    const glyphs = this.font.stringToGlyphs(text)
    for (let i = 0; i < glyphs.length; i++) {
      const glyph = glyphs[i]

      if (glyph.advanceWidth) {
        width += glyph.advanceWidth * fontScale
      }

      if (kerning && i < glyphs.length - 1) {
        const kerningValue = this.font.getKerningValue(glyph, glyphs[i + 1])
        width += kerningValue * fontScale
      }

      if (options.letterSpacing) {
        width += options.letterSpacing * fontSize
      } else if (options.tracking) {
        width += (options.tracking / 1000) * fontSize
      }
    }
    return width
  }

  getHeight(fontSize: number): number {
    const fontScale = (1 / this.font.unitsPerEm) * fontSize
    return (this.font.ascender - this.font.descender) * fontScale
  }

  getMetrics(text: string, options: any = {}): any {
    const fontSize = options.fontSize || 72
    const anchor = parseAnchorOption(options.anchor || '')

    const width = this.getWidth(text, options)
    const height = this.getHeight(fontSize)

    const fontScale = (1 / this.font.unitsPerEm) * fontSize
    const ascender = this.font.ascender * fontScale
    const descender = this.font.descender * fontScale

    let x = options.x || 0
    switch (anchor.horizontal) {
      case 'left':
        x -= 0
        break
      case 'center':
        x -= width / 2
        break
      case 'right':
        x -= width
        break
      default:
        throw new Error(`Unknown anchor option: ${anchor.horizontal}`)
    }

    let y = options.y || 0
    switch (anchor.vertical) {
      case 'baseline':
        y -= ascender
        break
      case 'top':
        y -= 0
        break
      case 'middle':
        y -= height / 2
        break
      case 'bottom':
        y -= height
        break
      default:
        throw new Error(`Unknown anchor option: ${anchor.vertical}`)
    }

    const baseline = y + ascender

    return {
      x,
      y,
      baseline,
      width,
      height,
      ascender,
      descender,
    }
  }

  getD(text: string, options: any = {}): string {
    const fontSize = options.fontSize || 72
    const kerning = 'kerning' in options ? options.kerning : true
    const metrics = this.getMetrics(text, options)
    const path = this.font.getPath(
      text,
      metrics.x,
      metrics.baseline,
      fontSize,
      {
        kerning,
      },
    )
    return path.toPathData(2)
  }

  getPath(text: string, options: any = {}): string {
    const attributes = Object.keys(options.attributes || {})
      .map((key) => `${key}="${options.attributes[key]}"`)
      .join(' ')
    const d = this.getD(text, options)

    if (attributes) {
      return `<path ${attributes} d="${d}"/>`
    }
    return `<path d="${d}"/>`
  }
}

export const ruby = {
  loadFont(source: string | ArrayBuffer): TextToSVG {
    let font: opentype.Font
    if (typeof source === 'string') {
      font = opentype.loadSync(source)
    } else {
      // Support browser array buffer parsing
      font = opentype.parse(source)
    }
    return new TextToSVG(font)
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

    // Strokes are replaced by the weight-compensation offsets above, but
    // transforms (e.g. the rotated left/right layouts) must be preserved.
    const baseAttribs = Object.keys(options.attributes || {})
      .filter(
        (k) =>
          k !== 'stroke' && k !== 'stroke-width' && k !== 'stroke-linejoin',
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

        const d = pathObj.toPathData(2)
        const idAttr = `id="pinyin-${idx}-${oIdx}"`
        const attrs = baseAttribs ? `${baseAttribs} ${idAttr}` : idAttr
        pinyinPaths += `<path ${attrs} d="${d}"/>`
      })

      // Glyphs are squeezed but tracking is applied post-squeeze, matching
      // the totalPinyinWidth used to centre the annotation above.
      currentX += advances[idx] * scaleRatio + spacingPx
    })

    return pinyinPaths
  },
  getData(doc: string): string {
    const match = doc.match(/<path[^>]*\s+d=["']([^"']+)["']/i)
    if (!match) {
      throw new Error('No path found in document')
    }
    return match[1]
  },
}

export default ruby
