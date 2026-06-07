from fontTools.ttLib import TTFont

font = TTFont('frontend/public/resources/fonts/PT_Sans-Narrow-Web-Regular.ttf')
glyf = font['glyf']

names = ['Udieresis']
for name in names:
    glyph = glyf[name]
    print(f"Glyph {name}:")
    if glyph.numberOfContours < 0:
        for i, comp in enumerate(glyph.components):
            print(f"  Component {i}: glyphName={comp.glyphName}, x={comp.x}, y={comp.y}, flags={comp.flags:#x}")
    else:
        print("  Not composite")
