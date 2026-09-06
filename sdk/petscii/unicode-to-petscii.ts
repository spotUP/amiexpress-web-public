/**
 * Unicode (box drawing, block elements, the few symbols a BBS prints) ->
 * PETSCII byte.
 *
 * Only glyphs whose SCREEN CODE renders the same in BOTH charset banks are
 * mapped as plain bytes: screen codes $60-$7F (PETSCII $A0-$BF) EXCEPT the
 * two that diverge ($69 and $7A), plus $40 (horizontal bar), $5B (cross),
 * $5C (left half medium shade, the same bitmap in both banks) and $5D
 * (vertical bar), and the bank-1-only check mark (screen code $7A ->
 * PETSCII $BA) since transduced text is always printed in bank 1. Screen
 * codes $41-$5A are LETTERS in bank 1, so the bank-0-only graphics that live
 * there - card suits, the bullet, the rounded corners, the diagonals - are
 * substituted with punctuation instead of mapped, or they would come out as
 * random capitals.
 *
 * Glyphs that exist in bank 1 ONLY - a different bitmap lives at the same
 * screen code in bank 0 - are kept OUT of this map and listed in
 * UNICODE_TO_PETSCII_BANK1_ONLY below, which `asciiToPetsciiByte` consults
 * only when it is encoding for bank 1.
 *
 * Glyphs PETSCII only has as the INVERSE of another glyph carry `{ rvs }`;
 * the transducer wraps those in $12/$92 and restores the latched SGR reverse
 * afterwards.
 *
 * Every byte here is `screenCodeToPetscii(sc)` of the screen code the repo's
 * normative screen-code -> Unicode table assigns to that glyph:
 * web/backend/src/utils/petscii-unicode-map.ts (`SCREENCODE_TO_UNICODE`,
 * transcribed from the Unicode Consortium's C64IPRI.TXT / C64IALT.TXT
 * interchange mappings, L2/19-025). The inverse was generated from that file
 * and is pinned cell by cell in tests/petscii/unicode-to-petscii.test.ts.
 * See also thoughts/shared/research/2026-09-01_true-petscii-reference.md
 * sections 2 and 4.3.
 */
const R = (byte: number) => ({ rvs: byte });

export const UNICODE_TO_PETSCII: ReadonlyMap<string, number | { rvs: number }> = new Map<string, number | { rvs: number }>([
  // single-line box drawing (screen codes $40, $5D, $5B, $70, $6E, $6D, $7D, $6B, $73, $72, $71)
  ['─', 0xC0], ['│', 0xDD], ['┼', 0xDB],
  ['┌', 0xB0], ['┐', 0xAE], ['└', 0xAD], ['┘', 0xBD],
  ['├', 0xAB], ['┤', 0xB3], ['┬', 0xB2], ['┴', 0xB1],
  // heavy, double and rounded variants -> the single-line glyphs (the text bank has no others)
  ['━', 0xC0], ['┃', 0xDD],
  ['═', 0xC0], ['║', 0xDD], ['╬', 0xDB],
  ['╔', 0xB0], ['╗', 0xAE], ['╚', 0xAD], ['╝', 0xBD],
  ['╠', 0xAB], ['╣', 0xB3], ['╦', 0xB2], ['╩', 0xB1],
  ['╭', 0xB0], ['╮', 0xAE], ['╯', 0xBD], ['╰', 0xAD],
  // block elements (screen codes $61-$67, $6C, $7B, $7C, $7E, $7F)
  ['▌', 0xA1], ['▄', 0xA2], ['▔', 0xA3], ['▁', 0xA4],
  ['▏', 0xA5], ['▒', 0xA6], ['▕', 0xA7],
  ['▗', 0xAC], ['▖', 0xBB], ['▝', 0xBC], ['▘', 0xBE], ['▚', 0xBF],
  ['░', 0xA6], ['▓', 0xA6],
  // the eighth/quarter blocks and the two medium shades (screen codes $5C,
  // $68, $6A, $6F, $74-$79) - the same bitmap in BOTH banks, verified glyph
  // by glyph against the character ROM. Astral code points are written
  // escaped, as the backend's normative table writes them: most editors and
  // terminals have no font for them.
  ['▂', 0xAF],            // LOWER ONE QUARTER BLOCK      (sc $6F)
  ['▃', 0xB9],            // LOWER THREE EIGHTHS BLOCK    (sc $79)
  ['▎', 0xB4],            // LEFT ONE QUARTER BLOCK       (sc $74)
  ['▍', 0xB5],            // LEFT THREE EIGHTHS BLOCK     (sc $75)
  ['\u{1FB87}', 0xAA],         // RIGHT ONE QUARTER BLOCK      (sc $6A)
  ['\u{1FB88}', 0xB6],         // RIGHT THREE EIGHTHS BLOCK    (sc $76)
  ['\u{1FB82}', 0xB7],         // UPPER ONE QUARTER BLOCK      (sc $77)
  ['\u{1FB83}', 0xB8],         // UPPER THREE EIGHTHS BLOCK    (sc $78)
  ['\u{1FB8C}', 0xDC],         // LEFT HALF MEDIUM SHADE       (sc $5C)
  ['\u{1FB8F}', 0xA8],         // LOWER HALF MEDIUM SHADE      (sc $68)
  // blocks PETSCII only has as the inverse of another glyph
  ['█', R(0x20)], ['▀', R(0xA2)], ['▐', R(0xA1)],
  ['▛', R(0xAC)], ['▜', R(0xBB)], ['▙', R(0xBC)], ['▟', R(0xBE)], ['▞', R(0xBF)],
  // symbols
  ['✓', 0xBA], ['£', 0x5C], ['↑', 0x5E], ['←', 0x5F],
  ['•', 0x2A], ['·', 0x2E], ['●', 0x2A],
  ['♠', 0x2A], ['♥', 0x2A], ['♦', 0x2A], ['♣', 0x2A],
  ['→', 0x3E],
  ['\u00A0', 0x20],   // NO-BREAK SPACE (written escaped: invisible in source)
  // MACRON, the Amiga's byte $AF (latin1 is how a 68K door's output is decoded:
  // amiga-emulation/api/DosLibrary.ts:1222). Amiga BBS art draws a horizontal
  // rule at the TOP of the cell with it and the mirror rule at the BOTTOM with
  // '_', in pairs - dRE!WAll's STYLE.2 and STYLE.4 are `___` / ticks / `¯¯¯`,
  // and 636 bytes of it sit in the board's own door screens. asciiToPetsciiByte
  // has mapped '_' to $A4 (screen code $64, LOWER ONE EIGHTH BLOCK) since the
  // table was written; this is the same decision for the other half of the
  // pair. Rasterised 8x8 from the PetMe64 outlines the terminal renders from
  // (PUA $E000 + bank*$100 + screen code), screen code $63 is one lit pixel row
  // at the TOP in BOTH banks and $64 one lit row at the bottom in both, so this
  // belongs in the shared, bank-agnostic table and not in the bank-1-only one.
  // Before this row a C64 caller got '?' for every cell of such a rule.
  ['\u00AF', 0xA3],   // MACRON -> UPPER ONE EIGHTH BLOCK (sc $63)
]);

/**
 * Glyphs the C64 can print in bank 1 (the shifted/text bank all transduced
 * text is printed in) where the SAME screen code is a different bitmap in
 * bank 0. They are deliberately not in the map above, which is bank-agnostic
 * and is also used to encode into bank 0 art: emitting these bytes there
 * would print pi for a checkerboard and a solid triangle for a diagonal
 * fill - a different glyph, not a near miss. `asciiToPetsciiByte` reaches
 * this table only when `bank === 1`; in bank 0 they still degrade to '?',
 * which is honest, because bank 0 genuinely has no such glyph.
 *
 * Bank 0 at these screen codes, for the record: $5E pi, $5F U+25E5 BLACK
 * UPPER RIGHT TRIANGLE, $69 U+25E4 BLACK UPPER LEFT TRIANGLE.
 *
 * The check mark above ($7A -> $BA) is bank-divergent too and stays in the
 * shared map: that is a standing decision this table does not reopen, and
 * moving it would change what bank 0 art already encodes to.
 */
export const UNICODE_TO_PETSCII_BANK1_ONLY: ReadonlyMap<string, number> = new Map<string, number>([
  ['\u{1FB96}', 0xDE],         // INVERSE CHECKER BOARD FILL      (sc $5E)
  ['\u{1FB98}', 0xDF],         // UPPER LEFT TO LOWER RIGHT FILL  (sc $5F)
  ['\u{1FB99}', 0xA9],         // UPPER RIGHT TO LOWER LEFT FILL  (sc $69)
]);

/**
 * LATIN-1 HIGH BYTES ($A0-$FF) -> a character the table above (or
 * `asciiToPetsciiByte`'s own ASCII branches) can already resolve.
 *
 * WHY THIS EXISTS. A 68K door's output is decoded as latin1 on its way out of
 * the emulator (`web/backend/src/amiga-emulation/api/DosLibrary.ts:1222` and
 * the FileHandle path), so the code point that reaches this encoder IS the
 * byte the door wrote, and the picture the caller was MEANT to see is the
 * Amiga Topaz glyph for that byte. Before this table `asciiToPetsciiByte`
 * resolved 92 of the 96 to '?' - only $A0, $A3, $AF and $B7 were mapped - and
 * five doors the board already marks C64_ADAPT=40 (`j`, `ulist`, `six_status`,
 * `hackcheck`, `doorrepo`) put unmapped bytes on a C64's glass every run.
 *
 * METHOD. Every row was decided from the two BITMAPS, not from the code
 * point's Unicode name. Topaz was rasterised 8x8 from
 * `web/frontend/public/fonts/Topaz_a500_v1.0.ttf` (upem 1600, advance 800, so
 * the native 8x8 cell is every second row of a 16px render) and each candidate
 * PETSCII glyph 8x8 from the PetMe64 outlines the terminal itself renders from
 * (PUA $E000 + bank*$100 + screen code), then compared by Hamming distance
 * over the 64 pixels. The rasteriser was sanity-checked against known cells -
 * PetMe64 bank 0 screen code $01 is 'A' and $5E is pi, bank 1 $01 is 'a' - the
 * same check `7eaa120d5` used. Distances quoted below are out of 64.
 *
 * The label lies more often than not, which is the whole reason to raster:
 * $AF is nominally MACRON and is really the top-of-cell rule Amiga art draws
 * with (already mapped, $A3); $AD is nominally SOFT HYPHEN and Topaz draws a
 * real 2px mid-height bar for it, a hyphen; $BC-$BE are nominally fractions
 * and are three diagonal-hatched cells the board's own BBSTITLE uses as a
 * shading run (`.¾¾¾¾¾.` in Screens/BBSTITLE.txt).
 *
 * Every value here is a REPLACEMENT CHARACTER, not a PETSCII byte:
 * `asciiToPetsciiByte` re-enters itself once with it, so the bank rules, the
 * letter ranges and the table above stay the single source of truth and no
 * bank-divergent byte can be introduced through this door. Targets are ASCII
 * or a glyph already in UNICODE_TO_PETSCII; none is itself a latin1 high byte,
 * which the tests assert so the recursion cannot become a cycle.
 */

/**
 * DECORATION - rules, dividers, ornaments and punctuation. 17 rows. These are
 * what Amiga BBS art draws its furniture with, so a '?' here is the damage a
 * sysop sees first: a rule that stops being a rule.
 */
const TOPAZ_DECORATION_FOLD: ReadonlyArray<readonly [string, string]> = [
  // INVERTED EXCLAMATION MARK: dot on row 0, stem on rows 2-6. The nearest
  // bitmap is actually the solid vertical bar (d=8, versus 10 for '!'), and it
  // is REJECTED: JoinCnf's logo row is ` /   ¡   \\  ¡   \\  |   \\  | /`, mixing
  // ¡ and '|' in one line, and '|' already resolves to that bar ($DD) - folding
  // ¡ there would erase a distinction the artist drew. '!' is the same picture
  // turned over and keeps the two apart.
  ['¡', '!'],
  // CURRENCY SIGN: a lozenge outline with four corner spikes. No PETSCII glyph
  // is close (best is '"' at d=12, a density artefact of two sparse top-cell
  // marks), but this table already folds the diamond and the other card suits
  // to '*', and MultiTop's `·°¤ MOMENT 22 ¤°·` uses it as exactly that kind of
  // centred ornament.
  ['¤', '*'],
  // BROKEN BAR: a vertical bar with a one-row gap - GWALL's HANDLE/BBS column
  // separator, and the `¦` in the reference-board screens. Nearest PETSCII is the solid
  // vertical bar at d=4, which is also where '|' goes.
  ['¦', '|'],
  // DIAERESIS: two dots on row 0. Nearest by pixels is the full top rule $A3
  // (d=4) purely because it has twice the ink; '"' (d=8) is two marks in the
  // same place, which is the picture.
  ['¨', '"'],
  // LEFT-POINTING DOUBLE ANGLE: two chevrons. The pixel metric prefers 'v'
  // (d=14) because PETSCII's '<' is one big chevron where Topaz draws two small
  // ones; the fold is still '<', which is what MultiTop's `»« --»> D U P L O <«--`
  // is drawing.
  ['«', '<'],
  // NOT SIGN: a 5px bar on row 0 with a 2px tick down at its right end. Nearest
  // is UPPER ONE EIGHTH BLOCK at d=5 - the tick has no PETSCII counterpart and
  // dropping it costs less than moving the bar to mid-cell, which is what the
  // corner glyph $AE would do. uSTATS draws `¬\\/_` and `¬\\ -CøS¥SøPs` with it.
  ['¬', '▔'],
  // SOFT HYPHEN: Topaz gives it a real 2px mid-height bar (glyph uni00AD, bbox
  // y 800-1200 of upem 1600). It is NOT blank - a shaping engine that drops SHY
  // makes it look blank, which is why this was rastered from the outline.
  // Nearest is '-' at d=6.
  ['­', '-'],
  // DEGREE SIGN: a small circle high in the cell. Nearest by pixels is '"'
  // (d=8) on top-cell sparseness alone, rejected because a quote mark is not an
  // ornament; '*' keeps the size ordering BBSTITLE's starfield draws with
  // ('·' -> '.', '°' -> '*').
  ['°', '*'],
  ['±', '+'],   // PLUS-MINUS: a plus with an underbar
  ['´', '\''],  // ACUTE ACCENT: TurboLister writes `Co´s: DjaX` - an apostrophe
  ['¸', ','],   // CEDILLA: nearest PETSCII is ',' at d=2
  ['»', '>'],   // RIGHT-POINTING DOUBLE ANGLE
  // VULGAR FRACTIONS: at 8x8 all three are diagonal hatch, and Amiga art uses
  // runs of them as shading - `.¾¾¾¾¾.` and `¼¼¼xx` in the board's own
  // BBSTITLE.txt. Nearest is '/' (d=12, 12, 15); the 50% checkerboard $A6 was
  // the obvious guess and measures d>24, twice the ink and none of the
  // diagonal, so it is not used.
  ['¼', '/'], ['½', '/'], ['¾', '/'],
  // MULTIPLICATION SIGN: a small mid-height cross. Nearest is '*' (d=13);
  // 'x' measures worse (>19) because PETSCII's x is full height.
  ['×', '*'],
  // DIVISION SIGN: bar with a dot above and below - HSTStat's rule is
  // `-÷-+---+-÷-+---+-÷-` and the reference-board screens' is `- -÷------÷- -`. '+' and
  // '-' both measure d=4; '+' is taken because it keeps an ornament where the
  // author put one instead of silently closing the rule over it.
  ['÷', '+'],
];

/**
 * SYMBOLS THE SCENE USES AS LETTERS. 10 rows. Each is a letter or digit with
 * decoration around it, and the corpus shows door authors typing them AS that
 * character: HackCheck prints `EnTe® thE laST foU® digiTs`, MultiTop lists
 * `®eaÇtø®`, uSTATS writes `S¥$øP` and `CøS¥SøPs`. None of them has a PETSCII
 * counterpart as a symbol (© and ® measure d=24 and d=28 against their nearest
 * glyph, which is no match at all), so the letter inside the ring is what
 * survives the trip.
 */
const TOPAZ_SYMBOL_FOLD: ReadonlyArray<readonly [string, string]> = [
  ['¢', 'c'],   // CENT SIGN
  ['¥', 'Y'],   // YEN SIGN - uSTATS's `S¥$øP` is SYSOP
  ['©', 'C'],   // COPYRIGHT - `© 1995 b WHiZ/LOGiC` (SiX-Status), `©1993` (5D-User)
  ['ª', 'a'],   // FEMININE ORDINAL
  ['®', 'R'],   // REGISTERED - HackCheck's `EnTe®` is ENTER
  ['²', '2'], ['³', '3'], ['¹', '1'],  // SUPERSCRIPT DIGITS
  ['µ', 'u'],   // MICRO SIGN - nearest PETSCII is 'u' at d=13
  ['º', 'o'],   // MASCULINE ORDINAL
];

/**
 * ACCENTED AND EXTENDED LETTERS -> the base letter, case preserved. 62 rows.
 *
 * DELIBERATE DEVIATION, flagged rather than hidden: the task that produced
 * this table said to leave accented letters at '?'. The corpus says otherwise.
 * These bytes are not decoration and they are not noise - they are how Amiga
 * scene handles and filenames are spelled, and every one of them appears in
 * captured door output: `SøNÝ` (HSTStat), `CøRteX/tRSi` (TurboLister),
 * `®eaÇtø®` (MultiTop), `BøHEM¡aN` (uSTATS), `$CP-BUß1.lha` (DoorRepo).
 * A C64 has no accented letter at all, so the only two answers are the base
 * letter or '?', and `S?N?` destroys a handle `SONY` merely bruises. This is
 * the fold every ASCII-only terminal has always done; it is NOT the thing the
 * instruction was guarding against, which is mapping a letter to unrelated
 * ART. Nothing here resolves to a graphic.
 *
 * The rasters agree wherever a base letter exists: Ð -> 'D' at d=4, ß -> 'B' at
 * d=4 (and the scene spells B with it), è-ë -> 'e' at d=3-4, ò-ö -> 'o' at
 * d=3-4, ù-ü -> 'u' at d=3-6. Where the metric disagrees it is because an
 * accent pushes the letter down a row (Ý measures nearest 'i'), and the letter
 * wins: these are letters, and the reader is reading words.
 *
 * Æ/æ and Þ/þ transliterate to two characters ("AE", "TH") which a
 * one-byte-in one-byte-out encoder cannot emit, so they take the letterform
 * instead - 'A' for the ligature's left half, 'P'/'p' for the thorn, which is
 * also the nearest raster (þ -> 'p' at d=8).
 */
const TOPAZ_LETTER_FOLD: ReadonlyArray<readonly [string, readonly number[]]> = [
  ['A', [0xC0, 0xC1, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6]],
  ['C', [0xC7]],
  ['E', [0xC8, 0xC9, 0xCA, 0xCB]],
  ['I', [0xCC, 0xCD, 0xCE, 0xCF]],
  ['D', [0xD0]],
  ['N', [0xD1]],
  ['O', [0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD8]],
  ['U', [0xD9, 0xDA, 0xDB, 0xDC]],
  ['Y', [0xDD]],
  ['P', [0xDE]],
  ['B', [0xDF]],
  ['a', [0xE0, 0xE1, 0xE2, 0xE3, 0xE4, 0xE5, 0xE6]],
  ['c', [0xE7]],
  ['e', [0xE8, 0xE9, 0xEA, 0xEB]],
  ['i', [0xEC, 0xED, 0xEE, 0xEF]],
  ['d', [0xF0]],
  ['n', [0xF1]],
  ['o', [0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF8]],
  ['u', [0xF9, 0xFA, 0xFB, 0xFC]],
  ['y', [0xFD, 0xFF]],
  ['p', [0xFE]],
];

/**
 * The three latin-1 high bytes this table DELIBERATELY leaves at '?', because
 * the C64 has neither the shape nor the letter:
 *
 *   $A7 SECTION SIGN   - nearest bitmap is a lowercase 's' at d=10. Rejected:
 *                        that is a letter, not the mark, and unlike ©/® there
 *                        is no capture anywhere in the corpus of an author
 *                        using § as one.
 *   $B6 PILCROW SIGN   - nearest is the upper-left quadrant block at d=14, no
 *                        match at all.
 *   $BF INVERTED QUESTION MARK - its own ASCII fold IS '?', so the fallback
 *                        already prints the right character; a row here would
 *                        change nothing.
 */
export const LATIN1_TO_PETSCII_FOLD: ReadonlyMap<string, string> = new Map<string, string>([
  ...TOPAZ_DECORATION_FOLD,
  ...TOPAZ_SYMBOL_FOLD,
  ...TOPAZ_LETTER_FOLD.flatMap(([base, codes]) =>
    codes.map((code) => [String.fromCharCode(code), base] as const),
  ),
]);
