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
    return engine.getPath(text, options)
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
