#!/usr/bin/env python3
"""
Shape real text with HarfBuzz against the built English gloss font and assert
that the GSUB calt rules behave: vocabulary words ligate into their composite
glyphs, boundary guards stop substring matches, and context rules pick the
right sense (river bank → 河岸, hot spring → 温泉).

Usage:
    python3 scripts/verify-gloss-shaping.py <font.ttf> <gloss-map.json>

Requires: pip3 install fonttools uharfbuzz
"""

import json
import sys

try:
    import uharfbuzz as hb
    from fontTools.ttLib import TTFont
except ImportError as exc:
    print(f"Error: missing dependency ({exc}). Run: pip3 install fonttools uharfbuzz",
          file=sys.stderr)
    sys.exit(1)


def parse_codepoint(cp: str) -> int:
    return int(cp.replace("U+", ""), 16)


def shape(font: "hb.Font", text: str):
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"calt": True, "liga": True, "kern": True})
    return [info.codepoint for info in buf.glyph_infos]


def main() -> None:
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <font.ttf> <gloss-map.json>", file=sys.stderr)
        sys.exit(1)

    font_path, map_path = sys.argv[1], sys.argv[2]
    with open(map_path, encoding="utf-8") as f:
        gloss_map = {entry["word"]: entry for entry in json.load(f)}

    tt = TTFont(font_path)
    cmap = tt.getBestCmap()
    name_to_gid = {name: gid for gid, name in enumerate(tt.getGlyphOrder())}

    def gid_for(codepoint_str: str) -> int:
        return name_to_gid[cmap[parse_codepoint(codepoint_str)]]

    blob = hb.Blob.from_file_path(font_path)
    face = hb.Face(blob)
    font = hb.Font(face)

    bank = gloss_map["bank"]
    spring = gloss_map["spring"]
    river = gloss_map["river"]
    love = gloss_map["love"]
    music = gloss_map["music"]
    sun = gloss_map["sun"]
    day = gloss_map["day"]
    sunday = gloss_map["sunday"]
    some = gloss_map["some"]
    one = gloss_map["one"]
    someone = gloss_map["someone"]
    december = gloss_map["december"]

    # (label, text, gids that must appear, gids that must NOT appear)
    cases = [
        ("lowercase word ligates", "love",
         [gid_for(love["lower"])], []),
        ("title-case word ligates", "Love",
         [gid_for(love["title"])], [gid_for(love["lower"])]),
        ("guard: trailing letters", "lovely",
         [], [gid_for(love["lower"]), gid_for(love["title"])]),
        ("guard: leading letters", "clove",
         [], [gid_for(love["lower"])]),
        ("guard: both sides", "cloves",
         [], [gid_for(love["lower"])]),
        ("sentence ligates each word", "I love music",
         [gid_for(love["lower"]), gid_for(music["lower"])], []),
        ("default sense", "bank",
         [gid_for(bank["lower"])], [gid_for(bank["alternates"][0]["lower"])]),
        ("context sense: river bank", "river bank",
         [gid_for(river["lower"]), gid_for(bank["alternates"][0]["lower"])],
         [gid_for(bank["lower"])]),
        ("context sense, title-case trigger", "River bank",
         [gid_for(river["title"]), gid_for(bank["alternates"][0]["lower"])],
         [gid_for(bank["lower"])]),
        ("context sense: hot spring", "hot spring",
         [gid_for(spring["alternates"][0]["lower"])], [gid_for(spring["lower"])]),
        ("default sense: spring", "spring came",
         [gid_for(spring["lower"])], [gid_for(spring["alternates"][0]["lower"])]),
        ("no false context", "west bank",
         [gid_for(bank["lower"])], [gid_for(bank["alternates"][0]["lower"])]),
        ("word containing two vocab words", "sunday",
         [gid_for(sunday["lower"])],
         [gid_for(sun["lower"]), gid_for(day["lower"])]),
        ("compound beats its parts", "someone",
         [gid_for(someone["lower"])],
         [gid_for(some["lower"]), gid_for(one["lower"])]),
        ("title-case month", "December",
         [gid_for(december["title"])], [gid_for(december["lower"])]),
        ("parts still ligate alone", "some day",
         [gid_for(some["lower"]), gid_for(day["lower"])], []),
    ]

    failures = 0
    for label, text, must, must_not in cases:
        gids = shape(font, text)
        missing = [g for g in must if g not in gids]
        present = [g for g in must_not if g in gids]
        ok = not missing and not present
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {label}: {text!r} -> {gids}")
        if missing:
            print(f"       expected glyph id(s) {missing} not found")
        if present:
            print(f"       unexpected glyph id(s) {present} found")
        failures += 0 if ok else 1

    if failures:
        print(f"\n{failures}/{len(cases)} shaping checks failed", file=sys.stderr)
        sys.exit(1)
    print(f"\nAll {len(cases)} shaping checks passed.")


if __name__ == "__main__":
    main()
