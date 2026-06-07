from fontTools.ttLib import TTFont

font = TTFont('frontend/public/resources/fonts/DroidSansFallbackFull.ttf')
cmap = font.getBestCmap()

chars = [
    (0x00FC, 'ü'),
    (0x01D6, 'ǖ'),
    (0x01D8, 'ǘ'),
    (0x01DA, 'ǚ'),
    (0x01DC, 'ǜ')
]

for cp, char in chars:
    present = cp in cmap
    gname = cmap.get(cp) if present else None
    print(f"Character {char} (U+{cp:04X}): {'present' if present else 'absent'} (glyph name: {gname})")
