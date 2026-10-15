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
