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
    // Pinyin column to the RIGHT of the glyph, rotated 90° clockwise so it
    // reads top-to-bottom. The rotation is baked into the path coordinates
    // (see ruby.getAnnotation) rather than emitted as an SVG transform, so it
    // survives the in-browser compiler, which only re-scales path `d` data.
    right: (options: CanvasDimensions): LayoutAttributes => ({
      x: options.width - 2,
      y: options.height / 2,
      fontSize: 22,
      anchor: 'top center',
      rotate: 90,
      attributes: { fill: 'black', stroke: 'black', id: 'annotation' },
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
    // Glyph shifted to the LEFT to leave room for a rotated pinyin column on
    // the right (mirror of `base.right`).
    left: (options: CanvasDimensions): LayoutAttributes => ({
      x: options.width / 2 - 13,
      y: options.height,
      fontSize: 52,
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
