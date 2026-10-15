#!/usr/bin/env python3
"""
Build BBSGraphics: the DOS graphics the Amiga faces do not have.

WHY THIS FONT EXISTS

xterm's canvas renderer draws U+2500-259F itself, out of a table inside the
addon, which is the only reason CP437 art has ever rendered on this board -
Topaz, TopazPlus, mOsOul, MicroKnight and P0T-NOoDLE carry zero of the 128
box-drawing codepoints and zero of the 32 block elements; they stop at U+00FF.

That table is also what costs us the artists' complaint. The canvas atlas
blits every glyph that comes from a FACE at `cellWidth - 1` device pixels -
measured, 80 Topaz underscores are 80 runs with a one-pixel gap between each -
and nothing about the font or the size changes it. Only the DOM renderer tiles
a face's glyphs, and the DOM renderer draws what the FONT has.

So this font moves the drawing xterm already does into a face, and the browser
can leave the atlas. NOTHING here reaches a telnet caller: the wire is
Latin-1 and `utils/wire-encoding.util.ts` folds these codepoints to Amiga
ASCII before a byte is written. The Amiga never had these characters and still
does not.

THE GRID

Eight by sixteen, which is a Topaz cell, scaled to a 1000-unit em: the advance
is 500 (0.5 em, what every Amiga face this board ships uses) and the line box
runs the full em, because those faces declare hhea ascent = upm and descent =
0. One pixel is 62.5 units. Every stroke lands on a pixel boundary, so a cell
tiles its neighbour exactly at any size the terminal picks.

    python3 dev/scripts/fonts/build-bbs-graphics-font.py \\
        --out web/frontend/public/fonts/BBSGraphics.ttf

Needs fonttools.
"""
import argparse
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPM = 1000
COLS, ROWS = 8, 16          # a Topaz cell, in pixels
ADVANCE = UPM // 2          # 0.5 em, the advance every Amiga face here uses
PX_X = ADVANCE / COLS       # 62.5 units
PX_Y = UPM / ROWS           # 62.5 units

# A stroke is two pixels on this grid: one pixel of an 8x16 cell is a hairline
# at the sizes the board runs, and the lines have to READ as lines.
LIGHT = 2
HEAVY = 4                   # the heavy set, and each half of the double set


def rect(px0, py0, px1, py1):
    """A rectangle in PIXELS, bottom-left origin, as font units."""
    return (px0 * PX_X, py0 * PX_Y, px1 * PX_X, py1 * PX_Y)


def draw(pen, rects):
    """Every rectangle as its own contour, wound the way TrueType fills."""
    for (x0, y0, x1, y1) in rects:
        if x1 <= x0 or y1 <= y0:
            continue
        pen.moveTo((x0, y0))
        pen.lineTo((x1, y0))
        pen.lineTo((x1, y1))
        pen.lineTo((x0, y1))
        pen.closePath()


# --------------------------------------------------------------------------
# Block elements, U+2580-U+259F
# --------------------------------------------------------------------------

def shade(density):
    """
    A dither, as squares on the pixel grid.

    The three shades are a RAMP and have to read as one: light is every
    fourth pixel, medium every other, dark every pixel but every fourth. Drawn
    as pixels rather than as a screened fill so the pattern survives whatever
    size the terminal picks, the way a real ANSI shade does.
    """
    out = []
    for y in range(ROWS):
        for x in range(COLS):
            if density == 1:                      # a quarter: every other, every other
                lit = x % 2 == 0 and y % 2 == 0
            elif density == 2:                    # a half: the checkerboard
                lit = (x + y) % 2 == 0
            else:                                 # three quarters: all but the hole
                lit = not (x % 2 and y % 2)
            if lit:
                out.append(rect(x, y, x + 1, y + 1))
    return out


def block_elements():
    """U+2580-U+259F, keyed by codepoint."""
    g = {}
    g[0x2580] = [rect(0, ROWS // 2, COLS, ROWS)]            # upper half
    # U+2581-U+2587, one eighth up to seven: i stops at 7, because the eighth
    # step is U+2580 and U+2580 is the UPPER half, not a full block.
    for i in range(1, 8):
        g[0x2588 - i] = [rect(0, 0, COLS, ROWS * i // 8)]
    g[0x2588] = [rect(0, 0, COLS, ROWS)]                     # full
    for i in range(1, 8):                                    # left eighths
        g[0x2588 + i] = [rect(0, 0, COLS * (8 - i) // 8, ROWS)]
    g[0x2590] = [rect(COLS // 2, 0, COLS, ROWS)]             # right half
    g[0x2591] = shade(1)
    g[0x2592] = shade(2)
    g[0x2593] = shade(3)
    g[0x2594] = [rect(0, ROWS * 7 // 8, COLS, ROWS)]         # upper eighth
    g[0x2595] = [rect(COLS * 7 // 8, 0, COLS, ROWS)]         # right eighth
    g[0x2596] = [rect(0, 0, COLS // 2, ROWS // 2)]           # quadrant ll
    g[0x2597] = [rect(COLS // 2, 0, COLS, ROWS // 2)]        # lr
    g[0x2598] = [rect(0, ROWS // 2, COLS // 2, ROWS)]        # ul
    g[0x2599] = [rect(0, 0, COLS, ROWS // 2), rect(0, ROWS // 2, COLS // 2, ROWS)]
    g[0x259A] = [rect(0, ROWS // 2, COLS // 2, ROWS), rect(COLS // 2, 0, COLS, ROWS // 2)]
    g[0x259B] = [rect(0, ROWS // 2, COLS, ROWS), rect(0, 0, COLS // 2, ROWS // 2)]
    g[0x259C] = [rect(0, ROWS // 2, COLS, ROWS), rect(COLS // 2, 0, COLS, ROWS // 2)]
    g[0x259D] = [rect(COLS // 2, ROWS // 2, COLS, ROWS)]     # ur
    g[0x259E] = [rect(COLS // 2, ROWS // 2, COLS, ROWS), rect(0, 0, COLS // 2, ROWS // 2)]
    g[0x259F] = [rect(COLS // 2, ROWS // 2, COLS, ROWS), rect(0, 0, COLS, ROWS // 2)]
    return g


# --------------------------------------------------------------------------
# Box drawing, U+2500-U+257F
# --------------------------------------------------------------------------
# Every one of these is four stems - up, right, down, left - each of which is
# absent, light, heavy or double. The table below is the Unicode chart read
# off in that form; the drawing is one function.

N, L, H, D = 0, 1, 2, 3     # absent, light, heavy, double


def stems(up, right, down, left, dashes=0, dash_axis='h'):
    """
    One box-drawing glyph from its four stems.

    A stem runs from the cell's edge to the CENTRE, so two neighbours meet in
    the middle of the boundary between them and a line is continuous across
    cells.

    A DOUBLE stem is two light rails, and where two doubles meet the corner
    has to CLOSE: the rail on the outside of the turn runs past the centre to
    the far rail, the rail on the inside stops at the near one. Drawing both
    rails all the way across is what turns `╔` into a lattice with stubs
    hanging off it.
    """
    cx, cy = COLS / 2, ROWS / 2
    rail = LIGHT
    out = []

    def bar(weight, axis, lo, hi, offset=0.0):
        t = HEAVY if weight == H else LIGHT
        if axis == 'h':
            out.append(rect(lo, cy - t / 2 + offset, hi, cy + t / 2 + offset))
        else:
            out.append(rect(cx - t / 2 + offset, lo, cx + t / 2 + offset, hi))

    # The single-weight stems are simply edge-to-centre.
    for weight, axis, lo, hi in (
        (up, 'v', cy, ROWS), (down, 'v', 0, cy),
        (right, 'h', cx, COLS), (left, 'h', 0, cx),
    ):
        if weight in (L, H):
            bar(weight, axis, lo, hi)

    # Where a double stem meets the centre, each of its two rails stops
    # against whatever the perpendicular stems put there. Written out as the
    # four cases rather than as one clever expression, because the corner
    # cases ARE the glyph: `╔` closes because its outer rail runs past the
    # centre and its inner rail stops short of it.
    def rail_end(toward_far, offset, perp_far, perp_near):
        """
        Where a rail stops when its own direction is absent on this side.

        `perp_far` / `perp_near` are the two perpendicular stems, named for
        the rail's own offset: `perp_near` sits on the same side as the rail.
        """
        if perp_far != N and perp_near != N:
            # A tee: the rail is arriving from the other side and stops at the
            # near perpendicular rail.
            return (-rail if toward_far else rail)
        if perp_far == N and perp_near == N:
            return 0.0                       # a stub: it just ends at centre
        # A corner. The rail on the OUTSIDE of the turn - the one away from
        # the single perpendicular stem - runs past centre to the far rail.
        outside = (perp_near == N)
        return (rail if outside else -rail) * (1 if toward_far else -1)

    if left == D or right == D:
        for offset in (rail, -rail):
            perp_near = up if offset > 0 else down
            perp_far = down if offset > 0 else up
            x0 = 0.0 if left == D else cx + rail_end(False, offset, perp_far, perp_near)
            x1 = float(COLS) if right == D else cx + rail_end(True, offset, perp_far, perp_near)
            if x1 > x0:
                bar(L, 'h', x0, x1, offset)

    if up == D or down == D:
        for offset in (rail, -rail):
            perp_near = right if offset > 0 else left
            perp_far = left if offset > 0 else right
            y0 = 0.0 if down == D else cy + rail_end(False, offset, perp_far, perp_near)
            y1 = float(ROWS) if up == D else cy + rail_end(True, offset, perp_far, perp_near)
            if y1 > y0:
                bar(L, 'v', y0, y1, offset)

    if dashes:
        out = []
        t = HEAVY if (up == H or right == H) else LIGHT
        if dash_axis == 'h':
            step = COLS / dashes
            for i in range(dashes):
                lo = i * step + step * 0.2
                out.append(rect(lo, cy - t / 2, lo + step * 0.6, cy + t / 2))
        else:
            step = ROWS / dashes
            for i in range(dashes):
                lo = i * step + step * 0.2
                out.append(rect(cx - t / 2, lo, cx + t / 2, lo + step * 0.6))
    return out


def box_drawing():
    """U+2500-U+257F as (up, right, down, left) stem weights."""
    T = {
        0x2500: (N, L, N, L), 0x2501: (N, H, N, H),
        0x2502: (L, N, L, N), 0x2503: (H, N, H, N),
        0x250C: (N, L, L, N), 0x250D: (N, H, L, N), 0x250E: (N, L, H, N), 0x250F: (N, H, H, N),
        0x2510: (N, N, L, L), 0x2511: (N, N, L, H), 0x2512: (N, N, H, L), 0x2513: (N, N, H, H),
        0x2514: (L, L, N, N), 0x2515: (L, H, N, N), 0x2516: (H, L, N, N), 0x2517: (H, H, N, N),
        0x2518: (L, N, N, L), 0x2519: (L, N, N, H), 0x251A: (H, N, N, L), 0x251B: (H, N, N, H),
        0x251C: (L, L, L, N), 0x2520: (H, L, H, N), 0x2523: (H, H, H, N),
        0x2524: (L, N, L, L), 0x2528: (H, N, H, L), 0x252B: (H, N, H, H),
        0x252C: (N, L, L, L), 0x2530: (N, L, H, L), 0x2533: (N, H, H, H),
        0x2534: (L, L, N, L), 0x2538: (H, L, N, L), 0x253B: (H, H, N, H),
        0x253C: (L, L, L, L), 0x2542: (H, L, H, L), 0x254B: (H, H, H, H),
        # The double set, and the mixed single/double joints beside it.
        0x2550: (N, D, N, D), 0x2551: (D, N, D, N),
        0x2552: (N, D, L, N), 0x2553: (N, L, D, N), 0x2554: (N, D, D, N),
        0x2555: (N, N, L, D), 0x2556: (N, N, D, L), 0x2557: (N, N, D, D),
        0x2558: (L, D, N, N), 0x2559: (D, L, N, N), 0x255A: (D, D, N, N),
        0x255B: (L, N, N, D), 0x255C: (D, N, N, L), 0x255D: (D, N, N, D),
        0x255E: (L, D, L, N), 0x255F: (D, L, D, N), 0x2560: (D, D, D, N),
        0x2561: (L, N, L, D), 0x2562: (D, N, D, L), 0x2563: (D, N, D, D),
        0x2564: (N, D, L, D), 0x2565: (N, L, D, L), 0x2566: (N, D, D, D),
        0x2567: (L, D, N, D), 0x2568: (D, L, N, L), 0x2569: (D, D, N, D),
        0x256A: (L, D, L, D), 0x256B: (D, L, D, L), 0x256C: (D, D, D, D),
        # Arcs: this grid has no curve in it, so a rounded corner is the
        # square one. A 62.5-unit pixel cannot describe an arc anyway.
        0x256D: (N, L, L, N), 0x256E: (N, N, L, L),
        0x256F: (L, N, N, L), 0x2570: (L, L, N, N),
        # Half stems.
        0x2574: (N, N, N, L), 0x2575: (L, N, N, N),
        0x2576: (N, L, N, N), 0x2577: (N, N, L, N),
        0x2578: (N, N, N, H), 0x2579: (H, N, N, N),
        0x257A: (N, H, N, N), 0x257B: (N, N, H, N),
        # Light/heavy transitions.
        0x257C: (N, H, N, L), 0x257D: (L, N, H, N),
        0x257E: (N, L, N, H), 0x257F: (H, N, L, N),
    }
    g = {cp: stems(*w) for cp, w in T.items()}

    # The dashed runs.
    for cp, count, axis, weight in (
        (0x2504, 3, 'h', L), (0x2505, 3, 'h', H),
        (0x2506, 3, 'v', L), (0x2507, 3, 'v', H),
        (0x2508, 4, 'h', L), (0x2509, 4, 'h', H),
        (0x250A, 4, 'v', L), (0x250B, 4, 'v', H),
        (0x254C, 2, 'h', L), (0x254D, 2, 'h', H),
        (0x254E, 2, 'v', L), (0x254F, 2, 'v', H),
    ):
        if axis == 'h':
            g[cp] = stems(N, weight, N, weight, dashes=count, dash_axis='h')
        else:
            g[cp] = stems(weight, N, weight, N, dashes=count, dash_axis='v')

    # The diagonals.
    def diagonal(down_right, up_right):
        out = []
        for x in range(COLS):
            if down_right:
                y = ROWS - 1 - (x * ROWS // COLS)
                out.append(rect(x, max(0, y - 1), x + 1, min(ROWS, y + 1)))
            if up_right:
                y = x * ROWS // COLS
                out.append(rect(x, max(0, y - 1), x + 1, min(ROWS, y + 1)))
        return out

    g[0x2571] = diagonal(False, True)
    g[0x2572] = diagonal(True, False)
    g[0x2573] = diagonal(True, True)

    # Anything the chart has that the table above does not name yet gets the
    # light cross, which is wrong-looking rather than missing - and missing is
    # what sends the DOM renderer back to a fallback font that does not tile.
    for cp in range(0x2500, 0x2580):
        g.setdefault(cp, stems(L, L, L, L))
    return g


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()

    glyphs = {}
    glyphs.update(block_elements())
    glyphs.update(box_drawing())

    names = {cp: f'uni{cp:04X}' for cp in glyphs}
    order = ['.notdef', 'space'] + [names[cp] for cp in sorted(glyphs)]

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({0x20: 'space', **{cp: names[cp] for cp in glyphs}})

    pen_glyphs = {}
    blank = TTGlyphPen(None)
    pen_glyphs['.notdef'] = blank.glyph()
    pen_glyphs['space'] = TTGlyphPen(None).glyph()
    for cp, rects in glyphs.items():
        pen = TTGlyphPen(None)
        draw(pen, rects)
        pen_glyphs[names[cp]] = pen.glyph()

    fb.setupGlyf(pen_glyphs)
    fb.setupHorizontalMetrics({name: (ADVANCE, 0) for name in order})
    # The line box IS the em, which is how every Amiga face this board ships
    # declares itself - so a glyph drawn 0..UPM fills the row exactly and a
    # vertical rule connects to the one above it.
    fb.setupHorizontalHeader(ascent=UPM, descent=0, lineGap=0)
    fb.setupNameTable({
        'familyName': 'BBSGraphics',
        'styleName': 'Regular',
        'uniqueFontIdentifier': 'BBSGraphics-Regular',
        'fullName': 'BBSGraphics Regular',
        'psName': 'BBSGraphics-Regular',
        'version': 'Version 1.000',
        'copyright': 'Generated geometry - dev/scripts/fonts/build-bbs-graphics-font.py',
    })
    fb.setupOS2(sTypoAscender=UPM, sTypoDescender=0, sTypoLineGap=0,
                usWinAscent=UPM, usWinDescent=0, achVendID='UPRO')
    fb.setupPost()
    # Deterministic: the same source builds the same bytes.
    fb.font['head'].created = fb.font['head'].modified = 0

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    fb.save(str(out))
    print(f'wrote {out} - {len(glyphs)} glyphs, advance {ADVANCE}/{UPM}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
