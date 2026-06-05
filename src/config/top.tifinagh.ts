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
  baseFontFilepath: path.resolve(
    projectRoot,
    '../../resources/fonts/NotoSans/NotoSansTifinagh-Regular.ttf',
  ),
  annotationFontFilepath: path.resolve(
    projectRoot,
    '../../resources/fonts/NotoSans/NotoSans-Regular.hinted.ttf',
  ),
  fontName: 'RFC-Tifinagh-regular',
  formats: ['ttf', 'woff2'],
  inputFiles: './build/**/*.svg',
  workingDir: path.resolve(projectRoot, '../../build/svg'),
  get layout() {
    return {
      base: layout.base.bottom(this.canvas),
      annotation: layout.annotation.top(this.canvas),
    }
  },
}

export default config
