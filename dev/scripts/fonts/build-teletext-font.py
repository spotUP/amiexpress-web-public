#!/usr/bin/env python3
"""
Build the board's teletext face: TeletextUPR, from upstream TDAText.

Two things happen here, and both exist because the browser cannot do them:

1. LOWERCASE A-RING. TDAText 0.1.3 draws U+00E5 as a byte-for-byte copy of
   U+00E4 - the same outline coordinates and the same embedded bitmap - so a
   Swedish teletext page reads "Nagon" with two dots where the ring belongs
   (sysop, 2026-09-13). The glyph is composed from shapes already in the font.

2. DOUBLE HEIGHT. Teletext's headline rows are drawn at twice the height, and
   xterm.js 5.5 does not implement DECDHL/DECDWL - there is no `ESC #` handler
   in it at all. So the halves are baked into the FONT: for every Latin-1
   printable this face carries, two derived glyphs land in the Private Use
   Area, one holding the top half of the character stretched over a whole
   cell and one the bottom half. A double-height row then travels as two
   ORDINARY rows of ordinary text, and any terminal that can show this font
   shows it correctly.

     top half of U+0041 ('A')  ->  U+E221   (0xE200 + cp - 0x20)
     bottom half of U+0041     ->  U+E321   (0xE300 + cp - 0x20)

   The mapping is arithmetic, not a table, so the backend can compute it
   without shipping a copy of this script's opinions:
   web/backend/src/utils/teletext-double-height.ts holds the same two lines.

   The halves are exact. This is a pixel font with a 20ppem strike of 12x20
   bitmaps, so "stretch the top half over a cell" means each of rows 0-9 is
   drawn twice - no interpolation, no resampling, no guessing. The outlines
   are traced from those same pixels, one contour per region boundary, which
   is why they stay crisp: at 20ppem one font pixel is exactly 50 units, so
   every edge lands on a device pixel.

TDAText is a Reserved Font Name under the OFL, so the result is renamed - SIL
Open Font License v1.1, clause 3. See web/frontend/public/fonts/
TeletextUPR-OFL-LICENSE.txt.

Usage:
    python3 dev/scripts/fonts/build-teletext-font.py \\
        dev/scripts/fonts/TDAText-upstream.ttf \\
        web/frontend/public/fonts/TeletextUPR.ttf \\
        web/frontend/public/fonts/TeletextUPR.woff2

Needs fonttools and brotli.
"""
import sys

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import ttProgram
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphCoordinates

NEW_FAMILY = "TeletextUPR"
NEW_PS = "TeletextUPR-Regular"

# The PUA mapping, and the only place it is written down besides
# packages/terminal/src/utils/teletext-double-height.ts.
#
# E200/E300, not E000/E100: the PETSCII transducer already owns U+E000-E1FF,
# where it keeps the glyphs for the C64 character ROM. Two meanings in one
# block is how a teletext row would one day arrive as Commodore mojibake.
DH_TOP_BASE = 0xE200
DH_BOTTOM_BASE = 0xE300
DH_FIRST_SOURCE = 0x20
DH_LAST_SOURCE = 0xFF

NOTE = (
    "Modified for AmiExpress-Web (2026-09-13): lowercase a-ring was a copy of "
    "a-dieresis and has been composed from this font's own 'a' and the ring of "
    "'uring'; Private Use Area E200-E2DF and E300-E3DF carry the top and bottom halves of each "
    "Latin-1 printable, for teletext double-height rows on terminals with no "
    "DECDHL. Renamed per OFL clause 3 (TDAText is a Reserved Font Name)."
)


def repair_aring(font):
    """Give the face a real lowercase a-ring, outline and bitmap alike."""
    glyf = font['glyf']
    a = glyf['a']
    a_pts = [tuple(p) for p in a.coordinates]
    a_ends = list(a.endPtsOfContours)
    a_flags = list(a.flags)

    # The ring is drawn rather than copied: uring's ring is an OPEN path that
    # relies on the stems of 'u' to close it, and dropped onto 'a' it fills as
    # a blob. These are the same pixels the strike draws, in font units - a
    # top bar, two sides and a bottom bar around a one-pixel hole, sitting on
    # the flat top of 'a'.
    ring_outer = [
        (250, 800), (400, 800), (400, 700), (450, 700), (450, 600), (400, 600),
        (400, 500), (250, 500), (250, 600), (200, 600), (200, 700), (250, 700),
    ]
    ring_hole = [(300, 600), (350, 600), (350, 700), (300, 700)]  # opposite winding

    ring = Glyph()
    ring.numberOfContours = len(a_ends) + 2
    ring.coordinates = GlyphCoordinates(a_pts + ring_outer + ring_hole)
    ring.flags = bytearray(a_flags + [1] * (len(ring_outer) + len(ring_hole)))
    ring.endPtsOfContours = a_ends + [
        len(a_pts) + len(ring_outer) - 1,
        len(a_pts) + len(ring_outer) + len(ring_hole) - 1,
    ]
    ring.program = a.program
    glyf['aring'] = ring
    glyf['aring'].recalcBounds(glyf)
    font['hmtx']['aring'] = font['hmtx']['a']

    strike = font['EBDT'].strikeData[0]
    metrics = font['EBLC'].strikes[0].indexSubTables[0].metrics
    ring_rows = 6  # rows 0-5 of uring are the ring; 6 on is the letter
    merged = bitmap_rows(strike, metrics, 'uring')[:ring_rows] + \
        bitmap_rows(strike, metrics, 'a')[ring_rows:]
    set_bitmap_rows(strike, metrics, 'aring', merged)


def bitmap_rows(strike, metrics, name):
    """The glyph's strike bitmap as a list of '0'/'1' strings, top row first."""
    bitmap = strike[name]
    out = []
    for y in range(metrics.height):
        raw = bitmap.getRow(y, bitDepth=1, metrics=metrics)
        out.append(''.join(f"{b:08b}" for b in raw)[:metrics.width])
    return out


def set_bitmap_rows(strike, metrics, name, rows):
    packed = [
        bytes(int(r[i:i + 8].ljust(8, '0'), 2) for i in range(0, len(r), 8))
        for r in rows
    ]
    strike[name].setRows(packed, bitDepth=1, metrics=metrics, reverseBytes=False)


def trace(rows, cell_height, ascender_px, unit):
    """
    Closed contours around the ink in a pixel bitmap, in font units.

    One edge per pixel side that borders empty space, walked so the ink is
    always on the left. Chained head to tail that gives outer boundaries one
    winding and holes the other, which is what a nonzero fill needs - and it
    is exact, so stacked pixels never show the hairline seams that a glyph
    built from one rectangle per pixel does.
    """
    height = len(rows)
    width = len(rows[0]) if height else 0

    def ink(col, row):
        return 0 <= row < height and 0 <= col < width and rows[row][col] == '1'

    def point(col, row):
        """Top-left corner of a pixel, in font units (y counts up)."""
        return (col * unit, (ascender_px - row) * unit)

    edges = {}
    for row in range(height):
        for col in range(width):
            if not ink(col, row):
                continue
            top_left = point(col, row)
            top_right = point(col + 1, row)
            bottom_left = point(col, row + 1)
            bottom_right = point(col + 1, row + 1)
            if not ink(col, row - 1):            # nothing above: walk left
                edges.setdefault(top_right, []).append(top_left)
            if not ink(col, row + 1):            # nothing below: walk right
                edges.setdefault(bottom_left, []).append(bottom_right)
            if not ink(col - 1, row):            # nothing to the left: walk down
                edges.setdefault(top_left, []).append(bottom_left)
            if not ink(col + 1, row):            # nothing right: walk up
                edges.setdefault(bottom_right, []).append(top_right)

    contours = []
    while edges:
        start = next(iter(edges))
        contour = []
        here = start
        while True:
            outgoing = edges.get(here)
            if not outgoing:
                break
            nxt = outgoing.pop()
            if not outgoing:
                del edges[here]
            contour.append(here)
            here = nxt
            if here == start:
                break
        if len(contour) >= 4:
            contours.append(drop_collinear(contour))
    return contours


def drop_collinear(points):
    """A rectilinear contour needs its corners only."""
    out = []
    count = len(points)
    for i, current in enumerate(points):
        before = points[i - 1]
        after = points[(i + 1) % count]
        turns = (before[0] == current[0]) != (current[0] == after[0])
        if turns:
            out.append(current)
    return out or points


def half_rows(rows, top):
    """Rows 0-9 or 10-19, each drawn twice: teletext's own double height."""
    height = len(rows)
    source = rows[:height // 2] if top else rows[height // 2:]
    doubled = []
    for row in source:
        doubled.append(row)
        doubled.append(row)
    return doubled


def add_double_height(font):
    """Every Latin-1 printable gets a top-half and a bottom-half twin."""
    glyf = font['glyf']
    hmtx = font['hmtx']
    cmap_source = font.getBestCmap()
    strike = font['EBDT'].strikeData[0]
    metrics = font['EBLC'].strikes[0].indexSubTables[0].metrics
    unit = font['head'].unitsPerEm // metrics.height   # 1000 / 20 = 50
    ascender_px = metrics.horiBearingY

    added = {}
    order = list(font.getGlyphOrder())
    for codepoint in range(DH_FIRST_SOURCE, DH_LAST_SOURCE + 1):
        name = cmap_source.get(codepoint)
        if name is None or name not in strike:
            continue
        rows = bitmap_rows(strike, metrics, name)
        for top in (True, False):
            half = half_rows(rows, top)
            glyph = Glyph()
            contours = trace(half, metrics.height, ascender_px, unit)
            points = [p for contour in contours for p in contour]
            glyph.numberOfContours = len(contours)
            glyph.coordinates = GlyphCoordinates(points)
            glyph.flags = bytearray([1] * len(points))
            ends, total = [], 0
            for contour in contours:
                total += len(contour)
                ends.append(total - 1)
            glyph.endPtsOfContours = ends
            # A simple glyph compiles its hinting program, so it needs one
            # even when it has nothing to say.
            glyph.program = ttProgram.Program()
            glyph.program.fromBytecode(b"")

            # The ADVANCE comes from the source character - a half is the
            # same width as the letter it is half of - but the side bearing
            # must be this glyph's own. Copying the source's shifted every
            # half by the difference between the two bounding boxes, which is
            # why the stem of a double-height 'T' sat to the left of its
            # crossbar (sysop, 2026-09-13).
            base = DH_TOP_BASE if top else DH_BOTTOM_BASE
            new_codepoint = base + (codepoint - DH_FIRST_SOURCE)
            new_name = f"dh{'top' if top else 'bot'}.uni{codepoint:04X}"
            glyf.glyphs[new_name] = glyph
            hmtx.metrics[new_name] = hmtx[name]
            order.append(new_name)
            added[new_codepoint] = new_name

    font.setGlyphOrder(order)
    glyf.glyphOrder = order
    for table in font['cmap'].tables:
        if table.isUnicode():
            table.cmap.update(added)
    for name in added.values():
        glyf[name].recalcBounds(glyf)
        advance = hmtx[name][0]
        left_bearing = glyf[name].xMin if glyf[name].numberOfContours else 0
        hmtx.metrics[name] = (advance, left_bearing)
    return len(added)


def rename(font):
    for record in font['name'].names:
        try:
            value = record.toUnicode()
        except Exception:
            continue
        if record.nameID in (1, 4, 16):
            record.string = NEW_FAMILY
        elif record.nameID == 6:
            record.string = NEW_PS
        elif record.nameID == 3:
            record.string = f"{NEW_FAMILY} : derived from {value}"
        elif record.nameID == 0:
            record.string = f"{value}\n\n{NOTE}"
        elif record.nameID == 5:
            record.string = f"{value} (AmiExpress-Web teletext build)"


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        return 2
    source, out_ttf, out_woff2 = sys.argv[1:4]

    font = TTFont(source)
    repair_aring(font)
    halves = add_double_height(font)
    rename(font)

    # NO LINE GAP.
    #
    # TDAText asks for 90/1000 em of leading, and a terminal honours it: the
    # cell becomes 1.09 em while a glyph is 1.0, so consecutive rows are
    # pushed apart by nine percent of the cell. Ordinary text does not care.
    # Double height does: the two halves of a headline are drawn on
    # consecutive rows and have to MEET, and that gap cut every letter across
    # the middle (sysop, 2026-09-13: "the green text-tv edition row has offset
    # issues"). A teletext grid is 40x25 with no leading by definition, so the
    # gap goes.
    font['hhea'].lineGap = 0
    font['OS/2'].sTypoLineGap = 0

    # Deterministic output: head.modified follows the clock otherwise, and a
    # font that differs byte-for-byte every run cannot be diffed against the
    # one in the tree.
    font['head'].modified = font['head'].created

    font.save(out_ttf)
    font.flavor = "woff2"
    font.save(out_woff2)
    print(f"wrote {out_ttf} and {out_woff2} ({halves} double-height glyphs)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
