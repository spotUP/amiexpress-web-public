# Teletext font

The board's teletext session (`T` at the graphics prompt) renders in
`web/frontend/public/fonts/TeletextUPR.woff2`, which is **TDAText with one
glyph repaired and 392 glyphs added**.

## What the build does

**The a-ring.** TDAText 0.1.3 draws lowercase a-ring (U+00E5) as a byte-for-byte
copy of a-dieresis (U+00E4) - the same outline coordinates and the same embedded
bitmap - so Swedish Text-TV pages read "Nagon" with two dots where the ring
belongs (sysop, 2026-09-13). Upstream HEAD had the same bytes when this was
written, so there was nothing to pull. The repair composes the glyph from shapes
already in the font: the contours of `a`, plus a ring matching the one `Aring`
and `uring` already carry.

**Double height.** Teletext draws headline rows at twice the height, and
xterm.js 5.5 implements no `DECDHL` - there is no `ESC #` handler in it at all.
So the halves live in the font: for every Latin-1 printable, the top half and
the bottom half of the character, each stretched over a whole cell, land in the
Private Use Area.

    top half of U+0041 ('A')  ->  U+E221      (0xE200 + cp - 0x20)
    bottom half of U+0041     ->  U+E321      (0xE300 + cp - 0x20)

The stretch is exact, not resampled: this is a pixel font with a 20ppem strike
of 12x20 bitmaps, so a half is those ten rows with each row drawn twice. The
outlines are traced around the resulting pixels, one contour per region, so
stacked pixels show no seams and every edge lands on a device pixel.

The same two lines of arithmetic live in
`packages/terminal/src/utils/teletext-double-height.ts`, which is what turns a
`ESC # 3` / `ESC # 4` line into those codepoints on the way to xterm.

## Licence

`TDAText` is a Reserved Font Name under the SIL Open Font License, so the
modified font is renamed to `TeletextUPR` - clause 3, not a preference. The
notice and the original licence ship beside the font;
`TDAText-OFL-LICENSE.txt` here is the upstream one, unchanged.

## Rebuilding (including against a newer TDAText)

    python3 dev/scripts/fonts/build-teletext-font.py \
        dev/scripts/fonts/TDAText-upstream.ttf \
        web/frontend/public/fonts/TeletextUPR.ttf \
        web/frontend/public/fonts/TeletextUPR.woff2

The build is deterministic, so its output can be diffed against the file in the
tree. Then run the guards, which read the SHIPPED font:

    cd web/frontend && npx vitest run src/components/__tests__/teletext-font-swedish.test.ts

Needs `fonttools` and `brotli` (`pip install fonttools brotli`).

## Font contract (levels plan D1-D3)

Every derived glyph is `base + index`. `index` is `cp - 0x20` for a Latin-1
printable (0x20-0xFF) and the 6-bit PATTERN (0-63) for a mosaic: cell 1 (top
left) = 1, cell 2 = 2, cell 3 = 4, cell 4 = 8, cell 5 (bottom left) = 16,
cell 6 = 32 (Unicode's order). PETSCII keeps U+E000-E1FF.

| Range | Source | Shows |
|-------|--------|-------|
| E200 / E300 | Latin-1 | double height: top / bottom half |
| E400 / E440 | contiguous mosaic | double height: top / bottom half |
| E480 / E4C0 | separated mosaic | double height: top / bottom half |
| E500 / E600 | Latin-1 | double width: left / right half |
| E700 / E740 | contiguous mosaic | double width: left / right half |
| E780 / E7C0 | separated mosaic | double width: left / right half |
| E800 / E900 / EA00 / EB00 | Latin-1 | double size: top-left / top-right / bottom-left / bottom-right |
| EC00 / EC40 / EC80 / ECC0 | contiguous mosaic | double size: TL / TR / BL / BR |
| ED00 / ED40 / ED80 / EDC0 | separated mosaic | double size: TL / TR / BL / BR |
| U+1CE51-1CE8F | Unicode 16 SEPARATED BLOCK SEXTANT-n | the 63 separated patterns (blank = U+0020) |

Geometry: the cell is 12x20 pixels. Contiguous mosaics use bands of 6, 8 and
6 rows (teletext's 3/4/3 scanlines doubled) and two 6-pixel columns. Separated
mosaics lose the outer pixel of every block on all four sides, so a block is
surrounded by background and neighbours sit 2 pixels apart (EN 300 706
Table 26, entry 1/A). Halves are pixel-exact: the kept rows or columns are each
drawn twice. For a mosaic on a double-height row the three bands stretch over
two cells: the top cell shows band 1 plus the upper 4 rows of band 2, the
bottom cell the lower 4 rows of band 2 plus band 3. Pattern 0 has glyphs in
every range (empty) but a renderer may emit U+0020.

The builder asserts every contiguous sextant against this grid. Upstream
TDAText draws U+1FB29 wrong (left half of its last two middle-band rows
missing); the builder redraws it. The wire form for double width and size is
not decided; only the codepoints are fixed here. Mirror constants:
`packages/terminal/src/utils/teletext-double-height.ts`.
