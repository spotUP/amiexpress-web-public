#!/usr/bin/env python3
"""
Draw a word as a teletext block logo.

Teletext has no big letters - it has BLOCKS. A logo on a real teletext page
is the G1 mosaic set spelling something out at 2x3 cells per character
position, which is how SVT draws its own headings and how every teletext
service that ever had a logo drew one.

This renders text with the board's own teletext face into a pixel grid, then
hands that grid to the mosaic packer (mosaic-art.py) - so the letters are the
face's letters, at whatever size fits, rather than a second alphabet nobody
maintains.

    python3 dev/scripts/teletext/logo.py "CONFERENCES" --cells-wide 40
    python3 dev/scripts/teletext/logo.py "UP ROUGH" --rows 4 --colour 33

One mosaic cell is 2 pixels wide and 3 tall, so `--cells-wide 40` is an
80-pixel canvas and `--rows 3` is 9 pixels of height: small, which is the
point. A teletext logo is legible because it is blocky, not because it is
detailed.

Prints the bytes escaped for a `.ttx` file (`\\x0e...\\x0f`), one line per row
of cells; `--raw` writes the bytes themselves.

Needs pillow, and the shipped face at web/frontend/public/fonts.
"""
import argparse
import sys
from importlib.machinery import SourceFileLoader
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
FACE = REPO / 'web' / 'frontend' / 'public' / 'fonts' / 'TeletextUPR.ttf'

mosaic = SourceFileLoader('mosaic', str(HERE / 'mosaic-art.py')).load_module()


def pixels_for(text: str, width_px: int, height_px: int, threshold: int) -> list[str]:
    """
    The word as a grid of '#' and '.', as large as it can be and still fit.

    The size search is the same shape as the terminal's own fit: try, measure,
    keep the largest that fits. A guessed size either clips the word or leaves
    it swimming in a logo three times its height.
    """
    best = None
    for size in range(height_px * 3, 3, -1):
        font = ImageFont.truetype(str(FACE), size)
        probe = Image.new('L', (width_px * 4, height_px * 4), 0)
        draw = ImageDraw.Draw(probe)
        box = draw.textbbox((0, 0), text, font=font)
        if box[2] - box[0] <= width_px and box[3] - box[1] <= height_px:
            best = (font, box)
            break
    if best is None:
        raise SystemExit(f'"{text}" does not fit {width_px}x{height_px} pixels at any size')

    font, box = best
    image = Image.new('L', (width_px, height_px), 0)
    draw = ImageDraw.Draw(image)
    # Centred, and drawn from the box's own origin: a glyph's bearings are not
    # zero and text((0,0)) would clip the tops of the capitals.
    left = (width_px - (box[2] - box[0])) // 2 - box[0]
    top = (height_px - (box[3] - box[1])) // 2 - box[1]
    draw.text((left, top), text, font=font, fill=255)

    px = image.load()
    return [
        ''.join('#' if px[x, y] > threshold else '.' for x in range(width_px))
        for y in range(height_px)
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('text')
    parser.add_argument('--cells-wide', type=int, default=40,
                        help='mosaic cells across; a teletext row is 40')
    parser.add_argument('--rows', type=int, default=3,
                        help='rows of cells - each is 3 pixels tall')
    parser.add_argument('--threshold', type=int, default=100)
    parser.add_argument('--raw', action='store_true')
    args = parser.parse_args()

    grid = pixels_for(args.text, args.cells_wide * 2, args.rows * 3, args.threshold)
    for row in mosaic.art_to_mosaic('\n'.join(grid)):
        line = bytes([mosaic.SHIFT_OUT] + row + [mosaic.SHIFT_IN])
        if args.raw:
            sys.stdout.buffer.write(line + b'\n')
        else:
            print(''.join(f'\\x{b:02x}' if b < 0x20 or b > 0x7e else chr(b) for b in line))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
