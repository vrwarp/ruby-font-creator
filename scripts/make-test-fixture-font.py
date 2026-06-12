#!/usr/bin/env python3
"""Generate test/fixtures/trad-only.ttf for the patch-font integration tests.

Subsets resources/fonts/DroidSansFallbackFull.ttf down to a handful of
TRADITIONAL-only characters (plus common shared chars), so tests can verify
that simplified codepoints get aliased/injected into a font that lacks them.

The fixture is derived from Droid Sans Fallback, Apache License 2.0.

Usage: python3 scripts/make-test-fixture-font.py
Requires: pip3 install fonttools
"""

import os

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

# Traditional forms (愛書馬龍國發後乾幹) + common shared chars.
CHARS = '愛書馬龍國發後乾幹的一是不了人我在有他'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IN_PATH = os.path.join(ROOT, 'resources', 'fonts', 'DroidSansFallbackFull.ttf')
OUT_PATH = os.path.join(ROOT, 'test', 'fixtures', 'trad-only.ttf')


def main():
    options = Options()
    options.glyph_names = False
    subsetter = Subsetter(options=options)
    subsetter.populate(text=CHARS)
    font = TTFont(IN_PATH)
    subsetter.subset(font)
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    font.save(OUT_PATH)
    print('wrote %s: %d glyphs, %d bytes, tables %s' % (
        OUT_PATH,
        font['maxp'].numGlyphs,
        os.path.getsize(OUT_PATH),
        ' '.join(sorted(font.keys())),
    ))


if __name__ == '__main__':
    main()
