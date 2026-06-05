import type { CanvasDimensions, LayoutAttributes } from './types.js'

export interface LayoutConfig {
  annotation: Record<string, (options: CanvasDimensions) => LayoutAttributes>
  base: Record<string, (options: CanvasDimensions) => LayoutAttributes>
}

const layouts: LayoutConfig = {
  annotation: {
    bottom: (options: CanvasDimensions): LayoutAttributes => ({
      x: options.width / 2,
      y: options.height + 12,
      fontSize: 28,
      anchor: 'bottom center',
      attributes: { fill: 'black', stroke: 'black', id: 'annotation' },
    }),
    left: (options: CanvasDimensions): LayoutAttributes => ({
      x: 1,
      y: (options.height * 1.5) / 2,
      fontSize: 24,
      anchor: 'left center',
      attributes: {
        fill: 'black',
        stroke: 'black',
        id: 'glyph',
        transform: `rotate(-90, 24, ${options.height / 2}) translate(0, ${-(
          24 + 1
        )})`,
      },
    }),
    top: (options: CanvasDimensions): LayoutAttributes => ({
      x: options.width / 2,
      y: -4,
      fontSize: 28,
      anchor: 'top center',
      attributes: { fill: 'black', stroke: 'black', id: 'annotation' },
    }),
  },
  base: {
    bottom: (options: CanvasDimensions): LayoutAttributes => ({
      x: options.width / 2,
      y: options.height + 12,
      fontSize: 56,
      anchor: 'bottom center',
      attributes: { fill: 'black', stroke: 'black', id: 'glyph' },
    }),
    right: (options: CanvasDimensions): LayoutAttributes => ({
      x: options.width / 2 + 10,
      y: options.height,
      fontSize: 64,
      anchor: 'bottom center',
      attributes: { fill: 'black', stroke: 'black', id: 'glyph' },
    }),
    top: (options: CanvasDimensions): LayoutAttributes => ({
      x: options.width / 2,
      y: -4,
      fontSize: 56,
      anchor: 'top center',
      attributes: { fill: 'black', stroke: 'black', id: 'glyph' },
    }),
  },
}

export default layouts
