"""
Give the teletext face a real lowercase a-ring.

TDAText 0.1.3 (and upstream HEAD, checked 2026-09-13) ships 'aring' as a
byte-for-byte copy of 'adieresis': same outline coordinates, same embedded
bitmap. A Swedish teletext page therefore reads "Nagon" with two dots where
the ring belongs. The font HAS the shape - 'Aring' and 'uring' both carry a
correct ring - so this composes the missing glyph from parts already in the
file rather than drawing anything new:

  outline: the contours of 'a', plus the two ring contours of 'uring'
  bitmap:  rows 0-5 of 'uring' (the ring) over rows 6-19 of 'a'

TDAText is a Reserved Font Name under the OFL, so the modified font is
renamed - that is clause 3, not a preference.
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphCoordinates

SRC, DST_TTF, DST_WOFF2 = sys.argv[1], sys.argv[2], sys.argv[3]
NEW_FAMILY = "TeletextUPR"
NEW_PS = "TeletextUPR-Regular"

font = TTFont(SRC)
glyf = font['glyf']

# ---- outline -------------------------------------------------------------
#
# The ring is drawn here rather than copied, because uring's ring is an OPEN
# path that relies on the stems of 'u' to close it - dropped onto 'a' it
# fills as a blob. These are the same pixels the strike draws, in font units
# (50 units to a pixel at this font's 20ppem strike): a top bar, two sides
# and a bottom bar around a one-pixel hole, sitting on the flat top of 'a'.
a = glyf['a']
a_pts = [tuple(p) for p in a.coordinates]
a_ends = list(a.endPtsOfContours)
a_flags = list(a.flags)

RING_OUTER = [
    (250, 800), (400, 800), (400, 700), (450, 700), (450, 600), (400, 600),
    (400, 500), (250, 500), (250, 600), (200, 600), (200, 700), (250, 700),
]
RING_HOLE = [(300, 600), (350, 600), (350, 700), (300, 700)]  # opposite winding to the outer ring, or it fills

new = Glyph()
new.numberOfContours = len(a_ends) + 2
coords = a_pts + RING_OUTER + RING_HOLE
new.coordinates = GlyphCoordinates(coords)
new.flags = bytearray(a_flags + [1] * (len(RING_OUTER) + len(RING_HOLE)))
new.endPtsOfContours = a_ends + [
    len(a_pts) + len(RING_OUTER) - 1,
    len(a_pts) + len(RING_OUTER) + len(RING_HOLE) - 1,
]
new.program = a.program
glyf['aring'] = new
glyf['aring'].recalcBounds(glyf)

# The advance width does not change; the glyph is one pixel taller.
font['hmtx']['aring'] = font['hmtx']['a']

# ---- embedded bitmap -----------------------------------------------------
strike = font['EBDT'].strikeData[0]
metrics = font['EBLC'].strikes[0].indexSubTables[0].metrics


def rows_of(name):
    bm = strike[name]
    out = []
    for y in range(metrics.height):
        bits = ''.join(f"{b:08b}" for b in bm.getRow(y, bitDepth=1, metrics=metrics))
        out.append(bits[:metrics.width])
    return out


RING_ROWS = 6            # rows 0-5 of uring are the ring, 6+ is the letter
merged = rows_of('uring')[:RING_ROWS] + rows_of('a')[RING_ROWS:]
strike['aring'].setRows(
    [bytes(int(r[i:i + 8].ljust(8, '0'), 2) for i in range(0, len(r), 8)) for r in merged],
    bitDepth=1, metrics=metrics, reverseBytes=False,
)

# ---- identity ------------------------------------------------------------
NOTE = ("Modified 2026-09-13 for AmiExpress-Web: the lowercase a-ring glyph was "
        "a copy of a-dieresis and has been composed from this font's own 'a' and "
        "the ring of 'uring'. Renamed per OFL clause 3 (TDAText is a Reserved "
        "Font Name).")
for rec in font['name'].names:
    try:
        value = rec.toUnicode()
    except Exception:
        continue
    if rec.nameID in (1, 4, 16):
        rec.string = NEW_FAMILY
    elif rec.nameID == 6:
        rec.string = NEW_PS
    elif rec.nameID == 3:
        rec.string = f"{NEW_FAMILY} : derived from {value}"
    elif rec.nameID == 0:
        rec.string = f"{value}\n\n{NOTE}"
    elif rec.nameID == 5:
        rec.string = f"{value} (AmiExpress-Web aring fix)"

# Deterministic output: head.modified moves with the clock otherwise, and a
# font that differs byte-for-byte every run cannot be checked against the one
# in the tree.
font['head'].modified = font['head'].created

font.save(DST_TTF)
font.flavor = "woff2"
font.save(DST_WOFF2)
print("wrote", DST_TTF, DST_WOFF2)
