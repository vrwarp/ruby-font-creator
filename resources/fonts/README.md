Should contain fonts to use (also needed by Travis/CI).

### PT Sans Narrow (Modified for Pinyin Support)

Versicle bundles a modified version of the [PT Sans Narrow](https://fonts.google.com/specimen/PT+Sans+Narrow) font family (Regular & Bold), originally created by [ParaType](https://www.paratype.com/) (Alexandra Korolkova, Olga Umpeleva, and Vladimir Yefimov) under the [SIL Open Font License 1.1](https://openfontlicense.org/).

Modifications:

-   Lacking native support for Hanyu Pinyin characters with tone marks, we programmatically injected the missing 3rd-tone (caron/hacek) composite glyphs (`ǎ`, `ǐ`, `ǒ`, `ǔ`, `ǚ`) into the local TrueType font binaries (`public/fonts/PT_Sans-Narrow-Web-*.ttf`) using Python `fonttools` to perfectly align and center the caron accent (`caron`) over their respective base vowel glyphs (`a`, `dotlessi`, `o`, `u`, `udieresis`).
