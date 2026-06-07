from fontTools.ttLib import TTFont
font = TTFont('resources/fonts/DroidSansFallbackFull.ttf')
cmap = font.getBestCmap()
for char in ['ǎ', 'ǐ', 'ǒ', 'ǔ', 'ǚ']:
    cp = ord(char)
    print(f"{char} (U+{cp:04X}): {'In cmap' if cp in cmap else 'NOT in cmap'}")
