/**
 * "petscii is missing swedish characters as well" - the sysop, 2026-09-13,
 * on a Swedish board.
 *
 * Standard PETSCII has no a-ring or umlauts: keymap.ts maps a-z, A-Z, digits,
 * punctuation and @[\]^_, and everything else returns null - so the key did
 * nothing at all. C64s sold in Sweden shipped a modified character ROM that
 * put the three letters where the bracket/pound trio had been.
 *
 * A VARIANT, never the default. PETSCII $5C is the pound sign, and this
 * board's MCI already uses it for the column tab; in a Swedish session that
 * byte is O-umlaut instead. An ordinary session must keep its pound sign.
 */
import { keyEventToPetscii, pastedTextToPetscii } from '../../../../packages/terminal/src/petscii/keymap';
import { petsciiInputToAscii } from '../../../../sdk/petscii/petscii-input';
import { SWEDISH_GLYPHS } from '../../../../packages/terminal/src/petscii/swedish';

describe('a Swedish caller typing', () => {
  it('gets a byte for each of their own letters', () => {
    expect(keyEventToPetscii('å', false, true)).toEqual([0x5D]);
    expect(keyEventToPetscii('ä', false, true)).toEqual([0x5B]);
    expect(keyEventToPetscii('ö', false, true)).toEqual([0x5C]);
    // Shift gives the capital its own byte, as the ROM gives it its own glyph.
    expect(keyEventToPetscii('Å', false, true)).toEqual([0x7D]);
    expect(keyEventToPetscii('Ö', false, true)).toEqual([0x7C]);
  });

  it('and the board reads them back as the letters it already speaks', () => {
    // Latin-1, which is what toAmigaLatin1 keeps and what the ANSI side uses.
    expect(petsciiInputToAscii([0x5D], true)).toBe('å');
    expect(petsciiInputToAscii([0x5B], true)).toBe('ä');
    expect(petsciiInputToAscii([0x5C], true)).toBe('ö');
  });

  it('round-trips a name through the wire, capitals and all', () => {
    const bytes = pastedTextToPetscii('Måns Ärlig', true);
    expect(petsciiInputToAscii(bytes, true)).toBe('Måns Ärlig');
  });

  it('does nothing at all when the session is not Swedish', () => {
    // The key is unmapped, exactly as before - not silently turned into a
    // bracket, which would put rubbish in a caller's message.
    expect(keyEventToPetscii('å', false)).toBeNull();
    expect(keyEventToPetscii('ö', false, false)).toBeNull();
  });

  it('leaves the pound sign alone in an ordinary session', () => {
    // $5C is MCI's column tab on this board. A session that did not ask for
    // Swedish must still read it as the pound sign, not as O-umlaut.
    expect(petsciiInputToAscii([0x5C])).toBe('\\');
    expect(petsciiInputToAscii([0x5C], false)).toBe('\\');
  });

  it('carries both cases in the text bank, which is what the ROM says', () => {
    // The first cut of this table was INFERRED and had it half right: the
    // text bank holds the lowercase letters at $1B-$1D AND the uppercase at
    // $5B-$5D. Character ROM 325018-02 settled it.
    const text = SWEDISH_GLYPHS.filter((g) => g.bank === 1);
    expect(text.map((g) => g.char)).toEqual(['ä', 'ö', 'å', 'Ä', 'Ö', 'Å']);
    expect(text.filter((g) => g.char === 'Ä')[0]!.screenCode).toBe(0x5B);
    // Bank 0 is the uppercase/graphics set: the letters sit at $1B-$1D there.
    expect(SWEDISH_GLYPHS.filter((g) => g.bank === 0).map((g) => g.char)).toEqual(['Ä', 'Ö', 'Å']);
  });

  it('draws the ROM, not a font\'s idea of an a-ring', () => {
    // Eight rows of eight pixels, straight out of characters.325018-02.bin.
    // A-ring, uppercase: the ring, then the A. Read it down the column.
    const aRing = SWEDISH_GLYPHS.find((g) => g.char === 'Å' && g.bank === 0)!;
    expect(aRing.rom).toEqual([0x18, 0x24, 0x3C, 0x66, 0x7E, 0x66, 0x66, 0x00]);
    // Every glyph is eight bytes, and none is blank.
    for (const g of SWEDISH_GLYPHS) {
      expect(g.rom).toHaveLength(8);
      expect(g.rom.some((b) => b !== 0)).toBe(true);
    }
  });

  it('keeps each letter on the byte its own symbol had', () => {
    for (const g of SWEDISH_GLYPHS) {
      // PETSCII $40-$5F draws from screen $00-$1F; $60-$7F from $40-$5F.
      const expected = g.petscii < 0x60 ? g.petscii - 0x40 : g.petscii - 0x20;
      expect(g.screenCode).toBe(expected);
    }
  });
});
