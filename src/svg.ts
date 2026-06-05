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
    return `<svg width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" xmlns="http://www.w3.org/2000/svg">
        ${text}
        ${annotation}
      </svg>`
  },
}

export default svg
