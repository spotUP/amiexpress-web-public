#!/usr/bin/env python3
"""
Write a teletext screen: header, rule, double-height title, body.

A teletext page has a shape, and every screen on this board that wears it
should wear the same one - a page number and the board's name along the top,
a drawn rule under it, a headline at twice the height, then forty-column
text. Hand-authoring that forty times is how twelve screens end up with
thirteen different headers.

    python3 dev/scripts/teletext/make-screen.py 300 "JOIN A CONFERENCE" \\
        --body "Pick a conference by number." --mci "~CL." \\
        --out Screens/JOINCONF.ttx

What it writes, in the order a teletext set draws it:

  * `~SMO1|`, so the screen types itself on at the board's slow-mo speed,
    the way BBSTITLE does.
  * the header: `<page> UP ROUGH` on the left, the date on the right
    through `~DT|`, so a static file still shows today.
  * a rule DRAWN from G1 mosaics rather than typed from equals signs
    (dev/scripts/teletext/mosaic-art.py explains the cells).
  * the title twice, under `ESC # 3` and `ESC # 4` - DECDHL, the two halves
    of a double-height line, which the terminal draws with the face's own
    half glyphs.
  * the body, wrapped to forty columns, and any MCI tokens verbatim after
    it (`~CL.` for a conference list, say) - those are the board's, and
    wrapping one would break it.

Everything is Latin-1, because that is what the screen loader reads.
"""
import argparse
import textwrap
from importlib.machinery import SourceFileLoader
from pathlib import Path

ESC = '\x1b'
SO, SI = '\x0e', '\x0f'
WIDTH = 40

CYAN, YELLOW, WHITE, GREEN = 36, 33, 37, 32

# The rule: every cell's top and bottom row lit, which reads as a double
# line. Cell 6 is 0x40 because 0x20 is the bit that selects the set at all.
RULE_BYTE = 0x20 | 0x01 | 0x02 | 0x10 | 0x40
RULE = SO + chr(RULE_BYTE) * WIDTH + SI


def colour(code: int, text: str) -> str:
    return f'{ESC}[0;{code}m{text}{ESC}[0m'


def centre(text: str, width: int = WIDTH) -> str:
    pad = max(0, width - len(text))
    return ' ' * (pad // 2) + text + ' ' * (pad - pad // 2)


def logo_rows(text: str, cells_wide: int = 38, rows: int = 3) -> list:
    """The word as teletext block mosaics - a real teletext logo."""
    here = Path(__file__).resolve().parent
    logo = SourceFileLoader('logo', str(here / 'logo.py')).load_module()
    mosaic = SourceFileLoader('mosaic', str(here / 'mosaic-art.py')).load_module()
    grid = logo.pixels_for(text, cells_wide * 2, rows * 3, 100)
    out = []
    for row in mosaic.art_to_mosaic('\n'.join(grid)):
        out.append(SO + ''.join(chr(b) for b in row) + SI)
    return out


def screen(page: int, title: str, body: str = '', mci: str = '',
           board: str = 'UP ROUGH', logo: str = '') -> str:
    # CLEAR FIRST. A teletext page is the whole screen by definition, and
    # these are shown from paths the board's SCREENS_REQUIRE_CLEAR list never
    # sees - so the bulletins page drew over whatever the caller was looking
    # at (sysop, 2026-09-14). The escape rather than a wipe code: a wipe is an
    # animation, and this is just a clean sheet.
    lines = ['~SMO1|', f'{ESC}[2J{ESC}[H']
    # Page, board, clock - a teletext header row, and the clock is why ~TM
    # exists: express.e has the date and the logon time and nothing that says
    # what time it is now.
    header = f'  {page} {board}'
    # `~DT| ~TM|` is nine characters of token and SEVENTEEN of output -
    # `09-14-26 01:38:36` - so padding to the token's width overran the row
    # and the clock wrapped onto a line of its own (sysop, 2026-09-14). Pad
    # for what the board PRINTS, not for what the file holds.
    CLOCK_COLUMNS = len('09-14-26 01:38:36')
    pad = max(1, WIDTH - len(header) - CLOCK_COLUMNS)
    lines.append(colour(CYAN, header) + colour(WHITE, ' ' * pad + '~DT| ~TM|'))
    lines.append(colour(CYAN, RULE))
    lines.append('')

    if logo:
        # A teletext logo is BLOCKS, not big letters: the G1 mosaic set
        # spelling the word out at 2x3 cells a character, which is how every
        # teletext service that ever had a logo drew one.
        for row in logo_rows(logo):
            lines.append(colour(YELLOW, row))
        lines.append('')
    else:
        # The headline, twice: the terminal draws the top half from the first
        # row and the bottom half from the second.
        shown = centre(title[:WIDTH])
        lines.append(f'{ESC}#3' + colour(YELLOW, shown))
        lines.append(f'{ESC}#4' + colour(YELLOW, shown))
        lines.append('')

    for paragraph in body.split('\n'):
        if paragraph.strip() == '':
            lines.append('')
            continue
        for wrapped in textwrap.wrap(paragraph, WIDTH - 2) or ['']:
            lines.append(colour(WHITE, '  ' + wrapped))

    if mci:
        lines.append('')
        # Verbatim: an MCI token is the board's, and wrapping one breaks it.
        lines.append(mci)

    return '\n'.join(lines) + '\n'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('page', type=int, help='the teletext page number shown in the header')
    parser.add_argument('title', help='the double-height headline')
    parser.add_argument('--body', default='', help='forty-column text, \\n between paragraphs')
    parser.add_argument('--mci', default='', help='MCI tokens to append verbatim')
    parser.add_argument('--board', default='UP ROUGH')
    parser.add_argument('--logo', default='',
                        help='draw this word as a block mosaic logo instead of a '
                             'double-height title')
    parser.add_argument('--out', required=True, help='where to write the .ttx')
    args = parser.parse_args()

    text = screen(args.page, args.title, args.body.replace('\\n', '\n'), args.mci,
                  args.board, args.logo)
    with open(args.out, 'w', newline='', encoding='latin-1') as handle:
        handle.write(text)
    print(f'wrote {args.out} ({len(text.encode("latin-1"))} bytes)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
