import fs from 'node:fs'
import path from 'node:path'

// Pinned commit of BYVoid/OpenCC (resolved from master on 2026-06-10)
const OPENCC_SHA = 'da76315a31341e8a2059a5a76723acb7eaeed39a'
const BASE_URL = `https://raw.githubusercontent.com/BYVoid/OpenCC/${OPENCC_SHA}/data/dictionary`

const DICT_FILES = {
  s2t: 'STCharacters.txt',
  t2s: 'TSCharacters.txt',
}

const destDir = path.resolve(process.cwd(), 'frontend/public/data')

async function downloadText(url) {
  console.log(`Downloading: ${url}`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`)
  }
  return response.text()
}

function parseDictionary(text) {
  const map = {}
  for (const line of text.split('\n')) {
    if (line.startsWith('#')) continue
    const tabIndex = line.indexOf('\t')
    if (tabIndex === -1) continue
    const key = line.slice(0, tabIndex)
    const candidates = line
      .slice(tabIndex + 1)
      .trim()
      .split(' ')
      .filter((c) => c.length > 0)
    if (key.length === 0 || candidates.length === 0) continue
    map[key] = candidates
  }
  return map
}

async function main() {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }

  const output = {
    source: OPENCC_SHA,
    license: 'Apache-2.0 (OpenCC)',
    s2t: {},
    t2s: {},
  }

  for (const [key, file] of Object.entries(DICT_FILES)) {
    const text = await downloadText(`${BASE_URL}/${file}`)
    output[key] = parseDictionary(text)
    console.log(`Parsed ${file}: ${Object.keys(output[key]).length} entries`)
  }

  const destPath = path.join(destDir, 'variants.json')
  fs.writeFileSync(destPath, JSON.stringify(output))
  const { size } = fs.statSync(destPath)
  console.log(`Wrote ${destPath} (${size} bytes)`)
}

main().catch((err) => {
  console.error('Error downloading OpenCC dictionaries:', err)
  process.exit(1)
})
