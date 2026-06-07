import sys
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import GlyphComponent, Glyph

def patch_font(filepath):
    print(f"Patching font: {filepath}")
    font = TTFont(filepath)
    cmap = font.getBestCmap()
    glyf = font['glyf']
    hmtx = font['hmtx']
    
    # 5 targets
    targets = [
        (0x01CD, 'A', 'uniF6CA', 'Acaron'),
        (0x01CF, 'I', 'uniF6CA', 'Icaron'),
        (0x01D1, 'O', 'uniF6CA', 'Ocaron'),
        (0x01D3, 'U', 'uniF6CA', 'Ucaron'),
        (0x01D9, 'Udieresis', 'uniF6CA', 'Udieresiscaron')
    ]
    
    glyph_order = font.getGlyphOrder()
    cmap_updated = False
    
    for cp, base_name, accent_name, new_name in targets:
        if cp in cmap:
            print(f"  Character {cp:#x} ({new_name}) already in cmap.")
            continue
            
        if base_name not in glyf:
            print(f"  Warning: base glyph '{base_name}' not found. Skipping {new_name}.")
            continue
        if accent_name not in glyf:
            print(f"  Warning: accent glyph '{accent_name}' not found. Skipping {new_name}.")
            continue
            
        base_glyph = glyf[base_name]
        accent_glyph = glyf[accent_name]
        
        # Calculate centers
        base_center = (base_glyph.xMin + base_glyph.xMax) / 2
        accent_center = (accent_glyph.xMin + accent_glyph.xMax) / 2
        x_offset = int(round(base_center - accent_center))
        y_offset = 0
        
        print(f"  Creating '{new_name}' (U+{cp:04X}): base={base_name}, accent={accent_name}, x_offset={x_offset}")
        
        # Create components
        comp_base = GlyphComponent()
        comp_base.glyphName = base_name
        comp_base.x = 0
        comp_base.y = 0
        comp_base.flags = 0x0204  # ROUND_XY_TO_GRID | USE_MY_METRICS
        
        comp_accent = GlyphComponent()
        comp_accent.glyphName = accent_name
        comp_accent.x = x_offset
        comp_accent.y = y_offset
        comp_accent.flags = 0x0004  # ROUND_XY_TO_GRID
        
        # Create composite glyph
        glyph = Glyph()
        glyph.numberOfContours = -1
        glyph.components = [comp_base, comp_accent]
        
        # Set glyph coordinates/bounds
        glyph.xMin = min(base_glyph.xMin, accent_glyph.xMin + x_offset)
        glyph.yMin = min(base_glyph.yMin, accent_glyph.yMin + y_offset)
        glyph.xMax = max(base_glyph.xMax, accent_glyph.xMax + x_offset)
        glyph.yMax = max(base_glyph.yMax, accent_glyph.yMax + y_offset)
        
        # Store in glyf table
        glyf[new_name] = glyph
        
        # Set metrics in hmtx
        base_width, base_lsb = hmtx[base_name]
        hmtx[new_name] = (base_width, base_lsb)
        
        # Update glyph order and cmap
        if new_name not in glyph_order:
            glyph_order.append(new_name)
        cmap[cp] = new_name
        cmap_updated = True

    if cmap_updated:
        font.setGlyphOrder(glyph_order)
        font.save(filepath)
        print(f"  Successfully saved patched font: {filepath}")
    else:
        print(f"  No changes made to {filepath}")

# Path both files in public and root
files_to_patch = [
    'frontend/public/resources/fonts/PT_Sans-Narrow-Web-Regular.ttf',
    'frontend/public/resources/fonts/PT_Sans-Narrow-Web-Bold.ttf',
    'resources/fonts/PT_Sans-Narrow-Web-Regular.ttf',
    'resources/fonts/PT_Sans-Narrow-Web-Bold.ttf'
]

for fp in files_to_patch:
    try:
        patch_font(fp)
    except Exception as e:
        print(f"Failed to patch {fp}: {e}")
