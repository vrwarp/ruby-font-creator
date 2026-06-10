import { compileTtf } from '../src/compile.js'
import type { GlyphEntry, BuildConfig } from '../src/types.js'
import { buildPolyphonicMap } from '../src/polyphonic.js'

let pyodideInstance: any = null
let pyodideBaseUrl = './pyodide/'

/**
 * Sets the absolute base URL for the vendored Pyodide assets. Required when
 * running inside a Web Worker, where relative URLs resolve against the worker
 * chunk's location instead of the document.
 */
export function setPyodideBaseUrl(url: string) {
  pyodideBaseUrl = url
}

async function initPyodide(logCallback: (msg: string) => void) {
  if (pyodideInstance) return pyodideInstance

  logCallback('Initializing Pyodide WASM Runtime...\n')

  // Works on both the main thread and in Web Workers: prefer an existing
  // global (also how tests inject their mock), otherwise import the ESM
  // build of the vendored runtime.
  let loadPyodideFn = (globalThis as any).loadPyodide
  if (typeof loadPyodideFn === 'undefined') {
    logCallback('Loading vendored Pyodide module...\n')
    const mod = await import(/* @vite-ignore */ `${pyodideBaseUrl}pyodide.mjs`)
    loadPyodideFn = mod.loadPyodide
  }

  const pyodide = await loadPyodideFn({
    indexURL: pyodideBaseUrl,
  })

  logCallback('Loading vendored Python wheels (fonttools, brotli)...\n')
  await pyodide.loadPackage([
    `${pyodideBaseUrl}fonttools-4.51.0-py3-none-any.whl`,
    `${pyodideBaseUrl}Brotli-1.1.0-cp312-cp312-pyodide_2024_0_wasm32.whl`,
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
  let ttfBytes = compileTtf(
    data,
    config,
    baseFontEngine,
    annotationFontEngine,
    logCallback,
  )

  let woff2Bytes = new Uint8Array()

  if (enablePolyphonic) {
    logCallback('Loading Pyodide for GSUB injection...\n')
    const pyodide = await initPyodide(logCallback)

    logCallback('Mounting TTF font & rules in Pyodide virtual filesystem...\n')
    pyodide.FS.writeFile('/font.ttf', ttfBytes)

    // Build polyphonic-map.json equivalent
    const polyMapData = buildPolyphonicMap(data)
    pyodide.FS.writeFile('/polyphonic-map.json', JSON.stringify(polyMapData))

    // Inject the equivalent of scripts/inject-gsub.py (keep both in sync)
    logCallback('Running GSUB injection script inside Pyodide...\n')
    await pyodide.runPythonAsync(`
import json
from fontTools.ttLib import TTFont
from fontTools.feaLib.builder import addOpenTypeFeatures

def parse_codepoint(cp):
    return int(cp.replace("U+", ""), 16)

def build_context_classes(poly_map, cmap):
    # Context neighbours that are themselves polyphonic may already be
    # substituted to a PUA glyph by an earlier calt lookup (e.g. 参 in 参差),
    # so context positions match a class of [primary alternates...].
    classes = {}
    for entry in poly_map.values():
        primary_cp = parse_codepoint(entry["default"]["codepoint"])
        primary_glyph = cmap.get(primary_cp)
        if not primary_glyph:
            continue
        alt_glyphs = []
        for alt in entry["alternates"]:
            alt_glyph = cmap.get(parse_codepoint(alt["codepoint"]))
            if alt_glyph:
                alt_glyphs.append(alt_glyph)
        if alt_glyphs:
            classes[primary_cp] = "[" + " ".join([primary_glyph] + alt_glyphs) + "]"
    return classes

def build_fea(poly_map, cmap):
    lines = [
        "# Auto-generated GSUB calt rules for polyphonic Chinese characters",
        "",
        "languagesystem DFLT dflt;",
        "languagesystem hani dflt;",
        "",
    ]
    context_classes = build_context_classes(poly_map, cmap)
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
            seen_triggers = set()
            for ctx in alt["contexts"]:
                for position in ("before", "after"):
                    if position not in ctx:
                        continue
                    ctx_cp = parse_codepoint(ctx[position])
                    ctx_glyph = cmap.get(ctx_cp)
                    if not ctx_glyph:
                        continue
                    if (position, ctx_cp) in seen_triggers:
                        continue
                    seen_triggers.add((position, ctx_cp))
                    ctx_match = context_classes.get(ctx_cp, ctx_glyph)
                    if position == "before":
                        rules.append(f"    sub {ctx_match} {primary_glyph}' by {alt_glyph};")
                    else:
                        rules.append(f"    sub {primary_glyph}' {ctx_match} by {alt_glyph};")
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

export async function patchFontInBrowser(
  fontBytes: Uint8Array,
  missingChars: string[],
  logCallback: (msg: string) => void,
): Promise<Uint8Array> {
  logCallback('Initializing Pyodide for font patching...\n')
  const pyodide = await initPyodide(logCallback)

  logCallback('Mounting font in virtual filesystem...\n')
  pyodide.FS.writeFile('/font.ttf', fontBytes)

  pyodide.globals.set('log_js', logCallback)

  await pyodide.runPythonAsync(`
import json
from fontTools.ttLib import TTFont

dest_font = TTFont('/font.ttf')

log_js("--- Font Metrics Instrumentation ---\\n")
log_js(f"Dest Font: unitsPerEm={dest_font['head'].unitsPerEm}, ascent={dest_font['hhea'].ascent}, descent={dest_font['hhea'].descent}\\n")
log_js("------------------------------------\\n")

dest_cmap = dest_font.getBestCmap()
dest_glyf = dest_font['glyf']
dest_hmtx = dest_font['hmtx']
glyph_order = dest_font.getGlyphOrder()

missing_chars = ${JSON.stringify(missingChars)}
cmap_updated = False

decomp_rules = {
    'ā': ('a', 'macron'),
    'á': ('a', 'acute'),
    'ǎ': ('a', 'caron'),
    'à': ('a', 'grave'),
    'ē': ('e', 'macron'),
    'é': ('e', 'acute'),
    'ě': ('e', 'caron'),
    'è': ('e', 'grave'),
    'ī': ('i', 'macron'),
    'í': ('i', 'acute'),
    'ǐ': ('i', 'caron'),
    'ì': ('i', 'grave'),
    'ō': ('o', 'macron'),
    'ó': ('o', 'acute'),
    'ǒ': ('o', 'caron'),
    'ò': ('o', 'grave'),
    'ū': ('u', 'macron'),
    'ú': ('u', 'acute'),
    'ǔ': ('u', 'caron'),
    'ù': ('u', 'grave'),
    'ü': ('u', 'dieresis'),
    'ǖ': ('ü', 'macron'),
    'ǘ': ('ü', 'acute'),
    'ǚ': ('ü', 'caron'),
    'ǜ': ('ü', 'grave'),
}

def find_accent_glyph(cmap, accent_type):
    # Try to extract the accent component name from precomposed glyphs
    # to match the font's designed visual style
    precomposed_base_map = {
        'caron': [('a', 'acaron'), ('e', 'ecaron'), ('o', 'ocaron'), ('u', 'ucaron')],
        'macron': [('a', 'amacron'), ('e', 'emacron'), ('o', 'omacron'), ('u', 'umacron')],
        'acute': [('a', 'aacute'), ('e', 'eacute'), ('o', 'oacute'), ('u', 'uacute')],
        'grave': [('a', 'agrave'), ('e', 'egrave'), ('o', 'ograve'), ('u', 'ugrave')],
        'dieresis': [('u', 'udieresis')]
    }
    
    for base_char, precomposed_name in precomposed_base_map.get(accent_type, []):
        if precomposed_name in dest_glyf:
            g = dest_glyf[precomposed_name]
            if g.numberOfContours < 0: # composite
                base_cp = ord(base_char)
                base_gname = dest_cmap.get(base_cp)
                if base_gname:
                    for comp in g.components:
                        cname = comp.glyphName
                        if cname != base_gname and cname in dest_glyf:
                            return cname

    accent_map = {
        'macron': [0x00AF, 0x02C9, 0x0304],
        'acute': [0x00B4, 0x02CA, 0x0301],
        'caron': [0x02C7, 0x030C],
        'grave': [0x0060, 0x02CB, 0x0300],
        'dieresis': [0x00A8, 0x0308]
    }
    for cp in accent_map.get(accent_type, []):
        if cp in cmap:
            return cmap[cp]
    return None

from fontTools.pens.boundsPen import ControlBoundsPen
from fontTools.ttLib.tables._g_l_y_f import GlyphComponent, Glyph

def get_glyph_bounds(glyph_name):
    try:
        glyph_set = dest_font.getGlyphSet()
        pen = ControlBoundsPen(glyph_set)
        glyph_set[glyph_name].draw(pen)
        if pen.bounds is not None:
            return pen.bounds
    except Exception as e:
        log_js(f"Error getting bounds for {glyph_name}: {e}\\n")
    
    if glyph_name in dest_glyf:
        g = dest_glyf[glyph_name]
        return (
            getattr(g, 'xMin', 0),
            getattr(g, 'yMin', 0),
            getattr(g, 'xMax', 0),
            getattr(g, 'yMax', 0)
        )
    return (0, 0, 0, 0)

def find_dotless_i_glyph():
    # 1. Check U+0131 in cmap
    if 0x0131 in dest_cmap:
        return dest_cmap[0x0131]
        
    # 2. Check standard names in glyf table
    for name in ['dotlessi', 'uni0131', 'dotlessI', 'i.dotless']:
        if name in dest_glyf:
            return name
            
    # 3. Check components of built-in i-based characters
    i_chars = ['iacute', 'igrave', 'idieresis', 'icaron', 'imacron']
    for name in i_chars:
        if name in dest_glyf:
            g = dest_glyf[name]
            # Check if it is composite
            if hasattr(g, 'numberOfContours') and g.numberOfContours < 0:
                for comp in g.components:
                    cname = comp.glyphName
                    if cname in dest_glyf:
                        is_accent = any(acc in cname.lower() for acc in ['acute', 'grave', 'dieresis', 'caron', 'macron', 'uni02', 'uni03'])
                        if not is_accent:
                            return cname
    return None

def get_or_create_glyph(char):
    cp = ord(char)
    if cp in dest_cmap and char not in missing_chars:
        return dest_cmap[cp]
        
    if char not in decomp_rules:
        return None
        
    base_char, accent_type = decomp_rules[char]
    base_name = None
    dotless_name = None
    if base_char == 'i':
        dotless_name = find_dotless_i_glyph()
        if dotless_name:
            base_name = dotless_name
            
    if not base_name:
        base_name = get_or_create_glyph(base_char)
        
    accent_name = find_accent_glyph(dest_cmap, accent_type)
    
    if base_name and accent_name and base_name in dest_glyf and accent_name in dest_glyf:
        dest_gname = f"uni{cp:04X}"
        base_glyph = dest_glyf[base_name]
        accent_glyph = dest_glyf[accent_name]
        
        base_bounds = get_glyph_bounds(base_name)
        accent_bounds = get_glyph_bounds(accent_name)
        
        base_xMin, base_yMin, base_xMax, base_yMax = base_bounds
        accent_xMin, accent_yMin, accent_xMax, accent_yMax = accent_bounds
        
        # Center horizontally
        base_center = (base_xMin + base_xMax) / 2
        accent_center = (accent_xMin + accent_xMax) / 2
        x_offset = int(round(base_center - accent_center))
        
        # Position vertically
        gap = int(round(dest_font['head'].unitsPerEm * 0.05))
        if accent_type == 'macron':
            gap += int(round(dest_font['head'].unitsPerEm * 0.03)) # total 8% gap for macron
        if base_char == 'i' and not dotless_name:
            gap += int(round(dest_font['head'].unitsPerEm * 0.03)) # extra 3% gap for dotted base to avoid collision
            
        y_offset = base_yMax - accent_yMin + gap
        
        # Create composite components
        comp_base = GlyphComponent()
        comp_base.glyphName = base_name
        comp_base.x = 0
        comp_base.y = 0
        comp_base.flags = 0x0204  # ROUND_XY_TO_GRID | USE_MY_METRICS
        
        comp_accent = GlyphComponent()
        comp_accent.glyphName = accent_name
        comp_accent.x = x_offset
        comp_accent.y = y_offset
        comp_accent.flags = 0x0004  # ROUND_XY_TO_GRID
        
        glyph = Glyph()
        glyph.numberOfContours = -1
        glyph.components = [comp_base, comp_accent]
        
        # Recalculate bounds using the true visual boundaries
        glyph.xMin = min(base_xMin, accent_xMin + x_offset)
        glyph.yMin = min(base_yMin, accent_yMin + y_offset)
        glyph.xMax = max(base_xMax, accent_xMax + x_offset)
        glyph.yMax = max(base_yMax, accent_yMax + y_offset)
        
        dest_glyf[dest_gname] = glyph
        base_width, _ = dest_hmtx[base_name]
        # LSB must equal xMin per the OpenType spec; using the base LSB causes
        # renderers to clip any ink that overhangs left of the base's left edge.
        dest_hmtx[dest_gname] = (base_width, int(glyph.xMin))
        
        if dest_gname not in glyph_order:
            glyph_order.append(dest_gname)
        # getBestCmap() returns only one subtable's dict; write the mapping
        # into every unicode cmap subtable so all consumers see the new glyph.
        dest_cmap[cp] = dest_gname
        for subtable in dest_font['cmap'].tables:
            if subtable.isUnicode():
                subtable.cmap[cp] = dest_gname

        log_js(f"Dynamically constructed composite '{char}' (U+{cp:04X}): base={base_name}, accent={accent_name}, x_offset={x_offset}, y_offset={y_offset}\\n")
        return dest_gname

    return None

for char in missing_chars:
    cp = ord(char)
    # Try to construct composite from destination font components
    dest_gname = get_or_create_glyph(char)
    if dest_gname:
        cmap_updated = True
    else:
        log_js(f"Warning: Could not construct '{char}' (U+{cp:04X}) because required base/accent glyph was not found in destination font.\\n")

if cmap_updated:
    dest_font.setGlyphOrder(glyph_order)
    dest_font.save('/font_patched.ttf')
else:
    dest_font.save('/font_patched.ttf')
  `)

  logCallback('Reading patched font from virtual filesystem...\n')
  const patchedBytes = pyodide.FS.readFile('/font_patched.ttf')
  logCallback('Patching complete!\n')
  return patchedBytes
}
