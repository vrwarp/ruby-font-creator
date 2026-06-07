from fontTools.ttLib import TTFont
font = TTFont('resources/fonts/PT_Sans-Narrow-Web-Regular.ttf')
cmap = font.getBestCmap()
for char in ['Ǎ', 'Ǐ', 'Ǒ', 'Ǔ', 'Ǚ']:
    cp = ord(char)
    print(f"{char} (U+{cp:04X}): {'In cmap' if cp in cmap else 'NOT in cmap'}")
