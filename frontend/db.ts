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

const DB_NAME = 'RubyFontCreatorDB'
const STORE_NAME = 'fonts'
const PINYIN_STORE_NAME = 'pinyin_fonts'
const CHINESE_STORE_NAME = 'chinese_fonts'
const DB_VERSION = 3

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
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
