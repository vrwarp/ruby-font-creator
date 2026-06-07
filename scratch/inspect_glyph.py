from fontTools.ttLib import TTFont
font = TTFont("resources/fonts/PT_Sans-Narrow-Web-Regular.ttf")
glyf = font['glyf']
g = glyf['A']
print("Attributes:", dir(g))
if hasattr(g, 'xMin'):
    print(f"BBox: {g.xMin}, {g.yMin}, {g.xMax}, {g.yMax}")
