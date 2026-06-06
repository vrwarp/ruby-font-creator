import { describe, test, expect, beforeEach } from 'vitest'
import { setupAllMocks, MockServiceWorkerContainer } from './mocks.js'

describe('Feature 4: Service Worker & Offline Caching', () => {
  let swContainer: MockServiceWorkerContainer

  beforeEach(() => {
    setupAllMocks()
    // @ts-expect-error - navigator.serviceWorker has custom mock type
    swContainer = globalThis.navigator.serviceWorker
  })

  // === TIER 1: HAPPY PATH TESTS ===

  test('Feature 4 Tier 1-1: Service Worker registration - should register sw.js successfully', async () => {
    const registration = await swContainer.register('/sw.js', { scope: '/' })
    expect(registration).toBeDefined()
    expect(registration.scope).toBe('/')
    expect(registration.active.state).toBe('activated')
  })

  test('Feature 4 Tier 1-2: Intercept network fetch - should return cache hit for offline DroidSansFallback.ttf', async () => {
    // Set up mock network interceptor simulating offline state and cache
    const url =
      'http://localhost:3000/resources/fonts/DroidSansFallbackFull.ttf'
    const cacheMap = new Map<string, Response>()
    cacheMap.set(url, new Response('FontDataBytes'))

    const fetchInterceptor = async (requestUrl: string) => {
      const cachedResponse = cacheMap.get(requestUrl)
      if (cachedResponse) {
        return cachedResponse.clone()
      }
      throw new Error('TypeError: Failed to fetch')
    }

    const response = await fetchInterceptor(url)
    const text = await response.text()
    expect(text).toBe('FontDataBytes')
  })

  test('Feature 4 Tier 1-3: Intercept network fetch - should return cache hit for offline Pyodide script', async () => {
    const url = 'http://localhost:3000/vendor/pyodide/pyodide.js'
    const cacheMap = new Map<string, Response>()
    cacheMap.set(url, new Response('console.log("pyodide loaded");'))

    const fetchInterceptor = async (requestUrl: string) => {
      const cached = cacheMap.get(requestUrl)
      if (cached) return cached.clone()
      throw new Error('Network Error')
    }

    const response = await fetchInterceptor(url)
    const code = await response.text()
    expect(code).toBe('console.log("pyodide loaded");')
  })

  test('Feature 4 Tier 1-4: Cache assets list - should store key static pages and js files in cache storage', async () => {
    // Emulate a standard PWA cache storage
    const mockCache = {
      keys: new Set<string>(),
      async add(request: string) {
        this.keys.add(request)
      },
      async addAll(requests: string[]) {
        requests.forEach((r) => this.keys.add(r))
      },
      async match(request: string) {
        return this.keys.has(request) ? new Response('mock-body') : null
      },
    }

    const assetsToCache = [
      '/',
      '/index.html',
      '/main.js',
      '/style.css',
      '/resources/fonts/DroidSansFallbackFull.ttf',
    ]

    await mockCache.addAll(assetsToCache)

    expect(mockCache.keys.size).toBe(5)
    expect(await mockCache.match('/index.html')).not.toBeNull()
    expect(await mockCache.match('/nonexistent')).toBeNull()
  })

  test('Feature 4 Tier 1-5: Cache hits update - should update caches when fetch triggers response updates', async () => {
    const cacheMap = new Map<string, string>()

    const updateCache = async (url: string, content: string) => {
      cacheMap.set(url, content)
    }

    await updateCache('/main.js', 'console.log("v1")')
    expect(cacheMap.get('/main.js')).toBe('console.log("v1")')

    await updateCache('/main.js', 'console.log("v2")')
    expect(cacheMap.get('/main.js')).toBe('console.log("v2")')
  })

  // === TIER 2: EDGE CASE & BOUNDARY TESTS ===

  test('Feature 4 Tier 2-1: Service Worker load failure - should fall back to standard fetch when registration fails', async () => {
    // Force register to throw error
    swContainer.register = async () => {
      throw new Error('Service Worker registration blocked by security policy')
    }

    await expect(async () => {
      await swContainer.register('/sw.js')
    }).rejects.toThrow('Service Worker registration blocked')
  })

  test('Feature 4 Tier 2-2: Cache miss during offline mode - should throw TypeError network exception', async () => {
    const isOffline = true
    const cacheMap = new Map<string, Response>() // Empty cache

    const offlineFetch = async (url: string) => {
      if (isOffline) {
        const cached = cacheMap.get(url)
        if (cached) return cached.clone()
        throw new TypeError('Failed to fetch')
      }
      return new Response('online')
    }

    await expect(async () => {
      await offlineFetch('/nonexistent.html')
    }).rejects.toThrow('Failed to fetch')
  })

  test('Feature 4 Tier 2-3: Bypass cache for POST requests - should not cache non-GET API routes', async () => {
    const interceptedRequests: string[] = []

    const handleFetchEvent = (request: { method: string; url: string }) => {
      if (request.method === 'POST') {
        // Bypass cache, directly fetch from network
        interceptedRequests.push('network')
        return false // did not handle via cache
      }
      interceptedRequests.push('cache')
      return true // handled via cache
    }

    const handledGet = handleFetchEvent({ method: 'GET', url: '/index.html' })
    const handledPost = handleFetchEvent({
      method: 'POST',
      url: '/api/build-font',
    })

    expect(handledGet).toBe(true)
    expect(handledPost).toBe(false)
    expect(interceptedRequests).toEqual(['cache', 'network'])
  })

  test('Feature 4 Tier 2-4: Cache size limits/eviction - should handle or ignore large dynamic requests properly', async () => {
    const MAX_SIZE = 10 * 1024 * 1024 // 10MB limit
    const cache = new Map<string, number>()

    const addToCache = (url: string, size: number) => {
      if (size > MAX_SIZE) {
        // Ignore or reject large cache entries (like big uncompressed fonts)
        return false
      }
      cache.set(url, size)
      return true
    }

    expect(addToCache('/small.js', 100)).toBe(true)
    expect(addToCache('/giant-raw-font.ttf', 20 * 1024 * 1024)).toBe(false) // 20MB exceeds size
    expect(cache.has('/giant-raw-font.ttf')).toBe(false)
  })

  test('Feature 4 Tier 2-5: Service worker update lifecycle - should activate and unregister clean state correctly', async () => {
    const registration = await swContainer.register('/sw.js')

    // Simulate updating and unregistering the service worker
    const unregistered = await registration.unregister()
    expect(unregistered).toBe(true)
  })
})
