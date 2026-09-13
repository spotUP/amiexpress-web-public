# Teletext font

The board's teletext session (`T` at the graphics prompt) renders in
`web/frontend/public/fonts/TeletextUPR.woff2`, which is **TDAText with one
glyph repaired**.

TDAText 0.1.3 draws lowercase a-ring (U+00E5) as a byte-for-byte copy of
a-dieresis (U+00E4) - the same outline coordinates and the same embedded
bitmap - so Swedish Text-TV pages read "Nagon" with two dots where the ring
belongs (sysop, 2026-09-13). Upstream HEAD had the same bytes when this was
written, so there was nothing to pull.

The repair composes the glyph from shapes already in the font: the contours of
`a`, plus a ring drawn on the same pixel grid the strike uses, matching the one
`Aring` and `uring` already carry. Nothing else is touched.

`TDAText` is a Reserved Font Name under the SIL Open Font License, so the
modified font is renamed to `TeletextUPR` - clause 3, not a preference. The
notice and the original licence ship beside the font.

## Re-applying to a newer TDAText

    python3 dev/scripts/fonts/fix-teletext-aring.py \
        dev/scripts/fonts/TDAText-upstream.ttf \
        web/frontend/public/fonts/TeletextUPR.ttf \
        web/frontend/public/fonts/TeletextUPR.woff2

Then run the guard, which reads the shipped file and fails if a-ring and
a-dieresis share an outline again:

    cd web/frontend && npx vitest run src/components/__tests__/teletext-font-swedish.test.ts

Needs `fonttools` and `brotli` (`pip install fonttools brotli`).
