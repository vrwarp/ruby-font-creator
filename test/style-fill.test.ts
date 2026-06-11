import { describe, it, expect } from 'vitest'
import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Integration tests for the deterministic stages of the offline
// style-faithful pipeline (scripts/style-faithful-fill.py): the fill planner
// and the shared vectorization geometry. The ML stages (fine-tune/generate)
// are exercised manually — see PROJECT.md.

const repoRoot = path.resolve(__dirname, '..')
const venvPython = path.join(repoRoot, '.venv-mxfont', 'bin', 'python')
const fixture = path.join(repoRoot, 'test', 'fixtures', 'trad-only.ttf')

let ready = false
try {
  ready =
    fs.existsSync(venvPython) &&
    fs.existsSync(fixture) &&
    fs.existsSync(path.join(repoRoot, 'vendor', 'zi2zi-jit'))
  if (ready) {
    execSync(`${venvPython} -c "import numpy, fontTools"`, { stdio: 'ignore' })
  }
} catch {
  ready = false
}

function py(code: string): string {
  return execFileSync(venvPython, ['-c', code], {
    encoding: 'utf8',
    cwd: repoRoot,
  }).trim()
}

describe.skipIf(!ready)('style-faithful-fill deterministic stages', () => {
  it('plans the missing half with counterpart anchors', () => {
    const out = py(`
import importlib.util, json, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location('sff', 'scripts/style-faithful-fill.py')
sff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sff)
direction, items, skipped = sff.plan_fill(Path('test/fixtures/trad-only.ttf'), 'auto')
by_char = {i['char']: i for i in items}
print(json.dumps({
  'direction': direction,
  'count': len(items),
  'ai_anchor': by_char.get('爱', {}).get('targetCp'),
}))
`)
    const result = JSON.parse(out)
    // traditional-only fixture -> fill simplified, anchored to 愛
    expect(result.direction).toBe('s2t')
    expect(result.count).toBeGreaterThanOrEqual(5)
    expect(result.ai_anchor).toBe(0x611b)
  })

  it('scores and gates glyphs through the TextPecker client (stub server)', () => {
    const out = py(`
import json, sys, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
sys.path.insert(0, 'scripts')
import numpy as np
from PIL import Image

# stub OpenAI-compatible endpoint: 爱 is clean, 发 has a structural anomaly
RESPONSES = {
    '\\u7231': '{"recognized_text": "\\u7231"}',
    '\\u53d1': '{"recognized_text": "<#>\\u53d1<#>"}',
}
calls = []
class Stub(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        calls.append(body)
        # answer per call order: first 爱, then 发
        text = RESPONSES['\\u7231'] if len(calls) == 1 else RESPONSES['\\u53d1']
        payload = json.dumps({'choices': [{'message': {'content': text}}]}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
    def log_message(self, *a): pass

server = HTTPServer(('127.0.0.1', 0), Stub)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/v1'

import tempfile
from textpecker_gate import score_glyphs, passes
with tempfile.TemporaryDirectory() as td:
    p1, p2 = Path(td) / 'a.png', Path(td) / 'b.png'
    Image.fromarray(np.full((256, 256), 255, np.uint8)).save(p1)
    Image.fromarray(np.full((256, 256), 255, np.uint8)).save(p2)
    scores = score_glyphs(base, 'TextPecker', [(p1, '\\u7231'), (p2, '\\u53d1')], concurrency=1)
server.shutdown()
print(json.dumps({
    'pass1': passes(scores[0], True),
    'pass2': passes(scores[1], True),
    'sem1': scores[0]['sem'], 'qua2': scores[1]['qua'],
}))
`)
    const result = JSON.parse(out)
    expect(result.pass1).toBe(true) // clean recognition of the right char
    expect(result.pass2).toBe(false) // structural anomaly marked with <#>
    expect(result.sem1).toBe(1)
    expect(result.qua2).toBeLessThan(1)
  })

  it('vectorizes glyph rasters with correct hole winding', () => {
    const out = py(`
import sys, json
sys.path.insert(0, 'scripts')
import numpy as np
from glyph_vectorize import image_to_contours, shoelace
f = np.zeros((256, 256))
f[40:216, 40:216] = 1.0
f[100:156, 100:156] = 0.0
loops = image_to_contours(f, 0.5, min_area=8.0)
areas = sorted((shoelace(l) for l in loops), reverse=True)
print(json.dumps({'count': len(loops), 'outerPositive': bool(areas[0] > 0), 'holeNegative': bool(areas[-1] < 0)}))
`)
    const result = JSON.parse(out)
    expect(result.count).toBe(2)
    expect(result.outerPositive).toBe(true)
    expect(result.holeNegative).toBe(true)
  })
})
