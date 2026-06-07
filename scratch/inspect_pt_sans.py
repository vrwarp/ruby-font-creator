from fontTools.ttLib import TTFont

font = TTFont('frontend/public/resources/fonts/PT_Sans-Narrow-Web-Regular.ttf')
cmap = font.getBestCmap()

# Check if standard accents exist
accents = {
    0x02C7: 'caron',
    0x02D8: 'breve',
    0x00B8: 'cedilla',
    0x00A8: 'dieresis',
    0x02C6: 'circumflex',
    0x00AF: 'macron',
    0x00B4: 'acute',
    0x0060: 'grave'
}

for cp, name in accents.items():
    print(f"Code point {cp:#x} ({name}): {'present' if cp in cmap else 'absent'}")

# Check base glyphs
bases = ['A', 'E', 'I', 'O', 'U', 'C', 'S', 'Z', 'a', 'e', 'i', 'o', 'u', 'c', 's', 'z', 'Umlaut', 'dieresis']
for base in bases:
    present = any(ord(c) in cmap for c in base) if len(base) == 1 else False
    if len(base) > 1:
        # check glyph by name
        present = base in font.getGlyphOrder()
    print(f"Base '{base}': {present}")
