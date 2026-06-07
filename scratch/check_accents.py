from fontTools.ttLib import TTFont
font = TTFont('resources/fonts/DroidSansFallbackFull.ttf')
cmap = font.getBestCmap()
accents = {
    'macron_00AF': 0x00AF,
    'macron_02C9': 0x02C9,
    'macron_0304': 0x0304,
    'acute_00B4': 0x00B4,
    'acute_02CA': 0x02CA,
    'acute_0301': 0x0301,
    'caron_02C7': 0x02C7,
    'caron_030C': 0x030C,
    'grave_0060': 0x0060,
    'grave_02CB': 0x02CB,
    'grave_0300': 0x0300
}
for name, cp in accents.items():
    print(f"{name} (U+{cp:04X}): {'In cmap' if cp in cmap else 'NOT in cmap'}")
