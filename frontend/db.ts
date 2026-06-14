export interface SavedFont {
  fontName: string
  ttf: Uint8Array
  woff2: Uint8Array
  config: any
  timestamp: number
}

export interface PinyinFontEntry {
  name: string
  displayName: string
  ttf: Uint8Array
  isSystem: boolean
  isPatched: boolean
  timestamp: number
}

export interface ChineseFontEntry {
  name: string
  displayName: string
  ttf: Uint8Array
  isSystem: boolean
  isPatched: boolean
  timestamp: number
}

// Trained style-faithful LoRA checkpoint for one uploaded Chinese font,
// keyed by the same name as its chinese_fonts entry (~19 MB of Float32Array
// per checkpoint). Patching a font adds glyphs but does not change its
// style, so checkpoints survive repatching; retraining overwrites.
export interface JitLoraEntry {
  fontName: string
  lora: Record<string, { data: Float32Array; shape: number[] }>
  trainedAt: number
  presetKey: string
  trainChars: number
  epochs: number
  // the exact codepoint split used at training time: generation reuses
  // trainCps for style references and holdoutCps for the preview gate, so
  // neither ever includes glyphs the adapter did not train on (a partially
  // filled font's coverage would otherwise leak AI-generated glyphs in)
  trainCps: number[]
  holdoutCps: number[]
  // per-font structure-gate thresholds calibrated on the font's own glyphs
  // (src/structure-gate.ts GateCalibration); absent on legacy checkpoints
  gateCalib?: import('../src/structure-gate.js').GateCalibration
}

const DB_NAME = 'RubyFontCreatorDB'
const STORE_NAME = 'fonts'
const PINYIN_STORE_NAME = 'pinyin_fonts'
const CHINESE_STORE_NAME = 'chinese_fonts'
const JIT_LORA_STORE_NAME = 'jit_lora'
// v5: adds the jit_lora store (v4 skipped — a dev build upgraded some
// databases to 4 without it, and IndexedDB never re-runs upgrades for the
// same version; the conditional creates below make any hop safe)
const DB_VERSION = 5

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(
        new Error(
          'Database upgrade blocked — close other tabs of this app and retry.',
        ),
      )
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'fontName' })
      }
      if (!db.objectStoreNames.contains(PINYIN_STORE_NAME)) {
        db.createObjectStore(PINYIN_STORE_NAME, { keyPath: 'name' })
      }
      if (!db.objectStoreNames.contains(CHINESE_STORE_NAME)) {
        db.createObjectStore(CHINESE_STORE_NAME, { keyPath: 'name' })
      }
      if (!db.objectStoreNames.contains(JIT_LORA_STORE_NAME)) {
        db.createObjectStore(JIT_LORA_STORE_NAME, { keyPath: 'fontName' })
      }
    }
  })
}

export async function saveFont(font: SavedFont): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(font)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function getFont(fontName: string): Promise<SavedFont | null> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(fontName)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result || null)
  })
}

export async function listFonts(): Promise<string[]> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAllKeys()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result as string[])
  })
}

export async function deleteFont(fontName: string): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(fontName)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function savePinyinFont(font: PinyinFontEntry): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PINYIN_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(PINYIN_STORE_NAME)
    const request = store.put(font)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function getPinyinFont(
  name: string,
): Promise<PinyinFontEntry | null> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PINYIN_STORE_NAME, 'readonly')
    const store = transaction.objectStore(PINYIN_STORE_NAME)
    const request = store.get(name)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result || null)
  })
}

export async function listPinyinFonts(): Promise<PinyinFontEntry[]> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PINYIN_STORE_NAME, 'readonly')
    const store = transaction.objectStore(PINYIN_STORE_NAME)
    const request = store.getAll()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result as PinyinFontEntry[])
  })
}

export async function deletePinyinFont(name: string): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PINYIN_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(PINYIN_STORE_NAME)
    const request = store.delete(name)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function saveChineseFont(font: ChineseFontEntry): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CHINESE_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(CHINESE_STORE_NAME)
    const request = store.put(font)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function getChineseFont(
  name: string,
): Promise<ChineseFontEntry | null> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CHINESE_STORE_NAME, 'readonly')
    const store = transaction.objectStore(CHINESE_STORE_NAME)
    const request = store.get(name)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result || null)
  })
}

export async function listChineseFonts(): Promise<ChineseFontEntry[]> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CHINESE_STORE_NAME, 'readonly')
    const store = transaction.objectStore(CHINESE_STORE_NAME)
    const request = store.getAll()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result as ChineseFontEntry[])
  })
}

export async function deleteChineseFont(name: string): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CHINESE_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(CHINESE_STORE_NAME)
    const request = store.delete(name)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function saveJitLora(entry: JitLoraEntry): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(JIT_LORA_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(JIT_LORA_STORE_NAME)
    const request = store.put(entry)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function getJitLora(
  fontName: string,
): Promise<JitLoraEntry | null> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(JIT_LORA_STORE_NAME, 'readonly')
    const store = transaction.objectStore(JIT_LORA_STORE_NAME)
    const request = store.get(fontName)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result || null)
  })
}

export async function deleteJitLora(fontName: string): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(JIT_LORA_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(JIT_LORA_STORE_NAME)
    const request = store.delete(fontName)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}
