from fontTools.ttLib import TTFont

fonts = [
    'frontend/public/resources/fonts/PT_Sans-Narrow-Web-Regular.ttf',
    'frontend/public/resources/fonts/PT_Sans-Narrow-Web-Bold.ttf'
]

chars = [
    (0x00FC, 'ü'),
    (0x01D6, 'ǖ'),
    (0x01D8, 'ǘ'),
    (0x01DA, 'ǚ'),
    (0x01DC, 'ǜ')
]

for filepath in fonts:
    font = TTFont(filepath)
    cmap = font.getBestCmap()
    print(f"\nFont: {filepath}")
    for cp, char in chars:
        present = cp in cmap
        gname = cmap.get(cp) if present else None
        print(f"  Character {char} (U+{cp:04X}): {'present' if present else 'absent'} (glyph name: {gname})")
