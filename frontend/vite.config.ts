import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: './',
  base: './',
  define: {
    __dirname: '""',
  },
  resolve: {
    alias: {
      'text-to-svg': path.resolve(
        __dirname,
        '../node_modules/text-to-svg/index.js',
      ),
      svg2ttf: path.resolve(__dirname, '../node_modules/svg2ttf/index.js'),
      svgpath: path.resolve(__dirname, '../node_modules/svgpath/index.js'),
      path: path.resolve(__dirname, './path-shim.ts'),
    },
  },
  server: {
    port: 3000,
    open: false,
  },
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
  },
})
