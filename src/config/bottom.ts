import path from 'node:path'
import layout from '../layouts.js'
import type { BuildConfig } from '../types.js'

const projectRoot = import.meta.dirname

const config: BuildConfig = {
  canvas: { width: 80, height: 80 },
  dataSource: path.resolve(projectRoot, '../data.json'),
  get destFilename() {
    return path.resolve(projectRoot, `../../build/${this.fontName}`)
  },
  fontFilepath: path.resolve(
    projectRoot,
    '../../resources/fonts/DroidSansFallbackFull.ttf',
  ),
  fontName: 'ruby-font-creator',
  formats: ['ttf', 'woff2'],
  get layout() {
    return {
      base: layout.base.top(this.canvas),
      annotation: layout.annotation.bottom(this.canvas),
    }
  },
}

export default config
