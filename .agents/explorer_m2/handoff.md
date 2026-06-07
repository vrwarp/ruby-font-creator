# Handoff Report - Milestone 2: Dependency Vendoring & PWA Setup

## 1. Observation

Direct observations and evidence obtained from filesystem tools:

### Existing Configurations and Dependencies

- **`package-lock.json` Dependency Versions**:
  - `opentype.js` is locked to version `1.3.4`:
    ````json
    "opentype.js": "^1.3.4",
    ``` (line 12)
    ````
  - `svg2ttf` is locked to version `6.0.3`:
    ````json
    "svg2ttf": "^6.0.3",
    ``` (line 13)
    ````
- **`frontend/index.html` CDN Reference**:
  - `opentype.js` is loaded from a CDN on line 20:
    ```html
    <script src="https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js"></script>
    ```
- **Vite Server configuration (`frontend/vite.config.ts`)**:
  - Root directory configuration (line 16): `root: './'`
  - Output directory configuration (line 23): `outDir: '../dist-web'`
- **Vite Build Scripts (`package.json`)**:
  - Dev script (line 19): `"dev": "vite frontend"`
  - Build script (line 18): `"build:web": "vite build frontend"`
- **Python requirements (`scripts/requirements.txt`)**:
  - Python dependencies specify (line 1): `fonttools>=4.0.0`
- **Missing Directories/Files**:
  - A directory for vendored dependencies (`frontend/vendor` or similar) does not exist yet.
  - A web app manifest (`manifest.json`) and service worker (`sw.js`) do not exist yet.

---

## 2. Logic Chain

1. **Vite Routing and Static Serving**:
   - Because `vite` is run with the `frontend` folder as the root, standard Vite behavior designates `<root>/public/` (i.e., `frontend/public/`) as the static files directory.
   - Files placed in `frontend/public/` are served at the root URL path `/` during development and are automatically copied to `dist-web/` as-is during production builds.
   - Therefore, to achieve offline capability in both dev and prod without complex Vite configurations, all vendored files, the Service Worker, and the Web Manifest should be placed in `frontend/public/` rather than `frontend/` or a custom folder.

2. **Required Dependency Selection**:
   - **`opentype.js` (v1.3.4)**: Selected to align with the existing lockfile definition (`package-lock.json:12`) and the CDN script currently in use.
   - **`svg2ttf` (v6.0.3)**: Selected to align with the existing lockfile definition (`package-lock.json:13`). We download the UMD browser bundle `svg2ttf.min.js`.
   - **Pyodide (v0.26.1)**: Selected as a modern stable Pyodide WebAssembly runtime. It runs Python 3.12.1.
   - **`fonttools` (v4.51.0)**: Required by the injector. We download the standard platform-independent pure Python wheel (`.whl`) from PyPI.
   - **`brotli` (v1.1.0)**: Required by `fonttools` for WOFF2 compression. Since it has C extensions, we must load the WebAssembly/Emscripten-compiled wheel distributed specifically for Pyodide v0.26.1 (cp312).

3. **Offline Caching (Service Worker)**:
   - For 100% network-independent offline capability, the Service Worker `sw.js` must intercept requests to local resources and return cached files (Cache-First strategy).
   - The large resources (Pyodide runtime, wheels, base font `DroidSansFallbackFull.ttf`, and the character dictionary `data.json`) must be cached on the service worker's `install` event to allow immediate offline functionality.

---

## 3. Caveats

- **Initial Download Size**: Precaching all local dependencies including the base font (`DroidSansFallbackFull.ttf` ~15MB) and Pyodide runtime + wheels (~15MB total) will require ~30MB download on first page visit. This is expected and necessary for 100% offline network independence.
- **Vite Hashed Assets**: The JS and CSS build bundles are hashed by Vite (e.g., `index-a1b2c3d4.js`). To handle this:
  - Option A: Configure Vite's rollup options to disable hashing for entry files (making them consistently named `/assets/index.js` and `/assets/index.css`).
  - Option B: Implement runtime cache interception inside `sw.js` so it caches files dynamically as they are loaded, keeping the main layout cached. Option A is recommended for predictability.

---

## 4. Conclusion

We must implement a localized public assets vendor structure to support 100% network independence. Below is the proposed list of files, URLs, local target paths, manifest configuration, service worker structure, and registration scripts.

### 4.1. Download Source & Target Paths

The vendored files must be downloaded and stored under `frontend/public/`:

| Asset / File                          | Source URL                                                                                                                                     | Local Target Path                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **opentype.min.js** (v1.3.4)          | `https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js`                                                                          | `frontend/public/vendor/opentype.min.js`                                               |
| **svg2ttf.min.js** (v6.0.3)           | `https://cdn.jsdelivr.net/npm/svg2ttf@6.0.3/dist/svg2ttf.min.js`                                                                               | `frontend/public/vendor/svg2ttf.min.js`                                                |
| **pyodide.js** (v0.26.1)              | `https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js`                                                                                     | `frontend/public/vendor/pyodide/pyodide.js`                                            |
| **pyodide.asm.js** (v0.26.1)          | `https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.asm.js`                                                                                 | `frontend/public/vendor/pyodide/pyodide.asm.js`                                        |
| **pyodide.asm.wasm** (v0.26.1)        | `https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.asm.wasm`                                                                               | `frontend/public/vendor/pyodide/pyodide.asm.wasm`                                      |
| **pyodide-lock.json** (v0.26.1)       | `https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide-lock.json`                                                                              | `frontend/public/vendor/pyodide/pyodide-lock.json`                                     |
| **python_stdlib.zip** (v0.26.1)       | `https://cdn.jsdelivr.net/pyodide/v0.26.1/full/python_stdlib.zip`                                                                              | `frontend/public/vendor/pyodide/python_stdlib.zip`                                     |
| **fonttools-4.51.0-py3-none-any.whl** | `https://files.pythonhosted.org/packages/c8/17/7492c68612140be05b76b2512f45cc23522f7b8ea00e626e5d263914a1a3/fonttools-4.51.0-py3-none-any.whl` | `frontend/public/vendor/pyodide/fonttools-4.51.0-py3-none-any.whl`                     |
| **brotli-1.1.0-...\_wasm32.whl**      | `https://cdn.jsdelivr.net/pyodide/v0.26.1/full/brotli-1.1.0-cp312-cp312-emscripten_3_1_58_wasm32.whl`                                          | `frontend/public/vendor/pyodide/brotli-1.1.0-cp312-cp312-emscripten_3_1_58_wasm32.whl` |
| **DroidSansFallbackFull.ttf** (base)  | (Copy from local filesystem)                                                                                                                   | `frontend/public/resources/fonts/DroidSansFallbackFull.ttf`                            |
| **data.json** (character mapping)     | (Copy from local filesystem)                                                                                                                   | `frontend/public/data.json`                                                            |

---

### 4.2. Automated Asset Downloader (`scripts/download-vendor.js`)

We propose adding this Node.js script to allow the developer to fetch/setup all local resources easily:

```javascript
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'

const VENDOR_DIR = path.resolve('frontend/public/vendor')
const PYODIDE_DIR = path.join(VENDOR_DIR, 'pyodide')
const FONT_DIR = path.resolve('frontend/public/resources/fonts')

const downloads = [
  {
    url: 'https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js',
    dest: path.join(VENDOR_DIR, 'opentype.min.js'),
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/svg2ttf@6.0.3/dist/svg2ttf.min.js',
    dest: path.join(VENDOR_DIR, 'svg2ttf.min.js'),
  },
  {
    url: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js',
    dest: path.join(PYODIDE_DIR, 'pyodide.js'),
  },
  {
    url: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.asm.js',
    dest: path.join(PYODIDE_DIR, 'pyodide.asm.js'),
  },
  {
    url: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.asm.wasm',
    dest: path.join(PYODIDE_DIR, 'pyodide.asm.wasm'),
  },
  {
    url: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide-lock.json',
    dest: path.join(PYODIDE_DIR, 'pyodide-lock.json'),
  },
  {
    url: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/python_stdlib.zip',
    dest: path.join(PYODIDE_DIR, 'python_stdlib.zip'),
  },
  {
    url: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/brotli-1.1.0-cp312-cp312-emscripten_3_1_58_wasm32.whl',
    dest: path.join(
      PYODIDE_DIR,
      'brotli-1.1.0-cp312-cp312-emscripten_3_1_58_wasm32.whl',
    ),
  },
  {
    url: 'https://files.pythonhosted.org/packages/c8/17/7492c68612140be05b76b2512f45cc23522f7b8ea00e626e5d263914a1a3/fonttools-4.51.0-py3-none-any.whl',
    dest: path.join(PYODIDE_DIR, 'fonttools-4.51.0-py3-none-any.whl'),
  },
]

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(
            new Error(`Failed to download ${url}: HTTP ${response.statusCode}`),
          )
          return
        }
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          console.log(`Downloaded: ${path.basename(dest)}`)
          resolve()
        })
      })
      .on('error', (err) => {
        fs.unlink(dest, () => {})
        reject(err)
      })
  })
}

async function main() {
  console.log('Ensuring target directories exist...')
  ensureDir(VENDOR_DIR)
  ensureDir(PYODIDE_DIR)
  ensureDir(FONT_DIR)

  console.log('Downloading remote vendor assets...')
  for (const item of downloads) {
    try {
      await download(item.url, item.dest)
    } catch (e) {
      console.error(e.message)
      process.exit(1)
    }
  }

  console.log('Copying local resources...')
  fs.copyFileSync(
    'resources/fonts/DroidSansFallbackFull.ttf',
    path.join(FONT_DIR, 'DroidSansFallbackFull.ttf'),
  )
  console.log('Copied base font: DroidSansFallbackFull.ttf')

  fs.copyFileSync('src/data.json', 'frontend/public/data.json')
  console.log('Copied character data: data.json')

  console.log('Vendor assets setups complete!')
}

main().catch(console.error)
```

---

### 4.3. Manifest Structure (`frontend/public/manifest.json`)

```json
{
  "name": "Pinyin Typography Lab",
  "short_name": "Pinyin Lab",
  "description": "Offline-capable Chinese Hanzi-Pinyin font design lab and browser compiler.",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "icons": [
    {
      "src": "./icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "./icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

### 4.4. Service Worker Structure (`frontend/public/sw.js`)

```javascript
const CACHE_NAME = 'ruby-font-creator-v1'

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  '/data.json',
  '/resources/fonts/DroidSansFallbackFull.ttf',
  '/vendor/opentype.min.js',
  '/vendor/svg2ttf.min.js',
  '/vendor/pyodide/pyodide.js',
  '/vendor/pyodide/pyodide.asm.js',
  '/vendor/pyodide/pyodide.asm.wasm',
  '/vendor/pyodide/pyodide-lock.json',
  '/vendor/pyodide/python_stdlib.zip',
  '/vendor/pyodide/brotli-1.1.0-cp312-cp312-emscripten_3_1_58_wasm32.whl',
  '/vendor/pyodide/fonttools-4.51.0-py3-none-any.whl',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log(
          '[Service Worker] Pre-caching static vendor and application assets',
        )
        return cache.addAll(PRECACHE_ASSETS)
      })
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log(
                '[Service Worker] Deleting obsolete cache:',
                cacheName,
              )
              return caches.delete(cacheName)
            }
          }),
        )
      })
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  // Only handle same-origin GET requests
  if (
    event.request.method === 'GET' &&
    event.request.url.startsWith(self.location.origin)
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse
        }

        return fetch(event.request).then((response) => {
          if (
            !response ||
            response.status !== 200 ||
            response.type !== 'basic'
          ) {
            return response
          }

          // Cache dynamic successful responses
          const responseToCache = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache)
          })

          return response
        })
      }),
    )
  }
})
```

---

### 4.5. Integrating in HTML and TypeScript

- **`frontend/index.html` changes**:
  - Update `opentype.js` source reference:
    ```html
    <script src="./vendor/opentype.min.js"></script>
    ```
  - Link the Web Manifest:
    ```html
    <link rel="manifest" href="./manifest.json" />
    ```
  - Add theme-color:
    ```html
    <meta name="theme-color" content="#0f172a" />
    ```

- **`frontend/main.ts` changes (Service Worker registration)**:
  ```typescript
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log(
            '[PWA] Service Worker registered scope:',
            registration.scope,
          )
        })
        .catch((err) => {
          console.error('[PWA] Service Worker registration failed:', err)
        })
    })
  }
  ```

---

## 5. Verification Method

To independently verify this design once implemented:

1. **Verify Asset Layout**:
   - Confirm target files are present in `frontend/public/vendor/` and `frontend/public/resources/fonts/`.
2. **Build and Serve Application**:
   - Run `npm run build:web` to compile the app to `dist-web/`.
   - Start a static local server inside `dist-web/` (e.g. `npx http-server dist-web -p 3000` or run the Vite dev server).
3. **Verify Service Worker Installation**:
   - Open browser developer tools (Chrome DevTools -> Application -> Service Workers).
   - Verify that `sw.js` is active and running.
   - Inspect Cache Storage -> Cache `ruby-font-creator-v1` and ensure all precached assets (including WASM, wheels, and fallback fonts) are successfully loaded.
4. **Verify Offline Access**:
   - Toggle browser to offline mode (DevTools -> Network -> Offline).
   - Reload the page.
   - _Expect: The web application interface loads, the base font is successfully loaded, and compilation works without external fetch requests._
