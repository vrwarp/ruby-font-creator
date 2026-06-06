import svg2ttf from 'svg2ttf'
import svgpath from 'svgpath'
import ruby from '../src/ruby.js'
import type { GlyphEntry, BuildConfig } from '../src/types.js'
import { buildPolyphonicMap } from '../src/polyphonic.js'

let pyodideInstance: any = null

async function initPyodide(logCallback: (msg: string) => void) {
  if (pyodideInstance) return pyodideInstance

  logCallback('Initializing Pyodide WASM Runtime...\n')

  if (typeof (window as any).loadPyodide === 'undefined') {
    logCallback('Loading pyodide.js script locally...\n')
    const script = document.createElement('script')
    script.src = './pyodide/pyodide.js'
    document.head.appendChild(script)
    await new Promise((resolve, reject) => {
      script.onload = resolve
      script.onerror = () => reject(new Error('Failed to load pyodide.js'))
    })
  }

  const pyodide = await (window as any).loadPyodide({
    indexURL: './pyodide/',
  })

  logCallback('Loading vendored Python wheels (fonttools, brotli)...\n')
  await pyodide.loadPackage([
    './pyodide/fonttools-4.51.0-py3-none-any.whl',
    './pyodide/Brotli-1.1.0-cp312-cp312-pyodide_2024_0_wasm32.whl',
  ])

  logCallback('Pyodide ready with Python dependencies.\n')
  pyodideInstance = pyodide
  return pyodide
}

export interface CompileResult {
  ttf: Uint8Array
  woff2: Uint8Array
}

export async function compileFontInBrowser(
  data: GlyphEntry[],
  config: BuildConfig,
  baseFontEngine: any,
  annotationFontEngine: any,
  enablePolyphonic: boolean,
  logCallback: (msg: string) => void,
): Promise<CompileResult> {
  logCallback(`Generating SVG glyph paths for ${data.length} entries...\n`)
  const characterWidth = config.canvas.width
  const scaleY = -12.5 // scale y canvas height 80 -> -1000/80 = -12.5
  const scaleX = 12.5 // uniform scaling to preserve aspect ratio

  let glyphsXml = ''

  for (const char of data) {
    try {
      const baseSvg = ruby.getBase(
        baseFontEngine,
        char.glyph,
        config.layout.base,
      )
      const baseD = ruby.getData(baseSvg)
      const baseScaled = svgpath(baseD)
        .scale(scaleX, scaleY)
        .translate(0, 800)
        .toString()

      const annoSvg = ruby.getAnnotation(
        annotationFontEngine,
        char.ruby,
        config.layout.annotation,
      )
      const dMatches = [...annoSvg.matchAll(/d="([^"]*)"/g)].map((m) => m[1])

      let combinedPath = baseScaled
      for (const d of dMatches) {
        const annoScaled = svgpath(d)
          .scale(scaleX, scaleY)
          .translate(0, 800)
          .toString()
        combinedPath += ' ' + annoScaled
      }

      const unicodeHex = char.codepoint.replace('U+', '').toLowerCase()
      const glyphWidth = characterWidth * 12.5
      glyphsXml += `\n  <glyph unicode="&#x${unicodeHex};" glyph-name="u${unicodeHex}" horiz-adv-x="${glyphWidth}" d="${combinedPath}" />`
    } catch (e: any) {
      logCallback(
        `Warning: failed generating glyph for ${char.glyph} (${char.ruby}): ${e.message}\n`,
      )
    }
  }

  logCallback('Assembling SVG Font XML...\n')
  const svgFontString = `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" >
<svg xmlns="http://www.w3.org/2000/svg">
<defs>
<font id="${config.fontName}" horiz-adv-x="1000">
  <font-face font-family="${config.fontName}" units-per-em="1000" ascent="800" descent="-200" />
  <missing-glyph horiz-adv-x="500" />${glyphsXml}
</font>
</defs>
</svg>`

  logCallback('Converting SVG Font to TTF...\n')
  const ttfResult = svg2ttf(svgFontString, {})
  let ttfBytes = new Uint8Array(ttfResult.buffer)

  let woff2Bytes = new Uint8Array()

  if (enablePolyphonic) {
    logCallback('Loading Pyodide for GSUB injection...\n')
    const pyodide = await initPyodide(logCallback)

    logCallback('Mounting TTF font & rules in Pyodide virtual filesystem...\n')
    pyodide.FS.writeFile('/font.ttf', ttfBytes)

    // Build polyphonic-map.json equivalent
    const polyMapData = buildPolyphonicMap(data)
    pyodide.FS.writeFile('/polyphonic-map.json', JSON.stringify(polyMapData))

    // Inject inject-gsub.py logic
    logCallback('Running GSUB injection script inside Pyodide...\n')
    await pyodide.runPythonAsync(`
import json
from fontTools.ttLib import TTFont
from fontTools.feaLib.builder import addOpenTypeFeatures

def parse_codepoint(cp):
    return int(cp.replace("U+", ""), 16)

def build_fea(poly_map, cmap):
    lines = [
        "# Auto-generated GSUB calt rules for polyphonic Chinese characters",
        "",
    ]
    lookup_names = []
    for glyph_char, entry in poly_map.items():
        primary_cp = parse_codepoint(entry["default"]["codepoint"])
        primary_glyph = cmap.get(primary_cp)
        if not primary_glyph:
            continue
        for alt in entry["alternates"]:
            alt_cp = parse_codepoint(alt["codepoint"])
            alt_glyph = cmap.get(alt_cp)
            if not alt_glyph:
                continue
            lookup_name = f"poly_{alt['codepoint'].replace('U+', '').lower()}"
            rules = []
            for ctx in alt["contexts"]:
                word = ctx["word"]
                if "before" in ctx:
                    ctx_cp = parse_codepoint(ctx["before"])
                    ctx_glyph = cmap.get(ctx_cp)
                    if ctx_glyph:
                        rules.append(f"    sub {ctx_glyph} {primary_glyph}' by {alt_glyph};")
                if "after" in ctx:
                    ctx_cp = parse_codepoint(ctx["after"])
                    ctx_glyph = cmap.get(ctx_cp)
                    if ctx_glyph:
                        rules.append(f"    sub {primary_glyph}' {ctx_glyph} by {alt_glyph};")
            if rules:
                lines.append(f"lookup {lookup_name} {{")
                lines.extend(rules)
                lines.append(f"}} {lookup_name};\\n")
                lookup_names.append(lookup_name)
    if not lookup_names:
        return ""
    lines.append("feature calt {")
    for name in lookup_names:
        lines.append(f"  lookup {name};")
    lines.append("} calt;\\n")
    return "\\n".join(lines)

with open('/polyphonic-map.json', 'r', encoding='utf-8') as f:
    poly_map = json.load(f)

font = TTFont('/font.ttf')
cmap = font.getBestCmap()
fea_content = build_fea(poly_map, cmap)

if fea_content:
    with open('/font.fea', 'w', encoding='utf-8') as f:
        f.write(fea_content)
    addOpenTypeFeatures(font, '/font.fea')

font.save('/font_out.ttf')

# Also generate WOFF2
font.flavor = 'woff2'
font.save('/font_out.woff2')
    `)

    logCallback('Extracting compiled font formats from Pyodide...\n')
    ttfBytes = pyodide.FS.readFile('/font_out.ttf')
    woff2Bytes = pyodide.FS.readFile('/font_out.woff2')
  } else {
    // Generate WOFF2 in Pyodide even if polyphonic is off
    logCallback('Loading Pyodide for WOFF2 compression...\n')
    const pyodide = await initPyodide(logCallback)
    pyodide.FS.writeFile('/font.ttf', ttfBytes)
    await pyodide.runPythonAsync(`
from fontTools.ttLib import TTFont
font = TTFont('/font.ttf')
font.flavor = 'woff2'
font.save('/font_out.woff2')
    `)
    woff2Bytes = pyodide.FS.readFile('/font_out.woff2')
  }

  logCallback('Font compilation complete!\n')
  return {
    ttf: ttfBytes,
    woff2: woff2Bytes,
  }
}
