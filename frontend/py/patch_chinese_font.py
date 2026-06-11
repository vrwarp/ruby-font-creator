#!/usr/bin/env python3
"""Patch a Chinese fallback font with codepoint aliases and synthetic glyphs.

Runs in two environments:

* Pyodide (fontTools wheel) in the browser: the host injects the globals
  ``patch_spec_json`` (a JSON string) and ``log_js`` (a callable) via
  ``pyodide.globals.set`` before executing this file, which then patches
  '/chinese_font.ttf' into '/chinese_font_patched.ttf'.
* CLI (used by the integration tests):
  python3 patch_chinese_font.py <in.ttf> <spec.json> <out.ttf>

Spec format:
  {
    "aliases": [{"cp": <int>, "toCp": <int>}, ...],
    "glyphs": [{"cp": <int>,
                "contours": [[[x, y], [x, y], ...], ...],
                "targetCp": <int or null>}, ...]
  }

* aliases map ``cp`` to the glyph that ``toCp`` resolves to in the font's
  best cmap (skipped with a log message when ``toCp`` is unmapped).
* glyph contours are implicitly-closed polylines on a 128x128 y-DOWN grid;
  they are uniformly scaled into the bounding box of ``targetCp``'s glyph
  (or a default box derived from unitsPerEm).

Compatible with fontTools 4.51 (Pyodide wheel) and 4.60+ (system).
"""

import json
import sys

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont


def _unicode_subtables(font):
    return [sub for sub in font['cmap'].tables if sub.isUnicode()]


def _can_map(font, cp):
    """True if some unicode cmap subtable can hold cp.

    Format-4 subtables only accept BMP codepoints; format 12 accepts any.
    """
    for sub in _unicode_subtables(font):
        if sub.format == 4 and cp > 0xFFFF:
            continue
        return True
    return False


def _set_cmap(font, cp, glyph_name, log):
    """Map cp -> glyph_name on every unicode subtable that can hold it."""
    updated = False
    for sub in _unicode_subtables(font):
        if sub.format == 4 and cp > 0xFFFF:
            continue
        sub.cmap[cp] = glyph_name
        updated = True
    if not updated:
        log('skip U+%04X: no unicode cmap subtable accepts this codepoint'
            % cp)
    return updated


def _glyph_bbox(glyf, name):
    """(xMin, yMin, xMax, yMax) of a glyph with a non-empty bbox, else None."""
    if name not in glyf.glyphs:
        return None
    glyph = glyf[name]  # __getitem__ expands the lazily-loaded glyph
    x_min = getattr(glyph, 'xMin', None)
    if x_min is None:
        return None
    bbox = (x_min, glyph.yMin, glyph.xMax, glyph.yMax)
    if bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
        return None
    return bbox


def _glyph_name_for(cp, best_cmap):
    if cp in best_cmap:
        return best_cmap[cp]
    if cp > 0xFFFF:
        return 'u%X' % cp
    return 'uni%04X' % cp


def _add_glyph(font, gspec, best_cmap, log):
    cp = gspec['cp']
    contours = [c for c in (gspec.get('contours') or []) if len(c) >= 3]
    if not contours:
        log('skip glyph U+%04X: no contour with 3+ points' % cp)
        return False
    if not _can_map(font, cp):
        log('skip glyph U+%04X: no unicode cmap subtable accepts this '
            'codepoint' % cp)
        return False

    # Ink bbox on the 128x128 y-down design grid.
    xs = [p[0] for contour in contours for p in contour]
    ys = [p[1] for contour in contours for p in contour]
    ink_min_x, ink_max_x = min(xs), max(xs)
    ink_min_y, ink_max_y = min(ys), max(ys)
    ink_w = ink_max_x - ink_min_x
    ink_h = ink_max_y - ink_min_y
    if ink_w <= 0 and ink_h <= 0:
        log('skip glyph U+%04X: degenerate ink bbox' % cp)
        return False

    upm = font['head'].unitsPerEm
    glyf = font['glyf']
    hmtx = font['hmtx']

    # Target box + advance in font units, copied from targetCp when usable.
    target_cp = gspec.get('targetCp')
    target_name = best_cmap.get(target_cp) if target_cp is not None else None
    box = None
    advance = None
    if target_name is not None:
        box = _glyph_bbox(glyf, target_name)
        if box is not None:
            advance = hmtx[target_name][0]
    if box is None:
        advance = upm
        box = (
            int(round(0.08 * upm)),
            int(round(-0.12 * upm)),
            int(round(0.92 * upm)),
            int(round(0.88 * upm)),
        )

    t_min_x, t_min_y, t_max_x, t_max_y = box
    scales = []
    if ink_w > 0:
        scales.append((t_max_x - t_min_x) / ink_w)
    if ink_h > 0:
        scales.append((t_max_y - t_min_y) / ink_h)
    s = min(scales)
    ink_cx = (ink_min_x + ink_max_x) / 2.0
    ink_cy = (ink_min_y + ink_max_y) / 2.0
    t_cx = (t_min_x + t_max_x) / 2.0
    t_cy = (t_min_y + t_max_y) / 2.0

    pen = TTGlyphPen(None)
    x_min = y_max = None
    for contour in contours:
        points = [
            (
                int(round(t_cx + (px - ink_cx) * s)),
                # y-down grid -> y-up font units
                int(round(t_cy + (ink_cy - py) * s)),
            )
            for px, py in contour
        ]
        for px, py in points:
            if x_min is None or px < x_min:
                x_min = px
            if y_max is None or py > y_max:
                y_max = py
        pen.moveTo(points[0])
        for point in points[1:]:
            pen.lineTo(point)
        pen.closePath()

    name = _glyph_name_for(cp, best_cmap)
    # glyf.__setitem__ already appends new names to the shared glyphOrder
    # list; appending to font.getGlyphOrder() too would break maxp.recalc.
    glyf[name] = pen.glyph()
    hmtx[name] = (advance, x_min)

    if 'vmtx' in font:
        vmtx = font['vmtx']
        if target_name is not None and target_name in vmtx.metrics:
            vmtx[name] = vmtx[target_name]
        else:
            tsb = max(0, int(round(0.88 * upm)) - y_max)
            vmtx[name] = (upm, tsb)

    _set_cmap(font, cp, name, log)
    return True


def patch_font(in_path, out_path, spec, log):
    font = TTFont(in_path)
    best_cmap = font.getBestCmap()

    n_aliases = 0
    for alias in spec.get('aliases') or []:
        cp = alias['cp']
        to_cp = alias['toCp']
        glyph_name = best_cmap.get(to_cp)
        if glyph_name is None:
            log('skip alias U+%04X -> U+%04X: target not in cmap'
                % (cp, to_cp))
            continue
        if _set_cmap(font, cp, glyph_name, log):
            n_aliases += 1

    n_glyphs = 0
    for gspec in spec.get('glyphs') or []:
        if _add_glyph(font, gspec, best_cmap, log):
            n_glyphs += 1

    font.save(out_path)
    log('patched %d alias(es), %d glyph(s) -> %s'
        % (n_aliases, n_glyphs, out_path))


_g = globals()
if 'patch_spec_json' in _g:
    # Pyodide: host injected patch_spec_json + log_js via pyodide.globals.set
    patch_font('/chinese_font.ttf', '/chinese_font_patched.ttf',
               json.loads(_g['patch_spec_json']), _g['log_js'])
elif __name__ == '__main__' and len(sys.argv) >= 4:
    with open(sys.argv[2]) as spec_file:
        patch_font(sys.argv[1], sys.argv[3], json.load(spec_file), print)
elif __name__ == '__main__':
    print('usage: python3 patch_chinese_font.py <in.ttf> <spec.json> '
          '<out.ttf>', file=sys.stderr)
    sys.exit(2)
