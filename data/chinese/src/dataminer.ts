import fs from 'node:fs'

export interface ConvertOptions {
  separator: string
  headers: string[]
}

export interface JsonEntry {
  codepoint: string
  ruby: string
  glyph: string
}

export const dataminer = {
  convertToJson(filepath: string, options: ConvertOptions): JsonEntry[] {
    return String(fs.readFileSync(filepath))
      .split('\n')
      .filter((line) => line.substring(0, 2) === 'U+')
      .map((line) => this.getGlyph(line, options))
  },

  getGlyph(line: string, options: ConvertOptions): JsonEntry {
    const parts = line.split(options.separator)
    const codepoint = parts[0]
    const ruby = parts[1]?.trim() || ''
    const unicodeCodepoint = codepoint.split('+')[1]
    const hexCodepoint = parseInt(unicodeCodepoint, 16)
    const glyph = String.fromCodePoint(hexCodepoint)
    return { codepoint, ruby, glyph }
  },

  save(filepath: string, content: JsonEntry[] = []): void {
    fs.writeFileSync(filepath, JSON.stringify(content, null, 2), 'utf-8')
  },
}

export default dataminer
