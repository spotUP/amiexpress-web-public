/**
 * The C128's 80-column colours.
 *
 * The VDC is not a VIC-II. A PETSCII colour byte is shown on the 80-column
 * screen in whichever of the VDC's sixteen RGBI colours the KERNAL's table
 * ($CE5C) translates it to - corroborated cell for cell by CTerm's Table 19
 * (thoughts/shared/research/2026-09-06_c128-80-column-petscii.md). It is a
 * TABLE, not a nearest-colour search, and the difference is visible: a search
 * against RGBI puts PETSCII red on dark grey and green on light green, while
 * the real machine has four surprises of its own that no distance metric
 * would ever produce.
 */
import {
  C64_PALETTE_COLODORE,
  C128_VDC_PALETTE,
  PETSCII_COLOR_TO_VIC,
  petsciiPaletteFor,
} from '../../petscii';

/** The IBM CGA sixteen, which is what the VDC's RGBI nibble amounts to. */
const CGA = [
  '#000000', '#0000AA', '#00AA00', '#00AAAA', '#AA0000', '#AA00AA', '#AA5500', '#AAAAAA',
  '#555555', '#5555FF', '#55FF55', '#55FFFF', '#FF5555', '#FF55FF', '#FFFF55', '#FFFFFF',
];

/** CTerm Table 19: PETSCII colour byte -> CGA index. */
const TABLE_19: ReadonlyArray<readonly [number, number]> = [
  [0x90, 0], [0x1f, 1], [0x1e, 2], [0x97, 3],
  [0x1c, 4], [0x81, 5], [0x95, 6], [0x9b, 7],
  [0x98, 8], [0x9a, 9], [0x99, 10], [0x9f, 11],
  [0x96, 12], [0x9c, 13], [0x9e, 14], [0x05, 15],
];

describe('the 80-column palette is the C128 KERNAL table', () => {
  it('has sixteen colours', () => {
    expect(C128_VDC_PALETTE).toHaveLength(16);
  });

  it('shows every PETSCII colour byte in the CGA colour CTerm Table 19 names', () => {
    for (const [byte, cgaIndex] of TABLE_19) {
      const vic = PETSCII_COLOR_TO_VIC[byte];
      expect({ byte: byte.toString(16), shown: C128_VDC_PALETTE[vic] })
        .toEqual({ byte: byte.toString(16), shown: CGA[cgaIndex] });
    }
  });

  /**
   * The four the plan warned about, spelled out: these are what tell a table
   * from a nearest-colour search, and getting them wrong is the difference
   * between a C128 screen and an invented one.
   */
  it('keeps the four surprises', () => {
    const vicIndex = { orange: 8, darkGrey: 11, brown: 9, lightGrey: 15, midGrey: 12 };
    expect(C128_VDC_PALETTE[vicIndex.orange]).toBe(CGA[5]);     // magenta, not orange
    expect(C128_VDC_PALETTE[vicIndex.darkGrey]).toBe(CGA[3]);   // cyan, not a grey
    expect(C128_VDC_PALETTE[vicIndex.brown]).toBe(CGA[6]);      // brown survives
    expect(C128_VDC_PALETTE[vicIndex.lightGrey]).toBe(CGA[7]);  // the LIGHTER grey
    expect(C128_VDC_PALETTE[vicIndex.midGrey]).toBe(CGA[8]);    // ...and mid grey the darker
  });

  it('is not the C64 palette', () => {
    expect(C128_VDC_PALETTE).not.toEqual(C64_PALETTE_COLODORE);
    // Black and white are the two both machines agree on.
    expect([C128_VDC_PALETTE[0], C128_VDC_PALETTE[1]]).toEqual([C64_PALETTE_COLODORE[0], C64_PALETTE_COLODORE[1]]);
  });
});

describe('choosing between them by name', () => {
  it('answers the C128 palette for vdc and the C64 for anything else', () => {
    expect(petsciiPaletteFor('vdc')).toBe(C128_VDC_PALETTE);
    expect(petsciiPaletteFor('vic')).toBe(C64_PALETTE_COLODORE);
    // A name nobody recognises must never leave a caller with colours he did
    // not choose: the C64's are the board's oldest behaviour.
    expect(petsciiPaletteFor(undefined)).toBe(C64_PALETTE_COLODORE);
    expect(petsciiPaletteFor('nonsense')).toBe(C64_PALETTE_COLODORE);
  });
});
