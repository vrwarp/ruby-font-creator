import { describe, it, expect } from 'vitest'
import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import opentype from 'opentype.js'

// Integration tests for frontend/py/patch_chinese_font.py: run the
// real script with the system python3 + fontTools against a real subset of
// Droid Sans Fallback, then verify the output with opentype.js. The browser
// runs the exact same file inside Pyodide (inlined via a vite ?raw import in
// frontend/compiler.ts).

const repoRoot = path.resolve(__dirname, '..')
const script = path.join(repoRoot, 'frontend', 'py', 'patch_chinese_font.py')
const fixture = path.join(repoRoot, 'test', 'fixtures', 'trad-only.ttf')

let pythonOk = false
try {
  execSync('python3 -c "import fontTools"', { stdio: 'ignore' })
  pythonOk = fs.existsSync(fixture)
} catch {
  // python3 or fontTools unavailable; skip the integration suite
}

interface PatchSpec {
  aliases: { cp: number; toCp: number }[]
  glyphs: {
    cp: number
    contours: number[][][]
    targetCp: number | null
  }[]
}

function runPatch(spec: PatchSpec, name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-font-'))
  const specPath = path.join(dir, `${name}.json`)
  const outPath = path.join(dir, `${name}.ttf`)
  fs.writeFileSync(specPath, JSON.stringify(spec))
  const stdout = execFileSync('python3', [script, fixture, specPath, outPath], {
    encoding: 'utf8',
  })
  return { outPath, stdout }
}

function loadFont(fontPath: string) {
  const buf = fs.readFileSync(fontPath)
  return opentype.parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  )
}

function pyProbe(lines: string[], ...args: string[]) {
  return execFileSync('python3', ['-c', lines.join('\n'), ...args], {
    encoding: 'utf8',
  })
}

describe.skipIf(!pythonOk)('patch_chinese_font.py integration', () => {
  it('aliases simplified codepoints to existing traditional glyphs', () => {
    const { outPath } = runPatch(
      {
        aliases: [
          { cp: 0x7231, toCp: 0x611b }, // 爱 -> 愛
          { cp: 0x4e66, toCp: 0x66f8 }, // 书 -> 書
        ],
        glyphs: [],
      },
      'aliases',
    )

    const font = loadFont(outPath)
    const ai = font.charToGlyph('爱')
    expect(ai.index).toBeGreaterThan(0)
    expect(ai.index).toBe(font.charToGlyph('愛').index)
    expect(ai.getPath(0, 0, 72).commands.length).toBeGreaterThan(0)

    const shu = font.charToGlyph('书')
    expect(shu.index).toBeGreaterThan(0)
    expect(shu.index).toBe(font.charToGlyph('書').index)
    expect(shu.getPath(0, 0, 72).commands.length).toBeGreaterThan(0)
  })

  it('injects a synthetic glyph scaled into the target glyph box', () => {
    const { outPath } = runPatch(
      {
        aliases: [],
        glyphs: [
          {
            cp: 0x7231, // 爱
            contours: [
              // outer square ring (y-down grid) ...
              [
                [20, 20],
                [108, 20],
                [108, 108],
                [20, 108],
              ],
              // ... with a hole wound the opposite way
              [
                [40, 40],
                [40, 88],
                [88, 88],
                [88, 40],
              ],
            ],
            targetCp: 0x611b, // 愛
          },
        ],
      },
      'inject',
    )

    const font = loadFont(outPath)
    const ai = font.charToGlyph('爱')
    const target = font.charToGlyph('愛')
    expect(ai.index).toBeGreaterThan(0)
    expect(ai.index).not.toBe(target.index)
    expect(ai.getPath(0, 0, 72).commands.length).toBeGreaterThan(0)
    expect(ai.advanceWidth).toBe(target.advanceWidth)

    // Uniform scaling must keep the synthetic outline inside the target
    // glyph's bbox (inflated by 2 font units for rounding).
    const bbox = ai.getBoundingBox()
    expect(bbox.x1).toBeGreaterThanOrEqual((target.xMin ?? 0) - 2)
    expect(bbox.y1).toBeGreaterThanOrEqual((target.yMin ?? 0) - 2)
    expect(bbox.x2).toBeLessThanOrEqual((target.xMax ?? 0) + 2)
    expect(bbox.y2).toBeLessThanOrEqual((target.yMax ?? 0) + 2)

    // fontTools-level sanity: vmtx survived and exactly one glyph was added.
    const probe = pyProbe(
      [
        'import json, sys',
        'from fontTools.ttLib import TTFont',
        'a = TTFont(sys.argv[1])',
        'b = TTFont(sys.argv[2])',
        'print(json.dumps({"vmtx": "vmtx" in b,',
        '  "before": a["maxp"].numGlyphs, "after": b["maxp"].numGlyphs}))',
      ],
      fixture,
      outPath,
    )
    const info = JSON.parse(probe)
    expect(info.vmtx).toBe(true)
    expect(info.after).toBe(info.before + 1)
  })

  it('skips non-BMP aliases when the font only has a format-4 cmap', () => {
    // The subsetter drops Droid Sans Fallback's format-12 subtable as
    // redundant, leaving only format 4 — confirm that assumption holds, since
    // this test asserts the SKIP path (with format 12 the alias would land).
    const formats = pyProbe(
      [
        'import json, sys',
        'from fontTools.ttLib import TTFont',
        'f = TTFont(sys.argv[1])',
        'subs = {t.format for t in f["cmap"].tables if t.isUnicode()}',
        'print(json.dumps(sorted(subs)))',
      ],
      fixture,
    )
    expect(JSON.parse(formats)).toEqual([4])

    const { outPath, stdout } = runPatch(
      {
        aliases: [{ cp: 0x20000, toCp: 0x611b }], // ext-B 𠀀 -> 愛
        glyphs: [],
      },
      'nonbmp',
    )

    expect(stdout).toContain('U+20000')
    const font = loadFont(outPath)
    expect(font.charToGlyphIndex(String.fromCodePoint(0x20000))).toBe(0)
    // The font itself is still intact.
    expect(font.charToGlyph('愛').index).toBeGreaterThan(0)
  })
})
