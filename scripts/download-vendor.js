import fs from 'fs'
import path from 'path'
import https from 'https'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.resolve(__dirname, '..')

// Helper to download a URL to a file path
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    // Ensure parent dir exists
    const parentDir = path.dirname(dest)
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true })
    }

    console.log(`Downloading ${url} to ${dest}...`)
    https
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Follow redirect
          downloadFile(response.headers.location, dest)
            .then(resolve)
            .catch(reject)
          return
        }
        if (response.statusCode !== 200) {
          reject(
            new Error(`Failed to download ${url}: HTTP ${response.statusCode}`),
          )
          return
        }

        const fileStream = fs.createWriteStream(dest)
        response.pipe(fileStream)

        fileStream.on('finish', () => {
          fileStream.close()
          // Check file size
          const stats = fs.statSync(dest)
          if (stats.size === 0) {
            reject(new Error(`Downloaded file is empty: ${dest}`))
          } else {
            console.log(
              `Successfully downloaded: ${dest} (${stats.size} bytes)`,
            )
            resolve()
          }
        })
      })
      .on('error', (err) => {
        fs.unlink(dest, () => {}) // delete on error
        reject(err)
      })
  })
}

// Helper to copy a file
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

async function main() {
  try {
    const downloads = [
      {
        url: 'https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js',
        dest: path.join(projectRoot, 'frontend/public/vendor/opentype.min.js'),
      },
      {
        url: 'https://cdn.jsdelivr.net/npm/svg2ttf@6.0.3/svg2ttf.min.js',
        dest: path.join(projectRoot, 'frontend/public/vendor/svg2ttf.min.js'),
      },
      {
        url: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js',
        dest: path.join(
          projectRoot,
          'frontend/public/vendor/pyodide/pyodide.js',
        ),
      },
      {
        url: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.asm.js',
        dest: path.join(
          projectRoot,
          'frontend/public/vendor/pyodide/pyodide.asm.js',
        ),
      },
      {
        url: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.asm.wasm',
        dest: path.join(
          projectRoot,
          'frontend/public/vendor/pyodide/pyodide.asm.wasm',
        ),
      },
      {
        url: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide-lock.json',
        dest: path.join(
          projectRoot,
          'frontend/public/vendor/pyodide/pyodide-lock.json',
        ),
      },
      {
        url: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/python_stdlib.zip',
        dest: path.join(
          projectRoot,
          'frontend/public/vendor/pyodide/python_stdlib.zip',
        ),
      },
      {
        url: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/Brotli-1.1.0-cp312-cp312-pyodide_2024_0_wasm32.whl',
        dest: path.join(
          projectRoot,
          'frontend/public/vendor/pyodide/brotli-1.1.0-cp312-cp312-emscripten_3_1_58_wasm32.whl',
        ),
      },
      {
        url: 'https://files.pythonhosted.org/packages/a8/ae/addd7b4abf37fe47c697ccca45e00f0ec28b74f78fb14bab92d3c7f7fedd/fonttools-4.51.0-py3-none-any.whl',
        dest: path.join(
          projectRoot,
          'frontend/public/vendor/pyodide/fonttools-4.51.0-py3-none-any.whl',
        ),
      },
    ]

    for (const item of downloads) {
      await downloadFile(item.url, item.dest)
    }

    // Duplicate brotli to the actual name expected by pyodide loader
    copyFile(
      path.join(
        projectRoot,
        'frontend/public/vendor/pyodide/brotli-1.1.0-cp312-cp312-emscripten_3_1_58_wasm32.whl',
      ),
      path.join(
        projectRoot,
        'frontend/public/vendor/pyodide/Brotli-1.1.0-cp312-cp312-pyodide_2024_0_wasm32.whl',
      ),
    )

    // Local copies
    copyFile(
      path.join(projectRoot, 'resources/fonts/DroidSansFallbackFull.ttf'),
      path.join(
        projectRoot,
        'frontend/public/resources/fonts/DroidSansFallbackFull.ttf',
      ),
    )
    copyFile(
      path.join(projectRoot, 'src/data.json'),
      path.join(projectRoot, 'frontend/public/data.json'),
    )

    console.log('All dependencies prepared successfully.')
  } catch (error) {
    console.error('Failure in downloading or copying dependencies:', error)
    process.exit(1)
  }
}

main()
