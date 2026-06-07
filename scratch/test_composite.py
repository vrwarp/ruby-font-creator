import os
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen

font_path = "resources/fonts/PT_Sans-Narrow-Web-Regular.ttf"
font = TTFont(font_path)
cmap = font.getBestCmap()
glyf = font['glyf']
hmtx = font['hmtx']
glyph_order = font.getGlyphOrder()

composites = {
    'Ǎ': ('A', 0x02C7),
    'Ǐ': ('I', 0x02C7),
    'Ǒ': ('O', 0x02C7),
    'Ǔ': ('U', 0x02C7),
    'Ǚ': ('Ü', 0x02C7)
}

for char, (base_char, accent_cp) in composites.items():
    cp = ord(char)
    base_cp = ord(base_char)
    
    # Resolve glyph names
    base_gname = cmap.get(base_cp)
    accent_gname = cmap.get(accent_cp)
    
    if not base_gname:
        print(f"Base character '{base_char}' not found in font.")
        continue
    if not accent_gname:
        print(f"Accent character U+{accent_cp:04X} not found in font.")
        continue
        
    dest_gname = f"uni{cp:04X}"
    
    # Get bounding boxes
    bg = glyf[base_gname]
    ag = glyf[accent_gname]
    
    bxMin = getattr(bg, 'xMin', 0)
    bxMax = getattr(bg, 'xMax', 0)
    byMax = getattr(bg, 'yMax', 0)
    
    axMin = getattr(ag, 'xMin', 0)
    axMax = getattr(ag, 'xMax', 0)
    ayMin = getattr(ag, 'yMin', 0)
    
    base_center = (bxMin + bxMax) / 2
    base_top = byMax
    
    accent_center = (axMin + axMax) / 2
    accent_bottom = ayMin
    
    # Calculate shift offsets
    x_offset = base_center - accent_center
    y_offset = base_top - accent_bottom + 30 # slight gap of 30 units
    
    print(f"Constructing {char} (U+{cp:04X}) with base={base_gname}, accent={accent_gname}")
    print(f"  Offsets: x={x_offset:.1f}, y={y_offset:.1f}")
    
    # Draw composite using pens
    pen = TTGlyphPen(font.getGlyphSet())
    font.getGlyphSet()[base_gname].draw(pen)
    
    tpen = TransformPen(pen, (1, 0, 0, 1, x_offset, y_offset))
    font.getGlyphSet()[accent_gname].draw(tpen)
    
    dest_glyph = pen.glyph()
    glyf[dest_gname] = dest_glyph
    
    # Copy metrics
    base_width, base_lsb = hmtx[base_gname]
    hmtx[dest_gname] = (base_width, base_lsb)
    
    if dest_gname not in glyph_order:
        glyph_order.append(dest_gname)
    cmap[cp] = dest_gname

font.setGlyphOrder(glyph_order)
font.save("scratch/PT_patched.ttf")
print("Saved scratch/PT_patched.ttf")
