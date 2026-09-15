#!/usr/bin/env python3
"""Convert HeborisCE's TARGET stages into the door's own JSON.

The reference ships 173 stages at `config/stage/stage%02d.sav`, each a run of
little-endian int32 words (`tomoyo.c:1403-1440`):

    0..209    the field, 21 rows of 10 - 0 empty, 1..9 an ordinary block,
              11 and up a PLATINUM block, which is what TARGET is about
              (`tomoyo.c:334-352` counts what is left)
    210..215  per-stage rules: MIRROR, ROLL ROLL, DEATH BLOCK (big), X-RAY,
              COLOR, BLIND
    250..449  the rising field, 20 rows of 10, in the same encoding

Sixty-four of the files are the older 250-word form and carry no rising field.

CELLS ARE ENCODED AS CHARACTERS so the result stays readable and small:
'.' empty, '2'..'9' an ordinary block in the reference's own numbering, and
'A' upwards for platinum 11 and up.

ONE FILE IS DIRTY. `stage45.sav` has three words of junk where its rising
field starts (values like -1610609659, which the reference would have read as
a block or not depending on sign). Anything outside 0..35 is written out as
empty and counted in the report, because guessing what those bytes meant is
worse than dropping them.

Usage: python3 dev/scripts/convert-heboris-stages.py [reference-root]
"""
import glob
import json
import os
import struct
import sys

DEFAULT_ROOT = 'HeborisCE-main'
OUT = 'Doors/grandmaster/assets/stages/stages.json'

FIELD_ROWS = 21
RISE_ROWS = 20
WIDTH = 10
RISE_OFFSET = 250


def cell(value: int, dirty: list) -> str:
    if value == 0:
        return '.'
    if 1 <= value <= 9:
        return str(value)
    if 11 <= value <= 35:
        return chr(ord('A') + value - 11)
    dirty.append(value)
    return '.'


def rows(words, start: int, count: int, dirty: list) -> list:
    return [
        ''.join(cell(words[start + r * WIDTH + c], dirty) for c in range(WIDTH))
        for r in range(count)
    ]


def main() -> None:
    root = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ROOT
    paths = sorted(glob.glob(os.path.join(root, 'config', 'stage', '*.sav')))
    if not paths:
        raise SystemExit(f'no stage files under {root}/config/stage')

    stages = []
    dirty: list = []
    for path in paths:
        words = struct.unpack('<%di' % (os.path.getsize(path) // 4), open(path, 'rb').read())
        number = int(os.path.basename(path)[len('stage'):-len('.sav')])
        stage = {'id': f'{number:03d}', 'rows': rows(words, 0, FIELD_ROWS, dirty)}

        if len(words) >= 216:
            names = ['mirror', 'rollRoll', 'big', 'xray', 'color', 'blind']
            rules = {name: True for name, on in zip(names, words[210:216]) if on}
            if rules:
                stage['rules'] = rules

        if len(words) >= RISE_OFFSET + RISE_ROWS * WIDTH:
            rise = rows(words, RISE_OFFSET, RISE_ROWS, dirty)
            if any(row.strip('.') for row in rise):
                stage['rise'] = rise

        stages.append(stage)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as out:
        json.dump({
            'source': "HeborisCE config/stage/stage%02d.sav, converted by "
                      "dev/scripts/convert-heboris-stages.py",
            'stages': stages,
        }, out, indent=1)
        out.write('\n')

    platinum = sum(1 for s in stages if any(c.isupper() for row in s['rows'] for c in row))
    print(f'{len(stages)} stages -> {OUT} ({os.path.getsize(OUT)} bytes)')
    print(f'  with platinum blocks: {platinum}')
    print(f'  with a rising field:  {sum(1 for s in stages if "rise" in s)}')
    print(f'  with per-stage rules: {sum(1 for s in stages if "rules" in s)}')
    print(f'  cells dropped as junk: {len(dirty)}')


if __name__ == '__main__':
    main()
