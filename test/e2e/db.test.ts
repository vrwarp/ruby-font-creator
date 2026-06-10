import { describe, test, expect, beforeEach } from 'vitest'
import { setupAllMocks } from './mocks.js'
import {
  saveFont,
  getFont,
  listFonts,
  deleteFont,
  savePinyinFont,
  getPinyinFont,
  listPinyinFonts,
  deletePinyinFont,
  type SavedFont,
  type PinyinFontEntry,
} from '../../frontend/db.js'

// Integration tests for the production IndexedDB layer (frontend/db.ts),
// running against the mock IndexedDB implementation.

function makeSavedFont(name: string): SavedFont {
  return {
    fontName: name,
    ttf: new Uint8Array([1, 2, 3]),
    woff2: new Uint8Array([4, 5, 6]),
    config: { placement: 'top', opticalSqueeze: 65 },
    timestamp: 1234567890,
  }
}

function makePinyinFont(name: string): PinyinFontEntry {
  return {
    name,
    displayName: `${name} Display`,
    ttf: new Uint8Array([9, 8, 7]),
    isSystem: false,
    isPatched: false,
    timestamp: 1234567890,
  }
}

describe('frontend/db.ts: compiled fonts store', () => {
  beforeEach(() => {
    setupAllMocks()
  })

  test('saveFont/getFont round-trips binaries and config under fontName key', async () => {
    await saveFont(makeSavedFont('my-font'))

    const loaded = await getFont('my-font')
    expect(loaded).not.toBeNull()
    expect(loaded!.fontName).toBe('my-font')
    expect(loaded!.ttf).toEqual(new Uint8Array([1, 2, 3]))
    expect(loaded!.woff2).toEqual(new Uint8Array([4, 5, 6]))
    expect(loaded!.config.placement).toBe('top')
  })

  test('getFont returns null for unknown names', async () => {
    expect(await getFont('does-not-exist')).toBeNull()
  })

  test('saveFont overwrites an existing entry with the same name', async () => {
    await saveFont(makeSavedFont('dupe'))
    await saveFont({ ...makeSavedFont('dupe'), ttf: new Uint8Array([42]) })

    const loaded = await getFont('dupe')
    expect(loaded!.ttf).toEqual(new Uint8Array([42]))
    expect(await listFonts()).toEqual(['dupe'])
  })

  test('listFonts returns all stored font names', async () => {
    await saveFont(makeSavedFont('font-a'))
    await saveFont(makeSavedFont('font-b'))

    const names = await listFonts()
    expect(names).toContain('font-a')
    expect(names).toContain('font-b')
    expect(names).toHaveLength(2)
  })

  test('deleteFont removes the entry', async () => {
    await saveFont(makeSavedFont('doomed'))
    await deleteFont('doomed')

    expect(await getFont('doomed')).toBeNull()
    expect(await listFonts()).toHaveLength(0)
  })
})

describe('frontend/db.ts: pinyin fonts store', () => {
  beforeEach(() => {
    setupAllMocks()
  })

  test('savePinyinFont/getPinyinFont round-trips entries under name key', async () => {
    await savePinyinFont(makePinyinFont('custom-pinyin'))

    const loaded = await getPinyinFont('custom-pinyin')
    expect(loaded).not.toBeNull()
    expect(loaded!.displayName).toBe('custom-pinyin Display')
    expect(loaded!.ttf).toEqual(new Uint8Array([9, 8, 7]))
    expect(loaded!.isPatched).toBe(false)
  })

  test('listPinyinFonts returns full entries and deletePinyinFont removes them', async () => {
    await savePinyinFont(makePinyinFont('one'))
    await savePinyinFont(makePinyinFont('two'))

    const all = await listPinyinFonts()
    expect(all.map((f) => f.name).sort()).toEqual(['one', 'two'])

    await deletePinyinFont('one')
    expect(await getPinyinFont('one')).toBeNull()
    expect(await listPinyinFonts()).toHaveLength(1)
  })

  test('the two stores are independent', async () => {
    await saveFont(makeSavedFont('shared-name'))
    expect(await getPinyinFont('shared-name')).toBeNull()
    expect(await getFont('shared-name')).not.toBeNull()
  })
})
