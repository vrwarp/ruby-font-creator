import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'

const PYODIDE_VERSION = '0.26.1'
const BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full`

// List of core Pyodide assets to download
const PYODIDE_FILES = [
  'pyodide.js',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'pyodide-lock.json',
  'python_stdlib.zip',
]

// List of Pyodide-compatible wheels to download.
// These are standard Python packages pre-compiled/packed for Emscripten by Pyodide.
const PYTHON_WHEELS = [
  'fonttools-4.51.0-py3-none-any.whl',
  // Brotli wheel specifically compiled for Pyodide v0.26.1 (Python 3.12 Pyodide WASM)
  'Brotli-1.1.0-cp312-cp312-pyodide_2024_0_wasm32.whl',
]

const destDir = path.resolve(process.cwd(), 'frontend/public/pyodide')

async function downloadFile(url, destPath) {
  console.log(`Downloading: ${url} -> ${destPath}`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`)
  }
  const fileStream = fs.createWriteStream(destPath)
  await finished(Readable.fromWeb(response.body).pipe(fileStream))
}

async function main() {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }

  for (const file of PYODIDE_FILES) {
    const url = `${BASE_URL}/${file}`
    const dest = path.join(destDir, file)
    await downloadFile(url, dest)
  }

  for (const wheel of PYTHON_WHEELS) {
    const url = `${BASE_URL}/${wheel}`
    const dest = path.join(destDir, wheel)
    await downloadFile(url, dest)
  }

  console.log('Successfully vendored Pyodide and wheels!')
}

main().catch((err) => {
  console.error('Error downloading assets:', err)
  process.exit(1)
})
