#!/usr/bin/env python3
"""
Draw teletext block mosaics, from a picture made of # and .

Teletext's graphics are a second character set, G1: each code is a 2x3 grid
of blocks, so a 40-column row of them is 80 pixels wide and 75 rows tall on a
25-row screen. A screen selects the set with SO (0x0E) and leaves it with SI
(0x0F), the way a VT terminal has always switched sets, and the terminal
draws the cells (packages/terminal/src/utils/teletext-double-height.ts).

This turns a picture into those bytes, so nobody has to work out the bit
layout by hand:

    $ cat rule.txt
    ########################################
    ........................................
    ########################################

    $ python3 dev/scripts/teletext/mosaic-art.py rule.txt
    <SO>...<SI>

Input is any text file: `#`, `*`, `X` and `1` are ink, everything else is
background, and lines shorter than the widest one are padded. Rows are taken
three at a time and columns two at a time, because that is one mosaic cell.

Output is the escaped bytes by default (`\\x0e...`), ready to paste into a
`.ttx` screen through a here-document or a python one-liner; `--raw` writes
the bytes themselves to stdout instead.

The cells are numbered

     1 2       bit 0x01 is cell 1, 0x02 cell 2, 0x04 cell 3,
     3 4       0x08 cell 4, 0x10 cell 5 - and 0x40 cell 6, because
     5 6       0x20 is the bit that selects the set in the first place.
"""
import sys

INK = set('#*X1')
SHIFT_OUT = 0x0E
SHIFT_IN = 0x0F

# Cell -> the bit that carries it. Cell 6 is 0x40 rather than 0x20 because
# 0x20 is the set-select bit; that is teletext's own arrangement, not ours.
CELL_BITS = (0x01, 0x02, 0x04, 0x08, 0x10, 0x40)


def cell_byte(cells):
    """One mosaic byte from six booleans, in reading order."""
    byte = 0x20
    for lit, bit in zip(cells, CELL_BITS):
        if lit:
            byte |= bit
    return byte


def art_to_mosaic(text):
    """A picture into one line of mosaic bytes per three rows of pixels."""
    rows = text.replace('\r\n', '\n').split('\n')
    while rows and rows[-1].strip() == '':
        rows.pop()
    if not rows:
        return []
    width = max(len(r) for r in rows)
    rows = [r.ljust(width) for r in rows]
    while len(rows) % 3:
        rows.append(' ' * width)

    lines = []
    for top in range(0, len(rows), 3):
        out = []
        for left in range(0, width, 2):
            cells = []
            for row in range(3):
                for col in range(2):
                    at_col = left + col
                    cells.append(at_col < width and rows[top + row][at_col] in INK)
            out.append(cell_byte(cells))
        lines.append(out)
    return lines


def escaped(byte):
    return f"\\x{byte:02x}"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    raw = '--raw' in sys.argv[1:]
    if len(args) != 1:
        print(__doc__)
        return 2

    with open(args[0], 'r', encoding='latin-1') as handle:
        lines = art_to_mosaic(handle.read())

    for bytes_ in lines:
        row = bytes([SHIFT_OUT] + bytes_ + [SHIFT_IN])
        if raw:
            sys.stdout.buffer.write(row + b'\n')
        else:
            print(''.join(escaped(b) if b < 0x20 or b > 0x7e else chr(b) for b in row))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
