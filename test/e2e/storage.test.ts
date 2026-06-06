import { describe, test, expect, beforeEach } from 'vitest'
import { setupAllMocks, MockIDBDatabase } from './mocks.js'

describe('Feature 5: IndexedDB Storage & Persistence', () => {
  beforeEach(() => {
    setupAllMocks()
  })

  // Helper to open DB in tests
  const openTestDB = (
    name = 'ruby-font-creator',
    version = 1,
  ): Promise<MockIDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(name, version)
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result as MockIDBDatabase
        db.createObjectStore('fonts')
        db.createObjectStore('settings')
      }
      request.onsuccess = (e: any) => {
        resolve(e.target.result as MockIDBDatabase)
      }
      request.onerror = (e: any) => {
        reject(e.target.error)
      }
    })
  }

  // === TIER 1: HAPPY PATH TESTS ===

  test('Feature 5 Tier 1-1: Open database - should open ruby-font-creator database successfully', async () => {
    const db = await openTestDB()
    expect(db).toBeDefined()
    expect(db.name).toBe('ruby-font-creator')
    expect(db.stores.has('fonts')).toBe(true)
    expect(db.stores.has('settings')).toBe(true)
  })

  test('Feature 5 Tier 1-2: Store font blob - should store TTF and WOFF2 font arrays under fontName key', async () => {
    const db = await openTestDB()
    const fontData = {
      name: 'my-custom-font',
      ttf: new Uint8Array([1, 2, 3]),
      woff2: new Uint8Array([4, 5, 6]),
      updatedAt: Date.now(),
    }

    const tx = db.transaction('fonts', 'readwrite')
    const store = tx.objectStore('fonts')

    const putPromise = new Promise((resolve) => {
      const req = store.put(fontData, fontData.name)
      req.onsuccess = (e: any) => resolve(e.target.result)
    })

    const key = await putPromise
    expect(key).toBe('my-custom-font')
  })

  test('Feature 5 Tier 1-3: Retrieve font blob - should fetch correct binary data back by font name', async () => {
    const db = await openTestDB()
    const fontData = {
      name: 'retrieve-font',
      ttf: new Uint8Array([7, 8, 9]),
    }

    const tx = db.transaction('fonts', 'readwrite')
    const store = tx.objectStore('fonts')

    // Store first
    await new Promise((resolve) => {
      store.put(fontData, fontData.name).onsuccess = resolve
    })

    // Retrieve now
    const retrieved: any = await new Promise((resolve) => {
      store.get('retrieve-font').onsuccess = (e: any) =>
        resolve(e.target.result)
    })

    expect(retrieved).toBeDefined()
    expect(retrieved.name).toBe('retrieve-font')
    expect(retrieved.ttf).toEqual(new Uint8Array([7, 8, 9]))
  })

  test('Feature 5 Tier 1-4: List stored fonts - should list all stored font keys from fonts store', async () => {
    const db = await openTestDB()
    const tx = db.transaction('fonts', 'readwrite')
    const store = tx.objectStore('fonts')

    await Promise.all([
      new Promise((r) => {
        store.put({ name: 'font-a' }, 'font-a').onsuccess = r
      }),
      new Promise((r) => {
        store.put({ name: 'font-b' }, 'font-b').onsuccess = r
      }),
    ])

    const keys: any = await new Promise((resolve) => {
      store.getAllKeys().onsuccess = (e: any) => resolve(e.target.result)
    })

    expect(keys).toContain('font-a')
    expect(keys).toContain('font-b')
    expect(keys.length).toBe(2)
  })

  test('Feature 5 Tier 1-5: Delete stored font - should remove font from store and return undefined', async () => {
    const db = await openTestDB()
    const tx = db.transaction('fonts', 'readwrite')
    const store = tx.objectStore('fonts')

    // Store
    await new Promise((r) => {
      store.put({ name: 'font-delete' }, 'font-delete').onsuccess = r
    })

    // Delete
    await new Promise((r) => {
      store.delete('font-delete').onsuccess = r
    })

    // Verify it is gone
    const retrieved: any = await new Promise((resolve) => {
      store.get('font-delete').onsuccess = (e: any) => resolve(e.target.result)
    })

    expect(retrieved).toBeUndefined()
  })

  // === TIER 2: EDGE CASE & BOUNDARY TESTS ===

  test('Feature 5 Tier 2-1: Open store version upgrade - should trigger upgrade event when database version increases', async () => {
    let upgradeTriggered = false

    // Open v1 first
    await openTestDB('version-test-db', 1)

    // Open v2
    await new Promise<void>((resolve) => {
      const request = globalThis.indexedDB.open('version-test-db', 2)
      request.onupgradeneeded = () => {
        upgradeTriggered = true
      }
      request.onsuccess = () => {
        resolve()
      }
    })

    expect(upgradeTriggered).toBe(true)
  })

  test('Feature 5 Tier 2-2: Retrieve non-existent font - should return undefined for unknown font key', async () => {
    const db = await openTestDB()
    const tx = db.transaction('fonts')
    const store = tx.objectStore('fonts')

    const retrieved = await new Promise((resolve) => {
      store.get('ghost-font').onsuccess = (e: any) => resolve(e.target.result)
    })

    expect(retrieved).toBeUndefined()
  })

  test('Feature 5 Tier 2-3: Overwrite existing font - should update the store value when putting under same key', async () => {
    const db = await openTestDB()
    const tx = db.transaction('fonts', 'readwrite')
    const store = tx.objectStore('fonts')

    await new Promise((r) => {
      store.put(
        { name: 'font-overwrite', ttf: new Uint8Array([1]) },
        'font-overwrite',
      ).onsuccess = r
    })
    await new Promise((r) => {
      store.put(
        { name: 'font-overwrite', ttf: new Uint8Array([1, 2, 3]) },
        'font-overwrite',
      ).onsuccess = r
    })

    const retrieved: any = await new Promise((resolve) => {
      store.get('font-overwrite').onsuccess = (e: any) =>
        resolve(e.target.result)
    })

    expect(retrieved.ttf).toEqual(new Uint8Array([1, 2, 3]))
  })

  test('Feature 5 Tier 2-4: Save and restore settings - should validate and handle application state structure', async () => {
    const db = await openTestDB()
    const settings = {
      placement: 'bottom',
      characterWidth: 100,
      opticalSqueeze: 75,
    }

    const tx = db.transaction('settings', 'readwrite')
    const store = tx.objectStore('settings')

    await new Promise((r) => {
      store.put(settings, 'current-settings').onsuccess = r
    })

    const restored: any = await new Promise((resolve) => {
      store.get('current-settings').onsuccess = (e: any) =>
        resolve(e.target.result)
    })

    expect(restored).toEqual(settings)
  })

  test('Feature 5 Tier 2-5: Database deletion - should remove the entire database successfully', async () => {
    await openTestDB('delete-test-db', 1)

    const deletePromise = new Promise((resolve) => {
      globalThis.indexedDB.deleteDatabase('delete-test-db').onsuccess = resolve
    })

    await deletePromise
    // Try to open it again without upgrades, it should be empty
    let databaseExisted = true
    await new Promise<void>((resolve) => {
      const request = globalThis.indexedDB.open('delete-test-db', 1)
      request.onupgradeneeded = () => {
        databaseExisted = false // If it triggers upgrades, it means it is a brand new database
      }
      request.onsuccess = () => resolve()
    })

    expect(databaseExisted).toBe(false)
  })
})
