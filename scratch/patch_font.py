import os
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen

def patch_single_font(src_path, dest_path, characters):
    print(f"\nPatching font: {dest_path}")
    src_font = TTFont(src_path)
    dest_font = TTFont(dest_path)
    
    src_cmap = src_font.getBestCmap()
    dest_cmap = dest_font.getBestCmap()
    
    dest_glyf = dest_font['glyf']
    dest_hmtx = dest_font['hmtx']
    
    src_units = src_font['head'].unitsPerEm
    dest_units = dest_font['head'].unitsPerEm
    scale_ratio = dest_units / src_units
    print(f"Source unitsPerEm: {src_units}, Destination unitsPerEm: {dest_units}")
    print(f"Scale ratio: {scale_ratio}")
    
    src_glyph_set = src_font.getGlyphSet()
    glyph_order = dest_font.getGlyphOrder()
    
    cmap_updated = False
    
    for char in characters:
        cp = ord(char)
        if cp in dest_cmap:
            print(f"Character '{char}' (U+{cp:04X}) already in destination cmap.")
            continue
        if cp not in src_cmap:
            print(f"Character '{char}' (U+{cp:04X}) not found in source font. Skipping.")
            continue
            
        src_gname = src_cmap[cp]
        dest_gname = f"uni{cp:04X}"
        
        # Decompose and scale contours using pens
        pen = TTGlyphPen(dest_font.getGlyphSet())
        transform_pen = TransformPen(pen, (scale_ratio, 0, 0, scale_ratio, 0, 0))
        src_glyph_set[src_gname].draw(transform_pen)
        
        dest_glyph = pen.glyph()
        dest_glyf[dest_gname] = dest_glyph
        
        # Scale and copy hmtx metrics
        src_hmtx = src_font['hmtx']
        src_width, src_lsb = src_font.getGlyphSet()[src_gname].width, 0
        if src_gname in src_hmtx:
            src_width, src_lsb = src_hmtx[src_gname]
        
        dest_width = int(round(src_width * scale_ratio))
        dest_lsb = int(round(src_lsb * scale_ratio))
        dest_hmtx[dest_gname] = (dest_width, dest_lsb)
        
        # Add to glyph order and cmap
        if dest_gname not in glyph_order:
            glyph_order.append(dest_gname)
        dest_cmap[cp] = dest_gname
        cmap_updated = True
        print(f"Successfully injected '{char}' (U+{cp:04X}) as glyph name: {dest_gname}")
        
    if cmap_updated:
        # Re-save cmap tables
        dest_font.setGlyphOrder(glyph_order)
        dest_font.save(dest_path)
        print("Font saved successfully.")
    else:
        print("No changes made.")

# Characters we want to patch (the missing lowercase pinyin vowels)
missing_characters = ['ǖ', 'ǘ', 'ǜ']

source_font = "resources/fonts/DroidSansFallbackFull.ttf"

# Patch resources/fonts
patch_single_font(source_font, "resources/fonts/PT_Sans-Narrow-Web-Regular.ttf", missing_characters)
patch_single_font(source_font, "resources/fonts/PT_Sans-Narrow-Web-Bold.ttf", missing_characters)

# Patch frontend/public/resources/fonts
patch_single_font(source_font, "frontend/public/resources/fonts/PT_Sans-Narrow-Web-Regular.ttf", missing_characters)
patch_single_font(source_font, "frontend/public/resources/fonts/PT_Sans-Narrow-Web-Bold.ttf", missing_characters)
