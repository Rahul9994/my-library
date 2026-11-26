"""
Makes the wide, heavy headline face used by the Dynamic View theme.

  python _site/tools/make_display_font.py        (needs: pip install fonttools brotli)

It takes the bundled Inter variable font, pins it at weight 900, stretches it
horizontally and saves it as _site/fonts/library-display.woff2. Inter is under the
SIL Open Font License, which allows modified versions as long as they keep the
licence and use their own name - hence "Library Display".
"""
import os

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

STRETCH = 1.09
FONTS = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'fonts'))

font = TTFont(os.path.join(FONTS, 'inter-normal.woff2'))
font = instancer.instantiateVariableFont(font, {'wght': 900})

glyf, hmtx = font['glyf'], font['hmtx']
glyph_set = font.getGlyphSet()
stretched = {}
for name in font.getGlyphOrder():
    rec = DecomposingRecordingPen(glyph_set)          # composites become plain outlines, so each is stretched once
    glyph_set[name].draw(rec)
    pen = TTGlyphPen(None)
    rec.replay(TransformPen(pen, (STRETCH, 0, 0, 1, 0, 0)))
    stretched[name] = (pen.glyph(), round(hmtx[name][0] * STRETCH))

for name, (glyph, advance) in stretched.items():
    glyf[name] = glyph
    glyph.recalcBounds(glyf)
    hmtx[name] = (advance, getattr(glyph, 'xMin', 0))

for tag in ('fpgm', 'prep', 'cvt ', 'gasp', 'HVAR', 'MVAR', 'STAT', 'avar'):      # hinting and variation leftovers
    if tag in font:
        del font[tag]

names = {1: 'Library Display', 2: 'Regular', 3: 'Library Display 900', 4: 'Library Display', 6: 'LibraryDisplay-Regular',
         13: 'SIL Open Font License 1.1. Modified from Inter.'}
table = font['name']
table.names = [r for r in table.names if r.nameID in (0, 14)]
for name_id, value in names.items():
    table.setName(value, name_id, 3, 1, 0x409)

font['OS/2'].usWeightClass = 900
font['OS/2'].usWidthClass = 7                       # expanded
font.flavor = 'woff2'
out = os.path.join(FONTS, 'library-display.woff2')
font.save(out)
print('wrote', out, os.path.getsize(out), 'bytes,', len(font.getGlyphOrder()), 'glyphs')
