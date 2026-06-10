// 1. IndexedDB Mock Classes and Utilities
export class MockIDBRequest {
  result: any = null
  error: any = null
  onsuccess: any = null
  onerror: any = null
}

export class MockIDBOpenDBRequest extends MockIDBRequest {
  onupgradeneeded: any = null
}

export class MockIDBObjectStore {
  map: Map<any, any>
  keyPath?: string

  constructor(map: Map<any, any>, keyPath?: string) {
    this.map = map
    this.keyPath = keyPath
  }

  put(value: any, key?: any) {
    const request = new MockIDBRequest()
    setTimeout(() => {
      const finalKey =
        key !== undefined
          ? key
          : (this.keyPath && value[this.keyPath]) ||
            value.id ||
            value.name ||
            Math.random().toString()
      this.map.set(finalKey, value)
      request.result = finalKey
      if (request.onsuccess) {
        request.onsuccess({ target: request })
      }
    }, 5)
    return request
  }

  get(key: any) {
    const request = new MockIDBRequest()
    setTimeout(() => {
      request.result = this.map.get(key)
      if (request.onsuccess) {
        request.onsuccess({ target: request })
      }
    }, 5)
    return request
  }

  getAll() {
    const request = new MockIDBRequest()
    setTimeout(() => {
      request.result = Array.from(this.map.values())
      if (request.onsuccess) {
        request.onsuccess({ target: request })
      }
    }, 5)
    return request
  }

  getAllKeys() {
    const request = new MockIDBRequest()
    setTimeout(() => {
      request.result = Array.from(this.map.keys())
      if (request.onsuccess) {
        request.onsuccess({ target: request })
      }
    }, 5)
    return request
  }

  delete(key: any) {
    const request = new MockIDBRequest()
    setTimeout(() => {
      this.map.delete(key)
      request.result = undefined
      if (request.onsuccess) {
        request.onsuccess({ target: request })
      }
    }, 5)
    return request
  }

  clear() {
    const request = new MockIDBRequest()
    setTimeout(() => {
      this.map.clear()
      request.result = undefined
      if (request.onsuccess) {
        request.onsuccess({ target: request })
      }
    }, 5)
    return request
  }
}

export class MockIDBTransaction {
  db: MockIDBDatabase
  storeNames: string[]
  oncomplete: any = null
  onerror: any = null

  constructor(db: MockIDBDatabase, storeNames: string | string[]) {
    this.db = db
    this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames]
  }

  objectStore(name: string) {
    const storeMap = this.db.stores.get(name)
    if (!storeMap) {
      throw new Error(`Store ${name} not found in database ${this.db.name}`)
    }
    return new MockIDBObjectStore(storeMap, this.db.keyPaths.get(name))
  }
}

export class MockIDBDatabase {
  name: string
  version: number
  stores = new Map<string, Map<any, any>>()
  keyPaths = new Map<string, string | undefined>()

  constructor(name: string, version: number) {
    this.name = name
    this.version = version
  }

  // DOMStringList-shaped view of the store names, as used by IDBDatabase
  get objectStoreNames() {
    const names = Array.from(this.stores.keys())
    return {
      length: names.length,
      contains: (name: string) => names.includes(name),
      item: (index: number) => names[index] ?? null,
    }
  }

  createObjectStore(storeName: string, options?: any) {
    if (!this.stores.has(storeName)) {
      this.stores.set(storeName, new Map())
      this.keyPaths.set(storeName, options?.keyPath)
    }
    return new MockIDBObjectStore(
      this.stores.get(storeName)!,
      this.keyPaths.get(storeName),
    )
  }

  transaction(storeNames: string | string[], _mode?: string) {
    void _mode
    return new MockIDBTransaction(this, storeNames)
  }

  close() {}
}

export const activeDatabases = new Map<string, MockIDBDatabase>()

export const mockIndexedDB = {
  open(name: string, version = 1) {
    const request = new MockIDBOpenDBRequest()
    setTimeout(() => {
      let db = activeDatabases.get(name)
      let isUpgradeNeeded = false
      if (!db) {
        db = new MockIDBDatabase(name, version)
        activeDatabases.set(name, db)
        isUpgradeNeeded = true
      } else if (db.version < version) {
        db.version = version
        isUpgradeNeeded = true
      }

      request.result = db
      if (isUpgradeNeeded && request.onupgradeneeded) {
        request.onupgradeneeded({ target: request })
      }
      if (request.onsuccess) {
        request.onsuccess({ target: request })
      }
    }, 5)
    return request
  },

  deleteDatabase(name: string) {
    const request = new MockIDBRequest()
    setTimeout(() => {
      activeDatabases.delete(name)
      if (request.onsuccess) {
        request.onsuccess({ target: request })
      }
    }, 5)
    return request
  },
}

// 2. CSS Font Loading API Mock
export class MockFontFace {
  family: string
  source: string | ArrayBuffer
  descriptors: any
  status: 'unloaded' | 'loading' | 'loaded' | 'error' = 'unloaded'

  constructor(family: string, source: string | ArrayBuffer, descriptors?: any) {
    this.family = family
    this.source = source
    this.descriptors = descriptors
  }

  async load() {
    this.status = 'loading'
    return new Promise<MockFontFace>((resolve) => {
      setTimeout(() => {
        this.status = 'loaded'
        resolve(this)
      }, 5)
    })
  }
}

export class MockFontSet extends Set<MockFontFace> {
  onloading: any = null
  onloadingdone: any = null
  onloadingerror: any = null

  add(fontFace: MockFontFace) {
    super.add(fontFace)
    return this
  }
}

// 3. Service Worker Mock
export class MockServiceWorkerContainer {
  controller: any = null
  ready: Promise<any> = Promise.resolve({})
  listeners = new Map<string, Set<(...args: any[]) => any>>()

  addEventListener(event: string, callback: (...args: any[]) => any) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  removeEventListener(event: string, callback: (...args: any[]) => any) {
    this.listeners.get(event)?.delete(callback)
  }

  async register(url: string, options?: any) {
    const registration = {
      scope: options?.scope || '/',
      active: { state: 'activated' },
      update: async () => {},
      unregister: async () => true,
    }
    return registration
  }
}

// 4. Pyodide Mock Runtime
export class MockPyodide {
  loadedPackages: string[] = []
  files = new Map<string, Uint8Array>()
  pythonGlobals = new Map<string, any>()

  async loadPackage(packages: string | string[]) {
    const pkgs = Array.isArray(packages) ? packages : [packages]
    this.loadedPackages.push(...pkgs)
  }

  async runPythonAsync(code: string) {
    if (code.includes('fontTools') || code.includes('import brotli')) {
      const hasFonttools = this.loadedPackages.some((pkg) =>
        pkg.toLowerCase().includes('fonttools'),
      )
      if (!hasFonttools) {
        throw new Error(
          "Python Error: ModuleNotFoundError: No module named 'fontTools'",
        )
      }
    }

    // Legacy simulated scripts (used directly by pyodide.test.ts)
    if (code.includes('inject')) {
      const inputFont = this.FS.readFile('in.ttf')
      // Simulate adding GSUB table by modifying a byte or just outputting it
      const outputFont = new Uint8Array(inputFont.length + 4)
      outputFont.set(inputFont)
      outputFont.set([71, 83, 85, 66], inputFont.length) // Append "GSUB" ascii signature exactly at the end
      this.FS.writeFile('out.ttf', outputFont)
      this.FS.writeFile(
        'out.woff2',
        new Uint8Array([119, 111, 102, 50, ...outputFont.slice(0, 20)]),
      ) // simulated woff2
      return 'GSUB injection and WOFF2 compression completed successfully'
    }

    // Simulation of the real frontend/compiler.ts scripts, keyed on the
    // virtual-FS paths they write, so the production compiler can be
    // exercised end-to-end with only Pyodide mocked out.
    if (code.includes("'/font_out.ttf'")) {
      const inputFont = this.FS.readFile('/font.ttf')
      if (code.includes('addOpenTypeFeatures')) {
        const outputFont = new Uint8Array(inputFont.length + 4)
        outputFont.set(inputFont)
        outputFont.set([71, 83, 85, 66], inputFont.length) // "GSUB" marker
        this.FS.writeFile('/font_out.ttf', outputFont)
      } else {
        this.FS.writeFile('/font_out.ttf', inputFont)
      }
    }
    if (code.includes("'/font_out.woff2'")) {
      const source =
        this.files.get('/font_out.ttf') ?? this.FS.readFile('/font.ttf')
      this.FS.writeFile(
        '/font_out.woff2',
        new Uint8Array([119, 111, 102, 50, ...source.slice(0, 20)]),
      )
    }
    if (code.includes("'/font_patched.ttf'")) {
      this.FS.writeFile('/font_patched.ttf', this.FS.readFile('/font.ttf'))
    }

    return 'Python script execution completed'
  }

  FS = {
    writeFile: (path: string, data: Uint8Array) => {
      this.files.set(path, data)
    },
    readFile: (path: string) => {
      const file = this.files.get(path)
      if (!file) {
        throw new Error(`FS Error: No such file or directory: '${path}'`)
      }
      return file
    },
    unlink: (path: string) => {
      this.files.delete(path)
    },
  }

  globals = {
    set: (name: string, val: any) => {
      this.pythonGlobals.set(name, val)
    },
    get: (name: string) => {
      return this.pythonGlobals.get(name)
    },
  }
}

// 5. Blob & URL Download Mocks
export class MockBlob {
  parts: any[]
  type: string

  constructor(parts: any[], options?: any) {
    this.parts = parts
    this.type = options?.type || ''
  }
}

export function setupAllMocks() {
  // Clear any state from previous runs
  activeDatabases.clear()

  // Set up IndexedDB on global scope
  globalThis.indexedDB = mockIndexedDB as any

  // Set up CSS Font Loading on global scope
  globalThis.FontFace = MockFontFace as any
  // @ts-expect-error - document.fonts is read-only in DOM types but we mock it
  document.fonts = new MockFontSet()

  // Set up Service Worker on global navigator scope
  if (!globalThis.navigator) {
    // @ts-expect-error - navigator is read-only in DOM types but we mock it
    globalThis.navigator = {}
  }
  // @ts-expect-error - navigator.serviceWorker is read-only but we mock it
  globalThis.navigator.serviceWorker = new MockServiceWorkerContainer()

  // Set up Pyodide global loader
  // @ts-expect-error - loadPyodide is a custom global function we declare
  globalThis.loadPyodide = async (_config?: any) => {
    void _config
    return new MockPyodide()
  }

  // Set up Object URL and Blob Download Mock
  const createdUrls = new Set<string>()
  globalThis.URL.createObjectURL = (_blob: any) => {
    void _blob
    const url = `blob:nodedata/${Math.random().toString(36).substring(7)}`
    createdUrls.add(url)
    return url
  }
  globalThis.URL.revokeObjectURL = (url: string) => {
    createdUrls.delete(url)
  }

  // JSDOM click action mockup helper
  if (typeof window !== 'undefined') {
    window.HTMLAnchorElement.prototype.click = function (
      this: HTMLAnchorElement,
    ) {
      const clickEvent = new window.MouseEvent('click')
      this.dispatchEvent(clickEvent)
    }
  }

  return {
    createdUrls,
    databases: activeDatabases,
  }
}

import svg2ttf from 'svg2ttf'

export interface GlyphInput {
  glyph: string
  path: string
  unicode: number
}

export class BrowserFontCompiler {
  static generateSvgFontXml(
    glyphs: GlyphInput[],
    fontFamily: string = 'ruby-font-creator',
  ): string {
    if (!glyphs || glyphs.length === 0) {
      throw new Error('No glyphs provided for compilation')
    }

    const glyphElements = glyphs
      .map((g) => {
        let pathData = g.path || ''
        if (pathData.includes('<path')) {
          const dMatches = [...pathData.matchAll(/d="([^"]*)"/g)].map(
            (m) => m[1],
          )
          pathData = dMatches.join(' ')
        }
        const dAttr = `d="${pathData}"`
        const hexUnicode = `&#x${g.unicode.toString(16).toUpperCase()};`
        const glyphName = `glyph-${g.unicode}`
        return `<glyph glyph-name="${glyphName}" unicode="${hexUnicode}" ${dAttr} horiz-adv-x="1000" />`
      })
      .join('\n')

    return `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg">
<defs>
<font id="${fontFamily}" horiz-adv-x="1000">
<font-face font-family="${fontFamily}" units-per-em="1000" ascent="800" descent="-200" />
<missing-glyph horiz-adv-x="1000" />
${glyphElements}
</font>
</defs>
</svg>`
  }

  static compile(
    glyphs: GlyphInput[],
    fontFamily: string = 'ruby-font-creator',
  ): Uint8Array {
    const xml = this.generateSvgFontXml(glyphs, fontFamily)
    const ttf = svg2ttf(xml, {})
    return new Uint8Array(ttf.buffer)
  }
}
