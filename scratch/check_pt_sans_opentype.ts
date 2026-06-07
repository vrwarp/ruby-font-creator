import fs from 'node:fs'
import opentype from 'opentype.js'

const PINYIN_REQUIRED_CHARS = [
  'ā',
  'á',
  'ǎ',
  'à',
  'ē',
  'é',
  'ě',
  'è',
  'ī',
  'í',
  'ǐ',
  'ì',
  'ō',
  'ó',
  'ǒ',
  'ò',
  'ū',
  'ú',
  'ǔ',
  'ù',
  'ü',
  'ǖ',
  'ǘ',
  'ǚ',
  'ǜ',
]

function checkFont(filepath: string) {
  const buffer = fs.readFileSync(filepath)
  const font = opentype.parse(buffer.buffer)
  console.log(`\nFont (opentype.js): ${filepath}`)
  for (const char of PINYIN_REQUIRED_CHARS) {
    const glyph = font.charToGlyph(char)
    const hasGlyph = glyph && glyph.index > 0
    console.log(
      `  Character ${char} (U+${char.charCodeAt(0).toString(16).padStart(4, '0')}): ${hasGlyph ? 'present' : 'absent'} (index: ${glyph ? glyph.index : 'none'})`,
    )
  }
}

checkFont('frontend/public/resources/fonts/PT_Sans-Narrow-Web-Regular.ttf')
checkFont('frontend/public/resources/fonts/PT_Sans-Narrow-Web-Bold.ttf')
