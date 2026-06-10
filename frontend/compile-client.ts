// Main-thread client for the compile worker: lazily spawns the worker,
// multiplexes requests by id, and streams log messages back to callers.
import type { CompileResult } from './compiler.js'
import type {
  WorkerFontSource,
  WorkerRequest,
  WorkerResponse,
} from './compile-worker.js'

export type { WorkerFontSource }

interface PendingRequest {
  resolve: (response: { ttf: Uint8Array; woff2?: Uint8Array }) => void
  reject: (err: Error) => void
  onLog?: (message: string) => void
}

let worker: Worker | null = null
let nextRequestId = 1
const pending = new Map<number, PendingRequest>()

function failAllPending(message: string) {
  for (const request of pending.values()) {
    request.reject(new Error(message))
  }
  pending.clear()
}

function getWorker(): Worker {
  if (worker) return worker

  worker = new Worker(new URL('./compile-worker.ts', import.meta.url), {
    type: 'module',
  })

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data
    const request = pending.get(msg.id)
    if (!request) return

    if (msg.type === 'log') {
      request.onLog?.(msg.message)
    } else if (msg.type === 'done') {
      pending.delete(msg.id)
      request.resolve({ ttf: msg.ttf, woff2: msg.woff2 })
    } else if (msg.type === 'error') {
      pending.delete(msg.id)
      request.reject(new Error(msg.message))
    }
  }

  worker.onerror = (event) => {
    failAllPending(event.message || 'Compile worker crashed')
    worker?.terminate()
    worker = null
  }

  return worker
}

function send(
  request: Omit<WorkerRequest, 'id' | 'pyodideBaseUrl'>,
  onLog?: (message: string) => void,
): Promise<{ ttf: Uint8Array; woff2?: Uint8Array }> {
  const id = nextRequestId++
  const payload = {
    ...request,
    id,
    pyodideBaseUrl: new URL('./pyodide/', document.baseURI).href,
  } as WorkerRequest

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onLog })
    getWorker().postMessage(payload)
  })
}

export function compileFontInWorker(
  options: {
    mode: 'full' | 'subset'
    text?: string
    config: any
    enablePolyphonic: boolean
    baseFont: WorkerFontSource
    annotationFont: WorkerFontSource
  },
  onLog?: (message: string) => void,
): Promise<CompileResult> {
  return send(
    {
      type: 'compile',
      dataUrl: new URL('./data.json', document.baseURI).href,
      ...options,
    },
    onLog,
  ) as Promise<CompileResult>
}

export async function patchFontInWorker(
  fontBytes: Uint8Array,
  missingChars: string[],
  onLog?: (message: string) => void,
): Promise<Uint8Array> {
  // Copy so transferring/cloning never detaches the caller's view (the bytes
  // usually come straight from an IndexedDB record).
  const copy = fontBytes.buffer.slice(
    fontBytes.byteOffset,
    fontBytes.byteOffset + fontBytes.byteLength,
  ) as ArrayBuffer

  const result = await send(
    { type: 'patch', fontBytes: copy, missingChars },
    onLog,
  )
  return result.ttf
}
