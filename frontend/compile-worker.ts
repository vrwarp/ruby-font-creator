// Web Worker running the font compiler off the main thread. A full-dataset
// build takes ~1 minute of CPU and a multi-GB transient heap — running it
// here keeps the UI responsive and lets progress stream back as messages.
import ruby, { TextToSVG } from '../src/ruby.js'
import {
  getAlternateGlyphEntries,
  POLYPHONIC_ENTRIES,
} from '../src/polyphonic.js'
import {
  compileFontInBrowser,
  patchFontInBrowser,
  setPyodideBaseUrl,
} from './compiler.js'
import type { GlyphEntry } from '../src/types.js'

export interface WorkerFontSource {
  /** Stable cache key (system font id, or custom font name + timestamp) */
  key: string
  /** Absolute URL to fetch the font from (system fonts) */
  url?: string
  /** Raw font bytes (custom fonts stored in IndexedDB) */
  bytes?: ArrayBuffer
}

export type WorkerRequest =
  | {
      id: number
      type: 'compile'
      mode: 'full' | 'subset'
      /** Tester text used to subset the dataset when mode === 'subset' */
      text?: string
      config: any
      enablePolyphonic: boolean
      baseFont: WorkerFontSource
      annotationFont: WorkerFontSource
      dataUrl: string
      pyodideBaseUrl: string
    }
  | {
      id: number
      type: 'patch'
      fontBytes: ArrayBuffer
      missingChars: string[]
      pyodideBaseUrl: string
    }

export type WorkerResponse =
  | { id: number; type: 'log'; message: string }
  | { id: number; type: 'done'; ttf: Uint8Array; woff2?: Uint8Array }
  | { id: number; type: 'error'; message: string }

// Parsed font engines and the character dataset are cached across builds, so
// repeated live-tester rebuilds skip the ~800 ms base-font parse and the
// data.json fetch + parse entirely.
const engineCache = new Map<string, TextToSVG>()
let cachedData: GlyphEntry[] | null = null
let cachedDataUrl = ''

async function getEngine(source: WorkerFontSource): Promise<TextToSVG> {
  const cached = engineCache.get(source.key)
  if (cached) return cached

  let buffer: ArrayBuffer
  if (source.bytes) {
    buffer = source.bytes
  } else if (source.url) {
    const res = await fetch(source.url)
    if (!res.ok) throw new Error(`Failed to fetch font: ${source.url}`)
    buffer = await res.arrayBuffer()
  } else {
    throw new Error(`Font source ${source.key} has neither url nor bytes`)
  }

  const engine = ruby.loadFont(buffer)
  engineCache.set(source.key, engine)
  return engine
}

async function getData(dataUrl: string): Promise<GlyphEntry[]> {
  if (cachedData && cachedDataUrl === dataUrl) return cachedData
  const res = await fetch(dataUrl)
  if (!res.ok) throw new Error('Failed to fetch data.json')
  cachedData = (await res.json()) as GlyphEntry[]
  cachedDataUrl = dataUrl
  return cachedData
}

/** Subsets the dataset to the characters present in the tester text. */
function subsetEntries(
  allData: GlyphEntry[],
  text: string,
  enablePolyphonic: boolean,
): GlyphEntry[] {
  const uniqueChars = new Set(text.split(''))
  const filtered = allData.filter((entry) => uniqueChars.has(entry.glyph))

  if (enablePolyphonic) {
    const activePolyGlyphs = new Set(
      POLYPHONIC_ENTRIES.filter((p) => uniqueChars.has(p.glyph)).map(
        (p) => p.glyph,
      ),
    )
    const activeAlternates = getAlternateGlyphEntries().filter((alt) =>
      activePolyGlyphs.has(alt.glyph),
    )
    filtered.push(...activeAlternates)
  }

  return filtered
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  const post = (response: WorkerResponse, transfer: Transferable[] = []) =>
    (self as any).postMessage(response, transfer)
  const log = (message: string) => post({ id: msg.id, type: 'log', message })

  try {
    setPyodideBaseUrl(msg.pyodideBaseUrl)

    if (msg.type === 'compile') {
      const [baseEngine, annotationEngine] = await Promise.all([
        getEngine(msg.baseFont),
        getEngine(msg.annotationFont),
      ])

      const allData = await getData(msg.dataUrl)
      const entries =
        msg.mode === 'full'
          ? [...allData, ...getAlternateGlyphEntries()]
          : subsetEntries(allData, msg.text ?? '', msg.enablePolyphonic)

      const result = await compileFontInBrowser(
        entries,
        msg.config,
        baseEngine,
        annotationEngine,
        msg.enablePolyphonic,
        log,
      )

      post(
        { id: msg.id, type: 'done', ttf: result.ttf, woff2: result.woff2 },
        [result.ttf.buffer, result.woff2.buffer].filter(
          (buf, i, all) => all.indexOf(buf) === i,
        ) as Transferable[],
      )
    } else if (msg.type === 'patch') {
      const patched = await patchFontInBrowser(
        new Uint8Array(msg.fontBytes),
        msg.missingChars,
        log,
      )
      post({ id: msg.id, type: 'done', ttf: patched }, [patched.buffer])
    }
  } catch (err: any) {
    post({ id: msg.id, type: 'error', message: err?.message ?? String(err) })
  }
}
