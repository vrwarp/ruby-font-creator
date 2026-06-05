import fs from 'node:fs'
import type { CanvasDimensions } from './types.js'

export const svg = {
  saveSync(filename: string, content: string): void {
    fs.writeFileSync(filename, content)
  },
  save(filename: string, content: string): void {
    fs.writeFileSync(filename, content)
  },
  wrap(
    text: string,
    annotation: string,
    options: CanvasDimensions = { width: 80, height: 80 },
  ): string {
    return `<svg width="${options.width}" height="${options.height}">
        ${text}
        ${annotation}
      </svg>`
  },
}

export default svg
