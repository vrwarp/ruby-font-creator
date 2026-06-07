import fs from 'node:fs'

const content = fs.readFileSync('frontend/main.ts', 'utf8')
const match = content.match(
  /const PINYIN_REQUIRED_CHARS = \[\s*([\s\S]*?)\s*\]/,
)
if (match) {
  const charsText = match[1]
  const chars = charsText
    .split(',')
    .map((s) => s.trim().replace(/['"]/g, ''))
    .filter(Boolean)
  for (const c of chars) {
    const codePoints = Array.from(c).map(
      (ch) => 'U+' + ch.charCodeAt(0).toString(16).padStart(4, '0'),
    )
    console.log(`Char: ${c} (len: ${c.length}) -> ${codePoints.join(', ')}`)
  }
} else {
  console.log('PINYIN_REQUIRED_CHARS not found in main.ts')
}
