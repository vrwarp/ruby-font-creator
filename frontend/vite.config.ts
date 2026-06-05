import { defineConfig } from 'vite'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import TextToSVG from 'text-to-svg'
import ttf2woff2 from 'ttf2woff2'
import ruby from '../src/ruby.js'

export default defineConfig({
  root: './',
  base: './',
  server: {
    port: 3000,
    open: false,
  },
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
  },
  plugins: [
    {
      name: 'font-builder-api',
      configureServer(server) {
        // Load font engine on startup
        const fontPath = path.resolve(
          process.cwd(),
          'resources/fonts/DroidSansFallbackFull.ttf',
        )
        let fontEngine: TextToSVG | null = null
        try {
          fontEngine = TextToSVG.loadSync(fontPath)
        } catch (e) {
          console.error('Failed to load base font for server previews:', e)
        }

        // Serve the build/ directory directly for downloading built fonts
        server.middlewares.use((req, res, next) => {
          if (req.url) {
            const cleanUrl = req.url.split('?')[0]
            if (cleanUrl.startsWith('/build/')) {
              const urlPath = decodeURIComponent(cleanUrl)
              const filePath = path.join(process.cwd(), urlPath)
              if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                const ext = path.extname(filePath)
                const contentType =
                  ext === '.ttf'
                    ? 'font/ttf'
                    : ext === '.woff2'
                      ? 'font/woff2'
                      : 'application/octet-stream'
                res.writeHead(200, {
                  'Content-Type': contentType,
                  'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
                })
                fs.createReadStream(filePath).pipe(res)
                return
              }
            }
          }
          next()
        })

        // API route to list generated fonts
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/list-fonts' && req.method === 'GET') {
            try {
              const buildDir = path.resolve(process.cwd(), 'build')
              let fontNames: string[] = []
              if (fs.existsSync(buildDir)) {
                const files = fs.readdirSync(buildDir)
                // Filter for .ttf files and strip extensions, ignoring any symbol files
                const ttfFiles = files.filter(
                  (f) => f.endsWith('.ttf') && !f.endsWith('.symbol.ttf'),
                )
                fontNames = ttfFiles.map((f) => path.basename(f, '.ttf'))
              }
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(fontNames))
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: err.message }))
            }
            return
          }
          next()
        })

        // API route to build font
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/build-font' && req.method === 'POST') {
            let body = ''
            req.on('data', (chunk) => {
              body += chunk
            })
            req.on('end', () => {
              try {
                const {
                  placement,
                  verticalOffset,
                  opticalSqueeze,
                  fontWeight,
                  letterTracking,
                  pinyinSize,
                  hanziSize,
                  fontName,
                  strategy,
                  characterWidth,
                  enablePolyphonic,
                } = JSON.parse(body)

                const sanitizedFontName = (fontName || 'ruby-font').replace(
                  /[^a-zA-Z0-9-_]/g,
                  '',
                )

                const calculatedPinyinFontSize = Math.round(
                  56 * (pinyinSize / hanziSize),
                )

                const configPath = path.resolve(
                  process.cwd(),
                  'src/config/web-temp.ts',
                )
                const configContent = `import path from 'node:path'
import type { BuildConfig } from '../types.js'

const projectRoot = import.meta.dirname

const config: BuildConfig = {
  canvas: { width: ${characterWidth || 80}, height: 80 },
  dataSource: path.resolve(projectRoot, '../data.json'),
  get destFilename() {
    return path.resolve(projectRoot, \`../../build/\${this.fontName}\`)
  },
  fontFilepath: path.resolve(
    projectRoot,
    '../../resources/fonts/DroidSansFallbackFull.ttf',
  ),
  fontName: '${sanitizedFontName}',
  formats: ['ttf', 'woff2'],
  inputFiles: './build/**/*.svg',
  workingDir: path.resolve(projectRoot, '../../build/svg'),
  get layout() {
    return {
      base: {
        x: this.canvas.width / 2,
        y: ${placement === 'top' ? 'this.canvas.height + 12' : '56'},
        fontSize: 56,
        anchor: 'bottom center',
        attributes: { fill: 'black', stroke: 'black', id: 'glyph' }
      },
      annotation: {
        x: this.canvas.width / 2,
        y: ${placement === 'top' ? `-4 - ${verticalOffset}` : `this.canvas.height + 12 + ${verticalOffset}`},
        fontSize: ${calculatedPinyinFontSize},
        anchor: 'top center',
        attributes: {
          fill: 'black',
          stroke: 'black',
          id: 'annotation',
        },
        squeeze: ${opticalSqueeze},
        tracking: ${letterTracking.toFixed(3)},
        weight: ${fontWeight},
        strategy: '${strategy || 'smart'}'
      }
    }
  }
}

export default config
`
                // Write config file
                fs.writeFileSync(configPath, configContent, 'utf-8')

                // Execute the builder command
                const cmd = `NODE_OPTIONS="--max-old-space-size=8192" npx tsx ./index.ts --config ./src/config/web-temp.ts`
                res.writeHead(200, {
                  'Content-Type': 'application/json',
                  'Transfer-Encoding': 'chunked',
                })

                res.write(
                  JSON.stringify({
                    status: 'started',
                    message: 'Compilation started...',
                  }) + '\n',
                )

                const processSpawn = exec(cmd, { cwd: process.cwd() })

                processSpawn.stdout?.on('data', (data) => {
                  res.write(
                    JSON.stringify({
                      status: 'building',
                      log: data.toString(),
                    }) + '\n',
                  )
                })

                processSpawn.stderr?.on('data', (data) => {
                  res.write(
                    JSON.stringify({
                      status: 'building',
                      log: data.toString(),
                    }) + '\n',
                  )
                })

                processSpawn.on('close', (code) => {
                  if (code === 0) {
                    if (enablePolyphonic) {
                      res.write(
                        JSON.stringify({
                          status: 'building',
                          log: '\nInjecting GSUB rules for polyphonic Chinese characters...\n',
                        }) + '\n',
                      )
                      const injectCmd = `python3 scripts/inject-gsub.py build/${sanitizedFontName}.ttf build/polyphonic-map.json`
                      exec(
                        injectCmd,
                        { cwd: process.cwd() },
                        (err, stdout, stderr) => {
                          if (stdout) {
                            res.write(
                              JSON.stringify({
                                status: 'building',
                                log: stdout,
                              }) + '\n',
                            )
                          }
                          if (stderr) {
                            res.write(
                              JSON.stringify({
                                status: 'building',
                                log: stderr,
                              }) + '\n',
                            )
                          }
                          if (err) {
                            res.write(
                              JSON.stringify({
                                status: 'error',
                                message: `GSUB injection failed: ${err.message}`,
                              }) + '\n',
                            )
                            res.end()
                            return
                          }

                          // Convert TTF to WOFF2 using the Node library to ensure it gets the GSUB rules too
                          try {
                            res.write(
                              JSON.stringify({
                                status: 'building',
                                log: 'Re-generating WOFF2 font with GSUB features...\n',
                              }) + '\n',
                            )
                            const ttfPath = path.resolve(
                              process.cwd(),
                              `build/${sanitizedFontName}.ttf`,
                            )
                            const woff2Path = path.resolve(
                              process.cwd(),
                              `build/${sanitizedFontName}.woff2`,
                            )
                            const ttfBuffer = fs.readFileSync(ttfPath)
                            const woff2Buffer = ttf2woff2(ttfBuffer)
                            fs.writeFileSync(woff2Path, woff2Buffer)
                            res.write(
                              JSON.stringify({
                                status: 'building',
                                log: 'WOFF2 font updated.\n',
                              }) + '\n',
                            )
                          } catch (convErr: any) {
                            res.write(
                              JSON.stringify({
                                status: 'building',
                                log: `Warning: WOFF2 compression failed: ${convErr.message}\n`,
                              }) + '\n',
                            )
                          }

                          res.write(
                            JSON.stringify({
                              status: 'success',
                              message:
                                'Font built successfully with GSUB features!',
                              files: {
                                ttf: `/build/${sanitizedFontName}.ttf`,
                                woff2: `/build/${sanitizedFontName}.woff2`,
                              },
                            }) + '\n',
                          )
                          res.end()
                        },
                      )
                    } else {
                      res.write(
                        JSON.stringify({
                          status: 'success',
                          message: 'Font built successfully!',
                          files: {
                            ttf: `/build/${sanitizedFontName}.ttf`,
                            woff2: `/build/${sanitizedFontName}.woff2`,
                          },
                        }) + '\n',
                      )
                      res.end()
                    }
                  } else {
                    res.write(
                      JSON.stringify({
                        status: 'error',
                        message: `Compilation failed with exit code ${code}`,
                      }) + '\n',
                    )
                    res.end()
                  }
                })
              } catch (err: any) {
                res.writeHead(500, { 'Content-Type': 'application/json' })
                res.end(
                  JSON.stringify({ status: 'error', message: err.message }),
                )
              }
            })
            return
          }
          next()
        })

        // API route to render SVG previews using backend text-to-svg and ruby.ts
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/render-preview' && req.method === 'POST') {
            let body = ''
            req.on('data', (chunk) => {
              body += chunk
            })
            req.on('end', () => {
              try {
                if (!fontEngine) {
                  throw new Error('Font engine not initialized on server')
                }

                const { glyphs, layout } = JSON.parse(body)
                const characterWidth = layout.characterWidth || 80
                const centerVal = characterWidth / 2
                const isPlacementTop = layout.placement === 'top'
                const baseLineY = isPlacementTop ? 92 : -4
                const baseAnchor = isPlacementTop
                  ? 'bottom center'
                  : 'top center'
                const annoLineY = isPlacementTop
                  ? -4 - layout.verticalOffset
                  : 92 + layout.verticalOffset
                const annoAnchor = isPlacementTop
                  ? 'top center'
                  : 'bottom center'

                const responseData = glyphs.map(
                  (char: { glyph: string; ruby: string }) => {
                    // Render base glyph using text-to-svg outline
                    const baseSvgPath = ruby.getBase(fontEngine!, char.glyph, {
                      x: centerVal,
                      y: baseLineY,
                      fontSize: 56,
                      anchor: baseAnchor,
                      attributes: {
                        fill: 'currentColor',
                        id: 'glyph',
                      },
                    })

                    // Calculate correct scaled pinyin size matching preview ratio
                    const pinyinSize = layout.pinyinSize || 13
                    const hanziSize = layout.hanziSize || 48
                    const pinyinFontSize = Math.round(
                      56 * (pinyinSize / hanziSize),
                    )

                    // Render annotation pinyin letter-by-letter to emulate tracking & squeeze
                    const pinyinPaths = ruby.getAnnotation(
                      fontEngine!,
                      char.ruby,
                      {
                        x: centerVal,
                        y: annoLineY,
                        fontSize: pinyinFontSize,
                        anchor: annoAnchor,
                        attributes: {
                          fill: 'currentColor',
                          id: 'annotation',
                        },
                        squeeze: layout.opticalSqueeze,
                        tracking: layout.letterTracking,
                        weight: layout.fontWeight,
                        strategy: layout.strategy,
                      },
                    )

                    const svgContent = `<svg width="${characterWidth}" height="80" viewBox="0 0 ${characterWidth} 80" xmlns="http://www.w3.org/2000/svg">
                      ${baseSvgPath}
                      ${pinyinPaths}
                    </svg>`

                    return {
                      glyph: char.glyph,
                      ruby: char.ruby,
                      svg: svgContent,
                    }
                  },
                )

                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify(responseData))
              } catch (err: any) {
                res.writeHead(500, { 'Content-Type': 'application/json' })
                res.end(
                  JSON.stringify({ status: 'error', message: err.message }),
                )
              }
            })
            return
          }
          next()
        })
      },
    },
  ],
})
