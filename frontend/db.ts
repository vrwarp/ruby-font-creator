export interface SavedFont {
  fontName: string
  ttf: Uint8Array
  woff2: Uint8Array
  config: any
  timestamp: number
}

const DB_NAME = 'RubyFontCreatorDB'
const STORE_NAME = 'fonts'
const DB_VERSION = 1

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
