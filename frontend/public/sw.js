const CACHE_NAME = 'ruby-font-creator-cache-v6'

// App shell plus the assets every preview/build needs. Pyodide assets and the
// MX-Font ONNX models are intentionally not pre-cached (≈25 MB / ≈24 MB) —
// they are cached on first use below.
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './data.json',
  './data/variants.json',
  './resources/fonts/DroidSansFallbackFull.ttf',
  './resources/fonts/PT_Sans-Narrow-Web-Regular.ttf',
  './resources/fonts/PT_Sans-Narrow-Web-Bold.ttf',
]

// Third-party CDNs serving the UI webfonts/icons; cached on first use so the
// app keeps its styling offline after the first online visit.
const CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE)
    }),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache)
          }
        }),
      )
    }),
  )
  self.clients.claim()
})

function cacheFirst(event) {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }
      return fetch(event.request).then((response) => {
        // Opaque (no-cors cross-origin) responses report status 0 but are
        // still servable from cache.
        if (
          !response ||
          (response.status !== 200 && response.type !== 'opaque')
        ) {
          return response
        }
        const responseToCache = response.clone()
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache)
        })
        return response
      })
    }),
  )
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  const url = new URL(event.request.url)

  // Cache-First strategy for Pyodide assets, ONNX assets, models, fonts, and package wheels
  if (
    url.pathname.includes('/pyodide/') ||
    url.pathname.includes('/onnx/') ||
    url.pathname.includes('/models/') ||
    url.pathname.endsWith('.ttf') ||
    url.pathname.endsWith('.whl') ||
    url.pathname.endsWith('.zip') ||
    url.pathname.endsWith('.onnx') ||
    url.pathname.endsWith('.wasm')
  ) {
    cacheFirst(event)
    return
  }

  // Cache-First for CDN webfonts/icons after first use
  if (CDN_HOSTS.includes(url.hostname)) {
    cacheFirst(event)
    return
  }

  // Stale-While-Revalidate for other local assets
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone()
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache)
              })
            }
            return networkResponse
          })
          .catch(async () => {
            // Offline and not cached: serve the app shell for navigations,
            // otherwise a well-formed error response instead of undefined.
            if (event.request.mode === 'navigate') {
              const shell = await caches.match('./index.html')
              if (shell) return shell
            }
            return new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable',
            })
          })
        return cachedResponse || fetchPromise
      }),
    )
  }
})
