from fontTools.ttLib import TTFont

font = TTFont('frontend/public/resources/fonts/PT_Sans-Narrow-Web-Regular.ttf')
glyf = font['glyf']

names = ['caron', 'udieresis', 'udieresiscaron']
for name in names:
    glyph = glyf[name]
    print(f"Glyph '{name}': bounds= xMin={glyph.xMin}, yMin={glyph.yMin}, xMax={glyph.xMax}, yMax={glyph.yMax}")
