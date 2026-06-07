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

const UPPER_CHARS = [
  'Ā',
  'Á',
  'Ǎ',
  'À',
  'Ē',
  'É',
  'Ě',
  'È',
  'Ī',
  'Í',
  'Ǐ',
  'Ì',
  'Ō',
  'Ó',
  'Ǒ',
  'Ò',
  'Ū',
  'Ú',
  'Ǔ',
  'Ù',
  'Ü',
  'Ǖ',
  'Ǘ',
  'Ǚ',
  'Ǜ',
]

function checkFont(path: string) {
  const buffer = fs.readFileSync(path)
  const font = opentype.parse(buffer.buffer)
  const missingLower = []
  const missingUpper = []

  for (const char of PINYIN_REQUIRED_CHARS) {
    const glyph = font.charToGlyph(char)
    if (!glyph || glyph.index === 0) {
      missingLower.push(char)
    }
  }

  for (const char of UPPER_CHARS) {
    const glyph = font.charToGlyph(char)
    if (!glyph || glyph.index === 0) {
      missingUpper.push(char)
    }
  }

  console.log(`${path}:`)
  console.log(
    `  missing lower (${missingLower.length}): ${missingLower.join(', ')}`,
  )
  console.log(
    `  missing upper (${missingUpper.length}): ${missingUpper.join(', ')}`,
  )
}

checkFont('frontend/public/resources/fonts/PT_Sans-Narrow-Web-Regular.ttf')
checkFont('frontend/public/resources/fonts/PT_Sans-Narrow-Web-Bold.ttf')
checkFont('frontend/public/resources/fonts/DroidSansFallbackFull.ttf')
