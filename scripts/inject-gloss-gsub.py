#!/usr/bin/env python3
"""
Inject GSUB calt rules into the English gloss font.

This is the word-level counterpart of scripts/inject-gsub.py. The pinyin font
only needs GSUB for 51 polyphonic characters; the English gloss font is built
entirely out of GSUB: every vocabulary word is ligated into its pre-composed
composite glyph (English word + Chinese gloss above), parked at a PUA
codepoint by english.ts.

The GSUB table is built directly with fontTools otTables rather than through
feaLib. feaLib compiles every chained-context rule to its own format-3
(coverage-based) subtable; at ~10k words that is ~20-30k subtables, whose
2-byte lookup-header offsets alone exceed OpenType's 16-bit offset arithmetic
— both the HarfBuzz repacker and fontTools' overflow resolution give up
("All candidates overflowed"). Class-based format-2 chained contexts encode
hundreds of rules per subtable, collapsing the whole vocabulary into a few
dozen subtables that pack trivially (and compile in seconds instead of
minutes).

Rule architecture, per chunk of the vocabulary (chunks keep each subtable's
internal 16-bit offsets comfortable):

* One LigatureSubst lookup (LIG) mapping each chunk word's letter sequences
  (lowercase and title-case) to its composite glyph.
* One ChainContextSubst format-2 lookup gating where LIG may apply. Its
  input ClassDef puts [x X] into one class per letter; backtrack and
  lookahead ClassDefs put every letter into class 1. Each first-letter
  class set holds, in order:
  1. a pre-guard rule (backtrack=[letter], no substitutions): any letter
     preceded by a letter is consumed, so only word-start positions are
     ever considered — "love" cannot fire inside "clove", and start of
     text needs no space matching;
  2. per word, longest first: a post-guard rule (input=word classes,
     lookahead=[letter], no substitutions) rejecting "sunday" ≠ "sun"+…,
     then a dispatch rule applying LIG at position 0. At a position that
     survives its guards LIG can only match the guarded word: any longer
     vocabulary word sharing the prefix would have tripped that word's
     post-guard. A mixed-case sequence ("sUn") dispatches but matches no
     ligature and is a no-op.
  Within a class set the first matching rule wins and guard rules consume
  the position, which is exactly the precedence this layout relies on.
  Any partition of words into chunks is correct: lookups scan positions
  independently and every word carries its own post-guard, so a prefix is
  suppressed in its own lookup regardless of which chunk holds a compound.

* Words with context-triggered senses ("river bank" → 河岸) additionally
  get a small format-3 (coverage-based) lookup that runs BEFORE all the
  default lookups, with its own pre/post guards and one backtrack rule per
  context form (raw letters, and the context word's ligated composites for
  robustness), dispatching into a per-word sense LigatureSubst.

Usage:
    python3 scripts/inject-gloss-gsub.py <font.ttf> <gloss-map.json> [output.ttf]

If output.ttf is omitted the input font is overwritten.

Requires: pip3 install fonttools
"""

import json
import os
import sys

try:
    from fontTools.ttLib import TTFont, newTable
    from fontTools.ttLib.tables import otTables
    from fontTools.otlLib.builder import buildLigatureSubstSubtable, buildLookup
except ImportError:
    print("Error: fonttools not installed. Run: pip3 install fonttools", file=sys.stderr)
    sys.exit(1)

# Words per merged lookup pair; sized so a format-2 subtable's internal
# 16-bit offsets (class-set offsets + ~50 bytes of rule data per word) stay
# far below the 64 KB limit.
MAX_WORDS_PER_LOOKUP = 600

LETTER_CLASS = 1  # class of every letter in backtrack/lookahead ClassDefs


def parse_codepoint(cp: str) -> int:
    return int(cp.replace("U+", ""), 16)


class GlyphResolver:
    def __init__(self, font: TTFont):
        self.cmap = font.getBestCmap()
        self.glyph_id = font.getReverseGlyphMap()
        self.missing = []

    def get(self, cp: int, context: str):
        name = self.cmap.get(cp)
        if name is None:
            self.missing.append(f"U+{cp:04X} ({context})")
        return name

    def for_char(self, char: str, context: str):
        return self.get(ord(char), context)

    def sequence(self, text: str, context: str):
        seq = [self.for_char(char, context) for char in text]
        return None if None in seq else seq

    def sorted_glyphs(self, names):
        return sorted(set(names), key=lambda g: self.glyph_id[g])


def letter_glyphs(res: GlyphResolver):
    """{letter: [glyph names for x and X]} for letters present in the cmap."""
    table = {}
    for cp in range(ord("a"), ord("z") + 1):
        pair = [g for g in (res.cmap.get(cp), res.cmap.get(cp - 0x20)) if g]
        if pair:
            table[chr(cp)] = pair
    return table


def make_coverage(res: GlyphResolver, names):
    cov = otTables.Coverage()
    cov.glyphs = res.sorted_glyphs(names)
    return cov


def make_class_def(mapping):
    cd = otTables.ClassDef()
    cd.classDefs = dict(mapping)
    return cd


def subst_record(sequence_index, lookup_index):
    rec = otTables.SubstLookupRecord()
    rec.SequenceIndex = sequence_index
    rec.LookupListIndex = lookup_index
    return rec


def class_rule(backtrack, input_rest, lookahead, records):
    rule = otTables.ChainSubClassRule()
    rule.Backtrack = list(backtrack)
    rule.BacktrackGlyphCount = len(rule.Backtrack)
    rule.Input = list(input_rest)
    rule.InputGlyphCount = len(rule.Input) + 1  # includes the class-set glyph
    rule.LookAhead = list(lookahead)
    rule.LookAheadGlyphCount = len(rule.LookAhead)
    rule.SubstLookupRecord = list(records)
    rule.SubstCount = len(rule.SubstLookupRecord)
    return rule


def build_chunk_lookups(res: GlyphResolver, letters, chunk, lig_lookup_index):
    """(LigatureSubst lookup, format-2 chain lookup) for one vocabulary chunk."""
    letter_class = {letter: i + 1 for i, letter in enumerate(sorted(letters))}

    ligatures = {}
    class_sets = {}  # first-letter class -> [ChainSubClassRule]
    for entry in chunk:  # already sorted longest-first
        word = entry["word"]
        added = False
        for key, text in (("lower", word), ("title", word[0].upper() + word[1:])):
            seq = res.sequence(text, word)
            target = res.get(parse_codepoint(entry[key]), f"{word}.{key}")
            if seq and target:
                ligatures[tuple(seq)] = target
                added = True
        if not added:
            print(f"Warning: skipping '{word}': glyphs missing", file=sys.stderr)
            continue
        classes = [letter_class[char] for char in word]
        rules = class_sets.setdefault(classes[0], [])
        # Post-guard: word followed by another letter never ligates.
        rules.append(class_rule([], classes[1:], [LETTER_CLASS], []))
        rules.append(
            class_rule([], classes[1:], [], [subst_record(0, lig_lookup_index)])
        )

    subtable = otTables.ChainContextSubst()
    subtable.Format = 2
    all_letter_glyphs = [g for pair in letters.values() for g in pair]
    subtable.Coverage = make_coverage(res, all_letter_glyphs)
    subtable.InputClassDef = make_class_def(
        (g, letter_class[letter])
        for letter, pair in letters.items()
        for g in pair
    )
    any_letter = make_class_def((g, LETTER_CLASS) for g in all_letter_glyphs)
    subtable.BacktrackClassDef = any_letter
    subtable.LookAheadClassDef = make_class_def(any_letter.classDefs)

    n_classes = len(letter_class) + 1
    sets = []
    for class_index in range(n_classes):
        rules = class_sets.get(class_index)
        if rules is None:
            sets.append(None)
            continue
        # Pre-guard first: any letter preceded by a letter is consumed, so
        # only word-start positions reach the per-word rules.
        cs = otTables.ChainSubClassSet()
        cs.ChainSubClassRule = [class_rule([LETTER_CLASS], [], [], [])] + rules
        cs.ChainSubClassRuleCount = len(cs.ChainSubClassRule)
        sets.append(cs)
    subtable.ChainSubClassSet = sets
    subtable.ChainSubClassSetCount = len(sets)

    lig = buildLookup([buildLigatureSubstSubtable(ligatures)])
    chain = buildLookup([subtable])
    return lig, chain


def context_rule(res, backtrack_covs, input_covs, lookahead_covs, records):
    rule = otTables.ChainContextSubst()
    rule.Format = 3
    # Binary order for backtrack coverages is closest-glyph-first.
    rule.BacktrackCoverage = list(backtrack_covs)
    rule.BacktrackGlyphCount = len(rule.BacktrackCoverage)
    rule.InputCoverage = list(input_covs)
    rule.InputGlyphCount = len(rule.InputCoverage)
    rule.LookAheadCoverage = list(lookahead_covs)
    rule.LookAheadGlyphCount = len(rule.LookAheadCoverage)
    rule.SubstLookupRecord = list(records)
    rule.SubstCount = len(rule.SubstLookupRecord)
    return rule


def build_context_lookups(res, letters, entry, by_word, lig_lookup_index):
    """(sense LigatureSubst lookup, format-3 chain lookup) for one word."""
    word = entry["word"]
    all_letter_glyphs = [g for pair in letters.values() for g in pair]
    letter_cov = make_coverage(res, all_letter_glyphs)

    def word_input_covs():
        covs = []
        for index, char in enumerate(word):
            names = list(letters.get(char, []))
            if index > 0:
                # Only the first letter varies by case in title form.
                names = [res.for_char(char, word)]
            if not names or None in names:
                return None
            covs.append(make_coverage(res, names))
        return covs

    input_covs = word_input_covs()
    if input_covs is None:
        return None

    ligatures = {}
    rules = [
        # Post- and pre-guards, mirroring the default lookups.
        context_rule(res, [], input_covs, [letter_cov], []),
        context_rule(res, [letter_cov], input_covs, [], []),
    ]
    space = res.get(0x20, "space")
    for alt in entry.get("alternates") or []:
        targets = {}
        for key, text in (("lower", word), ("title", word[0].upper() + word[1:])):
            seq = res.sequence(text, word)
            target = res.get(
                parse_codepoint(alt[key]), f"{word}.{alt['before']}.{key}"
            )
            if seq and target:
                targets[tuple(seq)] = target
        if not targets or space is None:
            continue
        ligatures.update(targets)

        before = alt["before"]
        backtracks = []
        raw = res.sequence(before, before)
        if raw is not None:
            # Closest-first: space, then the context word's letters reversed;
            # its first letter (farthest) accepts both cases.
            covs = [make_coverage(res, [space])]
            for char in reversed(before[1:]):
                covs.append(make_coverage(res, [res.for_char(char, before)]))
            covs.append(make_coverage(res, letters.get(before[0], raw[:1])))
            backtracks.append(covs)
        ctx_entry = by_word.get(before)
        if ctx_entry is not None:
            lig_forms = [
                res.get(parse_codepoint(ctx_entry[key]), f"{before}.{key}")
                for key in ("lower", "title")
            ]
            lig_forms = [g for g in lig_forms if g]
            if lig_forms:
                backtracks.append(
                    [make_coverage(res, [space]), make_coverage(res, lig_forms)]
                )
        for covs in backtracks:
            rules.append(
                context_rule(
                    res, covs, input_covs, [], [subst_record(0, lig_lookup_index)]
                )
            )

    if not ligatures:
        return None
    lig = buildLookup([buildLigatureSubstSubtable(ligatures)])
    chain = buildLookup(rules)
    return lig, chain


def build_gsub(font: TTFont, gloss_map: list):
    res = GlyphResolver(font)
    letters = letter_glyphs(res)
    by_word = {entry["word"]: entry for entry in gloss_map}

    lookups = []
    calt_lookup_indices = []

    # 1. Context-sense lookups run before every default lookup, while the
    #    neighbouring words are still raw letter glyphs.
    n_context = 0
    for entry in gloss_map:
        if not entry.get("alternates"):
            continue
        built = build_context_lookups(res, letters, entry, by_word, len(lookups))
        if built is None:
            continue
        lig, chain = built
        lookups.append(lig)  # index len(lookups)-1 == lig_lookup_index passed
        lookups.append(chain)
        calt_lookup_indices.append(len(lookups) - 1)
        n_context += 1

    # 2. Default ligatures in fixed-size chunks, longest word first.
    sorted_entries = sorted(gloss_map, key=lambda e: (-len(e["word"]), e["word"]))
    for start in range(0, len(sorted_entries), MAX_WORDS_PER_LOOKUP):
        chunk = sorted_entries[start : start + MAX_WORDS_PER_LOOKUP]
        lig, chain = build_chunk_lookups(res, letters, chunk, len(lookups))
        lookups.append(lig)
        lookups.append(chain)
        calt_lookup_indices.append(len(lookups) - 1)

    if res.missing:
        print(
            "Warning: unmapped codepoints: " + ", ".join(sorted(set(res.missing))),
            file=sys.stderr,
        )
    if not calt_lookup_indices:
        return None, 0, 0

    gsub = otTables.GSUB()
    gsub.Version = 0x00010000

    gsub.LookupList = otTables.LookupList()
    gsub.LookupList.Lookup = lookups
    gsub.LookupList.LookupCount = len(lookups)

    feature = otTables.Feature()
    feature.FeatureParams = None
    feature.LookupListIndex = calt_lookup_indices
    feature.LookupCount = len(calt_lookup_indices)
    feature_record = otTables.FeatureRecord()
    feature_record.FeatureTag = "calt"
    feature_record.Feature = feature
    gsub.FeatureList = otTables.FeatureList()
    gsub.FeatureList.FeatureRecord = [feature_record]
    gsub.FeatureList.FeatureCount = 1

    gsub.ScriptList = otTables.ScriptList()
    gsub.ScriptList.ScriptRecord = []
    for tag in ("DFLT", "latn"):
        lang_sys = otTables.DefaultLangSys()
        lang_sys.LookupOrder = None
        lang_sys.ReqFeatureIndex = 0xFFFF
        lang_sys.FeatureIndex = [0]
        lang_sys.FeatureCount = 1
        script = otTables.Script()
        script.DefaultLangSys = lang_sys
        script.LangSysRecord = []
        script.LangSysCount = 0
        record = otTables.ScriptRecord()
        record.ScriptTag = tag
        record.Script = script
        gsub.ScriptList.ScriptRecord.append(record)
    gsub.ScriptList.ScriptCount = len(gsub.ScriptList.ScriptRecord)

    table = newTable("GSUB")
    table.table = gsub
    return table, n_context, len(lookups)


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
    if not font.getBestCmap():
        print("Error: no cmap found in font", file=sys.stderr)
        sys.exit(1)

    gsub, n_context, n_lookups = build_gsub(font, gloss_map)
    if gsub is None:
        print("No GSUB rules generated — nothing to inject.", file=sys.stderr)
        sys.exit(0)

    font["GSUB"] = gsub
    font.save(output_path)
    print(
        f"wrote: {output_path} (GSUB calt: {len(gloss_map)} words, "
        f"{n_context} context-sense words, {n_lookups} lookups)"
    )

    try:
        woff2_path = os.path.splitext(output_path)[0] + ".woff2"
        font.flavor = "woff2"
        font.save(woff2_path)
        print(f"wrote: {woff2_path}")
    except Exception as exc:  # brotli may be unavailable
        print(f"Note: skipped WOFF2 ({exc})", file=sys.stderr)


if __name__ == "__main__":
    main()
