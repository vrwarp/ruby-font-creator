#!/usr/bin/env python3
"""
Inject GSUB calt rules into the English gloss font.

This is the word-level counterpart of scripts/inject-gsub.py. The pinyin font
only needs GSUB for 51 polyphonic characters; the English gloss font is built
entirely out of GSUB: every vocabulary word is ligated into its pre-composed
composite glyph (English word + Chinese gloss above), parked at a PUA
codepoint by english.ts.

Rule architecture — designed so that both feaLib compile time and runtime
shaping stay flat as the vocabulary grows to tens of thousands of words
(one lookup per word is quadratic in both and melts down around 10k words):

1. Small per-word lookups ONLY for words with context-triggered senses
   (e.g. "river bank" → 河岸). These run first, while the neighbouring words
   are still raw letter glyphs.
2. One merged `gloss_words` lookup holding every default ligature:
   - A single global pre-guard `ignore sub @LETTER @LETTER';` skips every
     position that is preceded by a letter, so only word-start positions are
     ever considered. This alone prevents "love" firing inside "clove", and
     it works at start-of-text where no explicit space could be matched.
   - Per word, one case-insensitive post-guard
     `ignore sub @L_s' @L_u' @L_n' @LETTER;` (built from [x X] classes)
     rejects matches followed by more letters ("sunday" ≠ "sun" + …).
   - Then the lowercase and title-case ligature subs.
   Rules are ordered longest-word-first, so at a shared word-start position
   a compound ("sunday") matches before its prefix ("sun") can be rejected
   or fire.

Within a lookup the first matching rule wins and `ignore` consumes the
position, which is exactly the precedence the ordering above relies on.

Usage:
    python3 scripts/inject-gloss-gsub.py <font.ttf> <gloss-map.json> [output.ttf]

If output.ttf is omitted the input font is overwritten. A .fea file is
written next to the output for inspection.

Requires: pip3 install fonttools
"""

import json
import os
import sys

try:
    from fontTools.ttLib import TTFont
    from fontTools.feaLib.builder import addOpenTypeFeatures
except ImportError:
    print("Error: fonttools not installed. Run: pip3 install fonttools", file=sys.stderr)
    sys.exit(1)


def parse_codepoint(cp: str) -> int:
    return int(cp.replace("U+", ""), 16)


class GlyphNames:
    """Codepoint → glyph-name resolution with error tracking."""

    def __init__(self, cmap: dict):
        self.cmap = cmap
        self.missing = []

    def get(self, cp: int, context: str):
        name = self.cmap.get(cp)
        if name is None:
            self.missing.append(f"U+{cp:04X} ({context})")
        return name

    def for_char(self, char: str, context: str):
        return self.get(ord(char), context)


def letter_sequence(names: GlyphNames, text: str, word: str):
    """Glyph names for each letter of `text`, or None if any is unmapped."""
    seq = []
    for char in text:
        name = names.for_char(char, f"letter '{char}' of {word})")
        if name is None:
            return None
        seq.append(name)
    return seq


def marked(seq):
    return " ".join(f"{g}'" for g in seq)


def case_class_guard(word: str) -> str:
    """Marked case-insensitive class sequence for `word`, e.g. "@L_s' @L_u'"."""
    return " ".join(f"@L_{char}'" for char in word)


def context_backtracks(names: GlyphNames, alt: dict, by_word: dict):
    """All backtrack strings that represent `alt['before']` + space.

    Context lookups run before the merged default lookup, so the preceding
    word is normally still raw letters; its ligated composites are matched
    too, for robustness against lookup reordering.
    """
    before = alt["before"]
    space = names.get(0x20, "space")
    if space is None:
        return []

    backtracks = []
    lower_seq = letter_sequence(names, before, before)
    if lower_seq:
        first_title = names.for_char(before[0].upper(), before)
        first = (
            f"[{lower_seq[0]} {first_title}]" if first_title else lower_seq[0]
        )
        raw = " ".join([first] + lower_seq[1:])
        backtracks.append(f"{raw} {space}")

    entry = by_word.get(before)
    if entry is not None:
        lig_forms = []
        for key in ("lower", "title"):
            lig = names.get(parse_codepoint(entry[key]), f"{before}.{key}")
            if lig:
                lig_forms.append(lig)
        if lig_forms:
            backtracks.append(f"[{' '.join(lig_forms)}] {space}")

    return backtracks


def build_fea(gloss_map: list, cmap: dict) -> str:
    names = GlyphNames(cmap)
    by_word = {entry["word"]: entry for entry in gloss_map}

    letters = []
    case_classes = []
    for cp in range(ord("a"), ord("z") + 1):
        lower = cmap.get(cp)
        upper = cmap.get(cp - 0x20)
        pair = [g for g in (lower, upper) if g]
        letters.extend(pair)
        if pair:
            case_classes.append(f"@L_{chr(cp)} = [{' '.join(pair)}];")

    lines = [
        "# Auto-generated GSUB calt rules for the English gloss font",
        "# Generated by ruby-font-creator/scripts/inject-gloss-gsub.py",
        "",
        "languagesystem DFLT dflt;",
        "languagesystem latn dflt;",
        "",
        f"@LETTER = [{' '.join(letters)}];",
        *case_classes,
        "",
    ]

    lookup_names = []

    # 1. Per-word context lookups for alternate senses, before the merged
    #    default lookup so neighbours are still raw letters.
    for entry in gloss_map:
        alternates = entry.get("alternates") or []
        if not alternates:
            continue
        word = entry["word"]
        variants = []
        for key, text in (("lower", word), ("title", word[0].upper() + word[1:])):
            seq = letter_sequence(names, text, word)
            if seq:
                variants.append((seq, key))
        if not variants:
            continue

        rules = [
            f"    ignore sub @LETTER {case_class_guard(word)};",
            f"    ignore sub {case_class_guard(word)} @LETTER;",
        ]
        n_context_rules = 0
        for alt in alternates:
            for backtrack in context_backtracks(names, alt, by_word):
                for seq, key in variants:
                    alt_target = names.get(
                        parse_codepoint(alt[key]), f"{word}.{alt['before']}.{key}"
                    )
                    if alt_target:
                        rules.append(
                            f"    sub {backtrack} {marked(seq)} by {alt_target};"
                            f"  # {alt['before']} {word} -> {alt['gloss']}"
                        )
                        n_context_rules += 1
        if not n_context_rules:
            continue

        lookup_name = f"gloss_ctx_{word}"
        lines.append(f"lookup {lookup_name} {{")
        lines.extend(rules)
        lines.append(f"}} {lookup_name};")
        lines.append("")
        lookup_names.append(lookup_name)

    # 2. One merged lookup with every default ligature.
    word_rules = []
    for entry in sorted(gloss_map, key=lambda e: (-len(e["word"]), e["word"])):
        word = entry["word"]
        subs = []
        for key, text in (("lower", word), ("title", word[0].upper() + word[1:])):
            seq = letter_sequence(names, text, word)
            target = names.get(parse_codepoint(entry[key]), f"{word}.{key}")
            if seq and target:
                subs.append(f"    sub {marked(seq)} by {target};")
        if not subs:
            print(f"Warning: skipping '{word}': glyphs missing", file=sys.stderr)
            continue
        word_rules.append(f"    ignore sub {case_class_guard(word)} @LETTER;")
        word_rules.extend(subs)

    if word_rules:
        lines.append("lookup gloss_words {")
        # Global pre-guard: only word-start positions (not preceded by a
        # letter) are ever considered; interior positions are consumed here.
        lines.append("    ignore sub @LETTER @LETTER';")
        lines.extend(word_rules)
        lines.append("} gloss_words;")
        lines.append("")
        lookup_names.append("gloss_words")

    if not lookup_names:
        return ""

    lines.append("feature calt {")
    for name in lookup_names:
        lines.append(f"  lookup {name};")
    lines.append("} calt;")
    lines.append("")

    if names.missing:
        print(
            "Warning: unmapped codepoints: " + ", ".join(sorted(set(names.missing))),
            file=sys.stderr,
        )

    return "\n".join(lines)


def main() -> None:
    if len(sys.argv) < 3:
        print(
            f"Usage: {sys.argv[0]} <font.ttf> <gloss-map.json> [output.ttf]",
            file=sys.stderr,
        )
        sys.exit(1)

    font_path = sys.argv[1]
    map_path = sys.argv[2]
    output_path = sys.argv[3] if len(sys.argv) > 3 else font_path

    with open(map_path, encoding="utf-8") as f:
        gloss_map = json.load(f)

    font = TTFont(font_path)
    cmap = font.getBestCmap()
    if not cmap:
        print("Error: no cmap found in font", file=sys.stderr)
        sys.exit(1)

    fea_content = build_fea(gloss_map, cmap)
    if not fea_content:
        print("No GSUB rules generated — nothing to inject.", file=sys.stderr)
        sys.exit(0)

    fea_path = os.path.splitext(output_path)[0] + ".fea"
    with open(fea_path, "w", encoding="utf-8") as f:
        f.write(fea_content)
    print(f"wrote: {fea_path}")

    addOpenTypeFeatures(font, fea_path)
    font.save(output_path)
    print(f"wrote: {output_path} (with GSUB calt)")

    try:
        woff2_path = os.path.splitext(output_path)[0] + ".woff2"
        font.flavor = "woff2"
        font.save(woff2_path)
        print(f"wrote: {woff2_path}")
    except Exception as exc:  # brotli may be unavailable
        print(f"Note: skipped WOFF2 ({exc})", file=sys.stderr)


if __name__ == "__main__":
    main()
