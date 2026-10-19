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
import os
import sys
import unicodedata

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

# THE FONT CONTRACT (levels plan D1-D3). Every range is base + index, where
# index is (cp - 0x20) for a Latin-1 printable and the PATTERN (0-63) for a
# mosaic. Pattern bits: cell 1 (top left) = 1, 2 (top right) = 2, 3 = 4,
# 4 = 8, 5 (bottom left) = 16, 6 (bottom right) = 32 - Unicode's own order.
#
#   range          Latin-1 / mosaic        what the glyph shows
#   E200 / E300    Latin-1                 double height: top / bottom half
#   E400 / E440    contiguous mosaic       double height: top / bottom half
#   E480 / E4C0    separated mosaic        double height: top / bottom half
#   E500 / E600    Latin-1                 double width: left / right half
#   E700 / E740    contiguous mosaic       double width: left / right half
#   E780 / E7C0    separated mosaic        double width: left / right half
#   E800 E900      Latin-1                 double size: top-left / top-right
#   EA00 EB00      Latin-1                 double size: bottom-left / bottom-right
#   EC00 EC40 EC80 ECC0  contiguous mosaic double size: TL / TR / BL / BR
#   ED00 ED40 ED80 EDC0  separated mosaic  double size: TL / TR / BL / BR
#
# Separated mosaics themselves are Unicode 16's U+1CE51-1CE8F (SEPARATED BLOCK
# SEXTANT-n); the blank pattern is U+0020.
MOSAIC_DH = {'cont': (0xE400, 0xE440), 'sep': (0xE480, 0xE4C0)}
LATIN_DW = (0xE500, 0xE600)
MOSAIC_DW = {'cont': (0xE700, 0xE740), 'sep': (0xE780, 0xE7C0)}
LATIN_DS = (0xE800, 0xE900, 0xEA00, 0xEB00)
MOSAIC_DS = {'cont': (0xEC00, 0xEC40, 0xEC80, 0xECC0),
             'sep': (0xED00, 0xED40, 0xED80, 0xEDC0)}

# The 3x2 grid over the 20-pixel cell: bands of 6, 8 and 6 rows (teletext's
# 3/4/3 scanlines doubled), columns of 6 and 6. A separated block loses its
# outer pixel on every side, so two neighbours are 2 pixels apart and a block
# is surrounded by background (EN 300 706 Table 26, entry 1/A).
BANDS = ((0, 6), (6, 14), (14, 20))
COLUMNS = ((0, 6), (6, 12))

NOTE = (
    "Modified for AmiExpress-Web (2026-09-13): lowercase a-ring was a copy of "
    "a-dieresis and has been composed from this font's own 'a' and the ring of "
    "'uring'; Private Use Area E200-E2DF and E300-E3DF carry the top and bottom halves of each "
    "Latin-1 printable, for teletext double-height rows on terminals with no "
    "DECDHL. Renamed per OFL clause 3 (TDAText is a Reserved Font Name)."
)



# ─── Level 1.5 letters (levels plan E1-E4) ──────────────────────
#
# The national option sub-sets (Table 36), G2 (Table 38 / Annex) and the
# X/26 diacritics (G2 column 4, s.12.3.1) reach letters TDAText never drew:
# Polish, Turkish, Rumanian, Baltic, Croatian. Each is drawn here as its
# base letter plus the mark, so the board shows the letter instead of
# falling back to the bare base. A mark is lifted from a letter the face
# already accents (the face's own pixels); the four with no donor letter are
# drawn. A capital, or a lowercase letter with an ascender, is squashed by
# one (doubled) pixel row to make room above it, exactly as the face's own
# accented capitals are: their bodies start two rows lower than plain ones.

MARK_DONORS = {  # mark: (lowercase donor, capital donor)
    0x0300: (0x00E8, 0x00C8), 0x0301: (0x00E9, 0x00C9), 0x0302: (0x00EA, 0x00CA),
    0x0303: (0x00F1, 0x00D1), 0x0308: (0x00EB, 0x00CB), 0x030A: (0x016F, 0x016E),
    0x030B: (0x0171, 0x0170), 0x030C: (0x010D, 0x010C), 0x0327: (0x00E7, 0x00C7),
}
CAPITAL_MARK_ROWS = 4  # a squashed capital's body starts here; its mark is above
DRAWN_MARKS = {  # mark: {row: pixels}, the same over a lowercase letter and a capital
    0x0304: {2: '000111111000', 3: '000111111000'},
    0x0306: {0: '001100001100', 1: '001100001100', 2: '000111111000', 3: '000111111000'},
    0x0307: {2: '000001100000', 3: '000001100000'},
    0x0328: {16: '000000110000', 17: '000000110000', 18: '000000011100', 19: '000000011100'},
}
BELOW_MARKS = (0x0327, 0x0328)
SPACING_MARKS = {  # spacing accent: the combining mark it draws, on its own
    0x00A8: 0x0308, 0x00AF: 0x0304, 0x00B8: 0x0327, 0x02C6: 0x0302, 0x02C7: 0x030C,
    0x02D8: 0x0306, 0x02D9: 0x0307, 0x02DA: 0x030A, 0x02DB: 0x0328, 0x02DC: 0x0303,
    0x02DD: 0x030B,
}
COMPOSED_RANGES = ((0x00C0, 0x017F), (0x01CD, 0x01DC), (0x1E00, 0x1EFF))


def _or(a, b):
    return [''.join('1' if '1' in (x, y) else '0' for x, y in zip(r, s)) for r, s in zip(a, b)]


def _minus(a, b):
    return [''.join('1' if x == '1' and y == '0' else '0' for x, y in zip(r, s)) for r, s in zip(a, b)]


def _within(a, b):
    return all(not (x == '1' and y == '0') for r, s in zip(a, b) for x, y in zip(r, s))


def _squash(rows):
    """Drop one doubled row pair from a straight run (else any pair), nearest the
    middle, and add the two rows back on top: the body starts two rows lower."""
    inked = [y for y, r in enumerate(rows) if '1' in r]
    if not inked or inked[0] < 2:
        return None
    middle = (inked[0] + inked[-1]) / 2
    pairs = [y for y in range(inked[0], inked[-1] - 2)
             if rows[y] == rows[y + 1] == rows[y + 2] == rows[y + 3]]
    if not pairs:   # a diagonal (N, Z): give up one pixel row of it instead
        pairs = [y for y in range(inked[0], inked[-1], 2) if rows[y] == rows[y + 1]]
    if not pairs:
        return None
    y = min(pairs, key=lambda k: abs(k - middle))
    blank = '0' * len(rows[0])
    return [blank, blank] + rows[:y] + rows[y + 2:]


def _drawn(pattern, width, height):
    pad = (width - 12) // 2
    return [('0' * pad + pattern[y] + '0' * width)[:width] if y in pattern else '0' * width
            for y in range(height)]


def level15_glyphs(cmap_source, strike, metrics):
    """Letters, spacing marks and the few symbols Level 1.5 needs, as rows."""
    def rows_of(cp):
        name = cmap_source.get(cp)
        return bitmap_rows(strike, metrics, name) if name is not None and name in strike else None

    def accent(mark, capital):
        """The mark's pixels, over a squashed body when `capital`."""
        if mark in DRAWN_MARKS:
            return _drawn(DRAWN_MARKS[mark], metrics.width, metrics.height)
        if mark not in MARK_DONORS:
            return None
        donor = MARK_DONORS[mark][1 if capital else 0]
        d = rows_of(donor)
        if d is None:
            return None
        if capital:
            return d[:CAPITAL_MARK_ROWS] + ['0' * metrics.width] * (len(d) - CAPITAL_MARK_ROWS)
        b = rows_of(ord(unicodedata.normalize('NFD', chr(donor))[0]))
        return _minus(d, b) if b is not None and _within(b, d) else None

    out = {}
    for first, last in COMPOSED_RANGES:
        for cp in range(first, last + 1):
            if cp in cmap_source:
                continue
            nfd = unicodedata.normalize('NFD', chr(cp))
            if len(nfd) != 2 or not nfd[0].isascii():
                continue
            base_cp, mark = ord(nfd[0]), ord(nfd[1])
            base = rows_of(base_cp)
            if base is None:
                continue
            if base_cp in (0x69, 0x6A) and mark not in BELOW_MARKS:
                base = ['0' * metrics.width] * 6 + base[6:]   # dotless i / j under a mark
            capital = mark not in BELOW_MARKS and any('1' in r for r in base[:6])
            got = accent(mark, capital)
            if got is None:
                continue
            body = _squash(base) if capital else base
            if body is None or (capital and any('1' in r for r in body[:CAPITAL_MARK_ROWS])):
                continue   # no straight run to give up; the base letter is shown instead
            out[cp] = _or(body, got)

    for cp, mark in SPACING_MARKS.items():
        if cp in cmap_source:
            continue
        got = accent(mark, False)
        if got is not None:
            out[cp] = got

    i_rows = rows_of(0x69)
    if 0x0131 not in cmap_source and i_rows is not None:
        out[0x0131] = ['0' * metrics.width] * 6 + i_rows[6:]
    for cp, base_cp in ((0x0141, 0x4C), (0x0142, 0x6C)):   # L/l with a stroke
        rows = rows_of(base_cp)
        if cp in cmap_source or rows is None:
            continue
        inked = [y for y, r in enumerate(rows) if '1' in r]
        mid = (inked[0] + inked[-1]) // 2
        stem = rows[mid].index('1')
        rows = list(rows)
        for y in (mid - 1, mid):
            r = list(rows[y])
            for x in range(max(0, stem - 2), min(metrics.width, stem + 4)):
                r[x] = '1'
            rows[y] = ''.join(r)
        out[cp] = rows
    dash = rows_of(0x2014)
    if 0x2015 not in cmap_source and dash is not None:
        out[0x2015] = dash
    for cp, closing in ((0x2018, 0x2019), (0x201C, 0x201D)):   # opening = closing turned
        rows = rows_of(closing)
        if cp in cmap_source or rows is None:
            continue
        inked = [y for y, r in enumerate(rows) if '1' in r]
        top, bottom = inked[0], inked[-1]
        turned = [r[::-1] for r in reversed(rows[top:bottom + 1])]
        out[cp] = rows[:top] + turned + rows[bottom + 1:]
    return out


COVERAGE_TS = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           '..', '..', '..', 'sdk', 'teletext', 'teletext-font-coverage.ts')


def write_coverage(font):
    """The code points outside the Private Use Area the font draws, for the sdk."""
    cps = sorted(c for c in font.getBestCmap() if not 0xE000 <= c <= 0xF8FF)
    ranges, start, prev = [], cps[0], cps[0]
    for c in cps[1:]:
        if c != prev + 1:
            ranges.append((start, prev))
            start = c
        prev = c
    ranges.append((start, prev))
    lines = [
        '// GENERATED by dev/scripts/fonts/build-teletext-font.py - do not edit.',
        '// Every code point outside the Private Use Area that TeletextUPR draws.',
        '// Teletext mode never emits a character outside this list (levels plan E1-E4).',
        'export const TELETEXT_FONT_RANGES: ReadonlyArray<readonly [number, number]> = [',
    ]
    lines += [f'  [0x{a:04x}, 0x{b:04x}],' for a, b in ranges]
    lines += ['];', '']
    with open(COVERAGE_TS, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines))


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


def mosaic_rows(pattern, separated, width=12, height=20):
    """The 12x20 pixel rows of one sextant pattern, top row first."""
    rows = [['0'] * width for _ in range(height)]
    for cell in range(6):
        if not pattern & (1 << cell):
            continue
        r0, r1 = BANDS[cell // 2]
        c0, c1 = COLUMNS[cell % 2]
        if separated:
            r0, r1, c0, c1 = r0 + 1, r1 - 1, c0 + 1, c1 - 1
        for y in range(r0, r1):
            for x in range(c0, c1):
                rows[y][x] = '1'
    return [''.join(r) for r in rows]


def slice_rows(rows, vertical, horizontal):
    """
    One part of a glyph stretched over a whole cell, every kept pixel drawn
    twice. vertical: None, 'top' or 'bottom'; horizontal: None, 'left' or
    'right'. For a mosaic this is the 3-band grid stretched over TWO cells:
    the top cell shows band 1 and the upper half of band 2, the bottom cell
    the lower half of band 2 and band 3.
    """
    height = len(rows)
    width = len(rows[0])
    if vertical is not None:
        rows = rows[:height // 2] if vertical == 'top' else rows[height // 2:]
        rows = [r for row in rows for r in (row, row)]
    if horizontal is not None:
        rows = [row[:width // 2] if horizontal == 'left' else row[width // 2:]
                for row in rows]
        rows = [''.join(c + c for c in row) for row in rows]
    return rows


def sextant_pattern(codepoint):
    """Cells of a BLOCK SEXTANT-n / SEPARATED BLOCK SEXTANT-n, from its name."""
    name = unicodedata.name(chr(codepoint))
    digits = name.rsplit('-', 1)[1]
    assert 'SEXTANT' in name and digits.isdigit(), name
    return sum(1 << (int(d) - 1) for d in digits)


def contiguous_codepoint(pattern):
    special = {0: 0x20, 0b010101: 0x258C, 0b101010: 0x2590, 0b111111: 0x2588}
    if pattern in special:
        return special[pattern]
    return 0x1FB00 + pattern - sum(1 for t in special if t < pattern)


def make_glyph(rows, metrics, ascender_px, unit):
    glyph = Glyph()
    contours = trace(rows, metrics.height, ascender_px, unit)
    points = [p for contour in contours for p in contour]
    glyph.numberOfContours = len(contours)
    glyph.coordinates = GlyphCoordinates(points)
    glyph.flags = bytearray([1] * len(points))
    ends, total = [], 0
    for contour in contours:
        total += len(contour)
        ends.append(total - 1)
    glyph.endPtsOfContours = ends
    # A simple glyph compiles its hinting program, so it needs one even when
    # it has nothing to say.
    glyph.program = ttProgram.Program()
    glyph.program.fromBytecode(b"")
    return glyph


def add_variants(font):
    """
    Separated mosaics (D2), then every half and quarter the contract names
    (D1, D3). Returns counts for the build log.
    """
    glyf = font['glyf']
    hmtx = font['hmtx']
    cmap_source = font.getBestCmap()
    strike = font['EBDT'].strikeData[0]
    metrics = font['EBLC'].strikes[0].indexSubTables[0].metrics
    unit = font['head'].unitsPerEm // metrics.height   # 1000 / 20 = 50
    ascender_px = metrics.horiBearingY
    advance = hmtx[cmap_source[0x20]][0]

    added = {}
    order = list(font.getGlyphOrder())

    def add(codepoint, name, rows, advance_width):
        glyph = make_glyph(rows, metrics, ascender_px, unit)
        glyf.glyphs[name] = glyph
        hmtx.metrics[name] = (advance_width, 0)
        order.append(name)
        added[codepoint] = name

    # The pixel rows of every source. Latin-1 comes from the strike; the
    # mosaics are DRAWN, and checked against the sextants the font already
    # carries so the two grids cannot drift apart.
    repaired = []
    latin = {}
    for codepoint in range(DH_FIRST_SOURCE, DH_LAST_SOURCE + 1):
        name = cmap_source.get(codepoint)
        if name is not None and name in strike:
            latin[codepoint] = (name, bitmap_rows(strike, metrics, name))
    for codepoint, rows in sorted(level15_glyphs(cmap_source, strike, metrics).items()):
        name = f"l15.{codepoint:04X}"
        add(codepoint, name, rows, advance)
        if DH_FIRST_SOURCE <= codepoint <= DH_LAST_SOURCE:
            latin[codepoint] = (name, rows)   # double height / width halves too
    for pattern in range(1, 63):
        cp = contiguous_codepoint(pattern)
        if 0x1FB00 <= cp <= 0x1FB3B:
            assert sextant_pattern(cp) == pattern, hex(cp)
            want = mosaic_rows(pattern, False)
            gname = cmap_source[cp]
            if bitmap_rows(strike, metrics, gname) != want:
                # Upstream TDAText draws U+1FB29 (SEXTANT-346) with the
                # left half of its last two middle-band rows missing. The
                # grid is the contract, so the glyph is redrawn from it.
                glyf.glyphs[gname] = make_glyph(want, metrics, ascender_px, unit)
                glyf[gname].recalcBounds(glyf)
                set_bitmap_rows(strike, metrics, gname, want)
                repaired.append(hex(cp))

    # D2: the 63 separated sextants Unicode 16 defines; the blank is U+0020.
    for cp in range(0x1CE51, 0x1CE8F + 1):
        pattern = sextant_pattern(cp)
        assert contiguous_codepoint(pattern) and pattern not in (0,), hex(cp)
        add(cp, f"sepsextant.{pattern:02d}", mosaic_rows(pattern, True), advance)

    def mosaic_sources():
        for kind in ('cont', 'sep'):
            for pattern in range(64):
                yield kind, pattern, mosaic_rows(pattern, kind == 'sep')

    # D1/D3 for Latin-1: DH, DW, DS.
    for codepoint, (name, rows) in latin.items():
        index = codepoint - DH_FIRST_SOURCE
        adv = hmtx[name][0]
        variants = [
            (DH_TOP_BASE, 'top', None, 'dhtop'),
            (DH_BOTTOM_BASE, 'bottom', None, 'dhbot'),
            (LATIN_DW[0], None, 'left', 'dwleft'),
            (LATIN_DW[1], None, 'right', 'dwright'),
            (LATIN_DS[0], 'top', 'left', 'dstl'),
            (LATIN_DS[1], 'top', 'right', 'dstr'),
            (LATIN_DS[2], 'bottom', 'left', 'dsbl'),
            (LATIN_DS[3], 'bottom', 'right', 'dsbr'),
        ]
        for base, v, h, tag in variants:
            add(base + index, f"{tag}.uni{codepoint:04X}",
                slice_rows(rows, v, h), adv)

    # D1/D3 for mosaics, both kinds, all 64 patterns.
    for kind, pattern, rows in mosaic_sources():
        variants = [
            (MOSAIC_DH[kind][0], 'top', None, 'mdhtop'),
            (MOSAIC_DH[kind][1], 'bottom', None, 'mdhbot'),
            (MOSAIC_DW[kind][0], None, 'left', 'mdwleft'),
            (MOSAIC_DW[kind][1], None, 'right', 'mdwright'),
            (MOSAIC_DS[kind][0], 'top', 'left', 'mdstl'),
            (MOSAIC_DS[kind][1], 'top', 'right', 'mdstr'),
            (MOSAIC_DS[kind][2], 'bottom', 'left', 'mdsbl'),
            (MOSAIC_DS[kind][3], 'bottom', 'right', 'mdsbr'),
        ]
        for base, v, h, tag in variants:
            add(base + pattern, f"{tag}.{kind}.{pattern:02d}",
                slice_rows(rows, v, h), advance)

    font.setGlyphOrder(order)
    glyf.glyphOrder = order
    for table in font['cmap'].tables:
        if table.isUnicode():
            # A format 4 subtable cannot address above U+FFFF.
            table.cmap.update({c: n for c, n in added.items()
                               if c <= 0xFFFF or table.format == 12})
    for name in added.values():
        glyf[name].recalcBounds(glyf)
        left_bearing = glyf[name].xMin if glyf[name].numberOfContours else 0
        hmtx.metrics[name] = (hmtx[name][0], left_bearing)
    print(f"redrew sextants that disagreed with the grid: {repaired}")
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
    halves = add_variants(font)
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
    write_coverage(font)
    print(f"wrote {out_ttf} and {out_woff2} ({halves} derived glyphs)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
