#!/usr/bin/env python3
"""
Generate src/gloss-generated.json — the bulk English → Chinese vocabulary for
the English gloss font — from ECDICT (github.com/skywind3000/ECDICT, MIT).

Selection: entries tagged `zk` (中考, China's grade-9 exam list), `gk`
(高考, high school), or `cet4` (college band 4 — needed because everyday
words like "solution" and "community" carry only that tag). Together these
approximate a 9th-grade English reading vocabulary, expanded with their
inflected forms from ECDICT's `exchange` field (GSUB cannot stem, so every
surface form needs an entry).

Gloss extraction from the `translation` field: take the first sense line,
strip the part-of-speech prefix, split on Chinese/ASCII separators, and keep
the first token that is pure Han and at most MAX_GLOSS_LEN characters. Lines
with domain markers ([医], [计], …) and glosses with Latin letters or
ellipses (在...里) are skipped — which conveniently filters out most
prepositions that have no stable standalone gloss.

The curated dictionary in src/gloss-data.ts always wins: it is loaded here
and its words are excluded from the generated output, along with a banned
list of function words and known-ambiguous forms.

Usage:
    python3 scripts/generate-gloss-data.py [path/to/ecdict.csv]

Downloads ecdict.csv (~66 MB) to data/english/ecdict.csv via curl when the
file is missing. The output src/gloss-generated.json is committed; the raw
CSV is gitignored.
"""

import csv
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CSV = os.path.join(ROOT, 'data', 'english', 'ecdict.csv')
OUT_PATH = os.path.join(ROOT, 'src', 'gloss-generated.json')
CURATED_PATH = os.path.join(ROOT, 'src', 'gloss-data.ts')
ECDICT_URL = (
    'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv'
)

GRADE_TAGS = {'zk', 'gk', 'cet4'}
MAX_GLOSS_LEN = 6
WORD_RE = re.compile(r'^[a-z]{2,20}$')
HAN_RE = re.compile(r'^[㐀-䶿一-鿿]+$')
POS_RE = re.compile(
    r'^(?:n|v|vt|vi|a|ad|adj|adv|prep|conj|pron|art|num|int|interj|aux|na|s|u|c'
    r')\.\s*'
)
SEP_RE = re.compile(r'[,;，；、]')

# Function words and known-ambiguous forms that must not receive a gloss.
# ("may"/"march": lowercase is the auxiliary/verb, not the month; "lives" and
# "left": competing senses too frequent — a wrong gloss is worse than none.)
BANNED = {
    'the', 'an', 'of', 'to', 'at', 'by', 'as', 'and', 'or', 'nor', 'via',
    'per', 'will', 'would', 'could', 'shall', 'might', 'may', 'march',
    'lives', 'left', 'wont', 'ought', 'been',
}

# exchange-field codes that are real surface forms of the same lexeme
EXCHANGE_CODES = {'p', 'd', 'i', '3', 's', 'r', 't'}


def curated_words():
    """Words already present in the curated src/gloss-data.ts dictionary."""
    with open(CURATED_PATH, encoding='utf-8') as f:
        return set(re.findall(r"word: '([a-z]+)'", f.read()))


def extract_gloss(translation: str):
    """First short pure-Han sense from an ECDICT translation field."""
    if not translation:
        return None
    # The field stores newlines as literal \r\n / \n escape sequences.
    for line in re.split(r'\\r\\n|\\n|\r|\n', translation):
        line = line.strip()
        if not line or line.startswith('['):
            continue
        line = POS_RE.sub('', line)
        for token in SEP_RE.split(line):
            token = token.strip()
            if HAN_RE.fullmatch(token) and len(token) <= MAX_GLOSS_LEN:
                return token
    return None


def inflected_forms(exchange: str):
    for part in (exchange or '').split('/'):
        if ':' not in part:
            continue
        code, form = part.split(':', 1)
        if code in EXCHANGE_CODES and WORD_RE.fullmatch(form):
            yield form


def frequency(row):
    for key in ('frq', 'bnc'):
        value = row.get(key) or ''
        if value.isdigit() and int(value) > 0:
            return int(value)
    return 10**9


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    if not os.path.exists(csv_path):
        print(f'{csv_path} missing; downloading ECDICT (~66 MB)...',
              file=sys.stderr)
        os.makedirs(os.path.dirname(csv_path), exist_ok=True)
        subprocess.run(['curl', '-sSL', '-o', csv_path, ECDICT_URL],
                       check=True)

    skip = curated_words() | BANNED
    print(f'curated words (kept authoritative): {len(skip - BANNED)}')

    lemmas = []
    with open(csv_path, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            word = row['word']
            tags = set((row.get('tag') or '').split())
            if not tags & GRADE_TAGS or not WORD_RE.fullmatch(word):
                continue
            gloss = extract_gloss(row.get('translation') or '')
            if gloss is None:
                continue
            lemmas.append((frequency(row), word, gloss,
                           list(inflected_forms(row.get('exchange') or ''))))

    # Frequent lemmas claim surface forms first, so e.g. "saw" belongs to
    # "see" (p:saw) or the lemma "saw", whichever is more frequent.
    lemmas.sort(key=lambda item: (item[0], item[1]))
    taken = dict()
    n_lemma = 0
    for _freq, word, gloss, _forms in lemmas:
        if word not in taken and word not in skip:
            taken[word] = gloss
            n_lemma += 1
    n_inflected = 0
    for _freq, _word, gloss, forms in lemmas:
        for form in forms:
            if form not in taken and form not in skip:
                taken[form] = gloss
                n_inflected += 1

    entries = [{'word': w, 'gloss': g} for w, g in sorted(taken.items())]
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'zk/gk lemmas with usable gloss: {n_lemma}')
    print(f'inflected forms added: {n_inflected}')
    print(f'wrote: {OUT_PATH} ({len(entries)} entries)')


if __name__ == '__main__':
    main()
