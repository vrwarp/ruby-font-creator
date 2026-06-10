import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.resolve(__dirname, '..')

// Synchronizes shared assets from the repository into the static frontend
// directory (frontend/public/) so the PWA serves the same data and fonts as
// the CLI builder. Runtime JS dependencies (opentype.js, svg2ttf, svgpath)
// are bundled by Vite from node_modules; the Pyodide runtime is handled by
// scripts/download-pyodide.js.

function copyFile(src, dest) {
  const parentDir = path.dirname(dest)
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true })
  }
  console.log(`Copying ${src} to ${dest}...`)
  fs.copyFileSync(src, dest)
  const stats = fs.statSync(dest)
  if (stats.size === 0) {
    throw new Error(`Copied file is empty: ${dest}`)
  }
  console.log(`Successfully copied: ${dest} (${stats.size} bytes)`)
}

function main() {
  try {
    const copies = [
      ['src/data.json', 'frontend/public/data.json'],
      [
        'resources/fonts/DroidSansFallbackFull.ttf',
        'frontend/public/resources/fonts/DroidSansFallbackFull.ttf',
      ],
      [
        'resources/fonts/PT_Sans-Narrow-Web-Regular.ttf',
        'frontend/public/resources/fonts/PT_Sans-Narrow-Web-Regular.ttf',
      ],
      [
        'resources/fonts/PT_Sans-Narrow-Web-Bold.ttf',
        'frontend/public/resources/fonts/PT_Sans-Narrow-Web-Bold.ttf',
      ],
    ]

    for (const [src, dest] of copies) {
      copyFile(path.join(projectRoot, src), path.join(projectRoot, dest))
    }

    console.log('All frontend assets prepared successfully.')
  } catch (error) {
    console.error('Failure preparing frontend assets:', error)
    process.exit(1)
  }
}

main()
